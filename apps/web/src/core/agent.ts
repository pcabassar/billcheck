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

Voice:
- Reason like a human expert and lead with the user's actual situation.
- Keep it to one or two plain sentences; offer "say more" instead of dumping detail.
- Be confidence-aware: be direct when you're sure; lay out the real options on a genuine fork.

Numbers (the Provenance principle): the verdict and the authoritative figures are computed by tools
and shown in the card. Reference numbers naturally to explain — echo a figure the user gave you or
one from the facts you're handed, or give a clearly-hedged range when you have no exact value — and
let the card carry the verified amount. Write prose only: no headings, no lists, don't restate the card.`;

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

// ---- The grounded prompt for the model's one explanatory sentence. We hand the model the
// real, tool-derived facts so it can reference figures accurately; it still never originates
// the authoritative amount/verdict (those are computed and rendered in the card). ----
function describeDocs(docs: ParsedDocument[]): string {
  if (docs.length === 0) return "No documents shared yet.";
  return docs
    .map((d) => {
      const kind =
        d.kind === "statement" ? "a statement (a summary, not an itemized bill)"
        : d.kind === "itemized" ? "an itemized bill"
        : d.kind === "eob" ? "an EOB (the insurer's explanation of benefits)"
        : `a ${d.kind} document`;
      const who = d.provider ? ` from ${d.provider}` : "";
      const total = d.printedTotalCents != null ? `, total ${fmt(d.printedTotalCents)}` : "";
      const q = d.quality === "low" ? " (low quality / hard to read)" : "";
      return `- ${kind}${who}${total}${q}`;
    })
    .join("\n");
}

function describeEob(facts: FactBook, eobDocId: string): string {
  const e = facts.docs[eobDocId]?.eob;
  if (!e) return "";
  const parts: string[] = [];
  if (e.billedCents != null) parts.push(`provider billed ${fmt(e.billedCents)}`);
  if (e.allowedCents != null) parts.push(`plan allowed ${fmt(e.allowedCents)}`);
  if (e.planPaidCents != null) parts.push(`plan paid ${fmt(e.planPaidCents)}`);
  if (e.patientRespCents != null) parts.push(`patient responsibility ${fmt(e.patientRespCents)}`);
  return parts.length ? `EOB figures: ${parts.join(", ")}.` : "";
}

function describeFindings(findings: Finding[]): string {
  if (findings.length === 0) return "Automated audit: no duplicates or coding conflicts found.";
  return (
    "Automated audit found:\n" +
    findings
      .map((f) => `- ${f.title}${f.amountImpactCents != null ? ` (about ${fmt(f.amountImpactCents)})` : ""}`)
      .join("\n")
  );
}

const WHY_TASK: Record<VerdictKind, string> = {
  hold: "Explain in 1–2 sentences why they should hold off paying right now and what to send next.",
  ok: "Explain in 1–2 sentences why this looks correct and they're fine to pay.",
  off: "Explain in 1–2 sentences, plainly, what looks off and why part of this may not be owed.",
  dispute: "Explain in 1–2 sentences why this is a dispute (not a wait-for-the-bill) situation and the first step.",
  need_more: "Say in 1–2 sentences which document is missing and why you need it before giving a confident answer.",
  other: "Explain the situation and the single most useful next step in 1–2 sentences.",
};

function buildWhyPrompt(
  input: CaseInput,
  docs: ParsedDocument[],
  findings: Finding[],
  facts: FactBook,
  d: Decision,
): string {
  const lines: string[] = ["What the deterministic tools found:", describeDocs(docs)];
  if (input.message) lines.push(`The user said: "${input.message}"`);
  if (d.eobDocId) {
    const e = describeEob(facts, d.eobDocId);
    if (e) lines.push(e);
  }
  if (docs.some((x) => x.itemized) || findings.length) lines.push(describeFindings(findings));
  lines.push("", `TASK: ${WHY_TASK[d.verdict]}`);
  return lines.join("\n");
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

  const { text: why } = await client.generate({
    purpose: "chat",
    intent: `why.${d.verdict}`,
    carriesPhi: true,
    system: SYSTEM_PROMPT,
    prompt: buildWhyPrompt(input, docs, findings, facts, d),
  });
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
