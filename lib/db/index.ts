// Drizzle over the Supabase Supavisor transaction pooler (postgres-js, prepare:false).
// Two access modes on one connection (the pooler role `postgres` has BYPASSRLS):
//   - adminDb(): runs as postgres -> BYPASSES RLS. Workflow + aggregate writes ONLY.
//   - withUser(userId, fn): sets role=authenticated + the JWT sub claim (txn-local) so every
//     RLS policy (auth.uid() = user_id) applies. A forgotten WHERE is then structurally harmless.
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { sql } from 'drizzle-orm'
import * as schema from './schema'

type Db = PostgresJsDatabase<typeof schema>
export type DbTx = Parameters<Parameters<Db['transaction']>[0]>[0]

let _client: ReturnType<typeof postgres> | undefined
let _db: Db | undefined

function client() {
  if (!_client) {
    // Tolerate an accidentally quote-wrapped value: dotenv strips surrounding quotes locally,
    // but some env-var UIs (e.g. the Vercel dashboard) keep them literal → `new URL()` would throw.
    const url = (process.env.DATABASE_URL ?? '').trim().replace(/^["']|["']$/g, '')
    if (!url) throw new Error('DATABASE_URL is not set')
    _client = postgres(url, { prepare: false }) // required for the Supavisor transaction pooler
  }
  return _client
}

/** Admin DB (postgres role, BYPASSRLS). Use ONLY for the reminder Workflow + aggregate writes. */
export function adminDb(): Db {
  if (!_db) _db = drizzle(client(), { schema })
  return _db
}

/** Run a unit of work as `userId` with RLS enforced. */
export async function withUser<T>(userId: string, fn: (tx: DbTx) => Promise<T>): Promise<T> {
  return adminDb().transaction(async (tx) => {
    await tx.execute(sql`select set_config('role', 'authenticated', true)`)
    await tx.execute(
      sql`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId })}, true)`,
    )
    return fn(tx)
  })
}

export { schema }
