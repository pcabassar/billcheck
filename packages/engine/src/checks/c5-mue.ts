import type { EngineFinding, EngineInput, ReferenceData } from "../types";

/**
 * C5 — Medically Unlikely Edits (MUE) units check (v1).
 *
 * A line whose units exceed the MUE max for its code → HIGH finding.
 * Amount = (units - max) * per-unit price, where per-unit price is
 * amount_cents / units rounded DOWN (integer cents everywhere — the
 * conservative floor never overstates the impact). Lines with a null amount
 * still flag, with a null impact.
 *
 * Skips (null → skipped_no_data) when no line carries both a code and
 * positive units, or when the injected MUE set is empty.
 */
export const CHECK_VERSION = "v1";

export function runC5Mue(
  input: EngineInput,
  refs: ReferenceData,
): EngineFinding[] | null {
  const eligible = input.lineItems.filter(
    (li) => li.code !== null && li.units !== null && li.units > 0,
  );
  if (eligible.length === 0 || refs.mue.size === 0) return null;

  const findings: EngineFinding[] = [];
  for (const li of eligible) {
    const code = li.code as string;
    const units = li.units as number;
    const max = refs.mue.get(code);
    if (max === undefined || units <= max) continue;

    const perUnitCents =
      li.amountCents === null ? null : Math.floor(li.amountCents / units);
    findings.push({
      checkId: "C5",
      checkVersion: CHECK_VERSION,
      refVersions: { mue: refs.version },
      confidenceTier: "high",
      amountImpactCents: perUnitCents === null ? null : (units - max) * perUnitCents,
      title: `Units exceed MUE limit: code ${code} billed ${units} units (limit ${max})`,
      evidence: [
        {
          documentId: li.documentId,
          lineItemId: li.id,
          note: `units ${units} exceed the MUE max of ${max} for code ${code}`,
        },
      ],
      evidenceKey: `C5:${code}:${li.dateOfService ?? ""}:${li.documentId}:${li.id}`,
    });
  }
  return findings;
}
