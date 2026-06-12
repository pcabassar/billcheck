"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isParsePending } from "@/lib/case/rules";

/**
 * Refreshing wait state for the S3 confirm screen: polls the tiny status
 * route every 2s while any document is pending/parsing, then refreshes the
 * server component so the extracted line items render.
 */

interface StatusResponse {
  state: string;
  documents: Array<{ id: string; parse_status: string }>;
}

export function ParseWait({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<StatusResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      try {
        const res = await fetch(`/api/cases/${caseId}/status`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as StatusResponse;
        if (cancelled) return;
        setStatus(data);
        const stillParsing = data.documents.some((d) => isParsePending(d.parse_status));
        if (!stillParsing) router.refresh();
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
