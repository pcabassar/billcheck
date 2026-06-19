// The model-driven turn (real Anthropic, tool-calling). This is the "the model drives
// the loop" path: the model calls run_audit (our deterministic engine) and then
// present_verdict (it OWNS the card's fields, including the numbers). We keep the audit
// tool available and tell it to fix-or-explain on mismatch, and we LOG model# vs tool#
// every turn so divergence becomes data (see Divergence). The deterministic respond() in
// agent.ts remains the offline/harness path; this one is used when a real key is present.

import Anthropic from "@anthropic-ai/sdk";
import type { AgentTurn, Part, VerdictCard, VerdictKind, Sourced } from "./types";
import { parseDocument, runAudit, buildFactBook, fmt } from "./tools";
import { decide, type CaseInput } from "./agent";

const MODEL = process.env.BILLCHECK_MODEL ?? "claude-sonnet-4-6";
const MAX_STEPS = 5;

const SYSTEM = `You are billcheck — a sharp, concise medical-bill advisor.

You have two tools:
- run_audit: runs the deterministic engine on this case and returns the real document types,
  EOB figures, findings, and the computed patient responsibility.
- present_verdict: your final answer, rendered as a card the user sees. Call it once, last.

PROCESS
1. ALWAYS call run_audit first, before you conclude.
2. Then call present_verdict with your read of the situation. You OWN the card's wording and
   its numbers.
3. If a dollar figure you put in the card differs from what run_audit returned, EITHER change
   it to match run_audit, OR keep yours and add one sentence in "why" explaining the override.

HONESTY (critical — this is our whole point)
- NEVER cite invented or generic statistics. "Most bills have errors", "X% of bills are wrong",
  and similar are MYTHS — stating them destroys the trust the product is built on. Use only the
  specific figures and findings run_audit returns. If you don't have a number, say so plainly.

STYLE
- Reason like a human expert; lead with the user's actual situation.
- Concise — one or two plain sentences in "why". You may state figures naturally.
- Pick the verdict that fits: hold (a statement / not the final bill → don't pay yet), ok (looks
  correct), off (something's wrong with the bill → options), dispute (the user was already charged
  and is surprised → push back), need_more (missing a key document), other.`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "run_audit",
    description:
      "Run the deterministic bill audit on the documents in this case. Returns document types, EOB figures (dollars), findings with dollar impact, and the computed patient responsibility. Call this BEFORE presenting a verdict so your numbers are grounded.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "present_verdict",
    description: "Give your final answer as a card the user sees. Call this once, last.",
    input_schema: {
      type: "object",
      properties: {
        verdict: {
          type: "string",
          enum: ["hold", "ok", "off", "dispute", "need_more", "other"],
          description: "the situation pattern that fits best",
        },
        title: { type: "string", description: "one-line headline for the card" },
        why: {
          type: "string",
          description:
            "1-2 plain sentences. If a figure here differs from run_audit, say why in one line.",
        },
        you_owe_dollars: {
          type: "number",
          description: "the bottom-line amount the user owes, in dollars, if known",
        },
        amounts: {
          type: "array",
          description: "other dollar figures worth showing (billed, allowed, disputed, …)",
          items: {
            type: "object",
            properties: { label: { type: "string" }, dollars: { type: "number" } },
            required: ["label", "dollars"],
          },
        },
        options: {
          type: "array",
          description: "next steps, best first",
          items: {
            type: "object",
            properties: { text: { type: "string" }, odds: { type: "string" } },
            required: ["text"],
          },
        },
        basis: { type: "array", description: "short basis tags", items: { type: "string" } },
      },
      required: ["verdict", "title", "why"],
    },
  },
];

