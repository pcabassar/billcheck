// Deadline data access — two surfaces:
//
//  1. USER-FACING (take a `DbTx` from `withUser(...)`, so they run under RLS as the user;
//     a forgotten WHERE is structurally harmless but we still scope by userId for clarity):
//     createDeadline / updateDeadline / cancelDeadline / listDeadlines / getDeadline.
//
//  2. WORKFLOW-FACING (take an explicit `db = adminDb()` handle — the reminder Workflow runs
//     OUTSIDE any user session, so it BYPASSES RLS and we scope EXPLICITLY by caseId/deadlineId):
//     readReminderContext / setReminderState.
//
// The reminder branch (act/gentle/past_due/suppress) is decided by the pure
// `selectReminderBranch` (lib/reminder/state.ts) from the context this file reads.
import { and, eq } from 'drizzle-orm'
import type { DbTx } from './index'
import { adminDb } from './index'
import { artifacts, cases, deadlines, timelineEvents } from './schema'

export type DeadlineRow = typeof deadlines.$inferSelect

type ReminderStatus = 'none' | 'pending' | 'armed' | 'sent' | 'failed' | 'cancelled'

// ---------------------------------------------------------------------------
// User-facing (RLS via the passed-in DbTx)
// ---------------------------------------------------------------------------

/**
 * Create a deadline. Dedup: if `dedupKey` is given and a row already exists for
 * (caseId, dedupKey), return that existing row instead of inserting a second one.
 * Relies on the partial UNIQUE (case_id, dedup_key) WHERE dedup_key IS NOT NULL:
 * we insert with onConflictDoNothing, then select the surviving row.
 *
 * Re-open semantics: if the matched row was previously CANCELLED, re-opening it (rather than
 * returning the dead row) means a re-scheduled deadline actually arms again — otherwise
 * `startReminder` would arm a workflow that `selectReminderBranch` immediately suppresses
 * (deadlineStatus='cancelled') while the tool reported "armed". Re-opening preserves the
 * partial unique index (same row, no second insert).
 */
export async function createDeadline(
  tx: DbTx,
  userId: string,
  input: {
    caseId: string
    kind?: string
    title?: string
    dueAt: Date
    dedupKey?: string
  },
): Promise<DeadlineRow> {
  if (input.dedupKey) {
    // Pre-check (covers the common case cheaply + handles the no-unique-index dev DB).
    const existing = await findByDedupKey(tx, input.caseId, input.dedupKey)
    if (existing) return reopenIfCancelled(tx, existing, input)
  }

  const inserted = await tx
    .insert(deadlines)
    .values({
      userId,
      caseId: input.caseId,
      kind: input.kind ?? null,
      title: input.title ?? null,
      dueAt: input.dueAt,
      status: 'open',
      reminderStatus: 'none',
      dedupKey: input.dedupKey ?? null,
    })
    .onConflictDoNothing()
    .returning()

  if (inserted[0]) return inserted[0]

  // Conflict happened (a concurrent insert won the unique race) — return the existing row.
  if (input.dedupKey) {
    const existing = await findByDedupKey(tx, input.caseId, input.dedupKey)
    if (existing) return reopenIfCancelled(tx, existing, input)
  }
  throw new Error('createDeadline: insert produced no row and no dedup match')
}

/**
 * If a dedup-matched row is CANCELLED, re-open it in place (status='open', reminderStatus='none',
 * clear the workflow bookkeeping, and refresh due_at/kind/title to the new values) and return the
 * refreshed row. If it's not cancelled, return it unchanged.
 */
async function reopenIfCancelled(
  tx: DbTx,
  existing: DeadlineRow,
  input: { kind?: string; title?: string; dueAt: Date },
): Promise<DeadlineRow> {
  if (existing.status !== 'cancelled') return existing

  const [reopened] = await tx
    .update(deadlines)
    .set({
      status: 'open',
      reminderStatus: 'none',
      reminderBranch: null,
      workflowRunId: null,
      dueAt: input.dueAt,
      kind: input.kind ?? null,
      title: input.title ?? null,
      updatedAt: new Date(),
    })
    .where(eq(deadlines.id, existing.id))
    .returning()
  return reopened ?? existing
}

async function findByDedupKey(
  tx: DbTx,
  caseId: string,
  dedupKey: string,
): Promise<DeadlineRow | null> {
  const [row] = await tx
    .select()
    .from(deadlines)
    .where(and(eq(deadlines.caseId, caseId), eq(deadlines.dedupKey, dedupKey)))
    .limit(1)
  return row ?? null
}

