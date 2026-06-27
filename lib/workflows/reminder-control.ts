// Reminder control plane — ORDINARY server code that arms / cancels the smart-reminder Workflow.
//
// These helpers live OUTSIDE the `'use workflow'` module on purpose: the WDK bundles a workflow
// module's plain (non-step) exports for the workflow runtime, which forbids Node-only modules
// (postgres). Arming/cancelling is normal server work (it touches the admin DB + the workflow
// API), so it belongs here, not in `reminder.ts`. We import only the workflow *reference* and the
// hook-token helper from that module — referencing a workflow to `start()` it is the WDK pattern.
//
// Public contract (unchanged from the plan): `startReminder({...})` and
// `closeReminder(caseId, deadlineId, workflowRunId?)`.
import { getRun, resumeHook, start } from 'workflow/api'
import { adminDb } from '@/lib/db'
import { setReminderState } from '@/lib/db/deadlines'
import { caseClosedToken, reminderWorkflow, type ReminderInput } from './reminder'

export type { ReminderInput }

/**
 * Arm a reminder: a transaction-or-outbox dual-write via the admin client.
 *   1) set reminderStatus 'pending' (intent recorded before the side effect),
 *   2) start() the durable Workflow,
 *   3) store workflowRunId + set reminderStatus 'armed'.
 * The deadline row must already exist (created by `createDeadline` under RLS in the tool).
 * Idempotency at the deadline level is the partial UNIQUE (case_id, dedup_key) handled by
 * createDeadline; this only arms whatever single deadline row it's given.
 */
export async function startReminder(input: ReminderInput): Promise<{ runId: string }> {
  const db = adminDb()

  // 1) Record intent first (so a crash between here and start() is detectable as 'pending').
  await setReminderState(db, input.deadlineId, { reminderStatus: 'pending' })

  // 2) Kick off the durable workflow.
  const run = await start(reminderWorkflow, [input])

  // 3) Persist the run id + flip to 'armed'.
  await setReminderState(db, input.deadlineId, {
    reminderStatus: 'armed',
    workflowRunId: run.runId,
  })

  return { runId: run.runId }
}

/**
 * Cancel a live reminder when the case closes / deadline is cancelled. Resumes the
 * case-closed hook (which wakes the workflow out of its sleep and cancels cleanly); if the
 * workflow isn't waiting on the hook anymore (already fired / not yet suspended), falls back
 * to cancelling the run by id. Best-effort + idempotent — never throws into the caller's tx.
 */
export async function closeReminder(
  caseId: string,
  deadlineId: string,
  workflowRunId?: string | null,
): Promise<void> {
  const token = caseClosedToken(caseId, deadlineId)
  try {
    await resumeHook(token, { reason: 'case_closed' })
    return
  } catch {
    // Hook not registered / already consumed — fall through to a hard cancel by run id.
  }

  if (workflowRunId) {
    try {
      await getRun(workflowRunId).cancel()
    } catch {
      // Run already finished / not found — nothing to cancel.
    }
  }
}
