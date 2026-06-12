import { z } from "zod";

/**
 * Case states V0 actually writes (plan: Key Technical Decisions).
 * GATHERING / EXECUTING / AWAITING_RESPONSE / ESCALATED are reserved for V1 —
 * the DB transition trigger (U2) rejects them; do not add here without a
 * migration + plan update.
 */
export const CaseState = z.enum([
  "CAPTURED",
  "TRIAGED",
  "AUDITED",
  "VERDICT",
  "WAITING_ADJUDICATION",
  "WAITING_ITEMIZED",
  "SENT_BY_USER",
  "RESOLVED_SELF_REPORTED",
  "RESOLVED_VERIFIED",
  "CLOSED_BY_USER",
]);
export type CaseState = z.infer<typeof CaseState>;

export const DocumentKind = z.enum([
  "bill",
  "eob",
  "gfe",
  "receipt",
  "collection_notice",
  "corrected_statement",
  "other",
]);
export type DocumentKind = z.infer<typeof DocumentKind>;

export const CheckId = z.enum([
  "C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9", "C10", "C11", "C12", "C13",
]);
export type CheckId = z.infer<typeof CheckId>;

export const ConfidenceTier = z.enum(["high", "medium", "review"]);
export type ConfidenceTier = z.infer<typeof ConfidenceTier>;

/** All monetary values are integer cents (plan: deepening data #1). */
export const LineItem = z.object({
  id: z.string(),
  documentId: z.string(),
  code: z.string().nullable(),
  codeSystem: z.enum(["cpt_hcpcs", "revenue", "ndc", "unknown"]).nullable(),
  descriptionRaw: z.string(),
  descriptionPlain: z.string().nullable(),
  units: z.number().int().nullable(),
  amountCents: z.number().int().nullable(),
  dateOfService: z.string().nullable(), // ISO date
  confidence: z.number().min(0).max(1),
});
export type LineItem = z.infer<typeof LineItem>;

export const Finding = z.object({
  checkId: CheckId,
  checkVersion: z.string(),
  refVersions: z.record(z.string(), z.string()).default({}),
  confidenceTier: ConfidenceTier,
  amountImpactCents: z.number().int().nullable(),
  title: z.string(),
  /** Evidence pointers reference documents/line items — never free-text PHI blobs in logs. */
  evidence: z.array(
    z.object({
      documentId: z.string(),
      lineItemId: z.string().nullable(),
      note: z.string(),
    }),
  ),
});
export type Finding = z.infer<typeof Finding>;

export const CoverageStatus = z.enum(["ran", "skipped_no_data", "not_yet_available"]);
export type CoverageStatus = z.infer<typeof CoverageStatus>;

export const CoverageEntry = z.object({
  checkId: CheckId,
  status: CoverageStatus,
  reason: z.string().nullable(),
});
export type CoverageEntry = z.infer<typeof CoverageEntry>;

export const VerdictKind = z.enum([
  "REJECT",
  "WAIT",
  "VALIDATE",
  "APPEAL",
  "CONTEST",
  "REDUCE",
  "NEGOTIATE",
  "PAY",
  "GET_ITEMIZED",
]);
export type VerdictKind = z.infer<typeof VerdictKind>;
