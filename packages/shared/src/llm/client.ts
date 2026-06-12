/**
 * The ONLY path to the Anthropic API in this codebase (plan: Key Technical
 * Decisions — AI call ledger). Direct `@anthropic-ai/sdk` imports are
 * lint-banned everywhere else.
 *
 * Responsibilities (wired here, U5):
 *  - Writes an `ai_calls` ledger row for EVERY call (success and failure):
 *    purpose, model, prompt version, input refs (document IDs + prompt char
 *    counts — never content), raw completion, validated output, tokens
 *    in/out, latency, stop reason, error code/payload. The ledger callback
 *    is injected by the app (apps/web/lib/llm.ts → ai_calls via the admin
 *    client) so this package stays network/DB-free apart from Anthropic.
 *  - Enforces the PHASE gate: in PHASE=A, document-bearing calls require the
 *    owning account to be flagged test/synthetic — otherwise FAIL CLOSED
 *    before any bytes reach Anthropic (pre-BAA boundary, plan review S3).
 *  - Single config-driven model (arch D3): no routing logic.
 *  - Structured output via a forced `emit` tool call whose input_schema is
 *    derived from a zod schema; tool input is validated with that schema and
 *    retried exactly once with the validation errors appended.
 *  - Document bytes are passed inline per-request (arch D3 — Files API is
 *    not BAA-eligible). Bytes never appear in ledger rows or logs.
 *
 * NO-PHI-IN-LOGS: this module logs via the shared sanitizing logger only.
 * Error messages/payloads (which can echo document text) go to the ledger
 * row's error_payload — never to stdout.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import { log, logError } from "../logger";
import { zodToJsonSchema } from "./json-schema";

export { zodToJsonSchema } from "./json-schema";
export type { JsonSchema } from "./json-schema";

export type LlmPurpose = "classify" | "parse" | "decode" | "letter" | "judgment";

export interface LlmCallInput {
  purpose: LlmPurpose;
  caseId?: string;
  documentId?: string;
  engineRunId?: string;
  promptVersion: string;
  /** Document bytes are passed inline per-request (arch D3 — Files API is not BAA-eligible). */
  documents?: Array<{ documentId: string; mediaType: string; base64: string }>;
  system?: string;
  prompt: string;
  /** Per-call output ceiling; defaults to 16000. */
  maxTokens?: number;
  /**
   * PHASE gate input (plan review S3). The CALLER resolves this from the
   * owning account's profile — the client never looks anything up. Anything
   * other than `true` blocks document-bearing calls in PHASE=A (fail closed).
   */
  isTestAccount?: boolean;
}

export interface LlmCallResult<T = unknown> {
  output: T;
  rawCompletion: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  stopReason: string;
  ledgerId: string;
}

/** Zod schema for structured output — typed alias so apps avoid a direct zod dep. */
export type LlmSchema<T> = z.ZodType<T>;

/**
 * One ai_calls ledger row. `inputRefs` carries document IDs and character
 * counts ONLY — never prompt text or document bytes (security #4).
 * `errorPayload` is the sanctioned home for full error objects (DB, not logs).
 */
export interface AiCallRow {
  caseId: string | null;
  documentId: string | null;
  engineRunId: string | null;
  purpose: LlmPurpose;
  modelId: string;
  promptVersion: string;
  inputRefs: { documentIds: string[]; promptChars: number; systemChars: number };
  rawCompletion: string | null;
  validatedOutput: unknown;
  tokensIn: number | null;
  tokensOut: number | null;
  latencyMs: number | null;
  stopReason: string | null;
  errorCode: string | null;
  errorPayload: unknown;
}

/** Minimal Messages API surface — injectable for tests (no network in CI). */
export interface LlmTransportRequest {
  model: string;
  max_tokens: number;
  system?: string;
  messages: Array<{ role: "user" | "assistant"; content: unknown }>;
  tools?: Array<{ name: string; description?: string; input_schema: Record<string, unknown> }>;
  tool_choice?: { type: "tool"; name: string };
}

export interface LlmTransportContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
}

export interface LlmTransportResponse {
  content: LlmTransportContentBlock[];
  usage: { input_tokens: number; output_tokens: number };
  stop_reason: string | null;
}

