"use client";
// React card components — mirror src/ui/render.ts. Every number comes from the
// card's sourced fields (set by tools); these components only display them.

import type { Card, Part, VerdictKind, Sourced } from "../src/core/types";

const fmt = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

const provTag = (src: string) =>
  src.startsWith("eob:") ? "EOB" : src.startsWith("line:") ? "itemized bill" : src.startsWith("finding:") ? "finding" : "source";

const V: Record<VerdictKind, { bg: string; c: string; ic: string; label: string }> = {
  hold: { bg: "var(--holdbg)", c: "var(--hold)", ic: "⏳", label: "Hold — don’t pay yet" },
  ok: { bg: "var(--okbg)", c: "var(--ok)", ic: "✓", label: "Looks correct" },
  off: { bg: "var(--offbg)", c: "var(--off)", ic: "!", label: "Something looks off" },
  dispute: { bg: "var(--disputebg)", c: "var(--dispute)", ic: "⚑", label: "Let’s dispute this" },
  need_more: { bg: "var(--needbg)", c: "var(--need)", ic: "?", label: "Need one more thing" },
  other: { bg: "var(--needbg)", c: "var(--brand)", ic: "•", label: "Advice" },
};

function Amounts({ a }: { a: { rows: Sourced[]; total?: Sourced; note?: string } }) {
  return (
    <div className="amt">
      <h4>The amounts</h4>
      <table>
        <tbody>
          {a.rows.map((s) => (
            <tr key={s.src}>
              <td className="lab">{s.label}</td>
              <td className="val">{fmt(s.cents)}</td>
              <td className="prov">· {provTag(s.src)}</td>
            </tr>
          ))}
          {a.total && (
            <tr className="tot">
              <td className="lab">{a.total.label}</td>
              <td className="val">{fmt(a.total.cents)}</td>
              <td />
            </tr>
          )}
        </tbody>
      </table>
      {a.note && <div className="note">{a.note}</div>}
    </div>
  );
}

export function CardView({ card, onApprove }: { card: Card; onApprove?: () => void }) {
  if (card.type === "doc")
    return (
      <div className="row agent">
        <div className="doc" style={{ background: "#fff", border: "1px solid var(--line)" }}>
          <span className="ic">📄</span>
          <div><div className="nm">{card.name}</div><div className="sub">{card.kind} · {card.pages}p</div></div>
        </div>
      </div>
    );

  if (card.type === "verdict") {
    const v = V[card.verdict];
    return (
      <div className="row agent">
        <div className="card">
          <div className="vhead" style={{ background: v.bg }}>
            <div className="vicon" style={{ background: v.c }}>{v.ic}</div>
            <div><div className="vlabel" style={{ color: v.c }}>{v.label}</div><div className="vtitle">{card.title}</div></div>
          </div>
          {card.why && (
            <details className="why">
              <summary>Why? / say more</summary>
              <div className="det">{card.why}</div>
            </details>
          )}
          {card.basis?.length > 0 && (
            <div className="basis">📎 {card.basis.map((b) => <span className="tag" key={b}>{b}</span>)}</div>
          )}
          {card.amounts && <Amounts a={card.amounts} />}
          {card.options?.length ? (
            <div className="opts">
              <h4>Options, best first</h4>
              {card.options.map((o) => (
                <div className="opt" key={o.rank}>
                  <span className="rank">{o.rank}.</span><span>{o.text}</span><span className="odds">{o.odds}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  if (card.type === "confirm")
    return (
      <div className="row agent">
        <div className="card confirm">
          <div className="vhead" style={{ background: "var(--needbg)" }}>
            <div className="vicon" style={{ background: "#475569" }}>✎</div>
            <div><div className="vlabel" style={{ color: "#475569" }}>Draft — needs your OK</div><div className="vtitle">{card.title}</div></div>
          </div>
          <div className="letter"><div className="lh">{card.subject}</div>{card.body}</div>
          <div className="prov-note">🔒 Every dollar here comes from your bill — injected from a finding, not written by the model.</div>
          <div className="cbtns">
            <button className="chip primary" onClick={onApprove}>✓ Approve &amp; send</button>
            <button className="chip ghost">Edit</button>
          </div>
        </div>
      </div>
    );

  // activity
  return (
    <div className="row agent">
      <div className="card">
        <div className="act">
          <h4>Activity</h4>
          {card.entries.map((e, i) => (
            <div className="e" key={i}><span className="t">{e.t}</span><span className="d">{e.mark ? <span className="mk">● </span> : null}{e.text}</span></div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PartView({ part }: { part: Part }) {
  if (part.type === "text") return <div className="row agent"><div className="bub">{part.text}</div></div>;
  return <CardView card={part.card} />;
}
