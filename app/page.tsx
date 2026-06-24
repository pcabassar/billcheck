"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type FileUIPart } from "ai";
import { upload } from "@vercel/blob/client";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

const STARTERS = [
  'I got a hospital "statement" — do I owe this?',
  "Is this a bill or just an EOB?",
  "I got a bill and I'm confused",
];

const ACCEPT = ["application/pdf", "image/png", "image/jpeg", "image/webp"];

type Attachment = {
  id: string;
  name: string;
  mediaType: string;
  url?: string;
  uploading: boolean;
  error?: boolean;
};

function isImage(t: string) {
  return t.startsWith("image/");
}

export default function Home() {
  const { messages, sendMessage, status, error, stop, regenerate } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const threadRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pinned = useRef(true);

  const busy = status === "submitted" || status === "streaming";
  const uploading = attachments.some((a) => a.uploading);
  const ready = attachments.filter((a) => a.url && !a.error);
  const canSend = !busy && !uploading && (input.trim().length > 0 || ready.length > 0);

  useEffect(() => {
    const el = threadRef.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [messages, status, error, attachments]);

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

  async function onFiles(list: FileList | null) {
    if (!list) return;
    for (const file of Array.from(list)) {
      const id = crypto.randomUUID();
      if (!ACCEPT.includes(file.type)) {
        setAttachments((a) => [
          ...a,
          { id, name: file.name, mediaType: file.type || "unknown", uploading: false, error: true },
        ]);
        continue;
      }
      setAttachments((a) => [
        ...a,
        { id, name: file.name, mediaType: file.type, uploading: true },
      ]);
      try {
        const blob = await upload(file.name, file, {
          access: "private",
          handleUploadUrl: "/api/blob-upload",
          contentType: file.type,
        });
        setAttachments((a) =>
          a.map((x) =>
            x.id === id ? { ...x, url: blob.url, mediaType: blob.contentType, uploading: false } : x,
          ),
        );
      } catch {
        setAttachments((a) =>
          a.map((x) => (x.id === id ? { ...x, uploading: false, error: true } : x)),
        );
      }
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  function removeAttachment(id: string) {
    setAttachments((a) => a.filter((x) => x.id !== id));
  }

  function submit() {
    if (!canSend) return;
    const text = input.trim();
    const files: FileUIPart[] = ready.map((a) => ({
      type: "file",
      url: a.url!,
      mediaType: a.mediaType,
      filename: a.name,
    }));
    pinned.current = true;
    if (files.length) sendMessage({ text, files });
    else sendMessage({ text });
    setInput("");
    setAttachments([]);
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
              Send a photo or PDF of a bill, statement, or EOB — or just describe
              your situation. I&apos;ll tell you what it is and what to do.
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
            {m.parts.map((part, i) => {
              if (part.type === "text") {
                return (
                  <div key={i} className="bubble">
                    {m.role === "user" ? part.text : <ReactMarkdown>{part.text}</ReactMarkdown>}
                  </div>
                );
              }
              if (part.type === "file") {
                return (
                  <span key={i} className="chip-doc sent">
                    <span className={`ic ${isImage(part.mediaType) ? "img" : ""}`}>
                      {isImage(part.mediaType) ? "IMG" : "PDF"}
                    </span>
                    <span className="nm">{part.filename ?? "attachment"}</span>
                  </span>
                );
              }
              return null;
            })}
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
        {attachments.length > 0 && (
          <div className="pending">
            {attachments.map((a) => (
              <span key={a.id} className={`chip-doc ${a.error ? "err" : ""}`}>
                <span className={`ic ${isImage(a.mediaType) ? "img" : ""}`}>
                  {a.uploading ? "…" : isImage(a.mediaType) ? "IMG" : a.error ? "!" : "PDF"}
                </span>
                <span className="nm">
                  {a.name}
                  {a.error && <small> unsupported / failed</small>}
                </span>
                <button className="rm" aria-label="Remove attachment" onClick={() => removeAttachment(a.id)}>
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="inputbar">
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT.join(",")}
            multiple
            hidden
            onChange={(e) => onFiles(e.target.files)}
          />
          <button
            className="attach"
            aria-label="Attach a photo or PDF"
            title="Attach a photo or PDF"
            onClick={() => fileRef.current?.click()}
          >
            ＋
          </button>
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
            <button className="send stop" aria-label="Stop generating" onClick={() => stop()}>
              ■
            </button>
          ) : (
            <button className="send" aria-label="Send" disabled={!canSend} onClick={submit}>
              ➤
            </button>
          )}
        </div>
        <div className="disclaim">Information, not legal or medical advice.</div>
      </div>
    </div>
  );
}
