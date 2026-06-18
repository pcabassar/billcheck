import type { EngineFinding, EngineInput, FapPolicy, IncomeBand, ReferenceData } from "../types";

/**
 * C9 — financial-assistance (FAP) screening (v1, U11).
 *
 * IRS 501(r) requires nonprofit hospitals to publish financial-assistance
 * policies. We match the bill's provider against the seeded policy set and
 * compare the user's coarse income band to the published FPL thresholds.
 *
 * Tier semantics (income is self-reported and coarse — never "high"):
 *  - medium: the WHOLE band sits at/under the published threshold ("your
 *    band qualifies under their published policy")
 *  - review: the threshold falls inside the band ("may qualify — worth
 *    applying")
 *
 * Skips (null): no income band, provider not in the seeded set (the
 * coverage map's skipped_no_data copy invites "tell us your hospital"), or
 * an empty seed.
 */
export const CHECK_VERSION = "v1";

/** Band bounds as FPL multiples: [lower, upper). */
const BAND_BOUNDS: Record<IncomeBand, [number, number]> = {
  under_2x_fpl: [0, 2],
  "2x_to_4x_fpl": [2, 4],
  over_4x_fpl: [4, Number.POSITIVE_INFINITY],
};

function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

function matchPolicy(provider: string, policies: FapPolicy[]): FapPolicy | null {
  const target = normalize(provider);
  if (target.length === 0) return null;
  for (const p of policies) {
    const candidate = normalize(p.hospitalName);
    if (candidate.length === 0) continue;
    if (target.includes(candidate) || candidate.includes(target)) return p;
  }
  return null;
}

export function runC9Fap(
  input: EngineInput,
  refs: ReferenceData,
): EngineFinding[] | null {
  if (input.coverage?.c9Enabled !== true) return null;
  const band = input.coverage.incomeBand;
  if (!band) return null;
  if (refs.fapPolicies.length === 0) return null;
  if (!input.providerName) return null;

  const policy = matchPolicy(input.providerName, refs.fapPolicies);
  if (!policy) return null; // skipped_no_data → "tell us your hospital"

  const [lower, upper] = BAND_BOUNDS[band];

  function judge(threshold: number | null, kind: "free" | "discounted"): EngineFinding | null {
    if (threshold === null || threshold <= 0) return null;
    if (upper <= threshold) {
      return finding("medium", `Likely eligible for ${kind} care under ${policy!.hospitalName}'s financial-assistance policy`);
    }
    if (lower < threshold) {
      return finding("review", `May qualify for ${kind} care under ${policy!.hospitalName}'s policy — worth applying`);
    }
    return null;
  }

  function finding(tier: "medium" | "review", title: string): EngineFinding {
    return {
      checkId: "C9",
      checkVersion: CHECK_VERSION,
      refVersions: { fap_policies: refs.versions.fapPolicies },
      confidenceTier: tier,
      // Eligibility, not a dollar dispute — no asserted amount (A2).
      amountImpactCents: null,
      title,
      evidence: [
        {
          documentId: input.lineItems[0]?.documentId ?? "",
          lineItemId: null,
          note: `published thresholds: free ≤ ${policy!.thresholdFreeFpl ?? "n/a"}× FPL, discounted ≤ ${policy!.thresholdDiscountFpl ?? "n/a"}× FPL`,
        },
      ],
      evidenceKey: `C9:${normalize(policy!.hospitalName)}:${band}`,
    };
  }

  const free = judge(policy.thresholdFreeFpl, "free");
  if (free) return [free];
  const discounted = judge(policy.thresholdDiscountFpl, "discounted");
  if (discounted) return [discounted];
  return []; // matched + compared, nothing qualifies → ran clean
}
