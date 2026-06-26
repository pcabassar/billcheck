// GET  /api/cases — list the user's cases (for the case switcher).
// POST /api/cases — create a new, empty case and return its id (the "New case" action).
import { withUser } from '@/lib/db'
import { listCases } from '@/lib/db/cases'
import { cases } from '@/lib/db/schema'
import { resolveUser } from '@/lib/route-auth'

// A trimmed, secret-free view of a case for the list UI.
function toListItem(c: {
  id: string
  title: string | null
  status: string
  updatedAt: Date
}) {
  return {
    id: c.id,
    title: c.title,
    status: c.status,
    updatedAt: c.updatedAt.toISOString(),
  }
}

export async function GET() {
  const auth = await resolveUser()
  if (auth instanceof Response) return auth
  const userId = auth

  const rows = await withUser(userId, (tx) => listCases(tx, userId))
  return Response.json({ cases: rows.map(toListItem) })
}

export async function POST() {
  const auth = await resolveUser()
  if (auth instanceof Response) return auth
  const userId = auth

  const created = await withUser(userId, async (tx) => {
    const [row] = await tx.insert(cases).values({ userId, status: 'new' }).returning()
    return row
  })

  return Response.json({ caseId: created.id, case: toListItem(created) })
}
