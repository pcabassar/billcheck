/**
 * The durable case lifecycle (plan U7, arch D7), split in two since review
 * round 1 (F03/F71): `processCase` carries a case through classify-parse to
 * TRIAGED and STOPS — the user reviews the extraction on the confirm screen —
 * then `auditCase` (kicked explicitly via POST /api/cases/[id]/audit after
 * that review) runs the engine and writes the verdict. The split makes the
 * reconciliation gate a real gate and closes the TOCTOU between line-item
 * edits and the audit reading them.
 *
 * PAYLOADS CARRY THE CASE ID ONLY — steps fetch PHI from Supabase and nothing
 * document-derived enters workflow state or logs (AGENTS.md #6).
 *
 * Error discipline (review F01/F02): EVERY Supabase read/write is checked.
 * Transient failures throw plain Errors (the step retries); only terminal
 * conditions (case gone, terminal state, audit already running) throw
 * FatalError. Load-bearing updates verify the matched-row count — a silent
 * 0-row update must never let a stale run feed a verdict.
 */
import { FatalError } from "workflow";
import {
  runEngine,
  referenceDataFromJson,
  type EngineInput,
  type ReferenceDataJson,
} from "@billcheck/engine";
import { log } from "@billcheck/shared";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { runParse } from "@/lib/parse/run-parse";

const TERMINAL_STATES = new Set([
  "CLOSED_BY_USER",
  "RESOLVED_SELF_REPORTED",
  "RESOLVED_VERIFIED",
]);

/** Kinds the V0 parser understands; EOB joins in U16 (F04: 'other' docs must not feed the audit). */
const PARSEABLE_KINDS = ["bill", "corrected_statement", "receipt", "gfe"];
/** Kinds whose LINE ITEMS feed the engine and define "itemized" — receipts/GFEs contribute totals only (U11). */
const BILL_KINDS = ["bill", "corrected_statement"];

const ROUTER_VERSION = "demo-0.1";

async function assertCaseActive(caseId: string): Promise<string> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("cases")
    .select("state")
    .eq("id", caseId)
    .maybeSingle();
  if (error) {
    // Transient DB failure → retryable, NOT fatal (review F32).
    throw new Error(`case_lookup_failed:${error.code ?? "unknown"}`);
  }
  if (!data) throw new FatalError(`case_not_found:${caseId}`);
  if (TERMINAL_STATES.has(data.state)) {
    throw new FatalError(`case_terminal:${data.state}`);
  }
  return data.state;
}

async function parseDocumentsStep(
  caseId: string,
): Promise<{ parsed: number; failed: number; skipped: number }> {
  "use step";
  await assertCaseActive(caseId);
  const admin = createSupabaseAdminClient();
  const { data: docs, error } = await admin
    .from("documents")
    .select("id, parse_status, kind")
    .eq("case_id", caseId)
    .in("parse_status", ["pending", "failed"])
    .in("kind", PARSEABLE_KINDS);
  if (error) throw new Error(`documents_lookup_failed:${error.code ?? "unknown"}`);

  let parsed = 0;
  let failed = 0;
  let skipped = 0;
  for (const doc of docs ?? []) {
    const result = await runParse(doc.id);
    if (result.ok) parsed += 1;
    else if (result.skipped) skipped += 1;
    else failed += 1;
  }
  log("workflow.parse_step.done", {
    caseId,
    count: parsed,
    status: failed > 0 ? "partial" : skipped > 0 ? "skipped" : "ok",
  });
  if (parsed === 0 && failed > 0) {
    // Real failures with nothing parsed — retry the step. Documents that
    // exhausted their attempt budget come back `skipped` instead, so a
    // poison document cannot re-bill the LLM forever (review F36).
    throw new Error("all_documents_failed_parse");
  }
  return { parsed, failed, skipped };
}

async function autoTriageStep(caseId: string): Promise<void> {
  "use step";
  const state = await assertCaseActive(caseId);
  if (state !== "CAPTURED") return; // already past — replay/no-op
  const admin = createSupabaseAdminClient();
  // Mechanical state advance post-parse; the USER's triage answers (S4)
  // overwrite coverage_profile via /api/cases/[id]/triage before the audit.
  const { data: moved, error } = await admin
    .from("cases")
    .update({ state: "TRIAGED", coverage_profile: { auto: true, reason: "awaiting user triage (S4)" } })
    .eq("id", caseId)
    .eq("state", "CAPTURED")
    .select("id");
  if (error) throw new Error(`triage_advance_failed:${error.code ?? "unknown"}`);
  if (!moved || moved.length === 0) {
    // Lost the CAS race — re-check; TRIAGED already is fine (replay).
    const now = await assertCaseActive(caseId);
    if (now === "CAPTURED") throw new Error("triage_advance_no_rows");
  }
}

