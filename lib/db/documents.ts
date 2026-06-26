// Document-model data access (U3). EVERY function takes a `DbTx` from `withUser(...)` and
// therefore runs under RLS as that user — a forgotten WHERE is structurally harmless, but we
// still scope by userId/caseId for clarity and correct row selection. Pure data-access: no
// model calls. Document-row creation is owned by the chat route (it has the caseId); the
// upload route's onUploadCompleted does NOT create rows (see app/api/blob-upload/route.ts).
import { and, eq, ne } from 'drizzle-orm'
import type { UIMessage } from 'ai'
import type { DbTx } from './index'
import { documents } from './schema'
import type { DocumentRow } from './cases'

export type { DocumentRow }

// The allowed document kinds — mirrors the DB CHECK on documents.kind (schema.ts).
export const DOCUMENT_KINDS = [
  'statement',
  'itemized',
  'eob',
  'receipt',
  'collection_notice',
  'denial_letter',
  'gfe',
  'bill',
  'unknown',
] as const
export type DocumentKind = (typeof DOCUMENT_KINDS)[number]

// "Bill-side" kinds an EOB plausibly explains, and vice-versa. Linking pairs an EOB
// (the insurer's explanation) with the provider bill/statement/itemized it corresponds to.
const EOB_KINDS: ReadonlySet<string> = new Set(['eob'])
const BILL_SIDE_KINDS: ReadonlySet<string> = new Set([
  'bill',
  'statement',
  'itemized',
])

function isLinkPair(a: string, b: string): boolean {
  return (
    (EOB_KINDS.has(a) && BILL_SIDE_KINDS.has(b)) ||
    (BILL_SIDE_KINDS.has(a) && EOB_KINDS.has(b))
  )
}

/**
 * Record the `file` parts of a message as `documents` rows for this case, deduped by blobUrl.
 * Called for the last incoming user message so newly-attached docs are tracked against the
 * case before the model reads them. Returns the affected/known rows (the existing row when a
 * blobUrl is already recorded, the freshly-inserted row otherwise) in message-part order.
 */
export async function upsertDocumentsFromMessage(
  tx: DbTx,
  userId: string,
  caseId: string,
  message: UIMessage,
): Promise<DocumentRow[]> {
  const fileParts = message.parts.filter(
    (p): p is Extract<typeof p, { type: 'file' }> =>
      p.type === 'file' && typeof p.url === 'string',
  )
  if (fileParts.length === 0) return []

  const result: DocumentRow[] = []
  for (const part of fileParts) {
    const blobUrl = part.url
    let blobPathname: string | null
    try {
      blobPathname = new URL(blobUrl).pathname
    } catch {
      blobPathname = null
    }

    // Dedup by blobUrl within this case (re-sent transcripts replay the same file parts).
    const [existing] = await tx
      .select()
      .from(documents)
      .where(and(eq(documents.caseId, caseId), eq(documents.blobUrl, blobUrl)))
      .limit(1)
    if (existing) {
      result.push(existing)
      continue
    }

    const [inserted] = await tx
      .insert(documents)
      .values({
        userId,
        caseId,
        blobUrl,
        blobPathname,
        filename: part.filename ?? null,
        contentType: part.mediaType ?? null,
        status: 'ready',
        kind: 'unknown',
      })
      .returning()
    result.push(inserted)
  }
  return result
}

/** All documents in the case, oldest first. */
export async function listDocuments(
  tx: DbTx,
  userId: string,
  caseId: string,
): Promise<DocumentRow[]> {
  return tx
    .select()
    .from(documents)
    .where(and(eq(documents.caseId, caseId), eq(documents.userId, userId)))
    .orderBy(documents.createdAt)
}

/** Fetch one owned document by id, or null. */
async function getOwnedDocument(
  tx: DbTx,
  userId: string,
  docId: string,
): Promise<DocumentRow | null> {
  const [row] = await tx
    .select()
    .from(documents)
    .where(and(eq(documents.id, docId), eq(documents.userId, userId)))
    .limit(1)
  return row ?? null
}

