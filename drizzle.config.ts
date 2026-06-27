import { defineConfig } from 'drizzle-kit'

// NOTE: the live schema is managed via Supabase migrations (incl. RLS policies). This config
// exists for type generation / inspection. Do NOT `drizzle-kit push` without re-declaring the
// RLS policies in schema.ts, or it will drop them.
export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
})
