import { NextResponse, type NextRequest } from "next/server";
import { computeRoutingFlags, log, logError, TriageAnswers } from "@billcheck/shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** Insured + pre-adjudication → check back for the EOB in ~3 weeks (S5). */
const EOB_WAIT_DAYS = 21;

/**
 * POST /api/cases/[id]/triage — persist the S4 answers + derived routing
 * flags onto cases.coverage_profile (U10). Replaces the U7 auto-stub marker.
 *
 * The flags decide the next hop, returned to the client:
 *  - wait=true  → state WAITING_ADJUDICATION + a +21d reminder deadline; the
 *    client routes to the S5 wait screen (audit deferred until the EOB).
 *  - otherwise  → the client kicks the audit (POST /audit) and walks decode.
 *
 * Writes go through the admin client (cases UPDATE is server-only since
 * review round 1); ownership is checked under the user's JWT first.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: caseId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = TriageAnswers.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_answers" }, { status: 400 });
  }
  const answers = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data: caseRow } = await supabase
    .from("cases")
    .select("id, state")
    .eq("id", caseId)
    .maybeSingle();
  if (!caseRow) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  // Answers are editable until the audit claim freezes the case shape.
  if (!["CAPTURED", "TRIAGED", "WAITING_ADJUDICATION", "WAITING_ITEMIZED"].includes(caseRow.state)) {
    return NextResponse.json({ error: "case_locked", state: caseRow.state }, { status: 409 });
  }

  const flags = computeRoutingFlags(answers);
  const coverageProfile = {
    triage: answers,
    flags,
    triagedAt: new Date().toISOString(),
  };

  const admin = createSupabaseAdminClient();
  const { data: updated, error: updateErr } = await admin
    .from("cases")
    .update({ coverage_profile: coverageProfile })
    .eq("id", caseId)
    .select("id");
  if (updateErr || !updated || updated.length === 0) {
    logError("triage.save_failed", updateErr ?? new Error("no_rows"), { caseId });
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }

  const { error: eventErr } = await admin.from("case_events").insert({
    case_id: caseId,
    type: "triage_completed",
    // Flags only — answers live on the RLS-protected case row.
    payload: { flags },
    by_role: "user",
  });
  if (eventErr) {
    logError("triage.event_append_failed", eventErr, { caseId });
  }

  if (flags.wait && caseRow.state === "TRIAGED") {
    const dueAt = new Date(Date.now() + EOB_WAIT_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { error: moveErr } = await admin
      .from("cases")
      .update({ state: "WAITING_ADJUDICATION" })
      .eq("id", caseId)
      .eq("state", "TRIAGED");
    if (moveErr) {
      logError("triage.wait_transition_failed", moveErr, { caseId });
      return NextResponse.json({ error: "save_failed" }, { status: 500 });
    }
    // One-shot reminder marker (delivery channel lands with the email
    // provider; the wait screen and my-bills render it meanwhile).
    const { error: deadlineErr } = await admin.from("deadlines").insert({
      case_id: caseId,
      type: "eob_wait_reminder",
      due_at: dueAt,
      source: "system",
    });
    if (deadlineErr) {
      logError("triage.deadline_insert_failed", deadlineErr, { caseId });
    }
    log("triage.completed", { caseId, status: "wait" });
    return NextResponse.json({ ok: true, next: "wait", reminderAt: dueAt });
  }

  log("triage.completed", { caseId, status: "audit" });
  return NextResponse.json({ ok: true, next: "audit" });
}
