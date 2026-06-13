"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Wait state for the action plan while the audit workflow finishes (the
 * audit runs while the user walks the decode screen — most arrivals here
 * will see one refresh at most). Deadline guards against a wedged workflow:
 * past it, we surface honest copy instead of an infinite spinner.
 */

const STALL_AFTER_MS = 120_000;

export function VerdictWait({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [stalled, setStalled] = useState(false);
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    startedAt.current ??= Date.now();
    let cancelled = false;

    async function tick() {
      try {
        const res = await fetch(`/api/cases/${caseId}/status`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { state: string };
        if (cancelled) return;
        if (data.state === "VERDICT" || data.state === "AUDITED") {
          router.refresh();
        }
        if (startedAt.current !== null && Date.now() - startedAt.current > STALL_AFTER_MS) setStalled(true);
      } catch {
        // Network blip — next tick retries.
      }
    }

    void tick();
    const interval = setInterval(() => void tick(), 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [caseId, router]);

  if (stalled) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-8 text-center text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100">
        The audit is taking longer than usual. Your bill is safe — check back
        in a few minutes, or refresh this page.
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-neutral-200 p-12 text-center dark:border-neutral-800">
      <span
        aria-hidden
        className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900 dark:border-neutral-700 dark:border-t-white"
      />
      <div className="flex flex-col gap-1">
        <p className="font-medium">Running the audit…</p>
        <p className="text-sm text-neutral-500">
          We&apos;re checking every line against duplicate, unbundling, and
          units rules. Usually under a minute.
        </p>
      </div>
    </div>
  );
}
