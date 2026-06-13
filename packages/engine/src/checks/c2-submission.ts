import type { EngineFinding, EngineInput, ReferenceData } from "../types";

/**
 * C2 — was insurance billed at all? (v1, U16)
 *
 * The insured patient holding a full-charge bill with no EOB and no
 * insurance adjustments on the bill is the classic "they never submitted
 * the claim" pattern. Review-tier — the signals are circumstantial — but
 * the action ("ask the provider to bill your insurance before paying a
 * cent") is high-value and free.
 *
 * Signals: triage says insured; no EOB document; the bill shows neither
 * credit lines nor insurance-adjustment lines (no negative amounts).
 */
export const CHECK_VERSION = "v1";

export function runC2Submission(
  input: EngineInput,
  _refs: ReferenceData,
): EngineFinding[] | null {
  if (input.coverage?.insured !== true) return null;
  if (input.lineItems.length === 0) return null;

  // An EOB in hand means the claim WAS submitted — ran clean.
  if (input.eob) return [];

  const hasCreditOrAdjustment = input.lineItems.some(
    (li) => li.amountCents !== null && li.amountCents < 0,
  );
  if (hasCreditOrAdjustment) return [];

  return [
    {
      checkId: "C2",
      checkVersion: CHECK_VERSION,
      refVersions: {},
      confidenceTier: "review",
      amountImpactCents: null,
      title: "No sign your insurance was billed — full charges, no adjustments, no EOB",
      evidence: [
        {
          documentId: input.lineItems[0]?.documentId ?? "",
          lineItemId: null,
          note: "bill shows gross charges with no insurance payments or adjustments; ask the provider to submit the claim before paying",
        },
      ],
      evidenceKey: "C2:no-submission-signals",
    },
  ];
}
