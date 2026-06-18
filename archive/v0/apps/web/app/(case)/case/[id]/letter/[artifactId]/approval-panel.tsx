"use client";

import { useState } from "react";

/**
 * Approval block (S13, review A4): the fact-attestation checkbox enables
 * Approve; download/print stay disabled until the artifact is approved.
 * Browser print is the V0 PDF path.
 */

export function ApprovalPanel({
  artifactId,
  letterText,
  attestationText,
  initiallyApproved,
}: {
  artifactId: string;
  letterText: string;
  attestationText: string;
  initiallyApproved: boolean;
}) {
  const [checked, setChecked] = useState(false);
  const [approved, setApproved] = useState(initiallyApproved);
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function approve() {
    setPending(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/artifacts/${artifactId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attestation: true }),
      });
      if (!res.ok) {
        setErrorMessage("We couldn't record your approval. Please try again.");
        return;
      }
      setApproved(true);
    } catch {
      setErrorMessage("We couldn't record your approval. Please try again.");
    } finally {
      setPending(false);
    }
  }

  function download() {
    const blob = new Blob([letterText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "dispute-letter.txt";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section
      aria-label="Approval"
      className="flex flex-col gap-4 rounded-lg border border-neutral-200 p-5 dark:border-neutral-800"
    >
      {approved ? (
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
          Approved. This letter is sent in your name — download or print it
          below.
        </p>
      ) : (
        <>
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <span>{attestationText}</span>
          </label>
          <button
            type="button"
            onClick={approve}
            disabled={!checked || pending}
            className="rounded-md bg-neutral-900 px-4 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {pending ? "Recording your approval…" : "Approve this letter"}
          </button>
        </>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => window.print()}
          disabled={!approved}
          className="flex-1 rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700"
        >
          Print / save as PDF
        </button>
        <button
          type="button"
          onClick={download}
          disabled={!approved}
          className="flex-1 rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700"
        >
          Download text
        </button>
      </div>
      {!approved && (
        <p className="text-xs text-neutral-500">
          Download and print unlock after you approve the letter.
        </p>
      )}
      {errorMessage && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {errorMessage}
        </p>
      )}
    </section>
  );
}
