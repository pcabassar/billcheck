"use client";

// Mobile-first chat client, now on the Vercel AI SDK (`useChat` + DefaultChatTransport).
// Demo scenarios attach their structured CaseInput via prepareSendMessagesRequest (a ref the
// transport closes over); free text sends as a plain message. The agent's reply arrives as a
// "data-turn" part whose Part[] we render with the same owned card components.

import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { CaseInput } from "../src/core/agent";
import type { BillcheckUIMessage } from "../src/ui/chat-types";
import { PartView } from "../components/Cards";

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
  const pendingInput = useRef<CaseInput | null>(null);
  const transport = useMemo(
    () =>
      new DefaultChatTransport<BillcheckUIMessage>({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ messages }) => ({ body: { messages, input: pendingInput.current } }),
      }),
    [],
  );
  const { messages, sendMessage, status } = useChat<BillcheckUIMessage>({ transport });
  const [text, setText] = useState("");
  const threadRef = useRef<HTMLDivElement>(null);
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  // Case status to display: the most recent turn's status.
  let caseStatus = "New";
  outer: for (let i = messages.length - 1; i >= 0; i--) {
    for (const p of messages[i].parts) {
      if (p.type === "data-turn") {
        caseStatus = p.data.status;
        break outer;
      }
    }
  }

  function send(userText: string, input: CaseInput) {
    if (busy) return;
    pendingInput.current = input;
    void sendMessage({ text: userText });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t || busy) return;
    setText("");
    send(t, { docs: [], message: t });
  }

  return (
    <div className="phone" role="application" aria-label="billcheck">
      <div className="demolabel">V0.1 · Vercel AI SDK · real model on deploy</div>
      <header className="top">
        <div className="brandrow">
          <div className="brand"><span className="dot" /> billcheck</div>
          <div className="status">{caseStatus}</div>
        </div>
      </header>

      <main className="thread" ref={threadRef} aria-live="polite">
        <div className="row agent"><div className="bub">{GREETING}</div></div>
        {messages.map((m) => (
          <div key={m.id}>
            {m.parts.map((part, i) => {
              if (part.type === "text")
                return (
                  <div className={`row ${m.role === "user" ? "user" : "agent"}`} key={i}>
                    <div className="bub">{part.text}</div>
                  </div>
                );
              if (part.type === "data-turn")
                return part.data.parts.map((p, j) => <PartView part={p} key={`${i}-${j}`} />);
              return null;
            })}
          </div>
        ))}
        {busy && <div className="row agent"><div className="bub typing"><i /><i /><i /></div></div>}
      </main>

      <footer className="composer">
        <div className="chips">
          {SCENARIOS.map((s) => (
            <button className="chip" key={s.key} disabled={busy} onClick={() => send(s.user, s.input)}>
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
