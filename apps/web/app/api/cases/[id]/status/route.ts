import { NextResponse } from "next/server";
import { logError } from "@billcheck/shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * GET /api/cases/[id]/status — tiny polling endpoint for the S3 confirm
 * screen's parse wait state. Returns case state + per-document parse status
 * only (IDs and enums — nothing document-derived). RLS scopes to the owner.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: caseRow, error: caseError } = await supabase
    .from("cases")
    .select("id, state")
    .eq("id", id)
    .maybeSingle();
  if (caseError) {
    logError("case.status.query_failed", caseError, { route: "/api/cases/[id]/status" });
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
  if (!caseRow) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: documents, error: docError } = await supabase
    .from("documents")
    .select("id, parse_status")
    .eq("case_id", id);
  if (docError) {
    logError("case.status.documents_query_failed", docError, {
      route: "/api/cases/[id]/status",
      caseId: id,
    });
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  return NextResponse.json(
    { state: caseRow.state, documents: documents ?? [] },
    { headers: { "Cache-Control": "no-store" } },
  );
}
