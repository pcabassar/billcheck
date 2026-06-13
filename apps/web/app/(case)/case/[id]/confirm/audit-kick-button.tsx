"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * The explicit audit kick (review F03/F71): clicking "Looks right" after
 * reviewing the extraction IS the reconciliation confirmation — the server
 * requires it whenever a document failed the printed-total check, and the
 * claim freezes line-item edits before the engine reads them.
 *
 * 409 (already running / already audited) is treated as success: the user's
 * intent — "move forward" — is satisfied either way.
 */
export function AuditKickButton({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [kicking, setKicking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-2">
      {error ? <p className="text-sm text-red-700 dark:text-red-300">{error}</p> : null}
      <button
        type="button"
        disabled={kicking}
        onClick={async () => {
          setKicking(true);
          setError(null);
          try {
            const res = await fetch(`/api/cases/${caseId}/audit`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ confirmed: true }),
            });
            if (res.ok || res.status === 409) {
              router.push(`/case/${caseId}/decode`);
              return;
            }
            setError("We couldn't start the audit — try again in a moment.");
            setKicking(false);
          } catch {
            setError("Network hiccup — check your connection and try again.");
            setKicking(false);
          }
        }}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {kicking ? "Starting the audit…" : "Looks right — run the audit"}
      </button>
      <p className="text-xs text-neutral-500">
        Edits lock when the audit starts. While it runs, we’ll walk you through
        what each charge means.
      </p>
    </div>
  );
}
