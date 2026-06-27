// POST /api/cases/[id]/share — generate the anonymized share card for the workspace "Wrap up /
// share" button. Backstop for the generateShareCard tool — SAME function (generateShareCard over
// loadCaseContext), so the button and the agent produce the identical card. Returns the draft for
// the user to PREVIEW (the human preview is the v1 PII backstop); nothing is shared server-side.
import { withUser } from '@/lib/db'
import { loadCaseContext } from '@/lib/db/cases'
import { generateShareCard } from '@/lib/share/card'
import { resolveUser } from '@/lib/route-auth'
import { logError } from '@/lib/log'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveUser()
  if (auth instanceof Response) return auth
  const userId = auth
  const { id: caseId } = await params

  try {
    // loadCaseContext throws on an unowned/unknown case → 404 below.
    const ctx = await withUser(userId, (tx) => loadCaseContext(tx, userId, caseId))
    const card = await generateShareCard(ctx)
    return Response.json({ title: card.title, bodyMd: card.bodyMd })
  } catch (e) {
    if (e instanceof Error && e.message === 'Case not found') {
      return new Response('Not found', { status: 404 })
    }
    // The model call (or anything else) failed — clean 500, no secrets. Log redacted.
    logError('cases.share', e)
    return new Response('Could not draft the share card.', { status: 500 })
  }
}
