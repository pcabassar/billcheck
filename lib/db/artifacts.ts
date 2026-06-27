// Artifact persistence + tracking. EVERY function takes a `DbTx` from `withUser(...)` and
// therefore runs under RLS as that user — a forgotten WHERE is structurally harmless, but
// we still scope by userId/id for clarity and correct row selection.
//
// markArtifactSent writes the `artifact_sent` timeline event the smart reminder reads (U6).
import { and, desc, eq } from 'drizzle-orm'
import type { DbTx } from './index'
import { artifacts, timelineEvents } from './schema'
import type { ArtifactType } from '@/lib/artifacts/generate'

export type ArtifactRow = typeof artifacts.$inferSelect

/**
 * Create a draft artifact and log an `artifact_generated` timeline event in the same tx.
 * userId is set explicitly to satisfy the RLS with-check on both inserts.
 */
export async function createArtifact(
  tx: DbTx,
  userId: string,
  input: { caseId: string; type: ArtifactType; title: string; contentMd: string },
): Promise<ArtifactRow> {
  const [row] = await tx
    .insert(artifacts)
    .values({
      userId,
      caseId: input.caseId,
      type: input.type,
      title: input.title,
      contentMd: input.contentMd,
      status: 'draft',
    })
    .returning()

  await tx.insert(timelineEvents).values({
    userId,
    caseId: input.caseId,
    type: 'artifact_generated',
    payload: { artifactId: row.id, artifactType: input.type },
  })

  return row
}

/** All artifacts for a case, most-recently-created first. */
export async function listArtifacts(
  tx: DbTx,
  userId: string,
  caseId: string,
): Promise<ArtifactRow[]> {
  return tx
    .select()
    .from(artifacts)
    .where(and(eq(artifacts.userId, userId), eq(artifacts.caseId, caseId)))
    .orderBy(desc(artifacts.createdAt))
}

/** A single artifact by id (owned), or null. */
export async function getArtifact(
  tx: DbTx,
  userId: string,
  id: string,
): Promise<ArtifactRow | null> {
  const [row] = await tx
    .select()
    .from(artifacts)
    .where(and(eq(artifacts.id, id), eq(artifacts.userId, userId)))
    .limit(1)
  return row ?? null
}

/**
 * Mark an artifact sent: set status 'sent' + sentAt=now, and log the `artifact_sent`
 * timeline event the reminder reads. Idempotent — if already sent, returns the row
 * unchanged and writes NO duplicate event.
 */
export async function markArtifactSent(
  tx: DbTx,
  userId: string,
  id: string,
): Promise<ArtifactRow> {
  const existing = await getArtifact(tx, userId, id)
  if (!existing) throw new Error('Artifact not found')
  if (existing.status === 'sent') return existing // idempotent: no duplicate event

  const [row] = await tx
    .update(artifacts)
    .set({ status: 'sent', sentAt: new Date(), updatedAt: new Date() })
    .where(and(eq(artifacts.id, id), eq(artifacts.userId, userId)))
    .returning()

  await tx.insert(timelineEvents).values({
    userId,
    caseId: row.caseId,
    type: 'artifact_sent',
    payload: { artifactId: row.id },
  })

  return row
}