export interface LlmTransport {
  create(req: LlmTransportRequest): Promise<LlmTransportResponse>;
}

export interface CreateLlmClientOpts {
  apiKey: string;
  /** Single config-driven model (arch D3). Defaults to claude-sonnet-4-6. */
  model?: string;
  /** BILLCHECK_PHASE; defaults to "A" (fail closed). */
  phase?: string;
  /** Writes one ai_calls row; returns its id. Injected by the app layer. */
  ledger: (row: AiCallRow) => Promise<string>;
  /** Test seam: replaces the real Anthropic SDK transport. */
  transport?: LlmTransport;
}

export interface LlmClient {
  call<T = unknown>(input: LlmCallInput & { schema?: LlmSchema<T> }): Promise<LlmCallResult<T>>;
}

export const MODEL_ID = process.env.BILLCHECK_MODEL ?? "claude-sonnet-4-6";
export const PHASE = process.env.BILLCHECK_PHASE ?? "A";

const DEFAULT_MODEL = "claude-sonnet-4-6";
const DEFAULT_MAX_TOKENS = 16000;
const EMIT_TOOL = "emit";

/** Thrown BEFORE any API call when the PHASE=A pre-BAA boundary blocks a document-bearing call. */
export class PhaseGateError extends Error {
  code = "PHASE_GATE_BLOCKED";
  constructor() {
    super(
      "PHASE=A: document-bearing LLM calls require the owning account to be flagged test/synthetic (fail closed)",
    );
    this.name = "PhaseGateError";
  }
}

/** Thrown when the forced `emit` tool input fails zod validation twice. Issues live on the ledger row, not in this message. */
export class LlmValidationError extends Error {
  code = "LLM_SCHEMA_VALIDATION";
  issues: unknown;
  constructor(issues: unknown) {
    super("LLM structured output failed schema validation after one retry");
    this.name = "LlmValidationError";
    this.issues = issues;
  }
}

/** @deprecated compat shim — the wired client is createLlmClient; apps use the `llm` singleton (apps/web/lib/llm.ts). */
export class LlmNotWiredError extends Error {
  code = "LLM_NOT_WIRED";
  constructor() {
    super("callLlm is deprecated — use createLlmClient via the app's llm singleton (apps/web/lib/llm.ts).");
    this.name = "LlmNotWiredError";
  }
}

/** @deprecated compat shim kept so existing imports compile; always throws. */
export async function callLlm<T = unknown>(_input: LlmCallInput): Promise<LlmCallResult<T>> {
  throw new LlmNotWiredError();
}

function sdkTransport(apiKey: string): LlmTransport {
  let sdk: Anthropic | null = null;
  return {
    async create(req: LlmTransportRequest): Promise<LlmTransportResponse> {
      sdk ??= new Anthropic({ apiKey });
      const res = await sdk.messages.create(
        req as unknown as Anthropic.Messages.MessageCreateParamsNonStreaming,
      );
      return res as unknown as LlmTransportResponse;
    },
  };
}

function errorCodeOf(err: unknown): string {
  if (typeof err === "object" && err !== null) {
    const e = err as { code?: unknown; status?: unknown; name?: unknown };
    if (typeof e.code === "string") return e.code;
    if (typeof e.status === "number") return `API_${e.status}`;
    if (typeof e.name === "string" && e.name.length > 0) return e.name;
  }
  return "UNKNOWN";
}

/** Full error -> JSON-safe payload for the ledger row (DB, never logs). */
function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    const e = err as Error & { status?: unknown; code?: unknown; error?: unknown };
    const out: Record<string, unknown> = {
      name: e.name,
      message: e.message,
      stack: e.stack ?? null,
    };
    if (typeof e.status === "number") out.status = e.status;
    if (typeof e.code === "string") out.code = e.code;
    if (e.error !== undefined) {
      try {
        out.apiError = JSON.parse(JSON.stringify(e.error)) as unknown;
      } catch {
        out.apiError = String(e.error);
      }
    }
    return out;
  }
  return { value: String(err) };
}

type EmitAttempt<T> = { ok: true; data: T } | { ok: false; issues: unknown };

