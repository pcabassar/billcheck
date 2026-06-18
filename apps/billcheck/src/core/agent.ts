// The orchestrator. Decides WHICH verdict/cards to show (open-ended in spirit;
// a deterministic rule-based stand-in here, the LLM via tool-calling later) and
// builds every card's numbers FROM facts. Conversational prose comes from the
// guarded client. Numbers never originate in the model.

import type {
  AgentTurn,
  Part,
  VerdictCard,
  VerdictKind,
  Sourced,
  ParsedDocument,
  Finding,
  FactBook,
} from "./types";
import { parseDocument, runAudit, buildFactBook, eobFieldId, fmt, type DocInput } from "./tools";
import { GuardedClient } from "./model";

export const SYSTEM_PROMPT = `You are billcheck — a sharp, concise medical-bill advisor.
PRINCIPLES
- Reason like a human expert, not a switch statement. Recognized verdict patterns
  (don't-pay-yet, looks-correct, something's-off, need-more, you-were-charged/dispute)
  are priors, not a closed menu — "other → tailored advice" is always valid.
- Lead with the user's ACTUAL situation, not a reflex.
- Be confidence-aware: direct when sure; offer 2 options with pros/cons on a real fork.
- Concise; don't over-explain. Offer "say more" rather than dumping detail.
- PROVENANCE (hard rule): never originate a dollar amount or a verdict. Numbers come
  from tools (facts) and are rendered in cards; your prose is qualitative.`;

export interface CaseInput {
  docs: DocInput[];
  message?: string;
  signals?: { chargedNoInvoice?: boolean };
}

export interface Decision {
  verdict: VerdictKind;
  eobDocId?: string;
  duplicate?: Finding;
}

/** Rule-based stand-in for the model's situation-recognition (LLM tool-calling later). */
export function decide(docs: ParsedDocument[], findings: Finding[], input: CaseInput): Decision {
  if (input.signals?.chargedNoInvoice) return { verdict: "dispute" };
  const hasItemized = docs.some((d) => d.itemized);
  const eobDoc = docs.find((d) => d.eob);
  const hasStatement = docs.some((d) => d.kind === "statement");
  const lowQuality = docs.some((d) => d.quality === "low");

  if (lowQuality && !eobDoc) return { verdict: "need_more" }; // can't read it clearly → don't guess
  if (hasStatement && !hasItemized && !eobDoc) return { verdict: "hold" };
  if (hasItemized && eobDoc) {
    const dup = findings.find((f) => f.checkId === "duplicate");
    return dup
      ? { verdict: "off", eobDocId: eobDoc.id, duplicate: dup }
      : { verdict: "ok", eobDocId: eobDoc.id };
  }
  return { verdict: "need_more" };
}

const STATUS: Record<VerdictKind, string> = {
  hold: "Gathering",
  ok: "Reviewed",
  off: "Reviewed",
  dispute: "Reviewed",
  need_more: "Gathering",
  other: "Reviewed",
};

function amountsFor(facts: FactBook, eobDocId: string, dup?: Finding) {
  const doc = facts.docs[eobDocId];
  const e = doc?.eob;
  const rows: Sourced[] = [];
  if (e?.billedCents != null)
    rows.push({ label: "Provider billed", cents: e.billedCents, src: eobFieldId(eobDocId, "billed") });
  if (e?.allowedCents != null)
    rows.push({ label: "Plan allowed", cents: e.allowedCents, src: eobFieldId(eobDocId, "allowed") });
  if (e?.planPaidCents != null)
    rows.push({ label: "Plan paid", cents: e.planPaidCents, src: eobFieldId(eobDocId, "planPaid") });
  if (dup?.amountImpactCents != null)
    rows.push({ label: "Disputed (duplicate)", cents: dup.amountImpactCents, src: dup.id });
  const total: Sourced | undefined =
    e?.patientRespCents != null
      ? { label: dup ? "They say you owe" : "You owe", cents: e.patientRespCents, src: eobFieldId(eobDocId, "patientResp") }
      : undefined;
  return { rows, total };
}

function verdictCard(
  verdict: VerdictKind,
  why: string,
  facts: FactBook,
  d: Decision,
): VerdictCard {
  switch (verdict) {
    case "hold":
      return { type: "verdict", verdict, title: "Hold off — this is a statement, not the final bill.", why, basis: ["document type = statement", "no EOB on file"] };
    case "ok":
      return { type: "verdict", verdict, title: "This checks out — you're fine to pay.", why, basis: ["EOB cost-share = bill", "in-network", "engine: 0 findings"], amounts: { ...amountsFor(facts, d.eobDocId!) } };
    case "off":
      return {
        type: "verdict",
        verdict,
        title: "Something looks off — part of this may not be owed.",
        why,
        basis: ["engine: duplicate (NCCI)"],
        amounts: amountsFor(facts, d.eobDocId!, d.duplicate),
        options: [
          { rank: 1, text: "Draft a dispute letter (cite the duplicate)", odds: "strong" },
          { rank: 2, text: "Call the billing office with the line numbers", odds: "medium" },
          { rank: 3, text: "Request a corrected itemized bill", odds: "medium" },
        ],
      };
    case "dispute":
      return { type: "verdict", verdict, title: "You were charged and you're surprised — let's dispute this.", why, basis: ["already charged", "no itemized invoice", "disputes service"] };
    default:
      return { type: "verdict", verdict: "need_more", title: "I need one more thing to tell you.", why, basis: ["missing the itemized bill or the EOB"] };
  }
}

/** Run one turn: perceive → orient → decide → act (build cards from facts) → record. */
export async function respond(client: GuardedClient, input: CaseInput): Promise<AgentTurn> {
  const docs = input.docs.map(parseDocument);
  const findings = runAudit(docs);
  const facts = buildFactBook(docs, findings);
  const d = decide(docs, findings, input);

  const parts: Part[] = [];
  for (const doc of docs)
    parts.push({ type: "card", card: { type: "doc", kind: doc.kind, name: doc.provider ?? doc.kind, pages: doc.pages } });

  const { text: why } = await client.generate({ purpose: "chat", intent: `why.${d.verdict}`, carriesPhi: true });
  parts.push({ type: "card", card: verdictCard(d.verdict, why, facts, d) });

  return { parts, status: STATUS[d.verdict], facts };
}

/** App-only follow-up: bounded-generation dispute letter. The $ is injected from the finding. */
export function draftDispute(facts: FactBook, dup: Finding) {
  const amt = dup.amountImpactCents != null ? fmt(dup.amountImpactCents) : "the disputed amount";
  return {
    type: "confirm" as const,
    title: "Dispute letter to the billing office",
    subject: "Re: duplicate charge",
    body: `Your itemized statement bills the same procedure code more than once for a single visit. Per NCCI, it is billable once. I request removal of the duplicate ${amt} charge and a corrected statement.`,
    sourcedFigures: [dup.id],
  };
}
