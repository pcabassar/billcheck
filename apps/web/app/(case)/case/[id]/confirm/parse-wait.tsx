"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { isParsePending } from "@/lib/case/rules";

/**
 * Refreshing wait state for the S3 confirm screen: polls the tiny status
 * route every 2s while any document is pending/parsing, then refreshes the
 * server component so the extracted line items render.
 *
 * A 2.5-minute deadline (review F72) flips to a stalled state with a retry
 * button instead of spinning forever — the retry re-kicks /process, which
 * reclaims failed documents.
 */

const STALL_AFTER_MS = 150_000;

interface StatusResponse {
  state: string;
  documents: Array<{ id: string; parse_status: string }>;
}

export function ParseWait({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [stalled, setStalled] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    startedAt.current ??= Date.now();
    let cancelled = false;

    async function tick() {
      try {
        const res = await fetch(`/api/cases/${caseId}/status`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as StatusResponse;
        if (cancelled) return;
        setStatus(data);
        const stillParsing = data.documents.some((d) => isParsePending(d.parse_status));
        if (!stillParsing) {
          router.refresh();
          return;
        }
        if (startedAt.current !== null && Date.now() - startedAt.current > STALL_AFTER_MS) setStalled(true);
      } catch {
        // Network blip — the next tick retries; nothing to log client-side.
      }
    }

    void tick();
    const interval = setInterval(() => void tick(), 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [caseId, router]);

  const total = status?.documents.length ?? 0;
  const done = status
    ? status.documents.filter((d) => !isParsePending(d.parse_status)).length
    : 0;

  if (stalled) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-lg border border-amber-300 bg-amber-50 p-12 text-center dark:border-amber-700 dark:bg-amber-950/30">
        <div className="flex flex-col gap-1">
          <p className="font-medium text-amber-900 dark:text-amber-100">
            This is taking longer than usual.
          </p>
          <p className="text-sm text-amber-900/80 dark:text-amber-100/80">
            Sometimes a read gets stuck. You can retry now, or come back in a
            few minutes — your documents are safe.
          </p>
        </div>
        <button
          type="button"
          disabled={retrying}
          onClick={async () => {
            setRetrying(true);
            await fetch(`/api/cases/${caseId}/process`, { method: "POST" }).catch(() => {});
            startedAt.current = Date.now();
            setStalled(false);
            setRetrying(false);
          }}
          className="rounded-md bg-amber-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {retrying ? "Retrying…" : "Retry reading"}
        </button>
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
        <p className="font-medium">Reading your bill…</p>
        <p className="text-sm text-neutral-500">
          {total > 1
            ? `${done} of ${total} documents read. This usually takes under a minute.`
            : "This usually takes under a minute. We pull out every line so you can check our work."}
        </p>
      </div>
    </div>
  );
}