// Would linking `docId -> targetDocId` create a cycle? True iff following targetDocId's
// existing link chain reaches docId. (RLS scopes the walk to this user's docs.)
async function wouldCreateCycle(
  tx: DbTx,
  userId: string,
  docId: string,
  targetDocId: string,
): Promise<boolean> {
  const seen = new Set<string>([docId])
  let cursor: string | null = targetDocId
  while (cursor) {
    if (seen.has(cursor)) return true
    seen.add(cursor)
    const row = await getOwnedDocument(tx, userId, cursor)
    cursor = row?.linkedToDocId ?? null
  }
  return false
}

/**
 * Link `docId -> targetDocId` (e.g. an EOB to the bill it explains). Both docs must be owned
 * and in the same case. Guards self-link (docId === targetDocId) and cycles (targetDocId must
 * not chain back to docId). Returns the updated row.
 */
export async function linkDocument(
  tx: DbTx,
  userId: string,
  { docId, targetDocId }: { docId: string; targetDocId: string },
): Promise<DocumentRow> {
  if (docId === targetDocId) throw new Error('A document cannot link to itself')

  const doc = await getOwnedDocument(tx, userId, docId)
  if (!doc) throw new Error('Document not found')
  const target = await getOwnedDocument(tx, userId, targetDocId)
  if (!target) throw new Error('Target document not found')
  if (doc.caseId !== target.caseId)
    throw new Error('Documents are not in the same case')
  if (await wouldCreateCycle(tx, userId, docId, targetDocId))
    throw new Error('Linking these documents would create a cycle')

  const [updated] = await tx
    .update(documents)
    .set({ linkedToDocId: targetDocId })
    .where(and(eq(documents.id, docId), eq(documents.userId, userId)))
    .returning()
  return updated
}

/**
 * Change or clear a document's link. Passing `targetDocId: null` clears it. A non-null target
 * is validated exactly like `linkDocument` (ownership, same case, no self/cycle).
 */
export async function relinkDocument(
  tx: DbTx,
  userId: string,
  { docId, targetDocId }: { docId: string; targetDocId: string | null },
): Promise<DocumentRow> {
  if (targetDocId !== null) {
    return linkDocument(tx, userId, { docId, targetDocId })
  }
  const doc = await getOwnedDocument(tx, userId, docId)
  if (!doc) throw new Error('Document not found')
  const [updated] = await tx
    .update(documents)
    .set({ linkedToDocId: null })
    .where(and(eq(documents.id, docId), eq(documents.userId, userId)))
    .returning()
  return updated
}

/**
 * Plausible link targets for `docId` within its case: a bill/statement/itemized for an EOB,
 * or an EOB for a bill-side doc. Excludes self. Used for "exactly one candidate → auto-link".
 */
export async function findLinkCandidates(
  tx: DbTx,
  userId: string,
  caseId: string,
  docId: string,
): Promise<DocumentRow[]> {
  const doc = await getOwnedDocument(tx, userId, docId)
  if (!doc) return []

  const others = await tx
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.caseId, caseId),
        eq(documents.userId, userId),
        ne(documents.id, docId),
      ),
    )
    .orderBy(documents.createdAt)

  return others.filter((other) => isLinkPair(doc.kind, other.kind))
}

/**
 * Retroactive auto-link: if `docId` has exactly one plausible candidate, link to it and return
 * the updated `docId` row; otherwise return null (leave unlinked — surface a choice upstream).
 */
export async function autoLinkIfSingleCandidate(
  tx: DbTx,
  userId: string,
  caseId: string,
  docId: string,
): Promise<DocumentRow | null> {
  const candidates = await findLinkCandidates(tx, userId, caseId, docId)
  if (candidates.length !== 1) return null
  return linkDocument(tx, userId, { docId, targetDocId: candidates[0].id })
}

/** Set a document's kind, validated against the allowed set. Returns the updated row. */
export async function setDocumentKind(
  tx: DbTx,
  userId: string,
  docId: string,
  kind: DocumentKind,
): Promise<DocumentRow> {
  if (!(DOCUMENT_KINDS as readonly string[]).includes(kind)) {
    throw new Error(`Invalid document kind: ${kind}`)
  }
  const [updated] = await tx
    .update(documents)
    .set({ kind })
    .where(and(eq(documents.id, docId), eq(documents.userId, userId)))
    .returning()
  if (!updated) throw new Error('Document not found')
  return updated
}
