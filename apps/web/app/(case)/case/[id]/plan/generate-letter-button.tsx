"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Generate-letter action (S12). POSTs to /api/artifacts and navigates to the
 * letter page (S13) on success. Server error codes are sanitized — map them
 * to honest user copy here, never surface raw detail.
 */

const ERROR_COPY: Record<string, string> = {
  no_completed_run: "Your audit hasn't finished yet — come back when checks are complete.",
  no_findings: "There are no disputable findings on this case, so there's nothing to put in a letter.",
  letter_fill_invalid: "The draft came back malformed, so we blocked it. Please try again.",
  letter_validation_failed:
    "We couldn't verify every figure in the draft against your bill, so we blocked it. Please try again.",
  letter_generation_failed: "We couldn't generate the letter right now. Please try again in a minute.",
};

export function GenerateLetterButton({
  caseId,
  canGenerate,
  hasExisting,
}: {
  caseId: string;
  canGenerate: boolean;
  hasExisting: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function generate() {
    setPending(true);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/artifacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId, type: "dispute" }),
      });
      const body: { artifactId?: string; error?: string } | null = await res
        .json()
        .catch(() => null);
      if (!res.ok || !body?.artifactId) {
        setErrorMessage(
          ERROR_COPY[body?.error ?? ""] ?? "Something went wrong. Please try again.",
        );
        return;
      }
      router.push(`/case/${caseId}/letter/${body.artifactId}`);
    } catch {
      setErrorMessage("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={generate}
        disabled={!canGenerate || pending}
        className="rounded-md bg-neutral-900 px-4 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {pending
          ? "Generating your letter…"
          : hasExisting
            ? "Generate a fresh letter"
            : "Generate my dispute letter"}
      </button>
      {!canGenerate && (
        <p className="text-sm text-neutral-500">
          Letter generation unlocks once your audit finishes with at least one
          disputable finding.
        </p>
      )}
      {errorMessage && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
