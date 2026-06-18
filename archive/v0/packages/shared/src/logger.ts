/**
 * Structured logger with a hard field allowlist.
 *
 * PHI rule (plan R8 / AGENTS.md): document content, parse output, user names,
 * emails, and error messages that may echo document text must NEVER reach
 * stdout/stderr or any log drain. Only the fields below may be logged.
 * Everything else is dropped silently (counted in `droppedFields`).
 *
 * Full error payloads belong in the `ai_calls` ledger (Postgres, RLS-protected),
 * never in logs. `console.*` is lint-banned in workers/jobs — use this logger.
 */

const ALLOWED_FIELDS = new Set([
  "level",
  "caseId",
  "documentId",
  "runId",
  "workflowRunId",
  "userRef",
  "status",
  "errorCode",
  "errorClass",
  "durationMs",
  "model",
  "promptVersion",
  "purpose",
  "tokensIn",
  "tokensOut",
  "count",
  "check",
  "refVersion",
  "phase",
  "route",
  "jobId",
  "batchSize",
]);

type LogValue = string | number | boolean | null | undefined;
export type LogFields = Record<string, LogValue>;

function sanitize(fields: LogFields): Record<string, LogValue> {
  const out: Record<string, LogValue> = {};
  let dropped = 0;
  for (const [k, v] of Object.entries(fields)) {
    if (ALLOWED_FIELDS.has(k)) out[k] = v;
    else dropped += 1;
  }
  if (dropped > 0) out["droppedFields"] = dropped;
  return out;
}

export function log(event: string, fields: LogFields = {}): void {
  const entry = { event, at: new Date().toISOString(), ...sanitize(fields) };
  process.stdout.write(JSON.stringify(entry) + "\n");
}

/**
 * Error logging: extracts only the error's class name and a code if present.
 * NEVER logs error.message — zod issues and SDK errors echo document content.
 * The full error object should be persisted to the ai_calls ledger row instead.
 */
export function logError(event: string, err: unknown, fields: LogFields = {}): void {
  const errorClass = err instanceof Error ? err.constructor.name : typeof err;
  const errorCode =
    typeof err === "object" && err !== null && "code" in err
      ? String((err as { code: unknown }).code)
      : undefined;
  log(event, { ...fields, level: "error", errorClass, errorCode });
}
