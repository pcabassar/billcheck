"use client";

import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type FileUIPart,
  type UIMessage,
} from "ai";
import { upload } from "@vercel/blob/client";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import CaseWorkspace from "./case-workspace";

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

// --- Tool UI (progressive disclosure) --------------------------------------
// A `tool-*` message part carries `{ type: 'tool-<name>', state, input, output, approval }`.
// We render a plain-language ✓/spinner status line per tool — NEVER raw JSON to the user.

// The tool name out of a `tool-<name>` part type.
function toolName(partType: string): string {
  return partType.replace(/^tool-/, "");
}

// Plain-language labels per tool, by phase. `running` shows while the tool executes;
// `done` shows once it finishes. Kept warm + jargon-free for a scared user.
const TOOL_LABELS: Record<string, { running: string; done: string }> = {
  updateCaseTitle: { running: "Naming your case…", done: "Named your case" },
  setCaseStatus: { running: "Updating your case…", done: "Updated your case" },
  updateProfile: { running: "Saving your details…", done: "Saved your details" },
  linkDocument: { running: "Linking your documents…", done: "Linked your documents" },
  relinkDocument: { running: "Updating a document link…", done: "Updated a document link" },
  setDocumentKind: { running: "Sorting your document…", done: "Sorted your document" },
  generateArtifact: { running: "Drafting your letter…", done: "Drafted your letter" },
  markArtifactSent: { running: "Marking it sent…", done: "Marked it sent" },
  scheduleReminder: { running: "Setting a reminder…", done: "Set a reminder" },
  updateDeadline: { running: "Updating your reminder…", done: "Updated your reminder" },
  cancelDeadline: { running: "Cancelling the reminder…", done: "Cancelled the reminder" },
  markResolved: { running: "Wrapping up your case…", done: "Wrapped up your case" },
  reopenCase: { running: "Re-opening your case…", done: "Re-opened your case" },
  generateShareCard: { running: "Writing your share card…", done: "Wrote your share card" },
};

function labelFor(name: string, done: boolean): string {
  const l = TOOL_LABELS[name];
  if (l) return done ? l.done : l.running;
  // Fallback: humanize the camelCase name.
  const human = name.replace(/([A-Z])/g, " $1").trim().toLowerCase();
  return done ? `Done: ${human}` : `${human}…`;
}

const APPROVAL_PROMPTS: Record<string, string> = {
  generateArtifact: "I'll draft this document for you. Want me to go ahead?",
  scheduleReminder: "I'll set a reminder for this deadline. Want me to go ahead?",
};

