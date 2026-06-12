/**
 * LLM structured-output contracts for upload classification (U4) and the
 * parse step (U5). These zod schemas are the single contract between the
 * Sonnet calls, the web app, and the engine (AGENTS.md style rule) — they
 * are converted to the forced `emit` tool's JSON schema by the LLM client
 * and validate its output.
 *
 * Money is integer cents everywhere (plan invariant #5). The parse step
 * rounds before writing line_items.amount_cents (bigint).
 *
 * NOTE: keep these inside the zod subset supported by
 * packages/shared/src/llm/json-schema.ts (objects/strings/numbers/booleans/
 * arrays/enums/nullable) — unsupported types throw at call time.
 */
import { z } from "zod";

/** D1 classification of an uploaded document (first page, cheap call). */
export const ClassifyResult = z.object({
  kind: z.enum(["bill", "eob", "gfe", "receipt", "collection_notice", "other"]),
  quality: z.enum(["ok", "blurry", "partial"]),
  /** Billing provider/facility name as printed, for upload-time dedupe. */
  provider: z.string().nullable(),
  /** Patient account number as printed, for upload-time dedupe. */
  accountNumber: z.string().nullable(),
  /** Primary date of service (ISO YYYY-MM-DD), for upload-time dedupe. */
  dateOfService: z.string().nullable(),
});
export type ClassifyResult = z.infer<typeof ClassifyResult>;

export const ParsedBillLineItem = z.object({
  /** Procedure/revenue/drug code exactly as printed; null when the line has none. */
  code: z.string().nullable(),
  codeSystem: z.enum(["cpt_hcpcs", "revenue", "ndc", "unknown"]).nullable(),
  /** Line description exactly as printed. */
  descriptionRaw: z.string(),
  /** Plain-English meaning for the patient — the decode rides along with parse. */
  descriptionPlain: z.string(),
  units: z.number().nullable(),
  /** Integer cents. */
  amountCents: z.number().nullable(),
  /** ISO date YYYY-MM-DD. */
  dateOfService: z.string().nullable(),
  /** 0..1 extraction confidence for this line (drives S3 confirm flags). */
  confidence: z.number(),
});
export type ParsedBillLineItem = z.infer<typeof ParsedBillLineItem>;

export const ParsedBill = z.object({
  /** True only if individual service lines are present (D2); summary bills route to GET_ITEMIZED. */
  itemized: z.boolean(),
  /** True if insurance adjudication amounts are visible on the document (D3). */
  adjudicationVisible: z.boolean(),
  /**
   * The document's own printed total in integer cents, extracted
   * independently of the line items — the reconciliation gate (review A1)
   * compares sum(lineItems.amountCents) against this. Null when no total is
   * printed.
   */
  printedTotalCents: z.number().nullable(),
  lineItems: z.array(ParsedBillLineItem),
});
export type ParsedBill = z.infer<typeof ParsedBill>;
