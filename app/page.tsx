"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

const STARTERS = [
  'I got a hospital "statement" — do I owe this?',
  "Is this a bill or just an EOB?",
  "I got a bill and I'm confused",
];

export default function Home() {
  const { messages, sendMessage, status, error, stop, regenerate } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });
  const [input, setInput] = useState("");
  const threadRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const pinned = useRef(true);

  const busy = status === "submitted" || status === "streaming";

  // auto-scroll to newest only when the user is pinned to the bottom
  useEffect(() => {
    const el = threadRef.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [messages, status, error]);

  function onScroll() {
    const el = threadRef.current;
    if (el) pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  function grow() {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  }

  function submit() {
    const text = input.trim();
    if (!text || busy) return;
    pinned.current = true;
    sendMessage({ text });
    setInput("");
    requestAnimationFrame(grow);
  }

  return (
    <div className="phone">
      <header>
        <div className="logo" aria-hidden>
          b
        </div>
        <div>
          <h1>billcheck</h1>
          <div className="sub">your medical-bill advisor</div>
        </div>
      </header>

      <div
        className="thread"
        ref={threadRef}
        onScroll={onScroll}
        role="log"
        aria-live="polite"
        aria-atomic="false"
      >
        {messages.length === 0 && (
          <div className="empty">
            <div className="big" aria-hidden>
              📄
            </div>
            <p>
              Tell me what you got — a bill, a statement, an EOB — or just
              describe your situation. I&apos;ll tell you what it is and what to
              do.
            </p>
            <div className="starters">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setInput(s);
                    requestAnimationFrame(() => {
                      taRef.current?.focus();
                      grow();
                    });
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`row ${m.role === "user" ? "me" : "bot"}`}>
            {m.parts.map((part, i) =>
              part.type === "text" ? (
                <div key={i} className="bubble">
                  {m.role === "user" ? (
                    part.text
                  ) : (
                    <ReactMarkdown>{part.text}</ReactMarkdown>
                  )}
                </div>
              ) : null,
            )}
          </div>
        ))}

        {status === "submitted" && (
          <div className="row bot">
            <div className="bubble typing" aria-label="Thinking">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        )}

        {error && (
          <div className="row bot">
            <div className="bubble error" role="alert">
              Something went wrong — I didn&apos;t finish.{" "}
              <button className="retry" onClick={() => regenerate()}>
                Try again
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="composer">
        <div className="inputbar">
          <textarea
            ref={taRef}
            aria-label="Message billcheck"
            value={input}
            placeholder="Message billcheck…"
            rows={1}
            onChange={(e) => {
              setInput(e.target.value);
              grow();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
          />
          {busy ? (
            <button
              className="send stop"
              aria-label="Stop generating"
              onClick={() => stop()}
            >
              ■
            </button>
          ) : (
            <button
              className="send"
              aria-label="Send"
              disabled={!input.trim()}
              onClick={submit}
            >
              ➤
            </button>
          )}
        </div>
        <div className="disclaim">Information, not legal or medical advice.</div>
      </div>
    </div>
  );
}
