"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * State-conditional case actions (S14-lite / U14, finding #2/#13). Renders
 * the moves a case can make from its current state and POSTs them to
 * /api/cases/[id]/actions. "Tell us what happened" expands a 4-chip
 * self-report; positive outcomes route to the S16 PWYW outcome screen.
 */

type SelfReport = "bill_reduced" | "bill_unchanged" | "paid_it" | "no_response_yet";

const SELF_REPORT_CHIPS: Array<{ value: SelfReport; label: string }> = [
  { value: "bill_reduced", label: "They reduced it" },
  { value: "bill_unchanged", label: "No change" },
  { value: "paid_it", label: "I paid it" },
  { value: "no_response_yet", label: "No response yet" },
];

export function CaseActions({ caseId, state }: { caseId: string; state: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: string, outcome?: SelfReport) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/cases/${caseId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, outcome }),
      });
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; resolved?: boolean; positive?: boolean; verified?: boolean; error?: string }
        | null;
      if (!res.ok || !body?.ok) {
        setError("That didn't go through — try again.");
        setBusy(false);
        return;
      }
      if (action === "self_report" && body.resolved) {
        router.push(`/case/${caseId}/outcome`);
        return;
      }
      if (action === "verify_savings" && body.verified) {
        router.push(`/case/${caseId}/outcome`);
        return;
      }
      router.refresh();
    } catch {
      setError("Network hiccup — try again.");
      setBusy(false);
    }
  }

  const canSend = state === "VERDICT";
  const canReport = ["VERDICT", "SENT_BY_USER"].includes(state);
  const canAddDoc = !["CLOSED_BY_USER", "RESOLVED_VERIFIED"].includes(state);
  const canVerify = ["VERDICT", "SENT_BY_USER", "RESOLVED_SELF_REPORTED"].includes(state);
  const canClose = !["CLOSED_BY_USER"].includes(state);
  const resolved = ["RESOLVED_VERIFIED", "RESOLVED_SELF_REPORTED"].includes(state);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {canSend ? (
          <ActionButton busy={busy} onClick={() => void act("sent")}>
            I sent it
          </ActionButton>
        ) : null}
        {canReport ? (
          <ActionButton busy={busy} onClick={() => setShowReport((v) => !v)}>
            Tell us what happened
          </ActionButton>
        ) : null}
        {canAddDoc ? (
          <ActionButton busy={busy} onClick={() => router.push(`/upload?caseId=${caseId}`)}>
            Add a document
          </ActionButton>
        ) : null}
        {canVerify ? (
          <ActionButton busy={busy} onClick={() => void act("verify_savings")}>
            Verify my savings
          </ActionButton>
        ) : null}
        {resolved ? (
          <ActionButton busy={busy} onClick={() => router.push(`/case/${caseId}/outcome`)}>
            View outcome
          </ActionButton>
        ) : null}
        {canClose ? (
          <ActionButton busy={busy} subtle onClick={() => void act("close")}>
            Close
          </ActionButton>
        ) : null}
      </div>

      {showReport ? (
        <div className="flex flex-wrap gap-2 rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
          {SELF_REPORT_CHIPS.map((chip) => (
            <ActionButton key={chip.value} busy={busy} onClick={() => void act("self_report", chip.value)}>
              {chip.label}
            </ActionButton>
          ))}
        </div>
      ) : null}

      {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}
    </div>
  );
}

function ActionButton({
  children,
  busy,
  subtle,
  onClick,
}: {
  children: React.ReactNode;
  busy: boolean;
  subtle?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className={
        subtle
          ? "rounded-md px-3 py-1.5 text-xs font-medium text-neutral-500 underline disabled:opacity-50"
          : "rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium disabled:opacity-50 dark:border-neutral-700"
      }
    >
      {children}
    </button>
  );
}
