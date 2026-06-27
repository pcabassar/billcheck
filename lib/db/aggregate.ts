// Deterministic, conclusion-time aggregate capture (U9). PRIVACY-CRITICAL.
//
// Runs under adminDb() (the postgres role, BYPASSRLS) because `aggregate_records` is admin-only
// (no RLS policy) and the personal-side pointer write must also succeed. BECAUSE adminDb bypasses
// RLS, EVERY query here filters explicitly by the given userId/caseId — there is no DB backstop.
//
// Invariants (see the plan's U9 + the keyless-aggregate Key Decision):
//   1. Consent is checked BEFORE any sensitive compute/load. consent=false → return early,
//      having loaded nothing beyond the consent flag.
//   2. The aggregate row is KEYLESS (UUID PK, no user/case columns, no back-reference).
//   3. Update-in-place via cases.aggregate_record_id — re-concluding a case never duplicates.
//   4. recordedAt is coarsened (truncated to the first of the month, UTC) — no exact timestamp.
//   5. assertNoPii() runs on the computed fields before the write (adversarial backstop).
//
// Account deletion (U12) calls deleteAggregatePointer() to null the pointer; per the consent
// disclosure the keyless rows themselves REMAIN (cannot be retracted).
import { and, eq } from 'drizzle-orm'
import { adminDb, type DbTx } from './index'
import { aggregateRecords, cases, profiles } from './schema'
import { loadCaseContext } from './cases'
import { assertNoPii, deIdentify } from '@/lib/aggregate/deidentify'

export type RecordResult = { written: boolean; reason?: string }

/**
 * Coarsen an insertion time to the first of its month at 00:00:00 UTC. This is the simplest
 * deterministic jitter that keeps the keyless row from carrying an exact (re-joinable) timestamp.
 */
function truncateToMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0))
}

/**
 * The deterministic conclusion-time aggregate write. Idempotent per case via the personal-side
 * pointer (cases.aggregate_record_id): an existing pointer → UPDATE in place; no pointer → INSERT
 * a new keyless row and set the pointer (scoped by id+userId).
 *
 * Returns:
 *   { written:false, reason:'no_consent' }  — aggregate consent is off/absent (checked FIRST)
 *   { written:false, reason:'too_sparse' }  — de-identified record had < ~3 meaningful fields
 *   { written:true }                        — a keyless row was inserted or updated in place
 */
export async function recordCaseAggregate(
  caseId: string,
  userId: string,
): Promise<RecordResult> {
  const db = adminDb()

  // 1) CONSENT FIRST — read only the consent flag, nothing sensitive, before any compute/load.
  const [profileConsent] = await db
    .select({ consentAggregate: profiles.consentAggregate })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1)

  if (!profileConsent?.consentAggregate) {
    return { written: false, reason: 'no_consent' }
  }

  // 2) Load the case context (explicitly scoped to userId+caseId — adminDb bypasses RLS) and
  //    compute the de-identified fields. loadCaseContext is typed for a DbTx but only uses the
  //    shared query builder (.select), which adminDb() exposes identically; the cast is safe.
  const ctx = await loadCaseContext(db as unknown as DbTx, userId, caseId)
  const fields = deIdentify(ctx)
  if (fields === null) {
    return { written: false, reason: 'too_sparse' }
  }

  // 3) Adversarial PII backstop — throws if anything slipped through the allow-lists.
  assertNoPii(fields)

  // 4) Coarsen the insertion time (no exact timestamp on the keyless row).
  const recordedAt = truncateToMonth(new Date())

  const values = {
    issueType: fields.issueType,
    lever: fields.lever,
    coverageSituation: fields.coverageSituation,
    state: fields.state,
    providerType: fields.providerType,
    billedBucket: fields.billedBucket,
    allowedBucket: fields.allowedBucket,
    paidBucket: fields.paidBucket,
    patientRespBucket: fields.patientRespBucket,
    outcome: fields.outcome,
    serviceYear: fields.serviceYear,
    recordedAt,
  }

  // 5) Update-in-place via the pointer, else insert + set the pointer.
  const existingPointer = ctx.caseRow.aggregateRecordId

  if (existingPointer) {
    await db
      .update(aggregateRecords)
      .set(values)
      .where(eq(aggregateRecords.id, existingPointer))
    return { written: true }
  }

  // Insert the keyless row AND set the personal-side pointer in ONE transaction so a crash
  // between them can't orphan a keyless aggregate_records row (no back-reference would ever
  // point to it again, and the case would re-insert a duplicate on the next conclusion).
  await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(aggregateRecords)
      .values(values)
      .returning({ id: aggregateRecords.id })

    // Set the personal-side pointer, scoped by (id, userId) so we only ever touch this user's case.
    await tx
      .update(cases)
      .set({ aggregateRecordId: inserted.id })
      .where(and(eq(cases.id, caseId), eq(cases.userId, userId)))
  })

  return { written: true }
}

/**
 * Account-deletion helper (U12): null out cases.aggregate_record_id for ALL of the user's cases.
 * The keyless aggregate_records rows themselves are intentionally NOT deleted — per the consent
 * disclosure, contributed anonymized records cannot be retracted. This only severs the personal
 * side pointer so nothing remains that could re-associate a row to the user.
 */
export async function deleteAggregatePointer(userId: string): Promise<void> {
  const db = adminDb()
  await db
    .update(cases)
    .set({ aggregateRecordId: null })
    .where(eq(cases.userId, userId))
}
