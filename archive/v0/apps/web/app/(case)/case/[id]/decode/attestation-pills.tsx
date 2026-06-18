"use client";

import { useState } from "react";
import type { AttestationStatus } from "@/lib/case/rules";

/**
 * Three attestation pills per decoded line (S3b): remember / not sure /
 * didn't happen. Posts to /api/attestations (upsert on line_item_id) with
 * optimistic selection; reverts on failure.
 */

const PILLS: Array<{ status: AttestationStatus; label: string }> = [
  { status: "remember", label: "I remember this" },
  { status: "not_sure", label: "Not sure" },
  { status: "didnt_happen", label: "This didn't happen" },
];

export function AttestationPills({
  lineItemId,
  initial,
}: {
  lineItemId: string;
  initial: AttestationStatus | null;
}) {
  const [selected, setSelected] = useState<AttestationStatus | null>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(status: AttestationStatus) {
    if (saving || status === selected) return;
    const previous = selected;
    setSelected(status);
    setSaving(true);
    setError(null);
    let res: Response | null = null;
    try {
      res = await fetch("/api/attestations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lineItemId, status }),
      });
    } catch {
      // network failure — handled below
    }
    setSaving(false);
    if (!res || !res.ok) {
      setSelected(previous);
      setError(
        res?.status === 409
          ? "This bill has already been audited — attestations are locked."
          : "We couldn't save that. Please try again.",
      );
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Did this happen?">
        {PILLS.map((pill) => {
          const active = selected === pill.status;
          return (
            <button
              key={pill.status}
              type="button"
              onClick={() => void choose(pill.status)}
              disabled={saving}
              aria-pressed={active}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors disabled:opacity-60 ${
                active
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-black"
                  : "border border-neutral-300 text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900"
              }`}
            >
              {pill.label}
            </button>
          );
        })}
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
