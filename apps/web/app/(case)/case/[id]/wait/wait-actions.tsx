"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * S5 exits. "EOB arrived" routes to the upload screen pinned to this case
 * (the EOB rides the same pipeline, U16); "audit anyway" is the honest
 * escape hatch — it kicks the audit with degraded coverage.
 */
export function WaitActions({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [kicking, setKicking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => router.push(`/upload?caseId=${caseId}`)}
        className="rounded-md bg-neutral-900 px-4 py-3 text-sm font-medium text-white dark:bg-white dark:text-black"
      >
        My EOB arrived — add it
      </button>
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
            setError("Network hiccup — try again.");
            setKicking(false);
          }
        }}
        className="rounded-md border border-neutral-300 px-4 py-3 text-sm font-medium disabled:opacity-50 dark:border-neutral-700"
      >
        {kicking ? "Starting…" : "Can't wait — audit what we have"}
      </button>
      {error ? <p className="text-sm text-red-700 dark:text-red-300">{error}</p> : null}
      <p className="text-xs text-neutral-500">
        Auditing now still runs the duplicate, unbundling, and units checks —
        but the strongest insured-bill checks need the EOB.
      </p>
    </div>
  );
}
