import type { CaseState } from "@billcheck/shared";

/**
 * Edit lock (plan U6, deepening data #1): confirm-screen edits to the original
 * parse close at AUDITED — after that, corrections create a new statement
 * version, never in-place mutation (protects the frozen savings baseline).
 * Attestations follow the same gate: the engine consumes them at audit time.
 */
export const EDITABLE_STATES = ["CAPTURED", "TRIAGED"] as const satisfies readonly CaseState[];

export function isEditableState(state: string): boolean {
  return (EDITABLE_STATES as readonly string[]).includes(state);
}

/**
 * Full edit-lock check (review F71): edits freeze the moment the audit claim
 * is taken (cases.audit_locked_at), not just when the state flips to AUDITED
 * — the engine reads line items before that flip. Mirrors the DB trigger.
 */
export function isCaseEditable(state: string, auditLockedAt: string | null): boolean {
  return isEditableState(state) && auditLockedAt === null;
}

/** Per-field confidence below this is visually flagged on S3 confirm. */
export const LOW_CONFIDENCE_THRESHOLD = 0.7;

export function isLowConfidence(confidence: number): boolean {
  return confidence < LOW_CONFIDENCE_THRESHOLD;
}

export const ATTESTATION_STATUSES = ["remember", "not_sure", "didnt_happen"] as const;
export type AttestationStatus = (typeof ATTESTATION_STATUSES)[number];

export const PARSE_PENDING_STATUSES = ["pending", "parsing"] as const;

export function isParsePending(parseStatus: string): boolean {
  return (PARSE_PENDING_STATUSES as readonly string[]).includes(parseStatus);
}