/** A turn's model#-vs-tool# record — the passive provenance signal (no blocking). */
export interface Divergence {
  toolVerdict: VerdictKind; // deterministic decide()
  modelVerdict: VerdictKind; // what the model presented
  verdictMatch: boolean;
  toolYouOweCents: number | null; // authoritative patient responsibility
  modelYouOweCents: number | null; // what the model put on the card
  youOweMatch: boolean | null; // null when one side is absent
  deltaCents: number | null;
  ranAudit: boolean; // did the model actually call run_audit?
  reason: string; // the model's "why" (carries any override explanation)
  steps: number;
}

const dollarsToCents = (d: unknown): number | null =>
  typeof d === "number" && isFinite(d) ? Math.round(d * 100) : null;

/** Authoritative patient responsibility from the facts (EOB), if present. */
function authoritativeYouOweCents(facts: ReturnType<typeof buildFactBook>): number | null {
  for (const id in facts.amounts) if (id.endsWith(":patientResp")) return facts.amounts[id];
  return null;
}

/** The JSON we hand back when the model calls run_audit — dollars, since models do better with them. */
function auditToolResult(docs: ReturnType<typeof parseDocument>[], facts: ReturnType<typeof buildFactBook>) {
  const eobDoc = docs.find((d) => d.eob);
  const e = eobDoc?.eob;
  const youOwe = authoritativeYouOweCents(facts);
  return {
    documents: docs.map((d) => ({
      kind: d.kind,
      provider: d.provider ?? null,
      itemized: d.itemized,
      quality: d.quality,
      printed_total_dollars: d.printedTotalCents != null ? d.printedTotalCents / 100 : null,
    })),
    eob: e
      ? {
          billed_dollars: e.billedCents != null ? e.billedCents / 100 : null,
          allowed_dollars: e.allowedCents != null ? e.allowedCents / 100 : null,
          plan_paid_dollars: e.planPaidCents != null ? e.planPaidCents / 100 : null,
          patient_responsibility_dollars: e.patientRespCents != null ? e.patientRespCents / 100 : null,
        }
      : null,
    findings: facts.findings.map((f) => ({
      title: f.title,
      impact_dollars: f.amountImpactCents != null ? f.amountImpactCents / 100 : null,
    })),
    computed_you_owe_dollars: youOwe != null ? youOwe / 100 : null,
  };
}

const STATUS: Record<VerdictKind, string> = {
  hold: "Gathering",
  ok: "Reviewed",
  off: "Reviewed",
  dispute: "Reviewed",
  need_more: "Gathering",
  other: "Reviewed",
};

/** Build the user-facing card from the model's present_verdict args (model-owned). */
function cardFromPresent(args: any): VerdictCard {
  const rows: Sourced[] = [];
  if (Array.isArray(args.amounts)) {
    for (const a of args.amounts) {
      const cents = dollarsToCents(a?.dollars);
      if (cents != null && typeof a?.label === "string")
        rows.push({ label: a.label, cents, src: "model:amount" });
    }
  }
  const owe = dollarsToCents(args.you_owe_dollars);
  const total: Sourced | undefined =
    owe != null ? { label: "You owe", cents: owe, src: "model:you_owe" } : undefined;
  const verdict: VerdictKind = ["hold", "ok", "off", "dispute", "need_more", "other"].includes(args.verdict)
    ? args.verdict
    : "other";
  return {
    type: "verdict",
    verdict,
    title: String(args.title ?? ""),
    why: String(args.why ?? ""),
    basis: Array.isArray(args.basis) ? args.basis.filter((b: unknown) => typeof b === "string") : [],
    ...(rows.length || total ? { amounts: { rows, total } } : {}),
    ...(Array.isArray(args.options) && args.options.length
      ? {
          options: args.options
            .filter((o: any) => typeof o?.text === "string")
            .map((o: any, i: number) => ({ rank: i + 1, text: o.text, odds: o.odds })),
        }
      : {}),
  };
}

export interface ModelTurn extends AgentTurn {
  divergence: Divergence;
}

