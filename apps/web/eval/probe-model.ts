// Headless probe of the model-driven loop against the REAL Anthropic model.
// Run: pnpm --filter @billcheck/v01 exec tsx eval/probe-model.ts  (needs ANTHROPIC_API_KEY)
// Not in CI — it makes real (small) API calls. Used to verify the loop + divergence log.

import { respondWithModel } from "../src/core/agentModel";
import type { CaseInput } from "../src/core/agent";
import { fmt } from "../src/core/tools";

const SCENARIOS: { key: string; input: CaseInput }[] = [
  { key: "stmt", input: { docs: [{ id: "d", kind: "statement", provider: "City Hospital", printedTotalCents: 480000 }] } },
  {
    key: "clean",
    input: {
      docs: [
        { id: "bill", kind: "itemized", provider: "NW Imaging", lines: [{ code: "73721", description: "MRI knee", amountCents: 120000 }] },
        { id: "eob", kind: "eob", provider: "BlueCross", eob: { billedCents: 120000, allowedCents: 48000, planPaidCents: 45000, patientRespCents: 3000 } },
      ],
    },
  },
  {
    key: "dup",
    input: {
      docs: [
        { id: "bill", kind: "itemized", provider: "City ER", lines: [
          { code: "99284", description: "ER visit", amountCents: 45000 },
          { code: "99284", description: "ER visit", amountCents: 45000 },
          { code: "80050", description: "Labs", amountCents: 12000 },
        ] },
        { id: "eob", kind: "eob", provider: "Aetna", eob: { billedCents: 231000, allowedCents: 124000, planPaidCents: 62000, patientRespCents: 62000 } },
      ],
    },
  },
  { key: "charged", input: { docs: [], message: "Two Chairs charged my card $179 but never sent an itemized invoice.", signals: { chargedNoInvoice: true } } },
];

const cents = (c: number | null) => (c == null ? "—" : fmt(c));

for (const s of SCENARIOS) {
  process.stdout.write(`\n================ ${s.key} ================\n`);
  try {
    const turn = await respondWithModel(s.input);
    const v = turn.parts.find((p) => p.type === "card" && p.card.type === "verdict");
    if (v && v.type === "card" && v.card.type === "verdict") {
      const c = v.card;
      console.log(`verdict: ${c.verdict}`);
      console.log(`title:   ${c.title}`);
      console.log(`why:     ${c.why}`);
      if (c.amounts) {
        for (const r of c.amounts.rows) console.log(`  amount: ${r.label} = ${fmt(r.cents)}`);
        if (c.amounts.total) console.log(`  total:  ${c.amounts.total.label} = ${fmt(c.amounts.total.cents)}`);
      }
      if (c.options?.length) for (const o of c.options) console.log(`  option ${o.rank}: ${o.text}${o.odds ? ` (${o.odds})` : ""}`);
    }
    const d = turn.divergence;
    console.log(
      `DIVERGENCE: verdict tool=${d.toolVerdict} model=${d.modelVerdict} match=${d.verdictMatch} | ` +
        `youOwe tool=${cents(d.toolYouOweCents)} model=${cents(d.modelYouOweCents)} match=${d.youOweMatch} ` +
        `delta=${d.deltaCents == null ? "—" : fmt(d.deltaCents)} | ranAudit=${d.ranAudit} steps=${d.steps}`,
    );
  } catch (e) {
    console.log("ERROR:", (e as Error).message);
  }
}