interface RefVersionRow {
  table_name: string;
  version: string;
}

/** Page through a reference table — supabase-js silently truncates at 1000 rows (review F78). */
async function loadAllRows<T>(table: string, columns: string, version: string): Promise<T[]> {
  const admin = createSupabaseAdminClient();
  const pageSize = 1000;
  const rows: T[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await admin
      .from(table)
      .select(columns)
      .eq("version", version)
      .range(page * pageSize, (page + 1) * pageSize - 1);
    if (error) throw new Error(`ref_load_failed:${table}:${error.code ?? "unknown"}`);
    rows.push(...((data ?? []) as T[]));
    if ((data ?? []).length < pageSize) return rows;
  }
}

/**
 * Latest version PER TABLE from the ref_versions registry — most recent load
 * wins (review F05/F06: lexicographic label ordering let MINI1 shadow 2026Q2,
 * and one table's label was stamped onto all three).
 */
async function loadLatestRefs(): Promise<ReferenceDataJson> {
  const admin = createSupabaseAdminClient();
  const { data: versionRows, error } = await admin
    .from("ref_versions")
    .select("table_name, version, loaded_at")
    .order("loaded_at", { ascending: false });
  if (error) throw new Error(`ref_versions_lookup_failed:${error.code ?? "unknown"}`);

  const latest = new Map<string, string>();
  for (const row of (versionRows ?? []) as RefVersionRow[]) {
    if (!latest.has(row.table_name)) latest.set(row.table_name, row.version);
  }
  const ncciVersion = latest.get("ref_ncci_ptp") ?? "EMPTY";
  const mueVersion = latest.get("ref_mue") ?? "EMPTY";
  const ratesVersion = latest.get("ref_medicare_rates") ?? "EMPTY";
  const fapVersion = latest.get("ref_fap_policies") ?? "EMPTY";

  const [ncciAll, mue, rates, fap] = await Promise.all([
    loadAllRows<{ code1: string; code2: string; modifier_allowed: boolean }>(
      "ref_ncci_ptp",
      "code1, code2, modifier_allowed",
      ncciVersion,
    ),
    loadAllRows<{ code: string; max_units: number }>("ref_mue", "code, max_units", mueVersion),
    loadAllRows<{ code: string; national_rate_cents: number }>(
      "ref_medicare_rates",
      "code, national_rate_cents",
      ratesVersion,
    ),
    loadAllRows<{ hospital_name: string; state: string; threshold_free_fpl: number | null; threshold_discount_fpl: number | null }>(
      "ref_fap_policies",
      "hospital_name, state, threshold_free_fpl, threshold_discount_fpl",
      fapVersion,
    ),
  ]);
  // Exclude modifier-allowed pairs (engine seam — modifier handling is U11).
  const ncci = ncciAll.filter((r) => r.modifier_allowed === false);

  return {
    versions: { ncciPtp: ncciVersion, mue: mueVersion, medicareRates: ratesVersion, fapPolicies: fapVersion },
    ncciPtp: ncci.map((r) => `${r.code1}|${r.code2}`),
    mue: Object.fromEntries(mue.map((r) => [r.code, r.max_units])),
    medicareRatesCents: Object.fromEntries(rates.map((r) => [r.code, Number(r.national_rate_cents)])),
    fapPolicies: fap.map((r) => ({
      hospitalName: r.hospital_name,
      state: r.state,
      thresholdFreeFpl: r.threshold_free_fpl === null ? null : Number(r.threshold_free_fpl),
      thresholdDiscountFpl: r.threshold_discount_fpl === null ? null : Number(r.threshold_discount_fpl),
    })),
  };
}

