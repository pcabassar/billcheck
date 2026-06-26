// POST /api/profile — update the user's "your situation" panel. Field-level merge (only the
// fields present in the body are written, via lib/db/profile updateProfile). Mirrors the
// updateProfile tool's contract so UI edits and agent edits go through the same merge.
import { z } from 'zod'
import { withUser } from '@/lib/db'
import { updateProfile } from '@/lib/db/profile'
import { resolveUser } from '@/lib/route-auth'

// Empty strings from text inputs become null (clears the field); checkboxes/selects pass through.
const bodySchema = z.object({
  coverageSituation: z.string().nullable().optional(),
  isDualQmb: z.boolean().optional(),
  isSelfFunded: z.boolean().nullable().optional(),
  state: z.string().nullable().optional(),
  situationNotes: z.string().nullable().optional(),
})

function emptyToNull(v: string | null | undefined): string | null | undefined {
  if (v === undefined) return undefined
  if (v === null) return null
  return v.trim() === '' ? null : v.trim()
}

export async function POST(req: Request) {
  const auth = await resolveUser()
  if (auth instanceof Response) return auth
  const userId = auth

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return new Response('Bad request', { status: 400 })
  }

  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) return new Response('Bad request', { status: 400 })

  const patch = {
    ...parsed.data,
    coverageSituation: emptyToNull(parsed.data.coverageSituation),
    state: emptyToNull(parsed.data.state),
    situationNotes: emptyToNull(parsed.data.situationNotes),
  }

  const row = await withUser(userId, (tx) => updateProfile(tx, userId, patch))

  return Response.json({
    ok: true,
    profile: {
      coverageSituation: row.coverageSituation,
      isDualQmb: row.isDualQmb,
      isSelfFunded: row.isSelfFunded,
      state: row.state,
      situationNotes: row.situationNotes,
    },
  })
}
