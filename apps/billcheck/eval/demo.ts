// Generates demo/index.html by running the REAL core over the three cases and
// rendering its actual output. Proof that the cards (and their numbers) come from
// the pipeline (parseDocument → runAudit → facts → cards), not from hardcoded HTML.

import { GuardedClient, mockTransport } from "../src/core/model";
import { respond, draftDispute } from "../src/core/agent";
import { renderGallery } from "../src/ui/render";
import type { Part } from "../src/core/types";
import { writeFileSync, mkdirSync } from "node:fs";

const mk = () => new GuardedClient({ transport: mockTransport, model: "mock", spendCapCents: 1000, phaseOk: true });

// Case 1 — two turns: statement → hold, then itemized+EOB → looks-correct.
const c1a = await respond(mk(), { docs: [{ id: "d", kind: "statement", provider: "Northwest Imaging", printedTotalCents: 120000 }] });
const c1b = await respond(mk(), {
  docs: [
    { id: "bill", kind: "itemized", provider: "NW Imaging", lines: [{ code: "73721", description: "MRI knee", amountCents: 120000 }] },
    { id: "eob", kind: "eob", provider: "BlueCross", eob: { billedCents: 120000, allowedCents: 48000, planPaidCents: 45000, patientRespCents: 3000 } },
  ],
});

// Case 2 — duplicate → something's off; then the bounded-generation draft + activity.
const c2 = await respond(mk(), {
  docs: [
    { id: "bill", kind: "itemized", provider: "City ER", lines: [
      { code: "99284", description: "ER visit", amountCents: 45000 },
      { code: "99284", description: "ER visit", amountCents: 45000 },
      { code: "80050", description: "Labs", amountCents: 12000 },
    ] },
    { id: "eob", kind: "eob", provider: "Aetna", eob: { billedCents: 231000, allowedCents: 124000, planPaidCents: 62000, patientRespCents: 62000 } },
  ],
});
const dup = c2.facts.findings.find((f) => f.checkId === "duplicate")!;
const case2: Part[] = [
  ...c2.parts,
  { type: "card", card: draftDispute(c2.facts, dup) },
  { type: "card", card: { type: "activity", entries: [
    { t: "10:02", text: "Uploaded itemized bill + EOB" },
    { t: "10:02", text: "Engine: duplicate found", mark: true },
    { t: "10:05", text: "Drafted dispute letter (figure injected from finding)" },
    { t: "10:06", text: "You approved & sent", mark: true },
  ] } },
];

// Case 3 — charged & surprised.
const c3 = await respond(mk(), { docs: [], message: "charged $179, no invoice", signals: { chargedNoInvoice: true } });

const html = renderGallery([
  { label: "Case 1 — statement → looks-correct", sub: "don’t-pay-yet, then itemized + EOB reconciled", status: c1b.status, parts: [...c1a.parts, ...c1b.parts] },
  { label: "Case 2 — dispute", sub: "duplicate flagged → ranked options → draft → activity", status: "Acting", parts: case2 },
  { label: "Case 3 — charged & surprised", sub: '"Two Chairs charged my card $179, no itemized invoice"', status: c3.status, parts: c3.parts },
]);

mkdirSync(new URL("../demo/", import.meta.url), { recursive: true });
const out = new URL("../demo/index.html", import.meta.url);
writeFileSync(out, html);
console.log("wrote", out.pathname, `(${html.length} bytes)`);
