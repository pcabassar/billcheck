/**
 * The app-side LLM singleton: the shared client (packages/shared/src/llm)
 * wired to the ai_calls ledger (service-role insert) and the PHASE gate
 * (BILLCHECK_PHASE). Everything in apps/web that talks to Anthropic imports
 * { llm } / { llmCall } from here — never the SDK, never createLlmClient
 * directly.
 *
 * SERVER ONLY (uses the service-role key via the admin client): legal in
 * WDK workflow steps and server routes per the AGENTS.md key map.
 *
 * The caller passes isTestAccount explicitly — this module looks nothing up
 * (contract: PHASE-gate input is resolved by the caller from the owning
 * account's profile, e.g. lib/parse/run-parse.ts).
 */
import {
  createLlmClient,
  type AiCallRow,
  type LlmCallInput,
  type LlmCallResult,
  type LlmClient,
  type LlmSchema,
} from "@billcheck/shared";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

let singleton: LlmClient | null = null;

/**
 * Every LLM call writes exactly one ai_calls row (success and failure).
 * Full raw/validated output and error payloads live HERE (RLS-protected
 * Postgres, same purge lifecycle as the case) — never in logs.
 */
async function writeAiCallRow(row: AiCallRow): Promise<string> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("ai_calls")
    .insert({
      case_id: row.caseId,
      document_id: row.documentId,
      engine_run_id: row.engineRunId,
      purpose: row.purpose,
      model_id: row.modelId,
      prompt_version: row.promptVersion,
      input_refs: row.inputRefs,
      raw_completion: row.rawCompletion,
      validated_output: row.validatedOutput ?? null,
      tokens_in: row.tokensIn,
      tokens_out: row.tokensOut,
      latency_ms: row.latencyMs,
      stop_reason: row.stopReason,
      error_code: row.errorCode,
      error_payload: row.errorPayload ?? null,
    })
    .select("id")
    .single();
  if (error || !data) {
    // Constant message — supabase error details may echo row content.
    throw Object.assign(new Error("ai_calls ledger insert failed"), {
      code: "LEDGER_INSERT_FAILED",
    });
  }
  return (data as { id: string }).id;
}

function getLlm(): LlmClient {
  if (!singleton) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw Object.assign(new Error("ANTHROPIC_API_KEY is not set"), {
        code: "LLM_NOT_CONFIGURED",
      });
    }
    singleton = createLlmClient({
      apiKey,
      model: process.env.BILLCHECK_MODEL,
      phase: process.env.BILLCHECK_PHASE ?? "A",
      ledger: writeAiCallRow,
    });
  }
  return singleton;
}

/** Make one ledgered LLM call. isTestAccount is mandatory at this boundary (PHASE gate input). */
export async function llmCall<T = unknown>(
  input: LlmCallInput & { isTestAccount: boolean; schema?: LlmSchema<T> },
): Promise<LlmCallResult<T>> {
  return getLlm().call<T>(input);
}

/** Lazy singleton facade (contract #1). */
export const llm = { call: llmCall };
