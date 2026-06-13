import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { log } from "@billcheck/shared";

/**
 * Daily reconciliation sweep (plan U7 / arch D7): the belt-and-suspenders
 * behind the workflow engine. Marks work that died mid-flight so the UI never
 * shows a forever-spinner and reruns can claim it:
 *  - documents stuck in 'parsing' for > 10 minutes measured from
 *    parse_started_at (review F09 — the old sweep measured from UPLOAD time
 *    and could fail a live parse, opening a two-writer race; the atomic
 *    finish RPC is the second line of defense)
 *  - engine_runs stuck in 'running' > 10 minutes → 'dead'
 *  - audit claims (cases.audit_locked_at) older than 10 minutes on cases
 *    still TRIAGED → cleared, so the audit kick is retryable
 * Registered with pg_cron → pg_net at deploy time (needs the public URL).
 * Secured by CRON_SECRET (this route is public-path in middleware).
 */
export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  const { data: staleDocs } = await admin
    .from("documents")
    .update({ parse_status: "failed" })
    .eq("parse_status", "parsing")
    .lt("parse_started_at", cutoff)
    .select("id");

  const { data: staleRuns } = await admin
    .from("engine_runs")
    .update({ status: "dead" })
    .eq("status", "running")
    .lt("created_at", cutoff)
    .select("id");

  const { data: staleAuditLocks } = await admin
    .from("cases")
    .update({ audit_locked_at: null })
    .eq("state", "TRIAGED")
    .not("audit_locked_at", "is", null)
    .lt("audit_locked_at", cutoff)
    .select("id");

  log("cron.reconcile.done", {
    route: "/api/cron/reconcile",
    count:
      (staleDocs?.length ?? 0) + (staleRuns?.length ?? 0) + (staleAuditLocks?.length ?? 0),
  });
  return NextResponse.json({
    staleDocuments: staleDocs?.length ?? 0,
    staleRuns: staleRuns?.length ?? 0,
    staleAuditLocks: staleAuditLocks?.length ?? 0,
  });
}