function fmtMonthDay(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Download a string of markdown as a .md file.
function downloadMarkdown(filename: string, contents: string) {
  const blob = new Blob([contents], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".md") ? filename : `${filename}.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function safeFilename(s: string): string {
  return (s || "billcheck").replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "billcheck";
}

export default function ChatClient() {
  // The active case is resolved/created server-side on mount; caseId is sent with every
  // turn and the stored transcript seeds useChat so a returning user resumes coherently.
  const [caseId, setCaseId] = useState<string | undefined>(undefined);
  const [userId, setUserId] = useState<string | undefined>(undefined);
  const caseIdRef = useRef<string | undefined>(undefined);
  caseIdRef.current = caseId;

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        // caseId is read at send time via the ref, so it's always the resolved value.
        prepareSendMessagesRequest: ({ messages, body }) => ({
          body: { ...body, messages, caseId: caseIdRef.current },
        }),
      }),
    [],
  );

  const {
    messages,
    setMessages,
    sendMessage,
    status,
    error,
    stop,
    regenerate,
    addToolApprovalResponse,
  } = useChat({
    transport,
    // Once the user has responded to every pending approval on the last assistant message,
    // auto-resubmit so the approved tool actually runs (and the turn continues).
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pinned = useRef(true);

  // Resume: load the active case + its stored transcript on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/cases/active");
        if (!res.ok) return;
        const data: { userId: string; caseId: string; messages: UIMessage[] } =
          await res.json();
        if (cancelled) return;
        setUserId(data.userId);
        setCaseId(data.caseId);
        if (data.messages?.length) setMessages(data.messages);
      } catch {
        // No resume available — start fresh.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setMessages]);

  const busy = status === "submitted" || status === "streaming";

  // Make a case active: stop any stream, point the chat at it (the caseId ref drives the body),
  // and load that case's stored transcript so the thread reflects the switched-to case.
  async function switchToCase(id: string) {
    if (busy) stop();
    setCaseId(id);
    setMessages([]);
    setDrawerOpen(false);
    try {
      const res = await fetch(`/api/cases/active?caseId=${encodeURIComponent(id)}`);
      if (!res.ok) return;
      const data: { userId: string; caseId: string; messages: UIMessage[] } = await res.json();
      setUserId(data.userId);
      setCaseId(data.caseId);
      if (data.messages?.length) setMessages(data.messages);
    } catch {
      // Couldn't load — the empty thread + the resolved caseId still work for a fresh start.
    }
  }

  // "New case": the server already created an empty case; just make it active (empty transcript).
  function startNewCase(id: string) {
    if (busy) stop();
    setCaseId(id);
    setMessages([]);
    setDrawerOpen(false);
  }

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
        // Namespace the stored path per user; the upload route enforces this prefix.
        const pathname = userId ? `user/${userId}/${file.name}` : file.name;
        const blob = await upload(pathname, file, {
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
        <div className="hd-titles">
          <h1>billcheck</h1>
          <div className="sub">your medical-bill advisor</div>
        </div>
        <button
          className="hd-workspace"
          aria-label="Open your case workspace"
          title="Your case"
          onClick={() => setDrawerOpen(true)}
        >
          Your case
        </button>
      </header>

      <CaseWorkspace
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        caseId={caseId}
        onSwitchCase={switchToCase}
        onNewCase={startNewCase}
      />

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
            <p className="welcome-lead">Hi — let&apos;s take a look together.</p>
            <p>
              Confusing medical bill? You don&apos;t have to figure it out alone. Send a photo or
              PDF of the bill, statement, or EOB — or just tell me what&apos;s going on. I&apos;ll
              explain what it is, whether you actually owe it, and what to do next. No homework, no
              jargon. I&apos;ll remember your case so we can pick up anytime.
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
                    {m.role === "user" ? (
                      part.text
                    ) : (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{part.text}</ReactMarkdown>
                    )}
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
              if (part.type.startsWith("tool-")) {
                return (
                  <ToolPart
                    key={i}
                    part={part as ToolPartLike}
                    addToolApprovalResponse={addToolApprovalResponse}
                  />
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
                  {a.error && (
                    <small> Unsupported — please upload a PDF, JPG, PNG, or WEBP.</small>
                  )}
                </span>
                <button className="rm" aria-label="Remove attachment" onClick={() => removeAttachment(a.id)}>
                  ✕
                </button>
              </span>
            ))}
            {attachments.some((a) => a.error) && (
              <p className="upload-fallback">
                Trouble with a file? No worries — you can just tell me about the bill in your own
                words instead.
              </p>
            )}
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

// A loosely-typed view of a `tool-*` UI part (the SDK's union is keyed by the concrete tool
// map; here we only read the fields the UI needs, so a structural type keeps this generic).
type ToolPartLike = {
  type: string;
  state:
    | "input-streaming"
    | "input-available"
    | "approval-requested"
    | "approval-responded"
    | "output-available"
    | "output-error"
    | "output-denied";
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  errorText?: string;
  approval?: { id: string; approved?: boolean };
};

function ToolPart({
  part,
  addToolApprovalResponse,
}: {
  part: ToolPartLike;
  addToolApprovalResponse: (opts: { id: string; approved: boolean }) => void;
}) {
  const name = toolName(part.type);
  const out = part.output ?? {};
  const hadError =
    part.state === "output-error" || (typeof out.error === "string" && out.error.length > 0);

  // 1) Approval card — render Approve / Decline for the two world-effecting tools.
  if (part.state === "approval-requested" && part.approval) {
    const id = part.approval.id;
    const prompt = APPROVAL_PROMPTS[name] ?? "Want me to go ahead?";
    const detail = approvalDetail(name, part.input);
    return (
      <div className="tool-approve" role="group" aria-label="Confirm action">
        <div className="ta-q">{prompt}</div>
        {detail && <div className="ta-detail">{detail}</div>}
        <div className="ta-actions">
          <button
            className="ta-approve"
            onClick={() => addToolApprovalResponse({ id, approved: true })}
          >
            Yes, go ahead
          </button>
          <button
            className="ta-decline"
            onClick={() => addToolApprovalResponse({ id, approved: false })}
          >
            Not now
          </button>
        </div>
      </div>
    );
  }

  // 2) The user declined this action.
  if (part.state === "output-denied") {
    return <div className="tool-line muted">Skipped — no problem.</div>;
  }

  // 3) Still running (input streaming / available, not yet finished).
  const running =
    part.state === "input-streaming" ||
    part.state === "input-available" ||
    part.state === "approval-responded";

  // 4) Artifact / share-card previews (with copy + download), once the output is ready.
  if (part.state === "output-available" && !hadError) {
    if (name === "generateArtifact" && typeof out.contentMd === "string") {
      return (
        <ArtifactPreview
          title={typeof out.title === "string" ? out.title : "Your letter"}
          contentMd={out.contentMd}
        />
      );
    }
    if (name === "generateShareCard" && typeof out.bodyMd === "string") {
      return (
        <SharePreview
          title={typeof out.title === "string" ? out.title : "Share card"}
          bodyMd={out.bodyMd}
        />
      );
    }
  }

  // 5) Plain-language status line + collapsed raw details (never raw JSON inline).
  const done = part.state === "output-available";
  const note = typeof out.note === "string" ? out.note : undefined;
  return (
    <div className={`tool-line ${hadError ? "err" : ""}`}>
      <span className="tl-mark" aria-hidden>
        {hadError ? "!" : running ? "…" : "✓"}
      </span>
      <span className="tl-text">
        {hadError ? gentleError(name) : labelFor(name, done)}
        {note && <span className="tl-note"> {note}</span>}
      </span>
      {(part.input || part.output) && (
        <details className="tl-raw">
          <summary>details</summary>
          <pre>{JSON.stringify({ input: part.input, output: part.output }, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}

// A short, human description shown inside an approval card (no raw JSON).
function approvalDetail(name: string, input?: Record<string, unknown>): string | null {
  if (!input) return null;
  if (name === "generateArtifact" && typeof input.type === "string") {
    const labels: Record<string, string> = {
      dispute: "a dispute letter",
      appeal: "an insurance appeal letter",
      complaint: "a regulator complaint",
      call_script: "a phone call-script",
    };
    return `Draft ${labels[input.type] ?? "a document"}.`;
  }
  if (name === "scheduleReminder") {
    const when = fmtMonthDay(typeof input.dueAt === "string" ? input.dueAt : undefined);
    const what = typeof input.title === "string" ? input.title : "this deadline";
    return when ? `Remind you about ${what} around ${when}.` : `Remind you about ${what}.`;
  }
  return null;
}

function gentleError(name: string): string {
  const l = TOOL_LABELS[name];
  return l ? `I couldn't ${l.running.replace(/…$/, "").toLowerCase()} just now.` : "That didn't work.";
}

function ArtifactPreview({ title, contentMd }: { title: string; contentMd: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="artifact-card">
      <div className="ac-head">
        <span className="ac-ic" aria-hidden>
          ✓
        </span>
        <span className="ac-title">{title}</span>
      </div>
      <div className="ac-body">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{contentMd}</ReactMarkdown>
      </div>
      <div className="ac-actions">
        <button
          onClick={() => {
            navigator.clipboard?.writeText(contentMd);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
        <button onClick={() => downloadMarkdown(safeFilename(title), contentMd)}>
          Download
        </button>
      </div>
    </div>
  );
}

function SharePreview({ title, bodyMd }: { title: string; bodyMd: string }) {
  const [copied, setCopied] = useState(false);
  const full = `## ${title}\n\n${bodyMd}`;
  return (
    <div className="artifact-card share">
      <div className="ac-head">
        <span className="ac-ic" aria-hidden>
          ↗
        </span>
        <span className="ac-title">{title}</span>
      </div>
      <div className="ac-body">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{bodyMd}</ReactMarkdown>
      </div>
      <div className="ac-note">Preview only — nothing is shared until you choose to.</div>
      <div className="ac-actions">
        <button
          onClick={() => {
            navigator.clipboard?.writeText(full);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
        <button onClick={() => downloadMarkdown(safeFilename(title), full)}>Download</button>
      </div>
    </div>
  );
}
