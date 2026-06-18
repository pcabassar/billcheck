// Framework-less renderer: AgentTurn.parts -> HTML. Shared visual language with
// the prototype; this is what the real Next/React components will mirror. Used by
// eval/demo.ts to render REAL core output (proving the pipeline + provenance), and
// reusable as the spec for the React port.

import type { AgentTurn, Part, Card, VerdictKind, Sourced } from "../core/types";
import { fmt } from "../core/tools";

const V: Record<VerdictKind, { bg: string; c: string; ic: string; label: string }> = {
  hold: { bg: "#e6f4fb", c: "#0284c7", ic: "⏳", label: "Hold — don’t pay yet" },
  ok: { bg: "#e7f7ec", c: "#16a34a", ic: "✓", label: "Looks correct" },
  off: { bg: "#fdecec", c: "#dc2626", ic: "!", label: "Something looks off" },
  dispute: { bg: "#f4ebfe", c: "#9333ea", ic: "⚑", label: "Let’s dispute this" },
  need_more: { bg: "#f1f3f6", c: "#64748b", ic: "?", label: "Need one more thing" },
  other: { bg: "#f1f3f6", c: "#0d9488", ic: "•", label: "Advice" },
};

// Provenance tag derived from the fact id — ties the on-screen "· source" to the real FactId.
const provTag = (src: string): string =>
  src.startsWith("eob:") ? "EOB" : src.startsWith("line:") ? "itemized bill" : src.startsWith("finding:") ? "finding" : "source";

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

function amounts(a: { rows: Sourced[]; total?: Sourced; note?: string }): string {
  const row = (s: Sourced) =>
    `<tr><td class="lab">${esc(s.label)}</td><td class="val">${fmt(s.cents)}</td><td class="prov">· ${provTag(s.src)}</td></tr>`;
  const tot = a.total
    ? `<tr class="tot"><td class="lab">${esc(a.total.label)}</td><td class="val">${fmt(a.total.cents)}</td><td></td></tr>`
    : "";
  return `<div class="amt"><h4>The amounts</h4><table>${a.rows.map(row).join("")}${tot}</table>${a.note ? `<div class="note">${esc(a.note)}</div>` : ""}</div>`;
}

function card(c: Card): string {
  if (c.type === "doc")
    return `<div class="row user"><div class="bub"><div class="doc"><span>📄</span><div><div class="nm">${esc(c.name)}</div><div class="sub">${esc(c.kind)} · ${c.pages}p</div></div></div></div></div>`;
  if (c.type === "verdict") {
    const v = V[c.verdict];
    const why = c.why ? `<div class="why"><b>Why?</b> ${esc(c.why)}</div>` : "";
    const basis = c.basis?.length ? `<div class="basis">📎 ${c.basis.map((b) => `<span class="tag">${esc(b)}</span>`).join(" ")}</div>` : "";
    const amt = c.amounts ? amounts(c.amounts) : "";
    const opts = c.options?.length
      ? `<div class="opts"><h4>Options, best first</h4>${c.options.map((o) => `<div class="opt"><span class="rank">${o.rank}.</span><span>${esc(o.text)}</span><span class="odds">${esc(o.odds ?? "")}</span></div>`).join("")}</div>`
      : "";
    return `<div class="card"><div class="vhead" style="background:${v.bg}"><div class="vicon" style="background:${v.c}">${v.ic}</div><div><div class="vlabel" style="color:${v.c}">${v.label}</div><div class="vtitle">${esc(c.title)}</div></div></div>${why}${basis}${amt}${opts}</div>`;
  }
  if (c.type === "confirm")
    return `<div class="card"><div class="vhead" style="background:#f1f3f6"><div class="vicon" style="background:#475569">✎</div><div><div class="vlabel" style="color:#475569">Draft — needs your OK</div><div class="vtitle">${esc(c.title)}</div></div></div><div class="letter"><div class="lh">${esc(c.subject)}</div>${esc(c.body)}</div><div class="prov-note">🔒 Every dollar here comes from your bill — injected from a finding, not written by the model.</div><div class="cbtns"><span class="btn primary">✓ Approve &amp; send</span><span class="btn ghost">Edit</span></div></div>`;
  // activity
  return `<div class="card"><div class="act"><h4>Activity</h4>${c.entries.map((e) => `<div class="e"><span class="t">${esc(e.t)}</span><span class="d">${e.mark ? "● " : ""}${esc(e.text)}</span></div>`).join("")}</div></div>`;
}

function part(p: Part): string {
  if (p.type === "text") return `<div class="row agent"><div class="bub">${esc(p.text)}</div></div>`;
  return card(p.card);
}

