import { z } from "zod";

/**
 * ParsedEob (U16): the EOB's adjudication facts, document-level for V0.
 * Extracted by the same single Sonnet call pattern as ParsedBill; validated
 * here; only typed fields reach the DB (documents.extracted.eob). The
 * engine compares these against the BILL — the EOB is the insurer's answer
 * sheet, and C1 (balance billing) is pure arithmetic off it.
 *
 * All money is integer cents. CARC codes are the standardized Claim
 * Adjustment Reason Codes printed next to adjustments (e.g. "CO-45").
 */
export const ParsedEobCarc = z.object({
  /** Code exactly as printed, normalized upper-case (e.g. "CO-45", "PR-1"). */
  code: z.string(),
  /** Dollar amount tied to this code on the EOB, if printed. */
  amountCents: z.number().int().nullable(),
});

export const ParsedEob = z.object({
  /** Insurer name as printed. */
  payer: z.string().nullable(),
  /** ISO date of service this EOB adjudicates, or null. */
  dateOfService: z.string().nullable(),
  /** Total billed by the provider as shown on the EOB. */
  billedCents: z.number().int().nullable(),
  /** Plan-allowed amount. */
  allowedCents: z.number().int().nullable(),
  /** What the plan paid. */
  planPaidCents: z.number().int().nullable(),
  /** THE number: what the EOB says the patient owes. */
  patientResponsibilityCents: z.number().int().nullable(),
  /** Adjustment reason codes with their printed amounts. */
  carcCodes: z.array(ParsedEobCarc),
  /** True when the document says it is not a bill (standard EOB language). */
  statesNotABill: z.boolean(),
  /** 0-1 read confidence (blur, ambiguity). */
  confidence: z.number().min(0).max(1),
});
export type ParsedEob = z.infer<typeof ParsedEob>;
export type ParsedEobCarc = z.infer<typeof ParsedEobCarc>;
