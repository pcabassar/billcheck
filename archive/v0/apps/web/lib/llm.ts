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
  log,
  logError,
  SpendAlarmError,
  sumCostCents,
  type AiCallRow,
  type LlmCallInput,
  type LlmCallResult,
  type LlmClient,
  type LlmSchema,
} from "@billcheck/shared";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Spend kill switch (plan: spend alarm — required before the public
 * anonymous funnel). A coarse GLOBAL ceiling on rolling LLM cost estimated
 * from the ai_calls ledger; trips → document-bearing calls are paused. This
 * is the runaway-cost backstop; the per-account 20/hr limit is the
 * per-user one.
 *
 *   BILLCHECK_SPEND_CEILING_CENTS  rolling-window cost cap (default $50.00)
 *   BILLCHECK_SPEND_WINDOW_HOURS   lookback window (default 24h)
 *
 * Set the ceiling to 0 to DISABLE the cap (e.g. a controlled load test).
 * Fail-OPEN on a ledger read error: the cap must never wedge the product on
 * a transient DB blip (the PHASE gate is the hard pre-BAA boundary; this is
 * a budget guard).
 */
const DEFAULT_CEILING_CENTS = 5000;
const DEFAULT_WINDOW_HOURS = 24;

async function spendGuard(): Promise<void> {
  const ceiling = Number(process.env.BILLCHECK_SPEND_CEILING_CENTS ?? DEFAULT_CEILING_CENTS);
  if (!Number.isFinite(ceiling) || ceiling <= 0) return; // disabled
  const windowHours = Number(process.env.BILLCHECK_SPEND_WINDOW_HOURS ?? DEFAULT_WINDOW_HOURS);
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("ai_calls")
    .select("model_id, tokens_in, tokens_out")
    .gte("created_at", since)
    .limit(100_000);
  if (error) {
    // Fail open — never wedge the product on a transient read failure.
    logError("llm.spend_guard.read_failed", error, {});
    return;
  }
  const spentCents = sumCostCents(
    (data ?? []) as Array<{ model_id: string; tokens_in: number | null; tokens_out: number | null }>,
  );
  if (spentCents >= ceiling) {
    log("llm.spend_guard.tripped", { count: Math.round(spentCents) });
    throw new SpendAlarmError();
  }
}

let singleton: LlmClient | null = null;

/**
 * Every LLM call writes exactly one ai_calls row (success and failure).
 * Full raw/validated output and error payloads live HERE (RLS-protected
 * Postgres, same purge lifecycle as the case) — never in logs.
 */
async function writeAiCallRow(row: AiCallRow): Promise<string> {
  const admin = createSupabaseAdminClient();
  // The success-path write is load-bearing (the row IS the audit record), so
  // a single Supabase blip must not discard a completed — and paid-for —
  // Anthropic call (review F33). Three attempts with short backoff.
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, attempt * 500));
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
    if (!error && data) return (data as { id: string }).id;
    lastError = error;
  }
  void lastError;
  // Constant message — supabase error details may echo row content.
  throw Object.assign(new Error("ai_calls ledger insert failed"), {
    code: "LEDGER_INSERT_FAILED",
  });
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
      spendGuard,
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
