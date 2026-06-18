"use client";

import { useEffect, useRef, useState } from "react";
import type { Part } from "../src/core/types";
import type { CaseInput } from "../src/core/agent";
import { PartView } from "../components/Cards";

type Item = { role: "user"; text: string } | { role: "agent"; parts: Part[] };

const SCENARIOS: { key: string; chip: string; user: string; input: CaseInput }[] = [
  {
    key: "stmt",
    chip: "📄 Hospital statement",
    user: "Here’s a hospital statement I got.",
    input: { docs: [{ id: "d", kind: "statement", provider: "City Hospital", printedTotalCents: 480000 }] },
  },
  {
    key: "clean",
    chip: "📄 Itemized bill + EOB",
    user: "Here’s my itemized bill and the EOB.",
    input: {
      docs: [
        { id: "bill", kind: "itemized", provider: "NW Imaging", lines: [{ code: "73721", description: "MRI knee", amountCents: 120000 }] },
        { id: "eob", kind: "eob", provider: "BlueCross", eob: { billedCents: 120000, allowedCents: 48000, planPaidCents: 45000, patientRespCents: 3000 } },
      ],
    },
  },
  {
    key: "dup",
    chip: "📄 Bill that looks too high",
    user: "This ER bill seems too high.",
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
  {
    key: "charged",
    chip: "💳 I was charged, no invoice",
    user: "Two Chairs charged my card $179 but never sent an itemized invoice.",
    input: { docs: [], message: "charged $179, no invoice", signals: { chargedNoInvoice: true } },
  },
];

const GREETING = "Hi — I’m billcheck. Send me a bill, statement, or EOB (a photo or PDF later), or tell me what’s going on. For now, tap a demo below.";

export default function Page() {
  const [items, setItems] = useState<Item[]>([{ role: "agent", parts: [{ type: "text", text: GREETING }] }]);
  const [status, setStatus] = useState("New");
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [items, busy]);

  async function send(userText: string, input: CaseInput) {
    if (busy) return;
    setItems((x) => [...x, { role: "user", text: userText }]);
    setBusy(true);
    try {
      const r = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ input }) });
      const data = await r.json();
      if (Array.isArray(data?.parts)) {
        setItems((x) => [...x, { role: "agent", parts: data.parts as Part[] }]);
        if (typeof data.status === "string") setStatus(data.status);
      } else {
        setItems((x) => [...x, { role: "agent", parts: [{ type: "text", text: "Something went wrong." }] }]);
      }
    } catch {
      setItems((x) => [...x, { role: "agent", parts: [{ type: "text", text: "Network error." }] }]);
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t || busy) return;
    setText("");
    void send(t, { docs: [], message: t });
  }

  return (
    <div className="phone" role="application" aria-label="billcheck">
      <div className="demolabel">V0.1 · mock model (real on deploy)</div>
      <header className="top">
        <div className="brandrow">
          <div className="brand"><span className="dot" /> billcheck</div>
          <div className="status">{status}</div>
        </div>
      </header>

      <main className="thread" ref={threadRef} aria-live="polite">
        {items.map((it, i) =>
          it.role === "user" ? (
            <div className="row user" key={i}><div className="bub">{it.text}</div></div>
          ) : (
            <div key={i}>{it.parts.map((p, j) => <PartView part={p} key={j} />)}</div>
          ),
        )}
        {busy && <div className="row agent"><div className="bub typing"><i /><i /><i /></div></div>}
      </main>

      <footer className="composer">
        <div className="chips">
          {SCENARIOS.map((s) => (
            <button className="chip" key={s.key} disabled={busy} onClick={() => void send(s.user, s.input)}>
              {s.chip}
            </button>
          ))}
        </div>
        <form className="inputrow" onSubmit={onSubmit}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Message billcheck…"
            aria-label="Message billcheck"
          />
          <button className="send" type="submit" disabled={busy || !text.trim()} aria-label="Send">↑</button>
        </form>
      </footer>
    </div>
  );
}
