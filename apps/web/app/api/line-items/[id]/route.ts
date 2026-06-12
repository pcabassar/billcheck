import { NextResponse, type NextRequest } from "next/server";
import { log, logError } from "@billcheck/shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isEditableState } from "@/lib/case/rules";

/**
 * PATCH /api/line-items/[id] — inline corrections from the S3 confirm screen.
 *
 * Runs under the USER's JWT (RLS owner-only is the ownership check). Edits are
 * rejected with 409 once the owning case leaves CAPTURED/TRIAGED — the edit
 * lock at AUDITED protects the frozen savings baseline (plan U6, data #1).
 *
 * Seam (U7 integration): the manual-edit `case_events` row cannot be appended
 * here — case_events has no client INSERT policy and this unit is barred from
 * the admin client. The edit event lands with U7's server-side integration.
 */

const MAX_AMOUNT_CENTS = 100_000_000_00; // $100M sanity cap
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

interface LineItemPatch {
  amount_cents?: number | null;
  code?: string | null;
  date_of_service?: string | null;
}

function buildPatch(body: Record<string, unknown>): LineItemPatch | { error: string } {
  const patch: LineItemPatch = {};

  if ("amountCents" in body) {
    const v = body.amountCents;
    if (v !== null && (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > MAX_AMOUNT_CENTS)) {
      return { error: "amountCents must be null or an integer between 0 and 10000000000" };
    }
    patch.amount_cents = v as number | null;
  }

  if ("code" in body) {
    const v = body.code;
    if (v !== null && (typeof v !== "string" || v.trim().length === 0 || v.trim().length > 32)) {
      return { error: "code must be null or a non-empty string of at most 32 characters" };
    }
    patch.code = v === null ? null : (v as string).trim();
  }

  if ("dateOfService" in body) {
    const v = body.dateOfService;
    if (v !== null && (typeof v !== "string" || !ISO_DATE.test(v) || Number.isNaN(Date.parse(v)))) {
      return { error: "dateOfService must be null or an ISO date (YYYY-MM-DD)" };
    }
    patch.date_of_service = v as string | null;
  }

  if (Object.keys(patch).length === 0) {
    return { error: "nothing to update — provide amountCents, code, or dateOfService" };
  }
  return patch;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const patch = buildPatch(body);
  if ("error" in patch) {
    return NextResponse.json({ error: "invalid_body", detail: patch.error }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();

  // Resolve line item -> document -> case under RLS; absent rows read as 404.
  const { data: item, error: itemError } = await supabase
    .from("line_items")
    .select("id, document_id")
    .eq("id", id)
    .maybeSingle();
  if (itemError) {
    logError("line_item.patch.lookup_failed", itemError, { route: "/api/line-items/[id]" });
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
  if (!item) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: doc, error: docError } = await supabase
    .from("documents")
    .select("id, case_id")
    .eq("id", item.document_id)
    .maybeSingle();
  if (docError || !doc) {
    if (docError) {
      logError("line_item.patch.document_lookup_failed", docError, {
        route: "/api/line-items/[id]",
        documentId: item.document_id,
      });
    }
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: caseRow, error: caseError } = await supabase
    .from("cases")
    .select("id, state")
    .eq("id", doc.case_id)
    .maybeSingle();
  if (caseError || !caseRow) {
    if (caseError) {
      logError("line_item.patch.case_lookup_failed", caseError, {
        route: "/api/line-items/[id]",
        caseId: doc.case_id,
      });
    }
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Edit lock: corrections close at AUDITED (plan U6, data #1).
  if (!isEditableState(caseRow.state)) {
    return NextResponse.json(
      { error: "case_locked", state: caseRow.state },
      { status: 409 },
    );
  }

  const { error: updateError } = await supabase
    .from("line_items")
    .update(patch)
    .eq("id", id);
  if (updateError) {
    logError("line_item.patch.update_failed", updateError, {
      route: "/api/line-items/[id]",
      caseId: caseRow.id,
    });
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  log("line_item.patched", {
    route: "/api/line-items/[id]",
    caseId: caseRow.id,
    documentId: doc.id,
  });
  return NextResponse.json({ ok: true });
}