async function auditStep(caseId: string): Promise<{ findings: number }> {
  "use step";
  const state = await assertCaseActive(caseId);
  const admin = createSupabaseAdminClient();

  const { data: allDocs, error: docsError } = await admin
    .from("documents")
    .select("id, kind, extracted, printed_total_cents, version_group, version_number")
    .eq("case_id", caseId)
    .eq("parse_status", "parsed")
    .in("kind", PARSEABLE_KINDS);
  if (docsError) throw new Error(`documents_lookup_failed:${docsError.code ?? "unknown"}`);

  // Latest version per group: corrected statements supersede their originals
  // for the audit; receipts/GFEs contribute printed totals only (U11).
  const latestByGroup = new Map<string, NonNullable<typeof allDocs>[number]>();
  for (const d of allDocs ?? []) {
    const prev = latestByGroup.get(d.version_group);
    if (!prev || d.version_number > prev.version_number) latestByGroup.set(d.version_group, d);
  }
  const latest = [...latestByGroup.values()];
  const docs = latest.filter((d) => BILL_KINDS.includes(d.kind));
  const receiptDocs = latest.filter((d) => d.kind === "receipt");
  const gfeDocs = latest.filter((d) => d.kind === "gfe");
  const docIds = docs.map((d) => d.id);
  if (docIds.length === 0) throw new Error("no_parsed_documents");

  const { data: lineItems, error: liError } = await admin
    .from("line_items")
    .select(
      "id, document_id, code, code_system, description_raw, description_plain, units, amount_cents, date_of_service, confidence",
    )
    .in("document_id", docIds);
  if (liError) {
    // A transient read failure must NEVER become a clean verdict (review
    // F01): throw so the step retries with real data.
    throw new Error(`line_items_lookup_failed:${liError.code ?? "unknown"}`);
  }

  const itemized = docs.some(
    (d) => (d.extracted as { itemized?: boolean } | null)?.itemized === true,
  );

  // U11 inputs: totals + provider identity + triage coverage flags.
  const sumTotals = (rows: typeof docs): number | null => {
    const totals = rows
      .map((d) => (d.printed_total_cents === null ? null : Number(d.printed_total_cents)))
      .filter((n): n is number => n !== null);
    return totals.length === 0 ? null : totals.reduce((a, b) => a + b, 0);
  };
  const billTotalCents = sumTotals(docs);
  const receiptsTotalCents = sumTotals(receiptDocs);
  const gfeTotalCents = sumTotals(gfeDocs);
  const providerName =
    (docs
      .map((d) => (d.extracted as { provider?: string } | null)?.provider)
      .find((p) => typeof p === "string" && p.length > 0) as string | undefined) ?? null;

  const { data: caseMeta, error: caseMetaErr } = await admin
    .from("cases")
    .select("coverage_profile")
    .eq("id", caseId)
    .maybeSingle();
  if (caseMetaErr) throw new Error(`case_lookup_failed:${caseMetaErr.code ?? "unknown"}`);
  const profile = (caseMeta?.coverage_profile ?? {}) as {
    triage?: { state?: string | null; incomeBand?: string | null };
    flags?: { c8Enabled?: boolean; c9Enabled?: boolean };
  };
  const incomeBand = profile.triage?.incomeBand;
  const coverage: import("@billcheck/engine").EngineCoverage = {
    c8Enabled: profile.flags?.c8Enabled === true,
    c9Enabled: profile.flags?.c9Enabled === true,
    incomeBand:
      incomeBand === "under_2x_fpl" || incomeBand === "2x_to_4x_fpl" || incomeBand === "over_4x_fpl"
        ? incomeBand
        : null,
  };

  const refsJson = await loadLatestRefs();
  const refs = referenceDataFromJson(refsJson);

  const input: EngineInput = {
    caseId,
    itemized,
    billTotalCents,
    receiptsTotalCents,
    gfeTotalCents,
    providerName,
    providerState: profile.triage?.state ?? null,
    coverage,
    lineItems: (lineItems ?? []).map((li) => ({
      id: li.id,
      documentId: li.document_id,
      code: li.code,
      codeSystem: li.code_system,
      descriptionRaw: li.description_raw,
      descriptionPlain: li.description_plain,
      units: li.units,
      amountCents: li.amount_cents === null ? null : Number(li.amount_cents),
      dateOfService: li.date_of_service,
      confidence: li.confidence,
    })),
  };

  const result = runEngine(input, refs);

  // Append-only run semantics (plan data #2): findings land under a new run;
  // the run is visible to consumers only once status='complete'. The partial
  // unique index (one running run per case, review F14) makes a concurrent
  // duplicate audit die here instead of double-writing findings.
  const { data: run, error: runErr } = await admin
    .from("engine_runs")
    .insert({
      case_id: caseId,
      engine_version: result.engineVersion,
      check_versions: result.checkVersions,
      ref_version_map: {
        ncci_ptp: refsJson.versions.ncciPtp,
        mue: refsJson.versions.mue,
        medicare_rates: refsJson.versions.medicareRates,
        fap_policies: refsJson.versions.fapPolicies,
      },
      status: "running",
    })
    .select("id")
    .single();
  if (runErr || !run) {
    if (runErr?.code === "23505") throw new FatalError("audit_already_running");
    throw new Error(`engine_run_insert_failed:${runErr?.code ?? "unknown"}`);
  }

  if (result.findings.length > 0) {
    const { error: findErr } = await admin.from("findings").insert(
      result.findings.map((f) => ({
        run_id: run.id,
        case_id: caseId,
        check_id: f.checkId,
        check_version: f.checkVersion,
        confidence_tier: f.confidenceTier,
        amount_impact_cents: f.amountImpactCents,
        title: f.title,
        evidence: f.evidence,
        evidence_key: f.evidenceKey,
      })),
    );
    if (findErr) throw new Error(`findings_insert_failed:${findErr.code ?? "unknown"}`);
  }

  const { data: completed, error: completeErr } = await admin
    .from("engine_runs")
    .update({ status: "complete", completed_at: new Date().toISOString() })
    .eq("id", run.id)
    .eq("status", "running")
    .select("id");
  if (completeErr) throw new Error(`engine_run_complete_failed:${completeErr.code ?? "unknown"}`);
  if (!completed || completed.length === 0) throw new Error("engine_run_complete_no_rows");

  const { data: pointed, error: pointErr } = await admin
    .from("cases")
    .update({ current_run_id: run.id })
    .eq("id", caseId)
    .select("id");
  if (pointErr) throw new Error(`current_run_update_failed:${pointErr.code ?? "unknown"}`);
  if (!pointed || pointed.length === 0) throw new Error("current_run_update_no_rows");

  if (["TRIAGED", "WAITING_ADJUDICATION", "WAITING_ITEMIZED"].includes(state)) {
    const { data: moved, error: moveErr } = await admin
      .from("cases")
      .update({ state: "AUDITED" })
      .eq("id", caseId)
      .eq("state", state)
      .select("id");
    if (moveErr) throw new Error(`audited_advance_failed:${moveErr.code ?? "unknown"}`);
    if (!moved || moved.length === 0) {
      const now = await assertCaseActive(caseId);
      if (now !== "AUDITED" && now !== "VERDICT") throw new Error("audited_advance_no_rows");
    }
  }

  log("workflow.audit_step.done", { caseId, runId: run.id, count: result.findings.length });
  return { findings: result.findings.length };
}

