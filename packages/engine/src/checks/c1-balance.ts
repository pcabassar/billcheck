import type { EngineFinding, EngineInput, ReferenceData } from "../types";

/**
 * C1 — balance billing vs the EOB (v1, U16). Pure arithmetic, and the single
 * most winnable dispute class: the bill asks for more than the EOB's
 * patient-responsibility figure.
 *
 * DOS guard (plan edge): an EOB adjudicating a DIFFERENT date of service
 * must not produce a false C1 — it yields a review-tier mismatch flag
 * instead of arithmetic.
 */
export const CHECK_VERSION = "v1";

/** Sub-dollar deltas are rounding, not balance billing. */
const TOLERANCE_CENTS = 100;

export function runC1Balance(
  input: EngineInput,
  _refs: ReferenceData,
): EngineFinding[] | null {
  const eob = input.eob;
  if (!eob || eob.patientResponsibilityCents === null) return null;

  const lineSum = input.lineItems.reduce(
    (sum, li) => sum + (li.amountCents !== null && li.amountCents > 0 ? li.amountCents : 0),
    0,
  );
  const billTotal = input.billTotalCents ?? (lineSum > 0 ? lineSum : null);
  if (billTotal === null) return null;

  // DOS guard: only compare when the EOB's date matches a billed date (or
  // either side prints no date — common enough that blocking would gut C1).
  const billDates = new Set(
    input.lineItems.map((li) => li.dateOfService).filter((d): d is string => d !== null),
  );
  if (eob.dateOfService !== null && billDates.size > 0 && !billDates.has(eob.dateOfService)) {
    return [
      {
        checkId: "C1",
        checkVersion: CHECK_VERSION,
        refVersions: {},
        confidenceTier: "review",
        amountImpactCents: null,
        title: "Your EOB covers a different date of service than this bill — match them before comparing",
        evidence: [
          {
            documentId: input.lineItems[0]?.documentId ?? "",
            lineItemId: null,
            note: `EOB date ${eob.dateOfService} vs billed dates ${[...billDates].join(", ")}`,
          },
        ],
        evidenceKey: `C1:dos-mismatch:${eob.dateOfService}`,
      },
    ];
  }

  const overBilled = billTotal - eob.patientResponsibilityCents;
  if (overBilled <= TOLERANCE_CENTS) return [];

  return [
    {
      checkId: "C1",
      checkVersion: CHECK_VERSION,
      refVersions: {},
      confidenceTier: "high",
      amountImpactCents: overBilled,
      title: `Balance billing: the bill asks $${(overBilled / 100).toFixed(2)} more than your EOB says you owe`,
      evidence: [
        {
          documentId: input.lineItems[0]?.documentId ?? "",
          lineItemId: null,
          note: `billed ${(billTotal / 100).toFixed(2)} vs EOB patient responsibility ${(eob.patientResponsibilityCents / 100).toFixed(2)}`,
        },
      ],
      evidenceKey: `C1:${billTotal}:${eob.patientResponsibilityCents}`,
    },
  ];
}
