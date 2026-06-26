// Case-spine data access. EVERY function takes a `DbTx` from `withUser(...)` and
// therefore runs under RLS as that user — a forgotten WHERE is structurally harmless,
// but we still scope by userId/caseId for clarity and correct row selection.
import { and, desc, eq, ne, notInArray } from 'drizzle-orm'
import type { UIMessage } from 'ai'
import type { DbTx } from './index'
import {
  artifacts,
  cases,
  deadlines,
  documents,
  profiles,
  transcripts,
} from './schema'

export type CaseRow = typeof cases.$inferSelect
export type ProfileRow = typeof profiles.$inferSelect
export type ArtifactRow = typeof artifacts.$inferSelect
export type DeadlineRow = typeof deadlines.$inferSelect
export type DocumentRow = typeof documents.$inferSelect

export type CaseStatus =
  | 'new'
  | 'gathering'
  | 'recommendation_offered'
  | 'acting'
  | 'resolved'
  | 'closed'
  | 'reopened'

/** Gathered context for the per-turn state block (U2 `buildStateBlock`). */
export type CaseContext = {
  caseRow: CaseRow
  profile: ProfileRow | null
  openArtifacts: ArtifactRow[]
  openDeadlines: DeadlineRow[]
  documents: DocumentRow[]
  status: string
  summary: string | null
}

/**
 * Resolve the active case for this turn:
 *  - if `caseId` is given AND owned by the user, return it;
 *  - else return the user's most-recently-updated case;
 *  - else INSERT a new case (status 'new') and return it.
 * Runs under RLS, so an unowned `caseId` simply isn't found (falls through).
 */
export async function resolveActiveCase(
  tx: DbTx,
  userId: string,
  caseId?: string,
): Promise<CaseRow> {
  if (caseId) {
    const [owned] = await tx
      .select()
      .from(cases)
      .where(and(eq(cases.id, caseId), eq(cases.userId, userId)))
      .limit(1)
    if (owned) return owned
  }

  const [mostRecent] = await tx
    .select()
    .from(cases)
    .where(eq(cases.userId, userId))
    .orderBy(desc(cases.updatedAt))
    .limit(1)
  if (mostRecent) return mostRecent

  const [created] = await tx
    .insert(cases)
    .values({ userId, status: 'new' })
    .returning()
  return created
}

/** The active transcript row for a case, or null. */
export async function loadActiveTranscript(
  tx: DbTx,
  caseId: string,
): Promise<typeof transcripts.$inferSelect | null> {
  const [row] = await tx
    .select()
    .from(transcripts)
    .where(and(eq(transcripts.caseId, caseId), eq(transcripts.isActive, true)))
    .limit(1)
  return row ?? null
}

/**
 * Upsert the active transcript's messages. If no active transcript exists, insert one
 * (isActive=true). userId is always set on insert to satisfy the RLS with-check.
 */
export async function persistTranscript(
  tx: DbTx,
  userId: string,
  caseId: string,
  messages: UIMessage[],
): Promise<void> {
  const existing = await loadActiveTranscript(tx, caseId)
  if (existing) {
    await tx
      .update(transcripts)
      .set({ messages, updatedAt: new Date() })
      .where(eq(transcripts.id, existing.id))
  } else {
    await tx.insert(transcripts).values({ userId, caseId, messages, isActive: true })
  }
  // Touch the case so resolveActiveCase's "most-recently-updated" ordering tracks activity.
  await tx.update(cases).set({ updatedAt: new Date() }).where(eq(cases.id, caseId))
}

/**
 * Gather everything the per-turn state block needs: the case row, the user's profile,
 * open artifacts/deadlines, and the case's documents.
 */
export async function loadCaseContext(
  tx: DbTx,
  userId: string,
  caseId: string,
): Promise<CaseContext> {
  const [caseRow] = await tx
    .select()
    .from(cases)
    .where(and(eq(cases.id, caseId), eq(cases.userId, userId)))
    .limit(1)
  if (!caseRow) throw new Error('Case not found')

  const [profile] = await tx
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1)

  const openArtifacts = await tx
    .select()
    .from(artifacts)
    .where(and(eq(artifacts.caseId, caseId), eq(artifacts.status, 'draft')))
    .orderBy(desc(artifacts.createdAt))

  const openDeadlines = await tx
    .select()
    .from(deadlines)
    .where(and(eq(deadlines.caseId, caseId), eq(deadlines.status, 'open')))
    .orderBy(deadlines.dueAt)

  const docs = await tx
    .select()
    .from(documents)
    .where(eq(documents.caseId, caseId))
    .orderBy(documents.createdAt)

  return {
    caseRow,
    profile: profile ?? null,
    openArtifacts,
    openDeadlines,
    documents: docs,
    status: caseRow.status,
    summary: caseRow.summary,
  }
}

/** Set the case status (CHECK allows new|gathering|recommendation_offered|acting|resolved|closed|reopened). */
export async function setCaseStatus(
  tx: DbTx,
  caseId: string,
  status: CaseStatus,
): Promise<void> {
  await tx
    .update(cases)
    .set({ status, updatedAt: new Date() })
    .where(eq(cases.id, caseId))
}

/**
 * Set the case status ONLY IF the case is not already in a terminal/explicit state
 * ('resolved' | 'closed' | 'reopened'). Used for the model's per-turn ADVISORY status write,
 * so an advisory status (e.g. 'acting') can never clobber a terminal status a deterministic
 * tool set in the same turn (e.g. markResolved → 'resolved'). The terminal transitions are
 * owned by the tools (markResolved/reopenCase) — never by the advisory output.
 */
export async function setCaseStatusIfNotTerminal(
  tx: DbTx,
  caseId: string,
  status: CaseStatus,
): Promise<void> {
  await tx
    .update(cases)
    .set({ status, updatedAt: new Date() })
    .where(
      and(
        eq(cases.id, caseId),
        notInArray(cases.status, ['resolved', 'closed', 'reopened']),
      ),
    )
}

/** All of the user's cases, most-recently-updated first. */
export async function listCases(tx: DbTx, userId: string): Promise<CaseRow[]> {
  return tx
    .select()
    .from(cases)
    .where(eq(cases.userId, userId))
    .orderBy(desc(cases.updatedAt))
}

/** A title-only summary of another open case — NEVER its contents (U11 cross-case awareness). */
export type OtherCaseSummary = { id: string; title: string | null; status: string }

/**
 * U11 — light cross-case awareness. The user's OTHER cases (excluding the active one and any
 * 'closed' or 'resolved' case), most-recently-updated first, as TITLES + STATUS ONLY. Used to make the model
 * aware that other cases exist (so it doesn't conflate them) WITHOUT ever loading their contents:
 * this returns no summaries, documents, profile facts, or amounts — only id/title/status.
 */
export async function listOtherOpenCases(
  tx: DbTx,
  userId: string,
  excludeCaseId: string,
): Promise<OtherCaseSummary[]> {
  return tx
    .select({ id: cases.id, title: cases.title, status: cases.status })
    .from(cases)
    .where(
      and(
        eq(cases.userId, userId),
        ne(cases.id, excludeCaseId),
        notInArray(cases.status, ['closed', 'resolved']),
      ),
    )
    .orderBy(desc(cases.updatedAt))
}
