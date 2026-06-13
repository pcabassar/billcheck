import { createHash, randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { log, logError } from "@billcheck/shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { MAX_UPLOAD_BYTES, validateUpload } from "@/lib/upload/validate";
import { checkUploadRateLimit } from "@/lib/upload/rate-limit";
import { classifyDocument, normalizeExtracted, type ClassifyOutput } from "@/lib/upload/classify";

/**
 * POST /api/documents — S2 upload pipeline (plan U4).
 *
 * Per file: validate (magic bytes / caps) -> rate-limit -> storage upload
 * (admin client; bucket has no client policies) -> documents row -> classify
 * (D1, via the shared LLM client + ai_calls ledger) -> dedupe / version
 * attach -> { documentId, caseId, kind, quality, dedupe?, byteIdentical? }.
 *
 * Auth: middleware guarantees a session; we still resolve the user and 401
 * if absent (belt and suspenders). All DB writes except storage + the
 * rate-limit count run under the USER's client so RLS stays the backstop.
 *
 * Case attach: `documents.case_id` is NOT NULL and the ai_calls ledger FK
 * needs the document row to exist before the classify call — so when no
 * caseId is supplied we create a provisional case first. If dedupe then
 * fires, the document stays PARKED on that provisional case and the response
 * carries `dedupe.existingCaseId`; the client offers continue-existing
 * (re-post with caseId=existing -> attaches as a new statement version).
 *
 * PHI: this response carries IDs + kind + quality only — never extracted
 * provider/account text, never document bytes.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "bad_form" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing_file" }, { status: 400 });
  }
  const requestedCaseIdRaw = form.get("caseId");
  const requestedCaseId =
    typeof requestedCaseIdRaw === "string" && UUID_RE.test(requestedCaseIdRaw)
      ? requestedCaseIdRaw
      : null;

  // 1. Validate — size cap first (cheap, before buffering), then magic
  //    bytes, then PDF page cap.
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "too_large" }, { status: 400 });
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const validation = validateUpload(bytes);
  if (!validation.ok) {
    log("documents.upload.rejected", { route: "/api/documents", errorCode: validation.reason });
    return NextResponse.json({ error: validation.reason }, { status: 400 });
  }

  // 2. Rate limit — per-user sliding window, fail closed.
  const admin = createSupabaseAdminClient();
  const rate = await checkUploadRateLimit(admin, user.id);
  if (!rate.allowed) {
    log("documents.upload.rate_limited", { route: "/api/documents", count: rate.count });
    return NextResponse.json({ error: "rate_limited", limit: rate.limit }, { status: 429 });
  }

  // 3. Resolve the case (ownership via RLS) or create a provisional one.
  let caseId: string;
  let provisionalCase = false;
  if (requestedCaseId) {
    const { data: existing } = await supabase
      .from("cases")
      .select("id")
      .eq("id", requestedCaseId)
      .maybeSingle();
    if (!existing) {
      return NextResponse.json({ error: "case_not_found" }, { status: 404 });
    }
    caseId = existing.id as string;
  } else {
    const { data: created, error: caseErr } = await supabase
      .from("cases")
      .insert({ user_id: user.id })
      .select("id")
      .single();
    if (caseErr || !created) {
      logError("documents.case_create.failed", caseErr, { route: "/api/documents" });
      return NextResponse.json({ error: "case_create_failed" }, { status: 500 });
    }
    caseId = created.id as string;
    provisionalCase = true;
  }

  // 4. Storage upload — opaque key, server-set content type, no upsert.
  const storagePath = `${user.id}/${randomUUID()}`;
  const contentHash = createHash("sha256").update(bytes).digest("hex");
  const { error: storageErr } = await admin.storage
    .from("documents")
    .upload(storagePath, bytes, { contentType: validation.contentType, upsert: false });
  if (storageErr) {
    logError("documents.storage_upload.failed", storageErr, { route: "/api/documents", caseId });
    if (provisionalCase) await rollbackProvisionalCase(caseId);
    return NextResponse.json({ error: "storage_failed" }, { status: 500 });
  }

  // 5. Documents row (kind placeholder until classification lands).
  const { data: doc, error: docErr } = await supabase
    .from("documents")
    .insert({
      case_id: caseId,
      kind: "other",
      storage_path: storagePath,
      filename: typeof file.name === "string" ? file.name.slice(0, 256) : null,
      content_hash: contentHash,
    })
    .select("id")
    .single();
  if (docErr || !doc) {
    logError("documents.insert.failed", docErr, { route: "/api/documents", caseId });
    await admin.storage.from("documents").remove([storagePath]);
    if (provisionalCase) await rollbackProvisionalCase(caseId);
    return NextResponse.json({ error: "document_insert_failed" }, { status: 500 });
  }
  const documentId = doc.id as string;

  // 6. Classify — PHASE gate input from the profiles lookup (fail closed:
  //    missing profile row means NOT a test account).
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_test_account")
    .eq("user_id", user.id)
    .maybeSingle();
  const isTestAccount = profile?.is_test_account === true;

  let classification: ClassifyOutput;
  try {
    classification = await classifyDocument({
      caseId,
      documentId,
      mediaType: validation.contentType,
      base64: Buffer.from(bytes).toString("base64"),
      isTestAccount,
    });
  } catch (err) {
    // Full error payload lives in the ai_calls ledger row (shared client);
    // logs get class/code only. Document stays kind='other', parse pending.
    logError("documents.classify.failed", err, { route: "/api/documents", caseId, documentId });
    return NextResponse.json(
      { error: "classify_failed", documentId, caseId },
      { status: 502 },
    );
  }

  const extracted = normalizeExtracted(classification);
  const { error: updateErr } = await supabase
    .from("documents")
    .update({ kind: classification.kind, extracted })
    .eq("id", documentId);
  if (updateErr) {
    logError("documents.classify_update.failed", updateErr, {
      route: "/api/documents",
      caseId,
      documentId,
    });
    return NextResponse.json({ error: "document_update_failed" }, { status: 500 });
  }

  // 7. Dedupe / statement-version attach — only when all three keys exist.
  let dedupe: { existingCaseId: string } | undefined;
  let byteIdentical = false;

  if (extracted.provider && extracted.accountNumber && extracted.dateOfService) {
    // RPC, not PostgREST filters: provider/account/DOS travel in the POST
    // body instead of URL query strings, which land in Supabase API logs
    // (review F73). SECURITY INVOKER — RLS scopes results to this user.
    interface DuplicateRow {
      id: string;
      case_id: string;
      version_group: string;
      content_hash: string | null;
    }
    const { data: matchData, error: matchErr } = await supabase.rpc(
      "find_duplicate_documents",
      {
        p_provider: extracted.provider,
        p_account: extracted.accountNumber,
        p_dos: extracted.dateOfService,
        p_exclude: documentId,
      },
    );
    const matches = (matchData ?? []) as DuplicateRow[];
    if (matchErr) {
      logError("documents.dedupe.query_failed", matchErr, {
        route: "/api/documents",
        caseId,
        documentId,
      });
    }

    const otherCaseMatch = matches.find((m) => m.case_id !== caseId);
    const sameCaseMatches = matches.filter((m) => m.case_id === caseId);

    if (otherCaseMatch && !requestedCaseId) {
      // Same provider+account+DOS in another of this user's cases: don't
      // attach — surface continue-existing. Doc stays parked (see header).
      dedupe = { existingCaseId: otherCaseMatch.case_id as string };
      byteIdentical = otherCaseMatch.content_hash === contentHash;
    } else if (sameCaseMatches.length > 0) {
      // Explicitly-targeted case already holds this statement: attach as a
      // new version in the matched group (corrected statements ride this).
      const group = sameCaseMatches[0].version_group as string;
      const attached = await attachAsVersion(supabase, documentId, group);
      if (attached) {
        const { data: twins } = await supabase
          .from("documents")
          .select("id")
          .eq("version_group", group)
          .eq("content_hash", contentHash)
          .neq("id", documentId)
          .limit(1);
        byteIdentical = (twins ?? []).length > 0;
      }
    }
  }

  log("documents.upload.completed", {
    route: "/api/documents",
    caseId,
    documentId,
    status: dedupe ? "dedupe" : "attached",
  });

  return NextResponse.json(
    {
      documentId,
      caseId,
      kind: classification.kind,
      quality: classification.quality,
      ...(dedupe ? { dedupe } : {}),
      ...(byteIdentical ? { byteIdentical } : {}),
    },
    { status: 201 },
  );
}

/**
 * Move a freshly-inserted document (version 1 in its own fresh group) into an
 * existing version_group as the next version. Two attempts cover the
 * (version_group, version_number) unique-key race on concurrent uploads.
 */
async function attachAsVersion(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  documentId: string,
  versionGroup: string,
): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: top } = await supabase
      .from("documents")
      .select("version_number")
      .eq("version_group", versionGroup)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    const next = ((top?.version_number as number | undefined) ?? 1) + 1;
    const { error } = await supabase
      .from("documents")
      .update({ version_group: versionGroup, version_number: next })
      .eq("id", documentId);
    if (!error) {
      log("documents.version_attached", { route: "/api/documents", documentId, count: next });
      return true;
    }
    if (attempt === 1) {
      logError("documents.version_attach.failed", error, { route: "/api/documents", documentId });
    }
  }
  return false;
}

/**
 * Empty provisional cases are removed through the sanctioned RPC — a bare
 * cases delete NEVER worked: the INSERT state event gives every case a
 * case_events row, and the append-only trigger blocks the cascade (review
 * F26). Failure is logged, not surfaced — an orphan case is a known seam
 * cleaned by the U17 purge.
 */
async function rollbackProvisionalCase(caseId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("rollback_provisional_case", { p_case_id: caseId });
  if (error || data !== true) {
    logError("documents.provisional_rollback.failed", error ?? new Error("not_rolled_back"), {
      route: "/api/documents",
      caseId,
    });
  }
}
