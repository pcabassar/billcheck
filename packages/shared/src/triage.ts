import { z } from "zod";

/**
 * Triage (U10, spec S4): the question set that routes a case. Answers are
 * the USER's claims about coverage status — "not sure" is always allowed and
 * routes conservatively. Stored on cases.coverage_profile; consumed by the
 * D10 verdict router (U12) and the coverage map.
 *
 * No PHI beyond coverage facts lives here: no names, no plan IDs, no
 * document text. State is a two-letter code; income is a coarse band used
 * only for FAP screening (C9).
 */

const TriState = z.enum(["yes", "no", "not_sure"]);
export type TriState = z.infer<typeof TriState>;

export const TriageAnswers = z.object({
  /** Do you have health insurance that should cover this visit? */
  insured: TriState,
  /** Has your insurance already processed this bill (EOB received / portal shows it)? */
  adjudicated: TriState,
  /** Is this bill with a collection agency (calls/letters from a third party)? */
  collections: TriState,
  /** Did your insurance DENY a claim for this visit? */
  denied: TriState,
  /** Have you already paid this bill (fully or partially)? */
  alreadyPaid: TriState,
  /** Could another payer owe this (auto accident, workers' comp, etc.)? */
  otherPayer: TriState,
  /** Two-letter state code, for state-specific levers. */
  state: z.string().regex(/^[A-Z]{2}$/).nullable(),
  /** Coarse household income band — FAP screening only (C9). */
  incomeBand: z.enum(["under_2x_fpl", "2x_to_4x_fpl", "over_4x_fpl", "skip"]).nullable(),
  /** Self-pay: were you given a Good Faith Estimate before care? */
  gfeReceived: TriState,
});
export type TriageAnswers = z.infer<typeof TriageAnswers>;

/**
 * Routing flags derived from the answers (plan D4/D5/D6/D14/D15). Pure and
 * deterministic — the table-driven test in triage.test.ts is the contract.
 */
export interface RoutingFlags {
  /** Insured + not yet adjudicated → WAIT screen (S5), audit deferred. */
  wait: boolean;
  /** Third-party collections → FDCPA validation track (letter gated on the notice, U13). */
  validate: boolean;
  /** Denied claim → APPEAL handoff track (routing + deadlines, no generation). */
  appeal: boolean;
  /** Already paid → REJECT premise track (C13 arms it). */
  rejectPremise: boolean;
  /** Self-pay + GFE in hand → C8 (GFE delta / PPDR) can run. */
  c8Enabled: boolean;
  /** Income band given → C9 (FAP screening) can run. */
  c9Enabled: boolean;
  /** Another payer may owe → surfaced as guidance, never blocks the audit. */
  otherPayerGuidance: boolean;
}

export function computeRoutingFlags(a: TriageAnswers): RoutingFlags {
  // WAIT is the only flag that defers the audit, and it must NOT trigger on
  // uncertainty: "not sure if adjudicated" runs the audit with degraded
  // coverage rather than parking the user behind a reminder they may not
  // need. Only a confident "insured: yes, adjudicated: no" waits.
  const wait = a.insured === "yes" && a.adjudicated === "no" && a.collections !== "yes";
  return {
    wait,
    validate: a.collections === "yes",
    appeal: a.denied === "yes",
    rejectPremise: a.alreadyPaid === "yes",
    c8Enabled: a.insured === "no" && a.gfeReceived === "yes",
    c9Enabled: a.incomeBand !== null && a.incomeBand !== "skip",
    otherPayerGuidance: a.otherPayer === "yes",
  };
}

/** Shape persisted to cases.coverage_profile after triage (replaces the auto-stub marker). */
export interface CoverageProfile {
  triage: TriageAnswers;
  flags: RoutingFlags;
  triagedAt: string;
}
