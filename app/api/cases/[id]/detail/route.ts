// GET /api/cases/[id]/detail — the case workspace payload: status, profile ("your situation"),
// aggregate-consent flag, timeline, artifacts, deadlines. All owner-scoped under RLS; an
// unowned/unknown id returns 404. Payload is secret-free (no blob tokens, no raw transcript).
import { withUser } from '@/lib/db'
import { loadCaseContext } from '@/lib/db/cases'
import { getProfile } from '@/lib/db/profile'
import { listArtifacts } from '@/lib/db/artifacts'
import { listDeadlines } from '@/lib/db/deadlines'
import { listTimeline } from '@/lib/db/timeline'
import { resolveUser } from '@/lib/route-auth'
import { logError } from '@/lib/log'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveUser()
  if (auth instanceof Response) return auth
  const userId = auth
  const { id: caseId } = await params

  try {
    const payload = await withUser(userId, async (tx) => {
      // loadCaseContext throws "Case not found" when the id isn't owned (RLS + the explicit check).
      const ctx = await loadCaseContext(tx, userId, caseId)
      const profile = await getProfile(tx, userId)
      const artifacts = await listArtifacts(tx, userId, caseId)
      const deadlines = await listDeadlines(tx, userId, caseId)
      const timeline = await listTimeline(tx, userId, caseId)

      return {
        caseId,
        title: ctx.caseRow.title,
        status: ctx.status,
        // "Your situation" — the editable profile fields (consent is split out below).
        profile: {
          coverageSituation: profile.coverageSituation,
          isDualQmb: profile.isDualQmb,
          isSelfFunded: profile.isSelfFunded,
          state: profile.state,
          situationNotes: profile.situationNotes,
        },
        consentAggregate: profile.consentAggregate,
        timeline: timeline.map((t) => ({
          id: t.id,
          type: t.type,
          payload: t.payload,
          createdAt: t.createdAt.toISOString(),
        })),
        artifacts: artifacts.map((a) => ({
          id: a.id,
          title: a.title,
          type: a.type,
          status: a.status,
          createdAt: a.createdAt.toISOString(),
          sentAt: a.sentAt ? a.sentAt.toISOString() : null,
        })),
        deadlines: deadlines.map((d) => ({
          id: d.id,
          title: d.title,
          kind: d.kind,
          dueAt: d.dueAt.toISOString(),
          status: d.status,
          reminderStatus: d.reminderStatus,
        })),
      }
    })

    return Response.json(payload)
  } catch (err) {
    // Unowned / unknown case → 404 (loadCaseContext throws). Don't leak which.
    // Log redacted in case it's a real failure (never the message/content).
    logError('cases.detail', err)
    return new Response('Not found', { status: 404 })
  }
}
