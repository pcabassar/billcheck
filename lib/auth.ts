import { createClient } from '@/lib/supabase/server'

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
 * The signed-in user's email from the auth claims (the JWT `email` claim), or null.
 * Used to arm the smart reminder (scheduleReminder). Returns null rather than throwing so a
 * missing email degrades gracefully (deadline still tracked; email reminder just not armed).
 */
export async function getRecipientEmail(): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const email = data?.claims?.email
  return typeof email === 'string' && email.length > 0 ? email : null
}
