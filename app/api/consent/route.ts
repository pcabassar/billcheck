// POST /api/consent — set the aggregate-data consent flag (opt-in, default OFF). Separate from
// the situation panel so a consent toggle never rides along with a profile edit (lib/db/profile
// keeps the two patches distinct). The de-identified aggregate write (U9) checks this flag
// server-side before computing anything.
import { z } from 'zod'
import { withUser } from '@/lib/db'
import { setConsent } from '@/lib/db/profile'
import { resolveUser } from '@/lib/route-auth'

// The consent copy version shown to the user (bump if the disclosure text changes materially).
const CONSENT_VERSION = 'aggregate-v1'

const bodySchema = z.object({
  consentAggregate: z.boolean(),
})

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

  const row = await withUser(userId, (tx) =>
    setConsent(tx, userId, {
      consentAggregate: parsed.data.consentAggregate,
      // Record the version only when opting IN; clearing consent leaves the prior version alone.
      consentVersion: parsed.data.consentAggregate ? CONSENT_VERSION : undefined,
    }),
  )

  return Response.json({ ok: true, consentAggregate: row.consentAggregate })
}
