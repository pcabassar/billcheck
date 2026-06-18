import { NextResponse, type NextRequest } from "next/server";
import {
  buildLetterFillPrompt,
  LETTER_FILL_PROMPT_VERSION,
  LETTER_FILL_SYSTEM_PROMPT,
  LetterFactsFill,
  log,
  logError,
  renderDisputeLetter,
  renderFapChecklist,
  renderItemizedRequest,
  renderPpdrGuide,
  renderValidationLetter,
  validateLetter,
} from "@billcheck/shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { llm } from "@/lib/llm";

/**
 * POST /api/artifacts — generate a dispute letter for a case (plan U9).
 *
 * Reads run under the user's JWT (RLS scopes ownership). Artifact + event
 * writes go through the admin client — artifacts/case_events have no client
 * INSERT policies by design; this route is the sanctioned server writer.
 *
 * The LLM fills ONLY the bounded {{FACTS_i}} slots from finding titles +
 * evidence notes (never raw document text). Every rendered letter passes
 * validateLetter (fail closed) before it is persisted: violations get a
 * sanitized 422 code here and the full detail goes to the ai_calls ledger
 * row's error_payload — never to logs or the client (AGENTS.md rule 1).
 */

const ROUTE = "/api/artifacts";

interface FindingRow {
  id: string;
  title: string;
  amount_impact_cents: number | null;
  evidence: unknown;
}

interface LineItemRow {
  amount_cents: number | null;
  description_raw: string | null;
  date_of_service: string | null;
}

