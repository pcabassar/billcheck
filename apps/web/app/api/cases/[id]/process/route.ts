import { NextResponse, type NextRequest } from "next/server";
import { start } from "workflow/api";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { log, logError } from "@billcheck/shared";
import { processCase } from "@/workflows/case-lifecycle";

/** A process kick older than this with the case still CAPTURED is presumed dead and re-claimable. */
const STALE_KICK_MS = 15 * 60 * 1000;

/**
 * Kicks the durable parse workflow (upload → TRIAGED; the audit is a separate
 * explicit kick, review F03/F71). Ownership-checked; payload = case ID only.
 *
 * Idempotent (review F14): an atomic claim on cases.process_started_at means
 * double-submits and retries return ok without starting a second workflow.
 * A stale claim (workflow died before TRIAGED) is re-claimable after 15min.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: caseId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: caseRow } = await supabase
    .from("cases")
    .select("id, state")
    .eq("id", caseId)
    .maybeSingle();
  if (!caseRow) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Atomic claim (admin: client policies have no UPDATE on cases).
  const admin = createSupabaseAdminClient();
  const { data: fresh, error: claimErr } = await admin
    .from("cases")
    .update({ process_started_at: new Date().toISOString() })
    .eq("id", caseId)
    .is("process_started_at", null)
    .select("id");
  if (claimErr) {
    logError("case.process.claim_failed", claimErr, { caseId });
    return NextResponse.json({ error: "claim_failed" }, { status: 500 });
  }
  if (!fresh || fresh.length === 0) {
    const staleCutoff = new Date(Date.now() - STALE_KICK_MS).toISOString();
    const { data: reclaimed } = await admin
      .from("cases")
      .update({ process_started_at: new Date().toISOString() })
      .eq("id", caseId)
      .eq("state", "CAPTURED")
      .lt("process_started_at", staleCutoff)
      .select("id");
    if (!reclaimed || reclaimed.length === 0) {
      // Already kicked (and not stale) — idempotent success, no second workflow.
      log("case.process.already_started", { caseId, route: "/api/cases/[id]/process" });
      return NextResponse.json({ ok: true, alreadyStarted: true });
    }
  }

  try {
    await start(processCase, [caseId]);
    log("case.process.started", { caseId, route: "/api/cases/[id]/process" });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logError("case.process.start_failed", err, { caseId });
    // Release the claim so a retry can start the workflow.
    await admin.from("cases").update({ process_started_at: null }).eq("id", caseId);
    return NextResponse.json({ error: "start_failed" }, { status: 500 });
  }
}
