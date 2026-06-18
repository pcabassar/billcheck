import { CheckId, type CoverageEntry } from "@billcheck/shared";

/**
 * The coverage map is the rendering source of truth for S10/S11 check copy
 * (plan: Key Technical Decisions). Every one of the 13 checks must appear in
 * every run's coverage, in canonical CheckId order: ran / skipped_no_data /
 * not_yet_available — never silent absence.
 */
export function completeCoverage(entries: CoverageEntry[]): CoverageEntry[] {
  const seen = new Set(entries.map((e) => e.checkId));
  const out = [...entries];
  for (const id of CheckId.options) {
    if (!seen.has(id)) {
      out.push({ checkId: id, status: "not_yet_available", reason: null });
    }
  }
  const order = new Map(CheckId.options.map((id, i) => [id, i] as const));
  return out.sort((a, b) => (order.get(a.checkId) ?? 0) - (order.get(b.checkId) ?? 0));
}
