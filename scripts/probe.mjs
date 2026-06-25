// billcheck test probe — simulate a user against the LIVE prototype.
//
// Replicates the real route path: the exact shipped SYSTEM_PROMPT + Opus 4.8 via
// the AI Gateway, with any attached document inlined the same way the chat route
// inlines a fetched Blob. We skip the Blob round-trip (already verified in U4) and
// inline the synthetic doc directly — this exercises the model's reading + triage,
// which is what each case tests.
//
// Usage: node --env-file=.env.local scripts/probe.mjs <cases.json>
// Writes a human-readable transcript per case to docs/observations/_raw/<id>.md

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { generateText, convertToModelMessages } from "ai";

// MUST match lib/prompt.ts verbatim.
const SYSTEM_PROMPT = `You are a medical-billing expert helping this person with their medical bills. Your job is to help them manage their bills in the best way possible.

Work from what they actually show you — a bill, statement, EOB, or what they describe — and lead with their real situation. When something is unclear or you can't tell from what you have, say so and ask for the one thing that would move it forward. Be concise and clear, and offer to say more if they want it.`;

const MODEL = "anthropic/claude-opus-4.8";

// Minimal valid one-page PDF from an array of text lines (same generator as U4).
function makePdf(lines) {
  let y = 760, s = "BT /F1 11 Tf\n";
  for (const l of lines) {
    s += `1 0 0 1 54 ${y} Tm (${String(l).replace(/([()\\])/g, "\\$1")}) Tj\n`;
    y -= 18;
  }
  s += "ET";
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(s)} >>\nstream\n${s}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offs = [];
  objs.forEach((o, i) => { offs.push(Buffer.byteLength(pdf, "latin1")); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offs.forEach((o) => { pdf += String(o).padStart(10, "0") + " 00000 n \n"; });
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

function userParts(turn) {
  const parts = [{ type: "text", text: turn.text }];
  if (turn.doc) {
    const bytes = makePdf(turn.doc.lines);
    parts.push({
      type: "file",
      url: `data:application/pdf;base64,${bytes.toString("base64")}`,
      mediaType: "application/pdf",
      filename: turn.doc.name || "document.pdf",
    });
  }
  return parts;
}

const casesPath = process.argv[2];
const { cases } = JSON.parse(readFileSync(casesPath, "utf8"));
mkdirSync("docs/observations/_raw", { recursive: true });

for (const c of cases) {
  const ui = [];
  let md = `# Transcript — ${c.id}: ${c.title}\n\n_Persona: ${c.persona}_\n\n`;
  for (let i = 0; i < c.turns.length; i++) {
    const turn = c.turns[i];
    ui.push({ id: `u${i}`, role: "user", parts: userParts(turn) });
    md += `### User${turn.doc ? ` (+ ${turn.doc.name})` : ""}\n${turn.text}\n`;
    if (turn.doc) md += `\n> 📎 attached: ${turn.doc.lines.join(" · ")}\n`;
    md += `\n`;
    const { text } = await generateText({
      model: MODEL,
      system: SYSTEM_PROMPT,
      messages: await convertToModelMessages(ui),
      maxOutputTokens: 1600,
    });
    ui.push({ id: `a${i}`, role: "assistant", parts: [{ type: "text", text }] });
    md += `### billcheck\n${text}\n\n---\n\n`;
    process.stdout.write(`✓ ${c.id} turn ${i + 1}/${c.turns.length}\n`);
  }
  writeFileSync(`docs/observations/_raw/${c.id}.md`, md);
}
process.stdout.write("done\n");
