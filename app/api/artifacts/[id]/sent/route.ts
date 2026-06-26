// POST /api/artifacts/[id]/sent — mark a drafted artifact as sent (the workspace "Mark sent"
// action). Reuses markArtifactSent, which is idempotent and writes the `artifact_sent` timeline
// event the smart reminder reads — same path the markArtifactSent tool uses (agent/user parity).
import { withUser } from '@/lib/db'
import { markArtifactSent } from '@/lib/db/artifacts'
import { resolveUser } from '@/lib/route-auth'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveUser()
  if (auth instanceof Response) return auth
  const userId = auth
  const { id } = await params

  try {
    const row = await withUser(userId, (tx) => markArtifactSent(tx, userId, id))
    return Response.json({ ok: true, status: row.status, sentAt: row.sentAt?.toISOString() ?? null })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}
