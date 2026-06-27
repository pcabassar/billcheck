// The smart-reminder durable Workflow (the thin, deterministic `'use workflow'` body).
//
// Shape (per the plan's "smart reminder Workflow" design):
//   - sleep durably until ~1 day before the deadline (proceed immediately if already past),
//     RACED against a case-closed hook so closing the case cancels the wait;
//   - on wake, a single step reads LIVE case state via adminDb(), runs the PURE
//     selectReminderBranch(...), then either suppresses (timeline only) or sends the
//     branch-tailored email (idempotency key = `${caseId}:${deadlineId}:${branch}`).
//
// Constraints honored:
//   - NO model call anywhere in here. Speed/clocks are the product's job, not the model's.
//   - The workflow BODY is thin + deterministic: no Date.now() / new Date() outside a step;
//     the only time it reads is `dueAtISO` (passed in) to compute the wake moment. ALL IO
//     (DB reads/writes, email) + all wall-clock reads live in the `'use step'` functions, which
//     are extracted to `reminder-steps.ts` so THIS module has NO module-level Node-only deps
//     (postgres / resend). The WDK bundles a workflow module's plain exports for the flow VM,
//     which forbids those deps — keeping them out of this file's imports is the WDK rule, not a
//     tree-shaking accident.
//   - The Workflow runs OUTSIDE any user session, so every DB call (in the steps) uses adminDb()
//     (BYPASSRLS) scoped EXPLICITLY by caseId/deadlineId.
//
// VERIFIED WDK API (workflow@4.5.0, from installed types + bundled docs):
//   - `'use workflow'` / `'use step'` directives (next.config withWorkflow enables them).
//   - `sleep(date | "1d" | ms)` from 'workflow' — durable, awaitable; race-able via Promise.race.
//   - `createHook<T>({ token })` from 'workflow' — awaitable Hook; resumed externally by token.
//   - `start(fn, args)` -> Promise<Run>; `Run.runId`; from 'workflow/api'.
//   - `getRun(runId)` -> Run; `Run.cancel()` / `Run.wakeUp()`; from 'workflow/api'.
//   - `resumeHook(token, payload)` from 'workflow/api' — resume a hook from a server route.
import { createHook, sleep } from 'workflow'
import type { ReminderBranch } from '@/lib/reminder/state'
import {
  computeWakeDelayStep,
  fireReminderStep,
  onClosedStep,
} from './reminder-steps'
import type { ReminderInput } from './reminder-types'

export type { ReminderInput }

// The hook token closing the case (or cancelling the deadline) uses to wake + cancel the wait.
function caseClosedToken(caseId: string, deadlineId: string): string {
  return `reminder-closed:${caseId}:${deadlineId}`
}

// ---------------------------------------------------------------------------
// The durable workflow (thin, deterministic body)
// ---------------------------------------------------------------------------

export async function reminderWorkflow(input: ReminderInput): Promise<{ branch: ReminderBranch | 'closed' }> {
  'use workflow'

  using closedHook = createHook<{ reason: string }>({
    token: caseClosedToken(input.caseId, input.deadlineId),
  })

  // How long to wait before nudging is clock-dependent, so it's computed inside a STEP
  // (the workflow body never reads the wall clock — determinism/skew rules). The step
  // clamps to >= 0 so an already-past wake moment becomes an immediate proceed.
  const wakeDelayMs = await computeWakeDelayStep(input.dueAtISO)

  // Race the durable sleep-until-wake against the case-closed hook (whichever fires first).
  const raced = await Promise.race([
    sleep(wakeDelayMs).then(() => 'wake' as const),
    closedHook.then(() => 'closed' as const),
  ])

  if (raced === 'closed') {
    // The case closed (or the deadline was cancelled) during the wait — cancel the reminder.
    await onClosedStep(input)
    return { branch: 'closed' }
  }

  // Woke at ~1 day before the deadline — read live state and act on it.
  const branch = await fireReminderStep(input)
  return { branch }
}

// ---------------------------------------------------------------------------
// Start / close helpers
// ---------------------------------------------------------------------------
// These run as ORDINARY server code (they only kick off / wake the workflow) — they do NOT
// belong in this `'use workflow'` module, because the WDK bundles this file's plain (non-step)
// exports for the workflow runtime, which forbids the Node-only DB client (postgres) they use.
// They therefore live in `lib/workflows/reminder-control.ts` (no directive) and import the
// `reminderWorkflow` reference from here. Callers (U4 tools) import them from that control module.
// The shared hook token helper is exported so the control module's closeReminder matches it.
export { caseClosedToken }