async function verdictStep(caseId: string): Promise<void> {
  "use step";
  await assertCaseActive(caseId);
  const admin = createSupabaseAdminClient();

  const { data: caseRow, error: caseErr } = await admin
    .from("cases")
    .select("id, state, current_run_id")
    .eq("id", caseId)
    .maybeSingle();
  if (caseErr) throw new Error(`case_lookup_failed:${caseErr.code ?? "unknown"}`);
  if (!caseRow?.current_run_id) throw new Error("no_current_run");

  const [findingsRes, docsRes] = await Promise.all([
    admin.from("findings").select("id, amount_impact_cents").eq("run_id", caseRow.current_run_id),
    admin
      .from("documents")
      .select("extracted")
      .eq("case_id", caseId)
      .eq("parse_status", "parsed")
      .in("kind", BILL_KINDS),
  ]);
  if (findingsRes.error) throw new Error(`findings_lookup_failed:${findingsRes.error.code ?? "unknown"}`);
  if (docsRes.error) throw new Error(`documents_lookup_failed:${docsRes.error.code ?? "unknown"}`);

  const itemized = (docsRes.data ?? []).some(
    (d) => (d.extracted as { itemized?: boolean } | null)?.itemized === true,
  );
  const findingCount = findingsRes.data?.length ?? 0;

  // Demo router (full D10 v0.2 cascade lands in U12). Honesty gates hold:
  // a partial battery NEVER yields PAY; code-less bills route to GET_ITEMIZED.
  const primary = !itemized ? "GET_ITEMIZED" : findingCount > 0 ? "CONTEST" : "CLEAN_PARTIAL_BATTERY";

  const { error: verdictErr } = await admin.from("verdicts").insert({
    case_id: caseId,
    run_id: caseRow.current_run_id,
    primary_verdict: primary,
    stacked: [],
    coverage_map: { note: "see engine_runs.check_versions; full coverage rendering in U12" },
    router_version: ROUTER_VERSION,
  });
  if (verdictErr) throw new Error(`verdict_insert_failed:${verdictErr.code ?? "unknown"}`);

  const { data: moved, error: moveErr } = await admin
    .from("cases")
    .update({ state: "VERDICT", primary_verdict: primary })
    .eq("id", caseId)
    .eq("state", "AUDITED")
    .select("id");
  if (moveErr) throw new Error(`verdict_advance_failed:${moveErr.code ?? "unknown"}`);
  if (!moved || moved.length === 0) {
    const now = await assertCaseActive(caseId);
    if (now !== "VERDICT") throw new Error("verdict_advance_no_rows");
  }

  log("workflow.verdict_step.done", { caseId, status: primary });
}

/** Upload → parse → TRIAGED, then STOP for the user's confirm review. */
export async function processCase(caseId: string) {
  "use workflow";
  await parseDocumentsStep(caseId);
  await autoTriageStep(caseId);
}

/** Kicked explicitly after the user confirms the extraction (review F03/F71). */
export async function auditCase(caseId: string) {
  "use workflow";
  await auditStep(caseId);
  await verdictStep(caseId);
}
