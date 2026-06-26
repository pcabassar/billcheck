// Profile / coverage-situation persistence — the profile is a first-class object (U8).
// EVERY function takes a `DbTx` from `withUser(...)` and therefore runs under RLS as that
// user — a forgotten WHERE is structurally harmless, but we still scope by userId for
// clarity and correct row selection.
//
// updateProfile and setConsent are FIELD-LEVEL MERGES: only keys explicitly provided are
// written; `undefined` keys are dropped before the update so they never clobber an existing
// value (no lost-update from a partial patch).
import { eq } from 'drizzle-orm'
import type { DbTx } from './index'
import { profiles } from './schema'

// Reuse the canonical row type exported by cases.ts (= typeof profiles.$inferSelect).
export type { ProfileRow } from './cases'
import type { ProfileRow } from './cases'

/** The structured, model/UI-editable profile fields (everything except the consent block). */
export type ProfilePatch = {
  coverageSituation?: string | null
  isDualQmb?: boolean
  isSelfFunded?: boolean | null
  state?: string | null
  situationNotes?: string | null
}

/** The consent block (separate so consent edits never ride along with situation edits). */
export type ConsentPatch = {
  consentAggregate?: boolean
  consentAccount?: boolean
  consentVersion?: string | null
}

/**
 * Return the user's profile row. A DB trigger creates one at signup, so this normally just
 * reads. If it is somehow absent (manual user, race), insert a default row keyed by userId
 * (all other columns take their schema defaults) and return it.
 */
export async function getProfile(tx: DbTx, userId: string): Promise<ProfileRow> {
  const [existing] = await tx
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1)
  if (existing) return existing

  const [created] = await tx.insert(profiles).values({ userId }).returning()
  return created
}

/**
 * Drop keys whose value is `undefined` so a partial patch updates ONLY the provided columns.
 * A key set to `null` is intentional (clears the field) and is preserved.
 */
function definedOnly<T extends Record<string, unknown>>(patch: T): Partial<T> {
  const out: Partial<T> = {}
  for (const key of Object.keys(patch) as (keyof T)[]) {
    if (patch[key] !== undefined) out[key] = patch[key]
  }
  return out
}

/**
 * Field-level merge of the structured situation fields. Only keys present in `patch` (and not
 * `undefined`) are written; everything else keeps its current value. Ensures the row exists
 * first (getProfile), so this works for any signed-in user. Returns the updated row.
 */
export async function updateProfile(
  tx: DbTx,
  userId: string,
  patch: ProfilePatch,
): Promise<ProfileRow> {
  await getProfile(tx, userId) // guarantee the row exists before merging

  const fields = definedOnly(patch)
  if (Object.keys(fields).length === 0) {
    // Nothing to merge — return the current row unchanged (no needless write/updatedAt bump).
    return getProfile(tx, userId)
  }

  const [row] = await tx
    .update(profiles)
    .set({ ...fields, updatedAt: new Date() })
    .where(eq(profiles.userId, userId))
    .returning()
  return row
}

/**
 * Field-level merge of the consent fields (used by U9 + signup). Same merge semantics as
 * updateProfile: only provided keys are written. Returns the updated row.
 */
export async function setConsent(
  tx: DbTx,
  userId: string,
  patch: ConsentPatch,
): Promise<ProfileRow> {
  await getProfile(tx, userId) // guarantee the row exists before merging

  const fields = definedOnly(patch)
  if (Object.keys(fields).length === 0) {
    return getProfile(tx, userId)
  }

  const [row] = await tx
    .update(profiles)
    .set({ ...fields, updatedAt: new Date() })
    .where(eq(profiles.userId, userId))
    .returning()
  return row
}
