import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client — SERVER ONLY. RLS does NOT apply.
 *
 * Sanctioned contexts (AGENTS.md service-role key map): the purge job route
 * (U17), the cron reconcile route (U7), and WDK workflow steps — which is
 * where lib/parse/run-parse.ts and the ai_calls ledger writer (lib/llm.ts)
 * execute. NEVER import this from `app/(case)/`, `app/(public)/`, or any
 * client component — CI greps for the key in client-facing paths.
 *
 * The `server-only` package would make this a build-time guarantee; it is
 * not installed, so we enforce with a runtime guard instead. If it gets
 * added later, an `import "server-only";` at the top of this file is the
 * upgrade.
 */
export function createSupabaseAdminClient(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error("createSupabaseAdminClient must never run in the browser");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase admin client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
