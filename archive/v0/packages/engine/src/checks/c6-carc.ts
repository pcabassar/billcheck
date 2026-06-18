import type { EngineFinding, EngineInput, ReferenceData } from "../types";

/**
 * C6 — denial-code liability (v1, U16). CARC codes on the EOB whose
 * liability class is `provider_writeoff` mean the PATIENT DOES NOT OWE that
 * adjustment: timely-filing failures (CO-29), amounts over the contracted
 * fee schedule (CO-45), bundled services (CO-97) — the provider's contract
 * with the insurer eats these, and billing the patient for them is
 * disputable per se.
 */
export const CHECK_VERSION = "v1";

export function runC6Carc(
  input: EngineInput,
  refs: ReferenceData,
): EngineFinding[] | null {
  const eob = input.eob;
  if (!eob || eob.carcCodes.length === 0) return null;
  if (refs.carcLiability.size === 0) return null;

  const findings: EngineFinding[] = [];
  const seen = new Set<string>();
  for (const carc of eob.carcCodes) {
    const code = carc.code.toUpperCase().trim();
    if (seen.has(code)) continue;
    seen.add(code);
    const liability = refs.carcLiability.get(code);
    if (liability !== "provider_writeoff") continue;
    findings.push({
      checkId: "C6",
      checkVersion: CHECK_VERSION,
      refVersions: { carc_rarc: refs.versions.carcRarc },
      confidenceTier: "high",
      amountImpactCents: carc.amountCents,
      title: `Code ${code} on your EOB is a provider write-off — you are not liable for that adjustment`,
      evidence: [
        {
          documentId: input.lineItems[0]?.documentId ?? "",
          lineItemId: null,
          note: `EOB adjustment ${code}${carc.amountCents !== null ? ` for ${(carc.amountCents / 100).toFixed(2)}` : ""} is classed provider_writeoff — contractually not patient responsibility`,
        },
      ],
      evidenceKey: `C6:${code}`,
    });
  }
  return findings;
}
