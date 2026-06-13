import { NextResponse, type NextRequest } from "next/server";
import { start } from "workflow/api";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { log, logError } from "@billcheck/shared";
import { auditCase } from "@/workflows/case-lifecycle";

/**
 * POST /api/cases/[id]/audit — the explicit audit kick (review F03/F71/F14).
 *
 * The user has just reviewed the extraction on the confirm screen; this kick
 * is the reconciliation gate made real: when any parsed document failed the
 * printed-total reconciliation, the body must carry { confirmed: true } —
 * the UI sets it after showing the full-line review banner.
 *
 * Idempotent: an atomic claim on cases.audit_locked_at (cleared by the cron
 * sweep if the workflow dies) plus the one-running-run unique index mean a
 * double-submit cannot produce duplicate runs/findings/verdicts. The claim
 * also freezes line-item edits — the DB trigger rejects client writes once
 * audit_locked_at is set, closing the edit/audit TOCTOU.
 */
export async function POST(
  request: NextRequest,
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
  if (caseRow.state !== "TRIAGED") {
    // AUDITED/VERDICT → the audit already ran; the client treats 409 as "move along".
    return NextResponse.json({ error: "not_auditable", state: caseRow.state }, { status: 409 });
  }

  const { data: docs } = await supabase
    .from("documents")
    .select("id, parse_status, reconciliation_ok, kind")
    .eq("case_id", caseId);
  const parsedDocs = (docs ?? []).filter((d) => d.parse_status === "parsed");
  if (parsedDocs.length === 0) {
    return NextResponse.json({ error: "nothing_to_audit" }, { status: 409 });
  }

  // Reconciliation gate (review F03): a printed-total mismatch requires the
  // user to have walked the full-line review — the UI confirms explicitly.
  const mismatch = parsedDocs.some((d) => d.reconciliation_ok === false);
  if (mismatch) {
    const body = (await request.json().catch(() => null)) as { confirmed?: unknown } | null;
    if (body?.confirmed !== true) {
      return NextResponse.json({ error: "reconciliation_review_required" }, { status: 422 });
    }
  }

  // Atomic claim: also freezes client line-item edits (DB trigger).
  const admin = createSupabaseAdminClient();
  const { data: locked, error: lockErr } = await admin
    .from("cases")
    .update({ audit_locked_at: new Date().toISOString() })
    .eq("id", caseId)
    .eq("state", "TRIAGED")
    .is("audit_locked_at", null)
    .select("id");
  if (lockErr) {
    logError("case.audit.claim_failed", lockErr, { caseId });
    return NextResponse.json({ error: "claim_failed" }, { status: 500 });
  }
  if (!locked || locked.length === 0) {
    log("case.audit.already_started", { caseId, route: "/api/cases/[id]/audit" });
    return NextResponse.json({ ok: true, alreadyStarted: true });
  }

  try {
    await start(auditCase, [caseId]);
    log("case.audit.started", { caseId, route: "/api/cases/[id]/audit" });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logError("case.audit.start_failed", err, { caseId });
    await admin.from("cases").update({ audit_locked_at: null }).eq("id", caseId);
    return NextResponse.json({ error: "start_failed" }, { status: 500 });
  }
}
