import type { LineItem } from "@billcheck/shared";
import type { EngineFinding, EngineInput, ReferenceData } from "../types";

/**
 * C4 — NCCI procedure-to-procedure (PTP) unbundling (v1).
 *
 * For each pair of coded lines on the same document + same date of service,
 * if the pair appears in the injected NCCI PTP set ("code1|code2", where
 * column1 is the comprehensive code and column2 the component), the component
 * should not have been billed separately → HIGH finding, amount = the
 * component line's amount_cents (null when it prints no charge).
 *
 * Matching tries both orientations against the set; the evidence key uses the
 * lexicographically sorted pair so it is stable regardless of line order, and
 * repeat line combinations of the same pair dedupe to one finding.
 */
export const CHECK_VERSION = "v2";

export function runC4Ncci(
  input: EngineInput,
  refs: ReferenceData,
): EngineFinding[] | null {
  const coded = input.lineItems.filter((li) => li.code !== null);
  if (coded.length === 0 || refs.ncciPtp.size === 0) return null;

  const groups = new Map<string, LineItem[]>();
  for (const li of coded) {
    const key = `${li.dateOfService ?? ""}::${li.documentId}`;
    const group = groups.get(key);
    if (group) group.push(li);
    else groups.set(key, [li]);
  }

  const findings: EngineFinding[] = [];
  const seenKeys = new Set<string>();
  for (const lines of groups.values()) {
    for (let i = 0; i < lines.length; i++) {
      for (let j = i + 1; j < lines.length; j++) {
        const a = lines[i];
        const b = lines[j];
        const matched = refs.ncciPtp.has(`${a.code}|${b.code}`)
          ? { comprehensive: a, component: b }
          : refs.ncciPtp.has(`${b.code}|${a.code}`)
            ? { comprehensive: b, component: a }
            : null;
        if (matched === null) continue;

        const sortedPair = [a.code as string, b.code as string].sort().join("|");
        const evidenceKey = `C4:${sortedPair}:${a.dateOfService ?? ""}:${a.documentId}`;
        if (seenKeys.has(evidenceKey)) continue;
        seenKeys.add(evidenceKey);


        findings.push({
          checkId: "C4",
          checkVersion: CHECK_VERSION,
          refVersions: { ncci_ptp: refs.versions.ncciPtp },
          confidenceTier: "high",
          // The disputed amount is what the COMPONENT line charged (the line
          // that should not have been billed separately). When that line has
          // no printed charge, the impact is unknown — never substitute the
          // comprehensive line's amount (F07: overstated disputes).
          amountImpactCents: matched.component.amountCents,
          title: `Unbundled pair: code ${matched.component.code} should not be billed separately with ${matched.comprehensive.code} (NCCI PTP)`,
          evidence: [
            {
              documentId: matched.comprehensive.documentId,
              lineItemId: matched.comprehensive.id,
              note: `column 1 (comprehensive) code ${matched.comprehensive.code}`,
            },
            {
              documentId: matched.component.documentId,
              lineItemId: matched.component.id,
              note: `column 2 (component) code ${matched.component.code} billed on the same document and date`,
            },
          ],
          evidenceKey,
        });
      }
    }
  }
  return findings;
}