/** Patch a deadline (owned). Only the columns present in `patch` are touched. */
export async function updateDeadline(
  tx: DbTx,
  userId: string,
  id: string,
  patch: Partial<{
    kind: string | null
    title: string | null
    dueAt: Date
    status: 'open' | 'met' | 'passed' | 'cancelled'
    reminderStatus: ReminderStatus
    reminderBranch: string | null
    workflowRunId: string | null
  }>,
): Promise<DeadlineRow> {
  const [row] = await tx
    .update(deadlines)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(deadlines.id, id), eq(deadlines.userId, userId)))
    .returning()
  if (!row) throw new Error('Deadline not found')
  return row
}

/**
 * Cancel a deadline: status 'cancelled' + reminderStatus 'cancelled'. Idempotent.
 * (The live reminder Workflow is cancelled separately via `closeReminder` in
 * lib/workflows/reminder.ts — this only flips the DB state.)
 */
export async function cancelDeadline(
  tx: DbTx,
  userId: string,
  id: string,
): Promise<DeadlineRow> {
  const [row] = await tx
    .update(deadlines)
    .set({ status: 'cancelled', reminderStatus: 'cancelled', updatedAt: new Date() })
    .where(and(eq(deadlines.id, id), eq(deadlines.userId, userId)))
    .returning()
  if (!row) throw new Error('Deadline not found')
  return row
}

/** All deadlines for a case (owned), soonest-due first. */
export async function listDeadlines(
  tx: DbTx,
  userId: string,
  caseId: string,
): Promise<DeadlineRow[]> {
  return tx
    .select()
    .from(deadlines)
    .where(and(eq(deadlines.userId, userId), eq(deadlines.caseId, caseId)))
    .orderBy(deadlines.dueAt)
}

/** A single deadline by id (owned), or null. */
export async function getDeadline(
  tx: DbTx,
  userId: string,
  id: string,
): Promise<DeadlineRow | null> {
  const [row] = await tx
    .select()
    .from(deadlines)
    .where(and(eq(deadlines.id, id), eq(deadlines.userId, userId)))
    .limit(1)
  return row ?? null
}

// ---------------------------------------------------------------------------
// Workflow-facing (explicit admin db handle, BYPASSES RLS — scope by ids EXPLICITLY)
// ---------------------------------------------------------------------------

export type ReminderContext = {
  caseStatus: string
  deadlineStatus: string
  dueAt: Date
  artifactSent: boolean
}

/**
 * Read the LIVE state the reminder branch decision needs, scoped explicitly by
 * caseId + deadlineId (the Workflow has no user session, so no RLS to lean on).
 * `artifactSent` = the case has any artifact with status 'sent' OR a timeline
 * 'artifact_sent' event. Returns null if the deadline no longer exists.
 */
export async function readReminderContext(
  db: ReturnType<typeof adminDb>,
  caseId: string,
  deadlineId: string,
): Promise<ReminderContext | null> {
  const [deadline] = await db
    .select({ status: deadlines.status, dueAt: deadlines.dueAt })
    .from(deadlines)
    .where(and(eq(deadlines.id, deadlineId), eq(deadlines.caseId, caseId)))
    .limit(1)
  if (!deadline) return null

  const [caseRow] = await db
    .select({ status: cases.status })
    .from(cases)
    .where(eq(cases.id, caseId))
    .limit(1)
  if (!caseRow) return null

  const [sentArtifact] = await db
    .select({ id: artifacts.id })
    .from(artifacts)
    .where(and(eq(artifacts.caseId, caseId), eq(artifacts.status, 'sent')))
    .limit(1)

  const [sentEvent] = await db
    .select({ id: timelineEvents.id })
    .from(timelineEvents)
    .where(and(eq(timelineEvents.caseId, caseId), eq(timelineEvents.type, 'artifact_sent')))
    .limit(1)

  return {
    caseStatus: caseRow.status,
    deadlineStatus: deadline.status,
    dueAt: deadline.dueAt,
    artifactSent: Boolean(sentArtifact) || Boolean(sentEvent),
  }
}

/**
 * Set the reminder bookkeeping columns on a deadline, scoped explicitly by id.
 * Admin handle — used from the Workflow steps and the `startReminder` dual-write.
 */
export async function setReminderState(
  db: ReturnType<typeof adminDb>,
  deadlineId: string,
  patch: {
    reminderStatus: ReminderStatus
    reminderBranch?: string | null
    workflowRunId?: string | null
  },
): Promise<void> {
  const set: Record<string, unknown> = {
    reminderStatus: patch.reminderStatus,
    updatedAt: new Date(),
  }
  if ('reminderBranch' in patch) set.reminderBranch = patch.reminderBranch ?? null
  if ('workflowRunId' in patch) set.workflowRunId = patch.workflowRunId ?? null

  await db.update(deadlines).set(set).where(eq(deadlines.id, deadlineId))
}
