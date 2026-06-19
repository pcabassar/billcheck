// The divergence inspector (Pedro's proposal #2). Runs the MODEL-DRIVEN loop over the
// persona set, then a stronger grader model classifies each model#-vs-tool# divergence.
// This is the analysis half of "solve provenance later as an engineering problem": it tells
// us the DISTRIBUTION of why the model diverges — judgment call vs number error vs a genuine
// engine gap the model caught — which is what decides when/whether to re-impose the hard gate.
//
// Run: pnpm --filter @billcheck/v01 exec tsx eval/inspect-divergence.ts  (needs ANTHROPIC_API_KEY)
// Not in CI — makes real (small) API calls. Grader = opus (stronger, different from the sonnet agent).

import Anthropic from "@anthropic-ai/sdk";
import { respondWithModel, type ModelTurn } from "../src/core/agentModel";
import { PERSONAS, type Persona } from "./personas";
import { fmt } from "../src/core/tools";

const JUDGE_MODELS = [process.env.BILLCHECK_JUDGE_MODEL ?? "claude-opus-4-8", "claude-sonnet-4-6"];
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const GRADER_SYSTEM =
  "You are a strict QA grader for a medical-bill advisor. A deterministic audit tool gives ground-truth " +
  "figures; the advisor model may differ from it. Classify the difference honestly. Return JSON only.";

const CATEGORIES = [
  "clean", // model matches the tool (verdict + numbers align)
  "verdict_judgment", // verdict label differs but is a defensible expert call; numbers fine
  "number_mismatch", // a dollar figure the model showed differs from ground truth (potential error)
  "engine_gap_caught", // model correctly flagged something the deterministic tool missed
  "missing_audit", // model failed to run the audit tool
  "other",
];

interface Graded {
  id: string;
  expect: string;
  toolV: string;
  modelV: string;
  toolOwe: string;
  modelOwe: string;
  ranAudit: boolean;
  category: string;
  severity: string;
  explanation: string;
}

function verdictCardWhy(turn: ModelTurn): string {
  const p = turn.parts.find((x) => x.type === "card" && x.card.type === "verdict");
  return p && p.type === "card" && p.card.type === "verdict" ? p.card.why : "";
}

async function grade(persona: Persona, turn: ModelTurn): Promise<{ category: string; severity: string; explanation: string }> {
  const d = turn.divergence;
  const findings =
    turn.facts.findings.map((f) => `${f.title}${f.amountImpactCents != null ? ` (${fmt(f.amountImpactCents)})` : ""}`).join("; ") || "none";
  const prompt = [
    `Case: ${persona.note ?? persona.dims.docType} — docs: ${persona.input.docs.map((x) => x.kind).join(", ") || "none"}${persona.input.message ? `; user said "${persona.input.message}"` : ""}`,
    `Test-design expected verdict: ${persona.expect}`,
    `TOOL ground truth: verdict=${d.toolVerdict}; patient_responsibility=${d.toolYouOweCents != null ? fmt(d.toolYouOweCents) : "unknown"}; findings=${findings}`,
    `MODEL answer: verdict=${d.modelVerdict}; you_owe=${d.modelYouOweCents != null ? fmt(d.modelYouOweCents) : "none shown"}; ran_audit=${d.ranAudit}; why="${verdictCardWhy(turn)}"`,
    ``,
    `Classify the MODEL's divergence from the TOOL into exactly one category: ${CATEGORIES.join(", ")}.`,
    `severity = risk to a user who acts on the model's answer (high = could cause overpay or skipping a valid dispute; low = cosmetic).`,
    `Return JSON only: {"category":"<one of the above>","severity":"low|med|high","explanation":"<one line>"}`,
  ].join("\n");

  for (const model of JUDGE_MODELS) {
    try {
      const res = await client.messages.create({ model, max_tokens: 250, system: GRADER_SYSTEM, messages: [{ role: "user", content: prompt }] });
      const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
      const j = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
      if (typeof j.category === "string") return { category: j.category, severity: String(j.severity ?? "?"), explanation: String(j.explanation ?? "") };
    } catch {
      /* try next model */
    }
  }
  return { category: "GRADER_ERROR", severity: "?", explanation: "grader failed for all models" };
}

const rows: Graded[] = [];
for (const persona of PERSONAS) {
  process.stderr.write(`. ${persona.id}\n`);
  try {
    const turn = await respondWithModel(persona.input);
    const g = await grade(persona, turn);
    const d = turn.divergence;
    rows.push({
      id: persona.id,
      expect: persona.expect,
      toolV: d.toolVerdict,
      modelV: d.modelVerdict,
      toolOwe: d.toolYouOweCents != null ? fmt(d.toolYouOweCents) : "—",
      modelOwe: d.modelYouOweCents != null ? fmt(d.modelYouOweCents) : "—",
      ranAudit: d.ranAudit,
      ...g,
    });
  } catch (e) {
    rows.push({ id: persona.id, expect: persona.expect, toolV: "?", modelV: "?", toolOwe: "—", modelOwe: "—", ranAudit: false, category: "RUN_ERROR", severity: "?", explanation: (e as Error).message });
  }
}

// ---- report ----
const pad = (s: string, n: number) => (s + " ".repeat(n)).slice(0, n);
console.log("\nDIVERGENCE INSPECTION — model-driven loop over " + rows.length + " personas\n");
console.log(pad("persona", 22) + pad("exp", 10) + pad("tool→model", 16) + pad("owe t/m", 18) + pad("category", 18) + pad("sev", 5) + "why");
console.log("-".repeat(120));
for (const r of rows) {
  console.log(
    pad(r.id, 22) +
      pad(r.expect, 10) +
      pad(`${r.toolV}→${r.modelV}`, 16) +
      pad(`${r.toolOwe}/${r.modelOwe}`, 18) +
      pad(r.category + (r.ranAudit ? "" : "*"), 18) +
      pad(r.severity, 5) +
      r.explanation.slice(0, 60),
  );
}
const dist: Record<string, number> = {};
for (const r of rows) dist[r.category] = (dist[r.category] ?? 0) + 1;
console.log("\ndistribution:", JSON.stringify(dist));
const high = rows.filter((r) => r.severity === "high");
console.log(`high-severity: ${high.length}` + (high.length ? " → " + high.map((r) => r.id).join(", ") : ""));
const noAudit = rows.filter((r) => !r.ranAudit);
console.log(`did-not-run-audit: ${noAudit.length}` + (noAudit.length ? " → " + noAudit.map((r) => r.id).join(", ") : ""));
console.log(`verdict-exact-match: ${rows.filter((r) => r.toolV === r.modelV).length}/${rows.length}`);
