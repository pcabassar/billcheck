import { NextResponse, type NextRequest } from "next/server";
import { log, logError } from "@billcheck/shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * POST /api/cases — create a case (plan U4; typed API boundary per R10/D9).
 *
 * Cases are born CAPTURED (DB trigger enforces it). Runs under the user's
 * client so RLS owns the write. Body is optional JSON: { externalRef? }.
 * Note: /api/documents also creates a case implicitly when none is supplied —
 * this route exists for clients that want the case first (mobile-ready
 * boundary), not as a required step before upload.
 */
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let externalRef: string | null = null;
  try {
    const body = await request.json();
    if (body && typeof body.externalRef === "string") {
      externalRef = body.externalRef.slice(0, 128);
    }
  } catch {
    // Empty or non-JSON body is fine — all fields are optional.
  }

  const { data: created, error } = await supabase
    .from("cases")
    .insert({ user_id: user.id, external_ref: externalRef })
    .select("id, state")
    .single();
  if (error || !created) {
    logError("cases.create.failed", error, { route: "/api/cases" });
    return NextResponse.json({ error: "case_create_failed" }, { status: 500 });
  }

  log("cases.created", { route: "/api/cases", caseId: created.id });
  return NextResponse.json({ caseId: created.id, state: created.state }, { status: 201 });
}
