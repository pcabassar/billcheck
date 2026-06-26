import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export class UnauthorizedError extends Error {
  constructor() {
    super('UNAUTHORIZED')
    this.name = 'UnauthorizedError'
  }
}

/** The signed-in user's id (auth.uid()), or null. Uses getClaims() (local JWT verification). */
export async function getUserId(): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  return (data?.claims?.sub as string | undefined) ?? null
}

/** The signed-in user's id, or throw UnauthorizedError (route handlers map this to 401). */
export async function requireUserId(): Promise<string> {
  const userId = await getUserId()
  if (!userId) throw new UnauthorizedError()
  return userId
}

/**
 * The signed-in user's email, resolved robustly for arming the smart reminder (scheduleReminder).
 *
 * The JWT `email` claim is OPTIONAL — it may be absent depending on how the session was minted. So
 * we try the claim first (cheap, no network), then FALL BACK to an admin lookup by userId
 * (auth.admin.getUserById) which reads the authoritative user record. Returns null rather than
 * throwing if BOTH are unavailable, so a missing email degrades gracefully (deadline still tracked;
 * email reminder just not armed).
 */
export async function getRecipientEmail(userId: string): Promise<string | null> {
  // 1) Cheap path — the JWT email claim, if present.
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const claimEmail = data?.claims?.email
  if (typeof claimEmail === 'string' && claimEmail.length > 0) return claimEmail

  // 2) Fallback — the authoritative user record via the admin client. Best-effort: if the admin
  //    client isn't configured (no SUPABASE_SECRET_KEY) or the lookup fails, degrade to null.
  try {
    const admin = createAdminClient()
    const { data: userData } = await admin.auth.admin.getUserById(userId)
    const adminEmail = userData?.user?.email
    return typeof adminEmail === 'string' && adminEmail.length > 0 ? adminEmail : null
  } catch {
    return null
  }
}