export function renderGallery(items: { label: string; sub: string; status: string; parts: Part[] }[]): string {
  const screens = items
    .map(
      (it) =>
        `<div class="casehead">${esc(it.label)}</div><div class="casesub">${esc(it.sub)}</div>
         <div class="screen"><div class="bar"><div class="brand"><span class="dot"></span> billcheck</div><span class="status">${esc(it.status)}</span></div>
         ${it.parts.map(part).join("")}</div>`,
    )
    .join("");
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>billcheck — rendered from the real core</title><style>
:root{--app:#fff;--ink:#0f172a;--muted:#64748b;--line:#e6e9ee;--brand:#0d9488;--agentbub:#f3f5f8;--userbub:#0d9488;--shadow:0 1px 2px rgba(16,24,40,.06),0 6px 20px rgba(16,24,40,.08)}
*{box-sizing:border-box}body{margin:0;background:#eef1f4;color:var(--ink);font:15px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding:18px;display:flex;flex-direction:column;align-items:center}
.casehead{max-width:440px;width:100%;margin:22px 4px 4px;font-weight:800;font-size:17px}.casesub{max-width:440px;width:100%;margin:0 4px 10px;color:var(--muted);font-size:12.5px}
.screen{width:100%;max-width:440px;background:var(--app);border:1px solid var(--line);border-radius:22px;box-shadow:var(--shadow);padding:12px 11px 16px}
.bar{display:flex;justify-content:space-between;align-items:center;padding:2px 4px 10px;border-bottom:1px solid var(--line);margin-bottom:8px}.brand{display:flex;gap:8px;align-items:center;font-weight:700}.dot{width:16px;height:16px;border-radius:5px;background:var(--brand)}
.status{font-size:11px;font-weight:600;color:var(--muted);background:#f1f3f6;border:1px solid var(--line);padding:3px 9px;border-radius:999px}
.row{display:flex;margin:9px 0}.row.user{justify-content:flex-end}.bub{max-width:86%;padding:9px 12px;border-radius:16px;box-shadow:var(--shadow);font-size:14px}
.row.agent .bub{background:var(--agentbub);border-bottom-left-radius:5px}.row.user .bub{background:var(--userbub);color:#fff;border-bottom-right-radius:5px}
.doc{display:flex;gap:9px;align-items:center}.doc .nm{font-weight:600;font-size:13px}.doc .sub{font-size:11px;opacity:.85}
.card{background:#fff;border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow);overflow:hidden;margin:9px 0;max-width:94%}
.vhead{display:flex;gap:10px;align-items:flex-start;padding:12px 13px}.vicon{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;font-size:16px;color:#fff;flex:0 0 auto}
.vlabel{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px}.vtitle{font-weight:700}
.why{margin:2px 13px 10px;font-size:13px;color:#475569;background:#fafbfc;border:1px solid var(--line);border-radius:9px;padding:8px 10px}
.basis{display:flex;gap:6px;flex-wrap:wrap;margin:0 13px 12px;font-size:11.5px;color:var(--muted)}.basis .tag{background:#f1f3f6;border:1px solid var(--line);border-radius:6px;padding:2px 7px;font-weight:600}
.amt{border-top:1px solid var(--line);padding:10px 13px}.amt h4,.opts h4,.act h4{margin:0 0 7px;font-size:12px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted)}
.amt table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}.amt td{padding:5px 0;font-size:13.5px}.amt td.lab{color:#475569}.amt td.val{text-align:right;font-weight:600}.amt td.prov{font-size:10.5px;color:var(--muted);padding-left:8px;white-space:nowrap}
.amt tr.tot td{border-top:2px solid var(--ink);padding-top:8px;font-size:16px;font-weight:800}.amt tr.tot td.lab{color:var(--ink)}.amt .note{margin-top:8px;font-size:11.5px;color:var(--muted)}
.opts{border-top:1px solid var(--line);padding:10px 13px}.opt{display:flex;gap:8px;align-items:baseline;padding:4px 0;font-size:13.5px}.opt .rank{font-weight:800;color:var(--brand)}.opt .odds{margin-left:auto;font-size:11px;color:var(--muted)}
.letter{margin:10px 13px;background:#fafbfc;border:1px solid var(--line);border-radius:11px;padding:10px 11px;font-size:12.5px;color:#334155}.letter .lh{font-weight:700;color:var(--ink);margin-bottom:5px}
.prov-note{margin:0 13px 9px;font-size:11.5px;color:#0b7c71;font-weight:600}.cbtns{display:flex;gap:8px;padding:0 13px 12px}.btn{font-size:13px;font-weight:600;border-radius:999px;padding:8px 12px;border:1px solid var(--brand);color:#0b7c71;background:#fff}.btn.primary{background:var(--brand);color:#fff}.btn.ghost{border-color:var(--line);color:var(--muted)}
.act .e{display:flex;gap:9px;padding:3px 0;font-size:12.5px}.act .t{color:var(--muted);flex:0 0 52px}.act .d{color:#334155}
.note-top{max-width:440px;color:var(--muted);font-size:12.5px;margin-bottom:6px}
</style></head><body>
<div class="note-top">⚙️ Rendered from the <b>real V0.1 core</b> (parseDocument → runAudit → facts → cards). Every number you see was produced by a tool and traces to a fact id — not written by the model.</div>
${screens}
</body></html>`;
}
