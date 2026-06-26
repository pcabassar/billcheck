// The smart-reminder durable Workflow + its start/close helpers.
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
//     (DB reads/writes, email) lives in `'use step'` functions.
//   - The Workflow runs OUTSIDE any user session, so every DB call uses adminDb() (BYPASSRLS)
//     scoped EXPLICITLY by caseId/deadlineId.
//
// VERIFIED WDK API (workflow@4.5.0, from installed types + bundled docs):
//   - `'use workflow'` / `'use step'` directives (next.config withWorkflow enables them).
//   - `sleep(date | "1d" | ms)` from 'workflow' — durable, awaitable; race-able via Promise.race.
//   - `createHook<T>({ token })` from 'workflow' — awaitable Hook; resumed externally by token.
//   - `start(fn, args)` -> Promise<Run>; `Run.runId`; from 'workflow/api'.
//   - `getRun(runId)` -> Run; `Run.cancel()` / `Run.wakeUp()`; from 'workflow/api'.
//   - `resumeHook(token, payload)` from 'workflow/api' — resume a hook from a server route.
import { createHook, sleep } from 'workflow'
import { adminDb } from '@/lib/db'
import { readReminderContext, setReminderState } from '@/lib/db/deadlines'
import { timelineEvents } from '@/lib/db/schema'
import { sendReminderEmail } from '@/lib/email/resend'
import { selectReminderBranch, type ReminderBranch } from '@/lib/reminder/state'

// Roughly one day in milliseconds — how far before the deadline we wake to nudge.
const ONE_DAY_MS = 24 * 60 * 60 * 1000

export type ReminderInput = {
  caseId: string
  deadlineId: string
  userId: string
  dueAtISO: string
  recipientEmail: string
}

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
// Steps (ALL IO + clock reads live here)
// ---------------------------------------------------------------------------

/**
 * Compute how many ms to sleep before nudging: (dueAt - 1 day) - now, clamped to >= 0.
 * Reads the wall clock — hence a step, not the deterministic workflow body. Idempotent on
 * replay (the durable runtime persists the step result, so the sleep target is stable).
 */
async function computeWakeDelayStep(dueAtISO: string): Promise<number> {
  'use step'

  const wakeAtMs = Date.parse(dueAtISO) - ONE_DAY_MS
  return Math.max(0, wakeAtMs - Date.now())
}

/**
 * Wake-time step: read LIVE state, pick the branch (pure), then suppress or send.
 * Returns the branch taken (for observability / the workflow return value).
 */
async function fireReminderStep(input: ReminderInput): Promise<ReminderBranch> {
  'use step'

  const db = adminDb()
  const ctx = await readReminderContext(db, input.caseId, input.deadlineId)

  // The deadline/case vanished (deleted) — nothing to do; record cancellation defensively.
  if (!ctx) {
    await setReminderState(db, input.deadlineId, { reminderStatus: 'cancelled' })
    return 'suppress'
  }

  // `now` is read inside the step (allowed — steps run real Node), passed into the pure fn.
  const branch = selectReminderBranch({
    now: new Date(),
    dueAt: ctx.dueAt,
    caseStatus: ctx.caseStatus,
    deadlineStatus: ctx.deadlineStatus,
    artifactSent: ctx.artifactSent,
  })

  if (branch === 'suppress') {
    await setReminderState(db, input.deadlineId, {
      reminderStatus: 'cancelled',
      reminderBranch: 'suppress',
    })
    await db.insert(timelineEvents).values({
      userId: input.userId,
      caseId: input.caseId,
      type: 'reminder_suppressed',
      payload: { deadlineId: input.deadlineId },
    })
    return 'suppress'
  }

  const { subject, html } = buildEmail(branch, ctx.dueAt)
  const result = await sendReminderEmail({
    to: input.recipientEmail,
    subject,
    html,
    idempotencyKey: `${input.caseId}:${input.deadlineId}:${branch}`,
  })

  if (result.ok) {
    await setReminderState(db, input.deadlineId, {
      reminderStatus: 'sent',
      reminderBranch: branch,
    })
    await db.insert(timelineEvents).values({
      userId: input.userId,
      caseId: input.caseId,
      type: 'reminder_sent',
      payload: { deadlineId: input.deadlineId, branch },
    })
  } else {
    await setReminderState(db, input.deadlineId, {
      reminderStatus: 'failed',
      reminderBranch: branch,
    })
    await db.insert(timelineEvents).values({
      userId: input.userId,
      caseId: input.caseId,
      type: 'reminder_failed',
      payload: { deadlineId: input.deadlineId, branch, error: result.error ?? 'unknown' },
    })
  }

  return branch
}

/** Hook-resume step: the case closed / deadline cancelled mid-wait — flip state, log it. */
async function onClosedStep(input: ReminderInput): Promise<void> {
  'use step'

  const db = adminDb()
  await setReminderState(db, input.deadlineId, {
    reminderStatus: 'cancelled',
    reminderBranch: 'suppress',
  })
  await db.insert(timelineEvents).values({
    userId: input.userId,
    caseId: input.caseId,
    type: 'reminder_cancelled',
    payload: { deadlineId: input.deadlineId, reason: 'case_closed' },
  })
}

// ---------------------------------------------------------------------------
// Email bodies (no model — fixed, branch-tailored copy)
// ---------------------------------------------------------------------------

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function buildEmail(
  branch: Exclude<ReminderBranch, 'suppress'>,
  dueAt: Date,
): { subject: string; html: string } {
  const due = fmtDate(dueAt)
  switch (branch) {
    case 'act':
      return {
        subject: `Reminder: your bill deadline is ${due}`,
        html: `<p>This is a heads-up from billcheck.</p>
<p>You have a deadline coming up on <strong>${due}</strong>. If you were planning to send your dispute, appeal, or complaint, now's the time — sending before the deadline keeps your options open.</p>
<p>Open billcheck to finish and send your letter.</p>`,
      }
    case 'gentle':
      return {
        subject: `You're on track — deadline ${due}`,
        html: `<p>This is a friendly note from billcheck.</p>
<p>It looks like you've already sent your letter ahead of the <strong>${due}</strong> deadline — nice work. No action needed; we'll keep tracking the case in case anything changes.</p>`,
      }
    case 'past_due':
      return {
        subject: `Your deadline (${due}) may have passed`,
        html: `<p>This is a note from billcheck.</p>
<p>The deadline on <strong>${due}</strong> appears to have passed. That doesn't always mean the door is closed — many disputes and appeals can still be filed late, or escalated another way.</p>
<p>Open billcheck and we'll walk through what's still possible.</p>`,
      }
  }
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
