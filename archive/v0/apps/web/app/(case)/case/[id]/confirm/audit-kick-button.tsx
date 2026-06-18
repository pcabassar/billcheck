"use client";

import { useRouter } from "next/navigation";

/**
 * Confirm-screen continue (U10 flow): the user has reviewed the extraction —
 * next stop is triage (S4), whose submit kicks the audit (or parks on the S5
 * wait screen). Clicking through the reconciliation banner here still counts
 * as the full-line review; the triage submit sends confirmed:true.
 */
export function AuditKickButton({ caseId }: { caseId: string }) {
  const router = useRouter();
  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={() => router.push(`/case/${caseId}/triage`)}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
      >
        Looks right — continue
      </button>
      <p className="text-xs text-neutral-500">
        A few coverage questions next, then the audit runs. Edits lock when it
        starts.
      </p>
    </div>
  );
}
