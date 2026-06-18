// Offline simulation runner — the "learn N-at-a-time" loop. Drives the real agent
// (mock model, deterministic tools) over the persona population, scores each turn,
// prints a report. Exit code 1 if any never-event fails (false-OK or provenance),
// so this becomes a CI gate later — for now it just reports.

import { GuardedClient, mockTransport } from "../src/core/model";
import { respond } from "../src/core/agent";
import { PERSONAS } from "./personas";
import { scoreTurn, type Score } from "./scorers";

const pad = (s: string, n: number) => (s + " ".repeat(n)).slice(0, n);

async function main() {
  const scores: Score[] = [];
  for (const persona of PERSONAS) {
    const client = new GuardedClient({
      transport: mockTransport,
      model: "mock",
      spendCapCents: 1000,
      phaseOk: true,
    });
    const turn = await respond(client, persona.input);
    scores.push(scoreTurn(turn, persona));
  }

  console.log(`\nbillcheck V0.1 — simulation run (${scores.length} personas, mock model, offline)\n`);
  console.log(pad("persona", 22) + pad("expect", 11) + pad("got", 11) + pad("verdict", 9) + pad("prov", 7) + "flags");
  console.log("-".repeat(72));
  for (const s of scores) {
    const flags = [s.falseOK ? "FALSE-OK!" : "", s.provenanceErr ? `prov:${s.provenanceErr}` : ""].filter(Boolean).join(" ");
    console.log(
      pad(s.id, 22) + pad(s.expect, 11) + pad(s.got, 11) +
        pad(s.verdictOk ? "ok" : "MISS", 9) + pad(s.provenanceOk ? "ok" : "FAIL", 7) + flags,
    );
  }

  const verdictHits = scores.filter((s) => s.verdictOk).length;
  const falseOKs = scores.filter((s) => s.falseOK).length;
  const provFails = scores.filter((s) => !s.provenanceOk).length;

  console.log("\nsummary");
  console.log(`  verdict accuracy : ${verdictHits}/${scores.length}`);
  console.log(`  false-OK (never-event)    : ${falseOKs}   ${falseOKs === 0 ? "✅" : "❌"}`);
  console.log(`  provenance (never-event)  : ${provFails === 0 ? "all sourced ✅" : `${provFails} FAIL ❌`}`);
  console.log("");

  if (falseOKs > 0 || provFails > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error("harness error:", e);
  process.exitCode = 1;
});
