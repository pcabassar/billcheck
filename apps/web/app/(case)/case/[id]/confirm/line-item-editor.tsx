"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { centsToDollarInput, formatCents, parseDollarsToCents } from "@/lib/case/money";
import { isLowConfidence } from "@/lib/case/rules";

/**
 * One line item on the S3 confirm screen: per-field display with a low-
 * confidence flag, plus inline edit of amount (dollars in, cents stored),
 * code, and date via PATCH /api/line-items/[id].
 */

export interface EditableLineItem {
  id: string;
  code: string | null;
  descriptionRaw: string;
  units: number | null;
  amountCents: number | null;
  dateOfService: string | null;
  confidence: number;
}

export function LineItemEditor({
  item,
  editable,
}: {
  item: EditableLineItem;
  editable: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState(item.code ?? "");
  const [amount, setAmount] = useState(centsToDollarInput(item.amountCents));
  const [date, setDate] = useState(item.dateOfService ?? "");

  const lowConfidence = isLowConfidence(item.confidence);

  async function save() {
    const parsed = parseDollarsToCents(amount);
    if (!parsed.ok) {
      setError("Enter the amount in dollars, like 123.45.");
      return;
    }
    setSaving(true);
    setError(null);
    let res: Response | null = null;
    try {
      res = await fetch(`/api/line-items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim() === "" ? null : code.trim(),
          amountCents: parsed.cents,
          dateOfService: date === "" ? null : date,
        }),
      });
    } catch {
      // network failure — handled below
    }
    setSaving(false);
    if (!res || !res.ok) {
      if (res?.status === 409) {
        setError(
          "This bill is locked — the audit already ran. Corrections now go in as a new statement version.",
        );
      } else {
        setError("We couldn't save that change. Please try again.");
      }
      return;
    }
    setEditing(false);
    router.refresh();
  }

  return (
    <li
      className={`flex flex-col gap-2 rounded-lg border p-4 ${
        lowConfidence
          ? "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30"
          : "border-neutral-200 dark:border-neutral-800"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="font-medium">{item.descriptionRaw}</span>
          {lowConfidence && (
            <span className="w-fit rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-200">
              We weren&apos;t sure about this one — double-check it
            </span>
          )}
        </div>
        {editable && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="shrink-0 rounded-md border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-900"
          >
            Edit
          </button>
        )}
      </div>

      {!editing ? (
        <dl className="grid grid-cols-3 gap-2 text-sm">
          <div>
            <dt className="text-xs text-neutral-500">Code</dt>
            <dd className="font-mono">{item.code ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-neutral-500">
              Amount{item.units && item.units > 1 ? ` (×${item.units})` : ""}
            </dt>
            <dd>{formatCents(item.amountCents)}</dd>
          </div>
          <div>
            <dt className="text-xs text-neutral-500">Date</dt>
            <dd>{item.dateOfService ?? "—"}</dd>
          </div>
        </dl>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-2">
            <label className="flex flex-col gap-1 text-xs text-neutral-500">
              Code
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={32}
                className="rounded-md border border-neutral-300 px-2 py-1.5 font-mono text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-neutral-500">
              Amount ($)
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="123.45"
                className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-neutral-500">
              Date
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
              />
            </label>
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setError(null);
                setCode(item.code ?? "");
                setAmount(centsToDollarInput(item.amountCents));
                setDate(item.dateOfService ?? "");
              }}
              disabled={saving}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 dark:border-neutral-700 dark:text-neutral-200"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