function parseEmit<T>(schema: LlmSchema<T>, response: LlmTransportResponse): EmitAttempt<T> {
  const block = response.content.find((b) => b.type === "tool_use" && b.name === EMIT_TOOL);
  if (!block) {
    return { ok: false, issues: [{ message: `response did not call the ${EMIT_TOOL} tool` }] };
  }
  const parsed = schema.safeParse(block.input);
  if (!parsed.success) return { ok: false, issues: parsed.error.issues };
  return { ok: true, data: parsed.data };
}

/**
 * Retry turn after a validation failure: echo the assistant turn, then answer
 * every tool_use with an is_error tool_result carrying the zod issues so the
 * model can correct itself (API requires a tool_result per tool_use id).
 */
function retryTurn(
  issues: unknown,
  response: LlmTransportResponse,
): { role: "user"; content: unknown } {
  const message =
    `The ${EMIT_TOOL} tool input failed schema validation. Errors: ${JSON.stringify(issues)}. ` +
    `Call the ${EMIT_TOOL} tool again with input that satisfies the schema exactly.`;
  const toolUses = response.content.filter((b) => b.type === "tool_use");
  if (toolUses.length === 0) {
    return { role: "user", content: [{ type: "text", text: message }] };
  }
  return {
    role: "user",
    content: toolUses.map((b) => ({
      type: "tool_result",
      tool_use_id: b.id,
      is_error: true,
      content: message,
    })),
  };
}

