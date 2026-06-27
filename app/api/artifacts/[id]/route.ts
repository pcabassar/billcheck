// GET /api/artifacts/[id] — the full artifact content for download/copy from the workspace.
// Owner-scoped (RLS + the explicit ownership check in getArtifact); unknown/unowned → 404.
import { withUser } from '@/lib/db'
import { getArtifact } from '@/lib/db/artifacts'
import { resolveUser } from '@/lib/route-auth'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveUser()
  if (auth instanceof Response) return auth
  const userId = auth
  const { id } = await params

  const row = await withUser(userId, (tx) => getArtifact(tx, userId, id))
  if (!row) return new Response('Not found', { status: 404 })

  return Response.json({
    id: row.id,
    title: row.title,
    type: row.type,
    status: row.status,
    contentMd: row.contentMd,
  })
}