function extractEvidenceNotes(evidence: unknown): string[] {
  if (!Array.isArray(evidence)) return [];
  const notes: string[] = [];
  for (const entry of evidence) {
    if (
      entry !== null &&
      typeof entry === "object" &&
      typeof (entry as { note?: unknown }).note === "string"
    ) {
      notes.push((entry as { note: string }).note);
    }
  }
  return notes;
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const caseId = (body as { caseId?: unknown })?.caseId;
  const type = (body as { type?: unknown })?.type;
  const ARTIFACT_TYPES = ["dispute", "validation", "itemized_request", "fap_application", "ppdr_guide"];
  if (typeof caseId !== "string" || caseId.length === 0 || typeof type !== "string" || !ARTIFACT_TYPES.includes(type)) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();

  // Ownership-scoped read: RLS returns nothing for someone else's case.
  const { data: caseRow } = await supabase
    .from("cases")
    .select("id, state, current_run_id")
    .eq("id", caseId)
    .maybeSingle();
  if (!caseRow) {
    return NextResponse.json({ error: "case_not_found" }, { status: 404 });
  }
  // Only the dispute letter needs a completed engine run; static artifacts
  // (U13) render from case documents and reference data alone.
  if (type === "dispute" && !caseRow.current_run_id) {
    return NextResponse.json({ error: "no_completed_run" }, { status: 409 });
  }

  // Idempotency (review F23): an open draft for this case+type is returned
  // as-is. The partial unique index (one open draft per case+type) backs it.
  const { data: existingDraft } = await supabase
    .from("artifacts")
    .select("id")
    .eq("case_id", caseId)
    .eq("type", type)
    .is("approved_at", null)
    .maybeSingle();
  if (existingDraft) {
    log("artifacts.draft_reused", { caseId, route: ROUTE });
    return NextResponse.json({ artifactId: existingDraft.id, reused: true }, { status: 200 });
  }

  // ---- Static artifacts (U13): deterministic templates, no LLM, no
  // validation pipeline — bracketed placeholders mark user-supplied fields.
  if (type !== "dispute") {
    const staticText = await renderStaticArtifact(supabase, caseId, type);
    if ("error" in staticText) {
      return NextResponse.json({ error: staticText.error }, { status: 409 });
    }
    const adminStatic = createSupabaseAdminClient();
    const { data: staticArtifact, error: staticErr } = await adminStatic
      .from("artifacts")
      .insert({
        case_id: caseId,
        type,
        content: { letterText: staticText.text, generatedAt: new Date().toISOString() },
        finding_ids: [],
      })
      .select("id")
      .single();
    if (staticErr || !staticArtifact) {
      if (staticErr?.code === "23505") {
        const { data: winner } = await supabase
          .from("artifacts")
          .select("id")
          .eq("case_id", caseId)
          .eq("type", type)
          .is("approved_at", null)
          .maybeSingle();
        if (winner) return NextResponse.json({ artifactId: winner.id, reused: true }, { status: 200 });
      }
      logError("artifacts.insert.failed", staticErr ?? new Error("no_row"), { caseId, route: ROUTE });
      return NextResponse.json({ error: "artifact_insert_failed" }, { status: 500 });
    }
    const { error: staticEventErr } = await adminStatic.from("case_events").insert({
      case_id: caseId,
      type: "artifact_generated",
      payload: { artifactId: staticArtifact.id, artifactType: type },
      by_role: "system",
    });
    if (staticEventErr) {
      logError("artifacts.event_append.failed", staticEventErr, { caseId, route: ROUTE });
    }
    log("artifacts.generated", { caseId, route: ROUTE, status: type });
    return NextResponse.json({ artifactId: staticArtifact.id }, { status: 201 });
  }

  const { data: findingsData } = await supabase
    .from("findings")
    .select("id, title, amount_impact_cents, evidence")
    .eq("run_id", caseRow.current_run_id)
    .order("created_at", { ascending: true });
  const findings = (findingsData ?? []) as FindingRow[];
  if (findings.length === 0) {
    return NextResponse.json({ error: "no_findings" }, { status: 409 });
  }

  // Confirmed line-item amounts feed the allowed-dollar set; descriptions
  // feed the quoted-excerpt source set. DB-read only — never logged.
  const { data: docs } = await supabase
    .from("documents")
    .select("id")
    .eq("case_id", caseId);
  const docIds = (docs ?? []).map((d: { id: string }) => d.id);
  let lineItems: LineItemRow[] = [];
  if (docIds.length > 0) {
    const { data: liData } = await supabase
      .from("line_items")
      .select("amount_cents, description_raw, date_of_service")
      .in("document_id", docIds);
    lineItems = (liData ?? []) as LineItemRow[];
  }

  const fillInputs = findings.map((f) => ({
    title: f.title,
    evidenceNotes: extractEvidenceNotes(f.evidence),
  }));

  // PHASE-gate input: the letter fill carries no document bytes, but the
  // client contract requires the caller to resolve isTestAccount explicitly.
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_test_account")
    .maybeSingle();

  let fill;
  try {
    fill = await llm.call({
      purpose: "letter",
      caseId,
      promptVersion: LETTER_FILL_PROMPT_VERSION,
      system: LETTER_FILL_SYSTEM_PROMPT,
      prompt: buildLetterFillPrompt(fillInputs),
      schema: LetterFactsFill,
      isTestAccount: profile?.is_test_account === true,
    });
  } catch (err) {
    logError("artifacts.letter_fill.failed", err, {
      caseId,
      route: ROUTE,
      purpose: "letter",
      promptVersion: LETTER_FILL_PROMPT_VERSION,
    });
    return NextResponse.json({ error: "letter_generation_failed" }, { status: 502 });
  }

  const admin = createSupabaseAdminClient();
  const facts = fill.output.facts;
  if (facts.length !== findings.length) {
    await admin
      .from("ai_calls")
      .update({
        error_code: "letter_fill_count_mismatch",
        error_payload: { expected: findings.length, got: facts.length },
      })
      .eq("id", fill.ledgerId);
    log("artifacts.letter_fill_invalid", { caseId, route: ROUTE });
    return NextResponse.json({ error: "letter_fill_invalid" }, { status: 422 });
  }

  // Provider/account/legal-name capture are open seams (plan: deferred to
  // U4 dedupe fields + approval-time name UX). Bracketed placeholders render
  // until then; date of service derives from confirmed line items.
  const dosSet = [
    ...new Set(
      lineItems
        .map((li) => li.date_of_service)
        .filter((d): d is string => typeof d === "string" && d.length > 0),
    ),
  ].sort();

  const letterText = renderDisputeLetter({
    userName: null,
    provider: "[Provider name]",
    accountNumber: null,
    dateOfService: dosSet.length > 0 ? dosSet.join(", ") : null,
    findings: findings.map((f, i) => ({
      title: f.title,
      amountImpactCents: f.amount_impact_cents,
      evidenceNotes: extractEvidenceNotes(f.evidence),
      factText: facts[i],
    })),
  });

  const allowedDollarCents = [
    ...findings
      .map((f) => f.amount_impact_cents)
      .filter((n): n is number => typeof n === "number"),
    ...lineItems
      .map((li) => li.amount_cents)
      .filter((n): n is number => typeof n === "number"),
  ];
  const sourceExcerpts = [
    ...findings.map((f) => f.title),
    ...findings.flatMap((f) => extractEvidenceNotes(f.evidence)),
    ...lineItems
      .map((li) => li.description_raw)
      .filter((s): s is string => typeof s === "string" && s.length > 0),
  ];

  const validation = validateLetter(letterText, { allowedDollarCents, sourceExcerpts });
  if (!validation.ok) {
    // Full violation detail (may echo document text) -> ledger, not logs.
    await admin
      .from("ai_calls")
      .update({
        error_code: "letter_validation_failed",
        error_payload: { violations: validation.violations },
      })
      .eq("id", fill.ledgerId);
    log("artifacts.letter_validation_failed", {
      caseId,
      route: ROUTE,
      count: validation.violations.length,
    });
    return NextResponse.json({ error: "letter_validation_failed" }, { status: 422 });
  }

  const generatedAt = new Date().toISOString();
  const { data: artifact, error: insertError } = await admin
    .from("artifacts")
    .insert({
      case_id: caseId,
      type: "dispute",
      content: { letterText, generatedAt },
      finding_ids: findings.map((f) => f.id),
    })
    .select("id")
    .single();
  if (insertError || !artifact) {
    // Unique-index race (two concurrent generates): hand back the winner.
    if (insertError?.code === "23505") {
      const { data: winner } = await supabase
        .from("artifacts")
        .select("id")
        .eq("case_id", caseId)
        .eq("type", "dispute")
        .is("approved_at", null)
        .maybeSingle();
      if (winner) {
        return NextResponse.json({ artifactId: winner.id, reused: true }, { status: 200 });
      }
    }
    logError("artifacts.insert.failed", insertError ?? new Error("no_row"), {
      caseId,
      route: ROUTE,
    });
    return NextResponse.json({ error: "artifact_insert_failed" }, { status: 500 });
  }

  const { error: eventError } = await admin.from("case_events").insert({
    case_id: caseId,
    type: "artifact_generated",
    payload: { artifactId: artifact.id, artifactType: "dispute" },
    by_role: "system",
  });
  if (eventError) {
    logError("artifacts.event_append.failed", eventError, { caseId, route: ROUTE });
  }

  log("artifacts.generated", { caseId, route: ROUTE, purpose: "letter" });
  return NextResponse.json({ artifactId: artifact.id }, { status: 201 });
}

