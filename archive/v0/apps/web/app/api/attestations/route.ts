import { NextResponse, type NextRequest } from "next/server";
import { log, logError } from "@billcheck/shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ATTESTATION_STATUSES, type AttestationStatus } from "@/lib/case/rules";

/**
 * POST /api/attestations — per-line attestation from the S3b decode screen.
 * Body: { lineItemId, status: remember | not_sure | didnt_happen }.
 *
 * Upserts on the unique line_item_id (changing your mind overwrites). Runs
 * under the USER's JWT — RLS owner-only is the ownership check. Attestations
 * stay open through VERDICT (the decode screen runs alongside the audit);
 * "didn't happen" lines feed the letter's records-request paragraph.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Open through VERDICT: the decode screen runs alongside the audit, and only
// the letter consumes attestations (at generation time).
const ATTESTABLE_STATES = ["CAPTURED", "TRIAGED", "AUDITED", "VERDICT"];

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const lineItemId = body.lineItemId;
  const status = body.status;
  if (typeof lineItemId !== "string" || !UUID.test(lineItemId)) {
    return NextResponse.json(
      { error: "invalid_body", detail: "lineItemId must be a UUID" },
      { status: 400 },
    );
  }
  if (
    typeof status !== "string" ||
    !(ATTESTATION_STATUSES as readonly string[]).includes(status)
  ) {
    return NextResponse.json(
      { error: "invalid_body", detail: "status must be remember | not_sure | didnt_happen" },
      { status: 400 },
    );
  }

  const supabase = await createSupabaseServerClient();

  // Resolve line item -> document -> case under RLS; absent rows read as 404.
  const { data: item, error: itemError } = await supabase
    .from("line_items")
    .select("id, document_id")
    .eq("id", lineItemId)
    .maybeSingle();
  if (itemError) {
    logError("attestation.lookup_failed", itemError, { route: "/api/attestations" });
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
  if (!item) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: doc } = await supabase
    .from("documents")
    .select("id, case_id")
    .eq("id", item.document_id)
    .maybeSingle();
  if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: caseRow } = await supabase
    .from("cases")
    .select("id, state")
    .eq("id", doc.case_id)
    .maybeSingle();
  if (!caseRow) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Attestations stay open through VERDICT (review-round flow change): the
  // user attests on the decode screen WHILE the audit runs, and nothing in
  // the V0 engine consumes attestations — the letter does, at generation
  // time. Only post-send and terminal states lock them.
  if (!ATTESTABLE_STATES.includes(caseRow.state)) {
    return NextResponse.json(
      { error: "case_locked", state: caseRow.state },
      { status: 409 },
    );
  }

  const { error: upsertError } = await supabase
    .from("attestations")
    .upsert(
      { line_item_id: lineItemId, status: status as AttestationStatus },
      { onConflict: "line_item_id" },
    );
  if (upsertError) {
    logError("attestation.upsert_failed", upsertError, {
      route: "/api/attestations",
      caseId: caseRow.id,
    });
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  log("attestation.upserted", {
    route: "/api/attestations",
    caseId: caseRow.id,
    status,
  });
  return NextResponse.json({ ok: true });
}
