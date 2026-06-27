// PURE branch selection for the smart reminder — the heart of "state-aware".
// No IO, no clock, no DB: everything is passed in so it's deterministic + unit-testable.
// The Workflow reads LIVE case state at wake time and feeds it here to decide whether
// to nudge (and how) or stay silent.

export type ReminderBranch = 'act' | 'gentle' | 'past_due' | 'suppress'

/**
 * Decide the reminder branch from the live state at wake time.
 *
 * Precedence (first match wins):
 *  1. suppress — the case is resolved/closed, or the deadline was met/cancelled
 *     (nothing useful to nudge about; staying silent is the respectful default).
 *  2. past_due — the due date has already passed (now > dueAt); the nudge becomes
 *     "this may have lapsed, here's what you can still do."
 *  3. gentle  — the user already sent the artifact; a light "you're on track" touch.
 *  4. act     — the default: the deadline is live and nothing's been sent yet.
 */
export function selectReminderBranch(input: {
  now: Date
  dueAt: Date
  caseStatus: string
  deadlineStatus: string
  artifactSent: boolean
}): ReminderBranch {
  const { now, dueAt, caseStatus, deadlineStatus, artifactSent } = input

  if (caseStatus === 'resolved' || caseStatus === 'closed') return 'suppress'
  if (deadlineStatus === 'met' || deadlineStatus === 'cancelled') return 'suppress'

  if (now.getTime() > dueAt.getTime()) return 'past_due'

  if (artifactSent) return 'gentle'

  return 'act'
}