/** Run one model-driven turn. Throws if no key (caller should fall back to deterministic respond()). */
export async function respondWithModel(input: CaseInput, apiKey = process.env.ANTHROPIC_API_KEY): Promise<ModelTurn> {
  if (!apiKey) throw new Error("respondWithModel requires ANTHROPIC_API_KEY");

  // Deterministic ground truth (authoritative) — computed up front, used for the divergence log
  // and served to the model when it calls run_audit.
  const docs = input.docs.map(parseDocument);
  const findings = runAudit(docs);
  const facts = buildFactBook(docs, findings);
  const ref = decide(docs, findings, input);
  const toolYouOwe = authoritativeYouOweCents(facts);

  const client = new Anthropic({ apiKey });
  const userText =
    (input.message ? `User says: "${input.message}"\n` : "") +
    `Documents in this case: ${docs.length ? docs.map((d) => d.kind).join(", ") : "none yet"}.` +
    (input.signals?.chargedNoInvoice ? "\nSignal: the user was charged but got no itemized invoice." : "") +
    `\n\nWork the case: call run_audit, then present_verdict.`;

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userText }];
  let presented: any = null;
  let ranAudit = false;
  let steps = 0;

  while (steps < MAX_STEPS && !presented) {
    steps++;
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 700,
      system: SYSTEM,
      tools: TOOLS,
      messages,
    });
    messages.push({ role: "assistant", content: res.content });

    const toolUses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (toolUses.length === 0) break; // model stopped without presenting

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      if (tu.name === "run_audit") {
        ranAudit = true;
        results.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: JSON.stringify(auditToolResult(docs, facts)),
        });
      } else if (tu.name === "present_verdict") {
        presented = tu.input;
        results.push({ type: "tool_result", tool_use_id: tu.id, content: "ok" });
      }
    }
    if (!presented) messages.push({ role: "user", content: results });
  }

  // Fallback: model never presented (rare) → use the deterministic verdict so the user still gets a card.
  if (!presented) {
    presented = { verdict: ref.verdict, title: "Here's what I found.", why: "" };
  }

  const card = cardFromPresent(presented);
  const modelYouOwe = card.amounts?.total?.cents ?? null;

  const divergence: Divergence = {
    toolVerdict: ref.verdict,
    modelVerdict: card.verdict,
    verdictMatch: ref.verdict === card.verdict,
    toolYouOweCents: toolYouOwe,
    modelYouOweCents: modelYouOwe,
    youOweMatch: toolYouOwe != null && modelYouOwe != null ? toolYouOwe === modelYouOwe : null,
    deltaCents: toolYouOwe != null && modelYouOwe != null ? modelYouOwe - toolYouOwe : null,
    ranAudit,
    reason: card.why,
    steps,
  };
  logDivergence(divergence, input);

  const parts: Part[] = [];
  for (const d of docs)
    parts.push({ type: "card", card: { type: "doc", kind: d.kind, name: d.provider ?? d.kind, pages: d.pages } });
  parts.push({ type: "card", card });

  return { parts, status: STATUS[card.verdict], facts, divergence };
}

/** Rich, non-blocking provenance log. Console for now; swap for Supabase/append-only later. */
function logDivergence(d: Divergence, input: CaseInput) {
  const flags: string[] = [];
  if (!d.ranAudit) flags.push("NO_AUDIT");
  if (!d.verdictMatch) flags.push("VERDICT_DIFF");
  if (d.youOweMatch === false) flags.push(`OWE_DIFF(${d.deltaCents != null ? fmt(d.deltaCents) : "?"})`);
  console.log(
    "[provenance]",
    JSON.stringify({
      docs: input.docs.map((x) => x.kind),
      toolVerdict: d.toolVerdict,
      modelVerdict: d.modelVerdict,
      toolYouOwe: d.toolYouOweCents,
      modelYouOwe: d.modelYouOweCents,
      deltaCents: d.deltaCents,
      ranAudit: d.ranAudit,
      steps: d.steps,
      flags: flags.length ? flags : ["clean"],
    }),
  );
}
