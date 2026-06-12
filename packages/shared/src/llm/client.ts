/**
 * The ONLY path to the Anthropic API in this codebase (plan: Key Technical
 * Decisions — AI call ledger). Direct `@anthropic-ai/sdk` imports are
 * lint-banned everywhere else.
 *
 * Responsibilities (wired up in U5):
 *  - Writes an `ai_calls` ledger row per call: purpose, model, promptVersion,
 *    input refs (document version, never duplicated bytes), raw completion,
 *    validated output, tokensIn/Out, latencyMs, stopReason, errorCode.
 *  - Enforces the PHASE gate: in PHASE=A, document-bearing calls require the
 *    owning account to be flagged test/synthetic — otherwise FAIL CLOSED
 *    before any bytes reach Anthropic (pre-BAA boundary, plan review S3).
 *  - Single config-driven model (arch D3): no routing logic.
 */

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
  /** When set, the call requests structured output validated against this schema name. */
  schemaName?: string;
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

export const MODEL_ID = process.env.BILLCHECK_MODEL ?? "claude-sonnet-4-6";
export const PHASE = process.env.BILLCHECK_PHASE ?? "A";

export class LlmNotWiredError extends Error {
  code = "LLM_NOT_WIRED";
  constructor() {
    super("LLM client is wired in U5 — set ANTHROPIC_API_KEY and implement callLlm.");
  }
}

/** Implemented in U5. Until then, callers compile against this contract. */
export async function callLlm<T = unknown>(_input: LlmCallInput): Promise<LlmCallResult<T>> {
  throw new LlmNotWiredError();
}
