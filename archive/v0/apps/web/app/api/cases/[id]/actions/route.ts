import { NextResponse, type NextRequest } from "next/server";
import { log, logError } from "@billcheck/shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { computeSavings, lineFingerprint, type BaselineSnapshot } from "@/lib/savings-diff";

/**
 * POST /api/cases/[id]/actions — resolution-lite state actions (U14).
 *
 * Actions:
 *  - sent           VERDICT → SENT_BY_USER, response_expected_by +30d
 *  - self_report    {outcome} → RESOLVED_SELF_REPORTED (unanchored PWYW;
 *                   never a dollar claim — review A2 / Pedro's PWYW decision)
 *  - verify_savings frozen-baseline diff vs the latest parsed corrected
 *                   statement → RESOLVED_VERIFIED + verified_savings_cents
 *                   (anchored PWYW), or an honest non-verification reason
 *  - close          → CLOSED_BY_USER
 *
 * State transitions go through the admin client (cases UPDATE is
 * server-only); the DB transition trigger remains the arbiter.
 */

const RESPONSE_WINDOW_DAYS = 30;
const SELF_REPORT_OUTCOMES = ["bill_reduced", "bill_unchanged", "paid_it", "no_response_yet"];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: caseId } = await params;
  let body: { action?: unknown; outcome?: unknown };
  try {
    body = (await request.json()) as { action?: unknown; outcome?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const action = body.action;

  const supabase = await createSupabaseServerClient();
  const { data: caseRow } = await supabase
    .from("cases")
    .select("id, state, baseline_snapshot, verified_savings_cents")
    .eq("id", caseId)
    .maybeSingle();
  if (!caseRow) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const admin = createSupabaseAdminClient();

  async function transition(to: string, from: string[]): Promise<boolean> {
    const { data: moved, error } = await admin
      .from("cases")
      .update({ state: to })
      .eq("id", caseId)
      .in("state", from)
      .select("id");
    if (error) {
      logError("case.action.transition_failed", error, { caseId, status: to });
      return false;
    }
    return (moved ?? []).length > 0;
  }

  async function appendEvent(type: string, payload: Record<string, unknown>): Promise<void> {
    const { error } = await admin
      .from("case_events")
      .insert({ case_id: caseId, type, payload, by_role: "user" });
    if (error) logError("case.action.event_failed", error, { caseId });
  }

  if (action === "sent") {
    const ok = await transition("SENT_BY_USER", ["VERDICT"]);
    if (!ok) return NextResponse.json({ error: "wrong_state", state: caseRow.state }, { status: 409 });
    const dueAt = new Date(Date.now() + RESPONSE_WINDOW_DAYS * 86400_000).toISOString();
    const { error: dlErr } = await admin
      .from("deadlines")
      .insert({ case_id: caseId, type: "response_expected_by", due_at: dueAt, source: "system" });
    if (dlErr) logError("case.action.deadline_failed", dlErr, { caseId });
    await appendEvent("user_sent_dispute", {});
    log("case.action", { caseId, status: "sent" });
    return NextResponse.json({ ok: true, responseExpectedBy: dueAt });
  }

  if (action === "self_report") {
    const outcome = body.outcome;
    if (typeof outcome !== "string" || !SELF_REPORT_OUTCOMES.includes(outcome)) {
      return NextResponse.json({ error: "invalid_outcome" }, { status: 400 });
    }
    if (outcome === "no_response_yet") {
      // Not a resolution — just an update event.
      await appendEvent("self_report", { outcome });
      return NextResponse.json({ ok: true, resolved: false });
    }
    const ok = await transition("RESOLVED_SELF_REPORTED", ["VERDICT", "SENT_BY_USER"]);
    if (!ok) return NextResponse.json({ error: "wrong_state", state: caseRow.state }, { status: 409 });
    await appendEvent("self_report", { outcome });
    log("case.action", { caseId, status: "self_report" });
    // Unanchored PWYW: positive outcomes invite a tip with NO dollar claim.
    return NextResponse.json({ ok: true, resolved: true, positive: outcome === "bill_reduced" });
  }

  if (action === "verify_savings") {
    // Latest parsed corrected statement (version > 1 in its group).
    const { data: docs } = await supabase
      .from("documents")
      .select("id, kind, parse_status, printed_total_cents, content_hash, version_group, version_number")
      .eq("case_id", caseId)
      .in("kind", ["bill", "corrected_statement"])
      .eq("parse_status", "parsed")
      .order("version_number", { ascending: false });
    const corrected = (docs ?? []).find((d) => d.version_number > 1);
    if (!corrected) {
      return NextResponse.json({ error: "no_corrected_statement" }, { status: 409 });
    }
    const original = (docs ?? []).find(
      (d) => d.version_group === corrected.version_group && d.version_number === 1,
    );
    const { data: correctedLines } = await supabase
      .from("line_items")
      .select("code, amount_cents, units")
      .eq("document_id", corrected.id);

    const diff = computeSavings(
      (caseRow.baseline_snapshot as BaselineSnapshot | null) ?? null,
      {
        printedTotalCents:
          corrected.printed_total_cents === null ? null : Number(corrected.printed_total_cents),
        contentHash: corrected.content_hash,
        originalContentHash: original?.content_hash ?? null,
        lineFingerprints: (correctedLines ?? []).map((li) =>
          lineFingerprint({
            code: li.code,
            amountCents: li.amount_cents === null ? null : Number(li.amount_cents),
            units: li.units,
          }),
        ),
      },
    );

    if (!diff.verified) {
      log("case.action", { caseId, status: `savings_not_verified:${diff.reason}` });
      return NextResponse.json({ ok: true, verified: false, reason: diff.reason });
    }

    const { error: saveErr } = await admin
      .from("cases")
      .update({ verified_savings_cents: diff.savingsCents })
      .eq("id", caseId);
    if (saveErr) {
      logError("case.action.savings_save_failed", saveErr, { caseId });
      return NextResponse.json({ error: "save_failed" }, { status: 500 });
    }
    const moved = await transition("RESOLVED_VERIFIED", [
      "VERDICT",
      "SENT_BY_USER",
      "RESOLVED_SELF_REPORTED",
    ]);
    if (!moved && caseRow.state !== "RESOLVED_VERIFIED") {
      return NextResponse.json({ error: "wrong_state", state: caseRow.state }, { status: 409 });
    }
    await appendEvent("savings_verified", { savingsCents: diff.savingsCents });
    log("case.action", { caseId, status: "savings_verified", count: diff.savingsCents });
    return NextResponse.json({ ok: true, verified: true, savingsCents: diff.savingsCents });
  }

  if (action === "close") {
    const ok = await transition("CLOSED_BY_USER", [
      "CAPTURED", "TRIAGED", "WAITING_ADJUDICATION", "WAITING_ITEMIZED",
      "AUDITED", "VERDICT", "SENT_BY_USER", "RESOLVED_SELF_REPORTED", "RESOLVED_VERIFIED",
    ]);
    if (!ok) return NextResponse.json({ error: "wrong_state", state: caseRow.state }, { status: 409 });
    await appendEvent("user_closed", {});
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "invalid_action" }, { status: 400 });
}
