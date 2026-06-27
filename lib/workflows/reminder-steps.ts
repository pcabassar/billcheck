// The `'use step'` functions for the smart-reminder Workflow.
//
// WHY a separate module: the workflow BODY (lib/workflows/reminder.ts, a `'use workflow'` module)
// must not carry module-level imports that transitively pull in Node-only deps (postgres via the
// deadlines DAO, resend via the email client). The WDK bundles the workflow module's plain
// (non-step) exports for the flow VM, which forbids those Node deps — the old layout only built
// because tree-shaking happened to drop them, which is fragile and against the WDK rule.
//
// All IO (DB reads/writes via adminDb, email via resend) and all wall-clock reads live HERE, inside
// `'use step'` functions. reminder.ts imports only these step functions + the workflow primitives.
//
// The Workflow runs OUTSIDE any user session, so every DB call uses adminDb() (BYPASSRLS) scoped
// EXPLICITLY by caseId/deadlineId.
import { adminDb } from '@/lib/db'
import { readReminderContext, setReminderState } from '@/lib/db/deadlines'
import { timelineEvents } from '@/lib/db/schema'
import { sendReminderEmail } from '@/lib/email/resend'
import { selectReminderBranch, type ReminderBranch } from '@/lib/reminder/state'
import type { ReminderInput } from './reminder-types'

// Roughly one day in milliseconds — how far before the deadline we wake to nudge.
const ONE_DAY_MS = 24 * 60 * 60 * 1000

/**
 * Compute how many ms to sleep before nudging: (dueAt - 1 day) - now, clamped to >= 0.
 * Reads the wall clock — hence a step, not the deterministic workflow body. Idempotent on
 * replay (the durable runtime persists the step result, so the sleep target is stable).
 */
export async function computeWakeDelayStep(dueAtISO: string): Promise<number> {
  'use step'

  const wakeAtMs = Date.parse(dueAtISO) - ONE_DAY_MS
  return Math.max(0, wakeAtMs - Date.now())
}

/**
 * Wake-time step: read LIVE state, pick the branch (pure), then suppress or send.
 * Returns the branch taken (for observability / the workflow return value).
 */
export async function fireReminderStep(input: ReminderInput): Promise<ReminderBranch> {
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
export async function onClosedStep(input: ReminderInput): Promise<void> {
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
