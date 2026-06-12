import { NextResponse, type NextRequest } from "next/server";
import { LETTER_FACT_ATTESTATION, log, logError } from "@billcheck/shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/artifacts/[id]/approve — record the user's fact-attestation
 * (plan U9 / review A4). The letter is downloadable/printable only after this.
 *
 * Ownership is established by the user-scoped read (RLS): if the artifact
 * isn't visible under the caller's JWT, respond 403 — uniform for
 * does-not-exist and not-yours. The write path is the admin client (the
 * sanctioned server writer for artifacts + case_events appends).
 */

const ROUTE = "/api/artifacts/[id]/approve";

const RESPONSE_WINDOW_DAYS = 30;

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: artifactId } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if ((body as { attestation?: unknown })?.attestation !== true) {
    return NextResponse.json({ error: "attestation_required" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: artifact } = await supabase
    .from("artifacts")
    .select("id, case_id, approved_at")
    .eq("id", artifactId)
    .maybeSingle();
  if (!artifact) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (artifact.approved_at) {
    return NextResponse.json({ ok: true, alreadyApproved: true });
  }

  const at = new Date().toISOString();
  const admin = createSupabaseAdminClient();

  const { error: updateError } = await admin
    .from("artifacts")
    .update({
      approved_at: at,
      approval_payload: { attestation: LETTER_FACT_ATTESTATION, at },
    })
    .eq("id", artifactId);
  if (updateError) {
    logError("artifacts.approve.failed", updateError, {
      caseId: artifact.case_id,
      route: ROUTE,
    });
    return NextResponse.json({ error: "approve_failed" }, { status: 500 });
  }

  const { error: eventError } = await admin.from("case_events").insert({
    case_id: artifact.case_id,
    type: "artifact_approved",
    payload: { artifactId },
    by_role: "user",
  });
  if (eventError) {
    logError("artifacts.approve_event.failed", eventError, {
      caseId: artifact.case_id,
      route: ROUTE,
    });
  }

  // Closure-panel promise backed by data (plan U9): a written response is
  // requested within 30 days of the letter being sent.
  const dueAt = new Date(Date.now() + RESPONSE_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error: deadlineError } = await admin.from("deadlines").insert({
    case_id: artifact.case_id,
    type: "response_expected_by",
    due_at: dueAt,
    source: "system",
  });
  if (deadlineError) {
    logError("artifacts.deadline_insert.failed", deadlineError, {
      caseId: artifact.case_id,
      route: ROUTE,
    });
  }

  log("artifacts.approved", { caseId: artifact.case_id, route: ROUTE });
  return NextResponse.json({ ok: true });
}
