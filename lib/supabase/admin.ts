// Supabase ADMIN client (service-role / secret key). BYPASSES RLS and the user's session.
//
// SCOPE: this client is reserved for ONE operation in v1 — `auth.admin.deleteUser(userId)` during
// account deletion (U12). All other user data access goes through the RLS-scoped Drizzle `withUser`
// path. Do NOT use this for ordinary reads/writes.
//
// The secret is read LAZILY (only when the client is actually constructed), so a missing
// SUPABASE_SECRET_KEY does NOT throw at import/build time — the deletion route catches the throw
// and degrades to a clear 503 ("deletion not configured"), letting the demo run without the key set.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Construct the service-role Supabase client. Throws a clear error (caught by the deletion route)
 * if SUPABASE_SECRET_KEY is absent — NEVER at import time, only when called.
 */
export function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const secret = process.env.SUPABASE_SECRET_KEY

  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set')
  if (!secret) throw new Error('SUPABASE_SECRET_KEY is not set')

  return createClient(url, secret, { auth: { persistSession: false } })
}
