// Small helper for the U10 route handlers: resolve the signed-in user or return a 401 Response.
// Keeps each handler's auth boilerplate to one line. ALL data access still goes via `withUser`.
import { requireUserId, UnauthorizedError } from '@/lib/auth'

/**
 * Resolve the signed-in userId, or a 401 `Response` to return immediately:
 *
 *   const auth = await resolveUser()
 *   if (auth instanceof Response) return auth
 *   const userId = auth
 */
export async function resolveUser(): Promise<string | Response> {
  try {
    return await requireUserId()
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return new Response('Unauthorized', { status: 401 })
    }
    throw e
  }
}