interface ExtractedDocFields {
  provider?: string;
  accountNumber?: string;
  dateOfService?: string;
}

/**
 * Static artifact renderers (U13). Data comes from the case's own documents
 * (classifier dedupe fields + printed totals) and the seeded reference sets.
 * The validation letter is GATED on an actual collection notice (review A3):
 * FDCPA rights attach to third-party collectors — the notice proves one.
 */
async function renderStaticArtifact(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  caseId: string,
  type: string,
): Promise<{ text: string } | { error: string }> {
  const { data: docs } = await supabase
    .from("documents")
    .select("id, kind, extracted, printed_total_cents")
    .eq("case_id", caseId);
  const all = docs ?? [];
  const billDoc = all.find((d) => d.kind === "bill" || d.kind === "corrected_statement");
  const billFields = ((billDoc?.extracted ?? {}) as ExtractedDocFields) ?? {};

  if (type === "itemized_request") {
    return {
      text: renderItemizedRequest({
        providerName: billFields.provider ?? null,
        accountNumber: billFields.accountNumber ?? null,
        dateOfService: billFields.dateOfService ?? null,
      }),
    };
  }

  if (type === "validation") {
    const notice = all.find((d) => d.kind === "collection_notice");
    if (!notice) return { error: "collection_notice_required" };
    const noticeFields = (notice.extracted ?? {}) as ExtractedDocFields;
    return {
      text: renderValidationLetter({
        collectorName: noticeFields.provider ?? "[COLLECTOR NAME FROM THE NOTICE]",
        accountNumber: noticeFields.accountNumber ?? null,
        demandedCents: notice.printed_total_cents === null ? null : Number(notice.printed_total_cents),
      }),
    };
  }

  if (type === "fap_application") {
    const provider = billFields.provider ?? null;
    let policy: { hospital_name: string; threshold_free_fpl: number | null; threshold_discount_fpl: number | null; source_url: string | null } | null = null;
    if (provider) {
      const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
      const { data: versions } = await supabase
        .from("ref_versions")
        .select("version, loaded_at")
        .eq("table_name", "ref_fap_policies")
        .order("loaded_at", { ascending: false })
        .limit(1);
      const fapVersion = versions?.[0]?.version;
      if (fapVersion) {
        const { data: policies } = await supabase
          .from("ref_fap_policies")
          .select("hospital_name, threshold_free_fpl, threshold_discount_fpl, source_url")
          .eq("version", fapVersion);
        policy =
          (policies ?? []).find(
            (p) => norm(provider).includes(norm(p.hospital_name)) || norm(p.hospital_name).includes(norm(provider)),
          ) ?? null;
      }
    }
    return {
      text: renderFapChecklist({
        hospitalName: policy?.hospital_name ?? provider,
        thresholdFreeFpl: policy?.threshold_free_fpl === null || policy === null ? null : Number(policy.threshold_free_fpl),
        thresholdDiscountFpl: policy?.threshold_discount_fpl === null || policy === null ? null : Number(policy.threshold_discount_fpl),
        sourceUrl: policy?.source_url ?? null,
      }),
    };
  }

  if (type === "ppdr_guide") {
    const gfeDoc = all.find((d) => d.kind === "gfe");
    const billTotal = billDoc?.printed_total_cents === null || !billDoc ? null : Number(billDoc.printed_total_cents);
    const gfeTotal = gfeDoc?.printed_total_cents === null || !gfeDoc ? null : Number(gfeDoc.printed_total_cents);
    return { text: renderPpdrGuide({ gfeCents: gfeTotal, billedCents: billTotal }) };
  }

  return { error: "invalid_body" };
}
