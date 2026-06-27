// POST /api/account/delete — permanent account + data deletion (U12).
//
// Flow (order matters):
//   1) requireUserId() — authed only; the user can only ever delete THEIR OWN account.
//   2) For each of the user's deadlines, closeReminder() any LIVE one (cancels the durable
//      Workflow so no reminder fires after the rows are gone). Best-effort, outside any tx.
//   3) deleteAggregatePointer(userId) — nulls cases.aggregate_record_id. The KEYLESS
//      aggregate_records rows themselves REMAIN (no user FK; per the consent disclosure,
//      contributed anonymized records cannot be retracted).
//   4) createAdminClient().auth.admin.deleteUser(userId) — deletes the auth user, which CASCADES
//      every personal row (cases → documents/timeline/deadlines/artifacts/transcripts + profile)
//      via the ON DELETE CASCADE FKs to auth.users(id).
//   5) Sign the user out (clear the session cookies).
//
// GUARD: if SUPABASE_SECRET_KEY is missing, createAdminClient() throws → we return a clear 503
// ("deletion not configured") so the demo degrades gracefully until Pedro sets the key.
import { requireUserId, UnauthorizedError } from '@/lib/auth'
import { withUser } from '@/lib/db'
import { listCases } from '@/lib/db/cases'
import { listDeadlines } from '@/lib/db/deadlines'
import { deleteAggregatePointer } from '@/lib/db/aggregate'
import { closeReminder } from '@/lib/workflows/reminder-control'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { logError } from '@/lib/log'

// Reminder states that still have (or may have) a live workflow worth cancelling.
const LIVE_REMINDER = new Set(['pending', 'armed'])

export async function POST() {
  let userId: string
  try {
    userId = await requireUserId()
  } catch (e) {
    if (e instanceof UnauthorizedError) return new Response('Unauthorized', { status: 401 })
    throw e
  }

  // Configuration guard FIRST — if the secret isn't set, the auth user can't actually be deleted,
  // so refuse cleanly BEFORE touching reminders/pointers (don't half-delete).
  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return Response.json({ error: 'deletion not configured' }, { status: 503 })
  }

  try {
    // 1) Cancel every live reminder workflow across ALL of the user's cases (RLS-scoped reads).
    const liveDeadlines = await withUser(userId, async (tx) => {
      const cases = await listCases(tx, userId)
      const out: { caseId: string; deadlineId: string; workflowRunId: string | null }[] = []
      for (const c of cases) {
        const deadlines = await listDeadlines(tx, userId, c.id)
        for (const d of deadlines) {
          if (LIVE_REMINDER.has(d.reminderStatus)) {
            out.push({ caseId: c.id, deadlineId: d.id, workflowRunId: d.workflowRunId })
          }
        }
      }
      return out
    })
    for (const d of liveDeadlines) {
      await closeReminder(d.caseId, d.deadlineId, d.workflowRunId)
    }

    // 2) Drop the personal-side aggregate pointers (keyless rows intentionally remain).
    await deleteAggregatePointer(userId)

    // 3) Delete the auth user — cascades all personal rows via the ON DELETE CASCADE FKs.
    const { error } = await admin.auth.admin.deleteUser(userId)
    if (error) {
      logError('account.delete:admin', error)
      return new Response('Could not delete the account.', { status: 500 })
    }

    // 4) Clear the now-orphaned session cookies (best-effort).
    try {
      const supabase = await createClient()
      await supabase.auth.signOut()
    } catch (err) {
      logError('account.delete:signout', err)
      // The user is already deleted server-side; a stale cookie is harmless (next request 401s).
    }

    return Response.json({ deleted: true })
  } catch (err) {
    logError('account.delete', err)
    return new Response('Could not delete the account.', { status: 500 })
  }
}
