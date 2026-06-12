import { NextResponse, type NextRequest } from "next/server";
import { start } from "workflow/api";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { log, logError } from "@billcheck/shared";
import { processCase } from "@/workflows/case-lifecycle";

/** Kicks the durable case workflow. Ownership-checked; payload = case ID only. */
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

  try {
    await start(processCase, [caseId]);
    log("case.process.started", { caseId, route: "/api/cases/[id]/process" });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logError("case.process.start_failed", err, { caseId });
    return NextResponse.json({ error: "start_failed" }, { status: 500 });
  }
}
