import type { LineItem } from "@billcheck/shared";
import type { EngineFinding, EngineInput, ReferenceData } from "../types";

/**
 * C3 — duplicate charge detection (v1).
 *
 * Scope rule (plan: Key Technical Decisions / flow finding #15): duplicates
 * are detected WITHIN a single bill document only. The grouping key includes
 * documentId, so the same code on the same date across paired
 * facility/professional documents structurally cannot form a duplicate group —
 * cross-document matches are suppressed, protecting legitimate split billing.
 *
 * Finding amount = the duplicated amount: the group's summed amount_cents
 * minus the single most expensive occurrence (the one occurrence presumed
 * legitimate — conservative). Lines with null amounts contribute nothing; if
 * every line in the group has a null amount, the impact is null (unknown).
 */
export const CHECK_VERSION = "v1";

export function runC3Duplicates(
  input: EngineInput,
  _refs: ReferenceData,
): EngineFinding[] | null {
  const coded = input.lineItems.filter((li) => li.code !== null);
  if (!input.itemized || coded.length === 0) return null;

  const groups = new Map<string, LineItem[]>();
  for (const li of coded) {
    const key = `${li.code}::${li.dateOfService ?? ""}::${li.documentId}`;
    const group = groups.get(key);
    if (group) group.push(li);
    else groups.set(key, [li]);
  }

  const findings: EngineFinding[] = [];
  for (const lines of groups.values()) {
    if (lines.length < 2) continue;
    const first = lines[0];
    const amounts = lines
      .map((l) => l.amountCents)
      .filter((a): a is number => a !== null);
    const amountImpactCents =
      amounts.length === 0
        ? null
        : amounts.reduce((sum, a) => sum + a, 0) - Math.max(...amounts);
    findings.push({
      checkId: "C3",
      checkVersion: CHECK_VERSION,
      refVersions: {},
      confidenceTier: "high",
      amountImpactCents,
      title: `Duplicate charge: code ${first.code} billed ${lines.length}x on the same date`,
      evidence: lines.map((l, i) => ({
        documentId: l.documentId,
        lineItemId: l.id,
        note: `occurrence ${i + 1} of ${lines.length} for code ${first.code} on the same document and date`,
      })),
      evidenceKey: `C3:${first.code}:${first.dateOfService ?? ""}:${first.documentId}`,
    });
  }
  return findings;
}