export function createLlmClient(opts: CreateLlmClientOpts): LlmClient {
  const model = opts.model ?? DEFAULT_MODEL;
  const phase = opts.phase ?? "A";
  const transport = opts.transport ?? sdkTransport(opts.apiKey);
  const ledger = opts.ledger;

  /** Failure-path ledger write: must never mask the original error. */
  async function safeLedger(row: AiCallRow): Promise<string | null> {
    try {
      return await ledger(row);
    } catch (err) {
      logError("llm.ledger_write_failed", err, {
        purpose: row.purpose,
        documentId: row.documentId ?? undefined,
        caseId: row.caseId ?? undefined,
      });
      return null;
    }
  }

  async function call<T = unknown>(
    input: LlmCallInput & { schema?: LlmSchema<T> },
  ): Promise<LlmCallResult<T>> {
    const documents = input.documents ?? [];
    const baseRow = {
      caseId: input.caseId ?? null,
      documentId: input.documentId ?? null,
      engineRunId: input.engineRunId ?? null,
      purpose: input.purpose,
      modelId: model,
      promptVersion: input.promptVersion,
      inputRefs: {
        documentIds: documents.map((d) => d.documentId),
        promptChars: input.prompt.length,
        systemChars: input.system?.length ?? 0,
      },
    };
    const emptyTail = {
      rawCompletion: null,
      validatedOutput: null,
      tokensIn: null,
      tokensOut: null,
      stopReason: null,
    };

    // PHASE gate (plan review S3): fail closed BEFORE any bytes reach
    // Anthropic. Anything other than isTestAccount === true blocks.
    if (phase === "A" && documents.length > 0 && input.isTestAccount !== true) {
      const err = new PhaseGateError();
      await safeLedger({
        ...baseRow,
        ...emptyTail,
        latencyMs: 0,
        errorCode: err.code,
        errorPayload: { phase, documentCount: documents.length },
      });
      logError("llm.phase_gate_blocked", err, {
        purpose: input.purpose,
        phase,
        documentId: input.documentId,
        caseId: input.caseId,
      });
      throw err;
    }

    // Build content: documents inline first, instruction text last.
    const content: Array<Record<string, unknown>> = [];
    for (const docu of documents) {
      if (docu.mediaType === "application/pdf") {
        content.push({
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: docu.base64 },
        });
      } else if (docu.mediaType.startsWith("image/")) {
        content.push({
          type: "image",
          source: { type: "base64", media_type: docu.mediaType, data: docu.base64 },
        });
      } else {
        const err = Object.assign(new Error("unsupported document media type"), {
          code: "UNSUPPORTED_MEDIA_TYPE",
        });
        await safeLedger({
          ...baseRow,
          ...emptyTail,
          latencyMs: 0,
          errorCode: "UNSUPPORTED_MEDIA_TYPE",
          errorPayload: { mediaType: docu.mediaType, documentId: docu.documentId },
        });
        throw err;
      }
    }
    content.push({ type: "text", text: input.prompt });

    const messages: Array<{ role: "user" | "assistant"; content: unknown }> = [
      { role: "user", content },
    ];
    const request: LlmTransportRequest = {
      model,
      max_tokens: input.maxTokens ?? DEFAULT_MAX_TOKENS,
      ...(input.system !== undefined ? { system: input.system } : {}),
      messages,
    };
    const schema = input.schema;
    if (schema) {
      request.tools = [
        {
          name: EMIT_TOOL,
          description:
            "Emit the structured extraction result. Call exactly once with the complete result.",
          input_schema: zodToJsonSchema(schema),
        },
      ];
      request.tool_choice = { type: "tool", name: EMIT_TOOL };
    }

    const started = Date.now();
    let tokensIn = 0;
    let tokensOut = 0;
    let rawCompletion = "";
    let stopReason = "";
    let ledgered = false;

    try {
      let response = await transport.create(request);
      tokensIn += response.usage.input_tokens;
      tokensOut += response.usage.output_tokens;
      rawCompletion = JSON.stringify(response.content);
      stopReason = response.stop_reason ?? "";

      let output: T;
      let validatedOutput: unknown = null;

      if (schema) {
        let attempt = parseEmit(schema, response);
        if (!attempt.ok) {
          // Retry exactly once with the validation errors appended.
          const retryMessages = [
            ...messages,
            { role: "assistant" as const, content: response.content },
            retryTurn(attempt.issues, response),
          ];
          response = await transport.create({ ...request, messages: retryMessages });
          tokensIn += response.usage.input_tokens;
          tokensOut += response.usage.output_tokens;
          rawCompletion = JSON.stringify(response.content);
          stopReason = response.stop_reason ?? "";
          attempt = parseEmit(schema, response);
        }
        if (!attempt.ok) {
          const latencyMs = Date.now() - started;
          await safeLedger({
            ...baseRow,
            rawCompletion,
            validatedOutput: null,
            tokensIn,
            tokensOut,
            latencyMs,
            stopReason,
            errorCode: "LLM_SCHEMA_VALIDATION",
            errorPayload: { issues: attempt.issues },
          });
          ledgered = true;
          throw new LlmValidationError(attempt.issues);
        }
        output = attempt.data;
        validatedOutput = attempt.data;
      } else {
        const text = response.content
          .filter((b) => b.type === "text")
          .map((b) => b.text ?? "")
          .join("\n");
        output = text as unknown as T;
      }

      const latencyMs = Date.now() - started;
      // Success-path ledger write is load-bearing (the row IS the audit
      // record) — if it fails, the call fails.
      const ledgerId = await ledger({
        ...baseRow,
        rawCompletion,
        validatedOutput,
        tokensIn,
        tokensOut,
        latencyMs,
        stopReason,
        errorCode: null,
        errorPayload: null,
      });
      log("llm.call", {
        purpose: input.purpose,
        model,
        promptVersion: input.promptVersion,
        tokensIn,
        tokensOut,
        durationMs: latencyMs,
        documentId: input.documentId,
        caseId: input.caseId,
      });
      return { output, rawCompletion, tokensIn, tokensOut, latencyMs, stopReason, ledgerId };
    } catch (err) {
      if (!ledgered) {
        await safeLedger({
          ...baseRow,
          rawCompletion: rawCompletion === "" ? null : rawCompletion,
          validatedOutput: null,
          tokensIn: tokensIn === 0 ? null : tokensIn,
          tokensOut: tokensOut === 0 ? null : tokensOut,
          latencyMs: Date.now() - started,
          stopReason: stopReason === "" ? null : stopReason,
          errorCode: errorCodeOf(err),
          errorPayload: serializeError(err),
        });
      }
      // Sanitized log only — never err.message (echoes document content).
      logError("llm.call_failed", err, {
        purpose: input.purpose,
        model,
        promptVersion: input.promptVersion,
        documentId: input.documentId,
        caseId: input.caseId,
      });
      throw err;
    }
  }

  return { call };
}
