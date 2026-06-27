"use client";

// U10 — the case workspace. A slide-in drawer (toggled from the chat header) that makes
// billcheck feel like a place that REMEMBERS the case: timeline, artifacts, deadlines, "your
// situation" (editable profile), aggregate-data consent, wrap-up/share, mark-resolved, and a
// case list for switching. Mobile-first; reuses the `.phone` palette/classes.
//
// Every action here hits a U10 endpoint that runs requireUserId() + withUser (RLS). The drawer
// owns NO chat state — case switching is delegated up to the chat client via onSwitchCase.

import { useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// --- Shapes returned by the U10 endpoints (secret-free) --------------------
type ProfilePanel = {
  coverageSituation: string | null;
  isDualQmb: boolean;
  isSelfFunded: boolean | null;
  state: string | null;
  situationNotes: string | null;
};
type TimelineItem = { id: string; type: string; createdAt: string };
type ArtifactItem = {
  id: string;
  title: string | null;
  type: string | null;
  status: string;
  createdAt: string;
  sentAt: string | null;
};
type DeadlineItem = {
  id: string;
  title: string | null;
  kind: string | null;
  dueAt: string;
  status: string;
  reminderStatus: string;
};
type CaseDetail = {
  caseId: string;
  title: string | null;
  status: string;
  profile: ProfilePanel;
  consentAggregate: boolean;
  timeline: TimelineItem[];
  artifacts: ArtifactItem[];
  deadlines: DeadlineItem[];
};
type CaseListItem = {
  id: string;
  title: string | null;
  status: string;
  updatedAt: string;
};

// --- Plain-language labels -------------------------------------------------
const TIMELINE_LABELS: Record<string, string> = {
  artifact_generated: "Drafted a letter",
  artifact_sent: "Marked a letter sent",
  reminder_sent: "Sent you a reminder",
  reminder_suppressed: "Skipped a reminder (already handled)",
  reminder_failed: "A reminder couldn't be sent",
  reminder_cancelled: "Cancelled a reminder",
};
function timelineLabel(type: string): string {
  return TIMELINE_LABELS[type] ?? type.replace(/_/g, " ");
}

const STATUS_LABELS: Record<string, string> = {
  new: "Just started",
  gathering: "Gathering details",
  recommendation_offered: "Plan in hand",
  acting: "Taking action",
  resolved: "Resolved",
  closed: "Closed",
  reopened: "Re-opened",
};
function statusLabel(s: string): string {
  return STATUS_LABELS[s] ?? s;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function dueLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

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

type Tab = "workspace" | "cases";

export default function CaseWorkspace({
  open,
  onClose,
  caseId,
  onSwitchCase,
  onNewCase,
}: {
  open: boolean;
  onClose: () => void;
  caseId: string | undefined;
  // Make the given case active in the chat (load its transcript). Called for switch + new.
  onSwitchCase: (id: string) => void;
  onNewCase: (id: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("workspace");
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!caseId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/detail`);
      if (res.ok) setDetail(await res.json());
      else setDetail(null);
    } catch {
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  // (Re)load whenever the drawer opens on the Workspace tab or the active case changes.
  useEffect(() => {
    if (open && tab === "workspace") loadDetail();
  }, [open, tab, loadDetail]);

  // Close on Escape for keyboard users.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <div className={`drawer-wrap ${open ? "open" : ""}`} aria-hidden={!open}>
      <div className="drawer-scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label="Case workspace" aria-modal="true">
        <header className="drawer-head">
          <div className="dh-tabs" role="tablist">
            <button
              role="tab"
              aria-selected={tab === "workspace"}
              className={tab === "workspace" ? "on" : ""}
              onClick={() => setTab("workspace")}
            >
              This case
            </button>
            <button
              role="tab"
              aria-selected={tab === "cases"}
              className={tab === "cases" ? "on" : ""}
              onClick={() => setTab("cases")}
            >
              All cases
            </button>
          </div>
          <button className="dh-close" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </header>

        <div className="drawer-body">
          {tab === "workspace" ? (
            <WorkspaceTab
              caseId={caseId}
              detail={detail}
              loading={loading}
              reload={loadDetail}
            />
          ) : (
            <CasesTab
              activeCaseId={caseId}
              onSwitchCase={(id) => {
                onSwitchCase(id);
                setTab("workspace");
              }}
              onNewCase={(id) => {
                onNewCase(id);
                setTab("workspace");
              }}
            />
          )}
        </div>
      </aside>
    </div>
  );
}

// --- "This case" tab -------------------------------------------------------
function WorkspaceTab({
  caseId,
  detail,
  loading,
  reload,
}: {
  caseId: string | undefined;
  detail: CaseDetail | null;
  loading: boolean;
  reload: () => void;
}) {
  if (!caseId) {
    return <p className="ws-empty">Start a conversation to open your case here.</p>;
  }
  if (loading && !detail) {
    return <p className="ws-empty">Loading your case…</p>;
  }
  if (!detail) {
    return <p className="ws-empty">Nothing to show here yet.</p>;
  }

  return (
    <div className="ws">
      <div className="ws-title">
        <h2>{detail.title || "Untitled case"}</h2>
        <span className={`ws-status st-${detail.status}`}>{statusLabel(detail.status)}</span>
      </div>

      <WrapUpSection caseId={caseId} status={detail.status} onChanged={reload} />
      <SituationSection caseId={caseId} profile={detail.profile} onSaved={reload} />
      <ConsentSection caseId={caseId} consent={detail.consentAggregate} />
      <ArtifactsSection artifacts={detail.artifacts} onChanged={reload} />
      <DeadlinesSection deadlines={detail.deadlines} />
      <TimelineSection timeline={detail.timeline} />
      <DangerSection />
    </div>
  );
}

// Account + data deletion (U12). A two-step confirm → POST /api/account/delete → redirect to login.
// Plain copy about what's removed and that anonymized contributions can't be retracted.
function DangerSection() {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function doDelete() {
    setDeleting(true);
    setErr(null);
    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      if (res.ok) {
        // Account + all personal data gone; cookies cleared server-side. Send them to login.
        window.location.href = "/login";
        return;
      }
      if (res.status === 503) {
        setErr("Account deletion isn't available right now. Please contact support.");
      } else {
        setErr("Couldn't delete your account just now. Please try again in a moment.");
      }
    } catch {
      setErr("Couldn't reach the server. Please try again in a moment.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Section title="Delete account & data">
      <p className="ws-help">
        This permanently deletes your account and everything in it — every case, the bills and
        documents you shared, your saved situation, letters, deadlines, and chat history. It can&apos;t
        be undone. Anonymized data you chose to contribute can&apos;t be retracted, but nothing in it
        can be traced back to you.
      </p>
      {!confirming ? (
        <div className="ws-actions">
          <button className="ws-btn danger" onClick={() => { setErr(null); setConfirming(true); }}>
            Delete account & data
          </button>
        </div>
      ) : (
        <div className="ws-danger-confirm">
          <p className="ws-danger-q">Are you sure? This can&apos;t be undone.</p>
          <div className="ws-actions">
            <button className="ws-btn danger" onClick={doDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Yes, delete everything"}
            </button>
            <button className="ws-btn" onClick={() => setConfirming(false)} disabled={deleting}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {err && <p className="ws-err">{err}</p>}
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="ws-sec">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

// Wrap up / share + mark resolved.
function WrapUpSection({
  caseId,
  status,
  onChanged,
}: {
  caseId: string;
  status: string;
  onChanged: () => void;
}) {
  const [card, setCard] = useState<{ title: string; bodyMd: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [err, setErr] = useState(false);
  const [copied, setCopied] = useState(false);
  const resolved = status === "resolved" || status === "closed";

  async function share() {
    setBusy(true);
    setErr(false);
    try {
      const res = await fetch(`/api/cases/${caseId}/share`, { method: "POST" });
      if (!res.ok) throw new Error();
      setCard(await res.json());
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
    }
  }

  async function resolve() {
    setResolving(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/resolve`, { method: "POST" });
      if (res.ok) onChanged();
    } finally {
      setResolving(false);
    }
  }

  return (
    <Section title="Wrap up & share">
      <p className="ws-help">
        Make a short, anonymized card about how this went — to share, or just to keep. You read
        it before anything leaves your screen.
      </p>
      <div className="ws-actions">
        <button className="ws-btn primary" onClick={share} disabled={busy}>
          {busy ? "Writing…" : card ? "Re-draft card" : "Wrap up & share"}
        </button>
        {!resolved && (
          <button className="ws-btn" onClick={resolve} disabled={resolving}>
            {resolving ? "Wrapping…" : "Mark resolved"}
          </button>
        )}
      </div>
      {err && <p className="ws-err">Couldn&apos;t draft the card just now. Try again in a moment.</p>}
      {card && (
        <div className="ws-card">
          <div className="ws-card-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{`## ${card.title}\n\n${card.bodyMd}`}</ReactMarkdown>
          </div>
          <p className="ws-card-note">Preview only — nothing is shared until you choose to.</p>
          <div className="ws-actions">
            <button
              className="ws-btn"
              onClick={() => {
                navigator.clipboard?.writeText(`## ${card.title}\n\n${card.bodyMd}`);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              className="ws-btn"
              onClick={() => downloadMarkdown(safeFilename(card.title), `## ${card.title}\n\n${card.bodyMd}`)}
            >
              Download
            </button>
          </div>
        </div>
      )}
    </Section>
  );
}

// "Your situation" — editable profile panel.
function SituationSection({
  caseId: _caseId,
  profile,
  onSaved,
}: {
  caseId: string;
  profile: ProfilePanel;
  onSaved: () => void;
}) {
  const [coverage, setCoverage] = useState(profile.coverageSituation ?? "");
  const [dualQmb, setDualQmb] = useState(profile.isDualQmb);
  // self-funded tri-state as a string for the <select>: "yes" | "no" | "unknown"
  const [selfFunded, setSelfFunded] = useState(
    profile.isSelfFunded === true ? "yes" : profile.isSelfFunded === false ? "no" : "unknown",
  );
  const [state, setState] = useState(profile.state ?? "");
  const [notes, setNotes] = useState(profile.situationNotes ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          coverageSituation: coverage,
          isDualQmb: dualQmb,
          isSelfFunded: selfFunded === "yes" ? true : selfFunded === "no" ? false : null,
          state,
          situationNotes: notes,
        }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
        onSaved();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section title="Your situation">
      <p className="ws-help">
        A few facts about your coverage so billcheck never has to ask twice.
      </p>
      <label className="ws-field">
        <span>Coverage</span>
        <input
          type="text"
          value={coverage}
          placeholder="e.g. Medicare + Medicaid, or Anthem PPO"
          onChange={(e) => setCoverage(e.target.value)}
        />
      </label>
      <label className="ws-check">
        <input type="checkbox" checked={dualQmb} onChange={(e) => setDualQmb(e.target.checked)} />
        <span>I have both Medicare and Medicaid (QMB)</span>
      </label>
      <label className="ws-field">
        <span>Is your plan self-funded?</span>
        <select value={selfFunded} onChange={(e) => setSelfFunded(e.target.value)}>
          <option value="unknown">Not sure</option>
          <option value="yes">Yes (self-funded)</option>
          <option value="no">No (fully insured)</option>
        </select>
      </label>
      <label className="ws-field">
        <span>State</span>
        <input
          type="text"
          value={state}
          placeholder="e.g. WA"
          onChange={(e) => setState(e.target.value)}
        />
      </label>
      <label className="ws-field">
        <span>Anything else worth knowing</span>
        <textarea
          rows={3}
          value={notes}
          placeholder="Veteran, income, charity-care eligibility, plan name…"
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      <div className="ws-actions">
        <button className="ws-btn primary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : saved ? "Saved" : "Save"}
        </button>
      </div>
    </Section>
  );
}

// Aggregate-data consent toggle (opt-in, default OFF).
function ConsentSection({ caseId: _caseId, consent }: { caseId: string; consent: boolean }) {
  const [on, setOn] = useState(consent);
  const [saving, setSaving] = useState(false);

  async function toggle(next: boolean) {
    setOn(next); // optimistic
    setSaving(true);
    try {
      const res = await fetch("/api/consent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ consentAggregate: next }),
      });
      if (!res.ok) setOn(!next); // revert on failure
    } catch {
      setOn(!next);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section title="Help fix this for everyone">
      <label className="ws-consent">
        <input
          type="checkbox"
          checked={on}
          disabled={saving}
          onChange={(e) => toggle(e.target.checked)}
        />
        <span>
          Share anonymized, de-identified data about this bill to help fix medical billing for
          everyone. No names, IDs, or exact amounts. You can turn this off anytime — but
          already-contributed anonymized records can&apos;t be retracted.
        </span>
      </label>
    </Section>
  );
}

// Artifacts list — title + status + download / copy / mark-sent.
function ArtifactsSection({
  artifacts,
  onChanged,
}: {
  artifacts: ArtifactItem[];
  onChanged: () => void;
}) {
  return (
    <Section title="Your letters">
      {artifacts.length === 0 ? (
        <p className="ws-help">No letters yet. Ask billcheck to draft one when you&apos;re ready.</p>
      ) : (
        <ul className="ws-list">
          {artifacts.map((a) => (
            <ArtifactRow key={a.id} artifact={a} onChanged={onChanged} />
          ))}
        </ul>
      )}
    </Section>
  );
}

function ArtifactRow({
  artifact,
  onChanged,
}: {
  artifact: ArtifactItem;
  onChanged: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  async function fetchContent(): Promise<string | null> {
    try {
      const res = await fetch(`/api/artifacts/${artifact.id}`);
      if (!res.ok) return null;
      const data: { contentMd: string } = await res.json();
      return data.contentMd;
    } catch {
      return null;
    }
  }

  async function copy() {
    const md = await fetchContent();
    if (md) {
      navigator.clipboard?.writeText(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }
  async function download() {
    const md = await fetchContent();
    if (md) downloadMarkdown(safeFilename(artifact.title || "letter"), md);
  }
  async function markSent() {
    setBusy(true);
    try {
      const res = await fetch(`/api/artifacts/${artifact.id}/sent`, { method: "POST" });
      if (res.ok) onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="ws-item">
      <div className="ws-item-main">
        <span className="ws-item-title">{artifact.title || "Untitled letter"}</span>
        <span className={`ws-pill ${artifact.status === "sent" ? "sent" : "draft"}`}>
          {artifact.status === "sent" ? "Sent" : "Draft"}
        </span>
      </div>
      <div className="ws-item-actions">
        <button className="ws-mini" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </button>
        <button className="ws-mini" onClick={download}>
          Download
        </button>
        {artifact.status !== "sent" && (
          <button className="ws-mini" onClick={markSent} disabled={busy}>
            {busy ? "…" : "Mark sent"}
          </button>
        )}
      </div>
    </li>
  );
}

// Deadlines list — title/kind + due date + reminder status.
function DeadlinesSection({ deadlines }: { deadlines: DeadlineItem[] }) {
  const REMINDER_LABEL: Record<string, string> = {
    none: "No reminder",
    pending: "Reminder arming…",
    armed: "Reminder set",
    sent: "Reminder sent",
    failed: "Reminder failed",
    cancelled: "Reminder off",
  };
  return (
    <Section title="Deadlines">
      {deadlines.length === 0 ? (
        <p className="ws-help">No deadlines tracked yet.</p>
      ) : (
        <ul className="ws-list">
          {deadlines.map((d) => (
            <li key={d.id} className="ws-item">
              <div className="ws-item-main">
                <span className="ws-item-title">{d.title || d.kind || "Deadline"}</span>
                <span className="ws-due">{dueLabel(d.dueAt)}</span>
              </div>
              <span className="ws-reminder">{REMINDER_LABEL[d.reminderStatus] ?? d.reminderStatus}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// Timeline — type + friendly label + relative time, most-recent first.
function TimelineSection({ timeline }: { timeline: TimelineItem[] }) {
  return (
    <Section title="Timeline">
      {timeline.length === 0 ? (
        <p className="ws-help">Your case activity will show up here.</p>
      ) : (
        <ul className="ws-timeline">
          {timeline.map((t) => (
            <li key={t.id} className="ws-tl-item">
              <span className="ws-tl-dot" aria-hidden />
              <span className="ws-tl-label">{timelineLabel(t.type)}</span>
              <span className="ws-tl-time">{relativeTime(t.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// --- "All cases" tab -------------------------------------------------------
function CasesTab({
  activeCaseId,
  onSwitchCase,
  onNewCase,
}: {
  activeCaseId: string | undefined;
  onSwitchCase: (id: string) => void;
  onNewCase: (id: string) => void;
}) {
  const [cases, setCases] = useState<CaseListItem[] | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/cases");
      if (res.ok) {
        const data: { cases: CaseListItem[] } = await res.json();
        setCases(data.cases);
      }
    } catch {
      setCases([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function newCase() {
    setCreating(true);
    try {
      const res = await fetch("/api/cases", { method: "POST" });
      if (res.ok) {
        const data: { caseId: string } = await res.json();
        onNewCase(data.caseId);
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="ws">
      <div className="ws-actions">
        <button className="ws-btn primary" onClick={newCase} disabled={creating}>
          {creating ? "Creating…" : "+ New case"}
        </button>
      </div>
      {cases === null ? (
        <p className="ws-empty">Loading your cases…</p>
      ) : cases.length === 0 ? (
        <p className="ws-empty">No cases yet.</p>
      ) : (
        <ul className="ws-list">
          {cases.map((c) => (
            <li key={c.id}>
              <button
                className={`ws-case ${c.id === activeCaseId ? "active" : ""}`}
                onClick={() => onSwitchCase(c.id)}
              >
                <span className="ws-case-title">{c.title || "Untitled case"}</span>
                <span className="ws-case-meta">
                  <span className={`ws-pill st-${c.status}`}>{statusLabel(c.status)}</span>
                  <span className="ws-case-time">{relativeTime(c.updatedAt)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
