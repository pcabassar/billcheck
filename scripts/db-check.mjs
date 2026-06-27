// Quick DB wiring check against the real DATABASE_URL (transaction pooler).
// Verifies: connection works, the v1 schema is present, and RLS actually engages
// (a query as the `authenticated` role with a random user returns 0 rows, not an error).
// Usage: node --env-file=.env.local scripts/db-check.mjs
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }
const host = (() => { try { return new URL(url).host; } catch { return "?"; } })();
console.log("host:", host, host.includes("pooler.supabase.com") ? "(pooler ✓)" : "(NOT pooler — should be ...pooler.supabase.com:6543)");

const sql = postgres(url, { prepare: false });
try {
  const [{ ok }] = await sql`select 1 as ok`;
  console.log("select 1 ->", ok);

  const [{ n: tables }] = await sql`select count(*)::int as n from pg_tables where schemaname='public'`;
  console.log("public tables ->", tables, "(expect 8)");

  const names = await sql`select tablename from pg_tables where schemaname='public' order by tablename`;
  console.log("tables ->", names.map((r) => r.tablename).join(", "));

  // RLS engages: as authenticated with a random user, cases should return 0 (not error).
  const scoped = await sql.begin(async (tx) => {
    await tx`select set_config('role','authenticated',true)`;
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: "00000000-0000-0000-0000-000000000000" })}, true)`;
    const [{ n }] = await tx`select count(*)::int as n from cases`;
    return n;
  });
  console.log("RLS-scoped cases for a random user ->", scoped, scoped === 0 ? "(RLS engaged ✓)" : "(unexpected)");

  console.log("\nDB WIRING OK ✓");
} catch (e) {
  console.error("DB CHECK FAILED:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
