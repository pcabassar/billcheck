"use client";

import { useState } from "react";
import type { DeliveryOption } from "@/lib/delivery/channels";

/**
 * SendPanel (U13): renders the DeliveryChannel options for an artifact —
 * portal-guided steps with copy-to-clipboard, and download as a .txt file.
 * Client-only mechanics; the artifact text never leaves the page except by
 * the user's own action.
 */
export function SendPanel({
  options,
  letterText,
  filename,
}: {
  options: DeliveryOption[];
  letterText: string;
  filename: string;
}) {
  const [copied, setCopied] = useState(false);

  function download() {
    const blob = new Blob([letterText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(letterText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard denied — the user can still select the text manually.
    }
  }

  return (
    <section aria-label="How to send it" className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">How to send it</h2>
      {options.map((opt) => (
        <div
          key={opt.kind}
          className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
        >
          <p className="font-medium">{opt.title}</p>
          <ol className="list-decimal pl-5 text-sm text-neutral-600 dark:text-neutral-400">
            {opt.steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
          {opt.kind === "portal_guided" ? (
            <button
              type="button"
              onClick={() => void copy()}
              className="self-start rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-black"
            >
              {copied ? "Copied ✓" : "Copy the text"}
            </button>
          ) : (
            <button
              type="button"
              onClick={download}
              className="self-start rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium dark:border-neutral-700"
            >
              Download .txt
            </button>
          )}
        </div>
      ))}
    </section>
  );
}
