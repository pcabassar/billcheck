/**
 * The durable case lifecycle (plan U7, arch D7): one workflow per case
 * orchestrates parse → triage(auto) → audit → verdict. Vercel Workflow DevKit:
 * the workflow function replays deterministically; each "use step" runs with
 * retries. PAYLOADS CARRY THE CASE ID ONLY — steps fetch PHI from Supabase
 * and nothing document-derived enters workflow state or logs (AGENTS.md #6).
 *
 * State writes are compare-and-set against the expected prior state, and the
 * DB transition trigger is the final arbiter — a step racing a user's close
 * action aborts harmlessly (FatalError) instead of resurrecting the case.
 */
import { FatalError } from "workflow";
import {
  runEngine,
  referenceDataFromJson,
  type EngineInput,
  type ReferenceDataJson,
} from "@billcheck/engine";
import { log, logError } from "@billcheck/shared";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { runParse } from "@/lib/parse/run-parse";

const TERMINAL_STATES = new Set([
  "CLOSED_BY_USER",
  "RESOLVED_SELF_REPORTED",
  "RESOLVED_VERIFIED",
]);

const ROUTER_VERSION = "demo-0.1";

async function assertCaseActive(caseId: string): Promise<string> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("cases")
    .select("state")
    .eq("id", caseId)
    .single();
  if (error || !data) throw new FatalError(`case_not_found:${caseId}`);
  if (TERMINAL_STATES.has(data.state)) {
    throw new FatalError(`case_terminal:${data.state}`);
  }
  return data.state;
}

async function parseDocumentsStep(caseId: string): Promise<{ parsed: number; failed: number }> {
  "use step";
  await assertCaseActive(caseId);
  const admin = createSupabaseAdminClient();
  const { data: docs } = await admin
    .from("documents")
    .select("id, parse_status, kind")
    .eq("case_id", caseId)
    .in("parse_status", ["pending", "failed"]);

  let parsed = 0;
  let failed = 0;
  for (const doc of docs ?? []) {
    const result = await runParse(doc.id);
    if (result.ok) parsed += 1;
    else failed += 1;
  }
  log("workflow.parse_step.done", { caseId, count: parsed, status: failed > 0 ? "partial" : "ok" });
  if (parsed === 0 && failed > 0) {
    // Nothing parseable — let the step retry; persistent failure surfaces via
    // documents.parse_status='failed' and the confirm screen's wait state.
    throw new Error("all_documents_failed_parse");
  }
  return { parsed, failed };
}

async function autoTriageStep(caseId: string): Promise<void> {
  "use step";
  const state = await assertCaseActive(caseId);
  if (state !== "CAPTURED") return; // already past — replay/no-op
  const admin = createSupabaseAdminClient();
  // Auto-advance until U10 ships the real triage (plan: demo slice marker).
  const { error } = await admin
    .from("cases")
    .update({ state: "TRIAGED", coverage_profile: { auto: true, reason: "triage UI lands in U10" } })
    .eq("id", caseId)
    .eq("state", "CAPTURED");
  if (error) throw new Error(`triage_advance_failed:${error.code ?? "unknown"}`);
}

interface RefRow {
  version: string;
}

async function loadLatestRefs(): Promise<ReferenceDataJson> {
  const admin = createSupabaseAdminClient();
  // Latest version per table = lexicographically max version label present.
  const [ncciVer, mueVer, ratesVer] = await Promise.all([
    admin.from("ref_ncci_ptp").select("version").order("version", { ascending: false }).limit(1),
    admin.from("ref_mue").select("version").order("version", { ascending: false }).limit(1),
    admin.from("ref_medicare_rates").select("version").order("version", { ascending: false }).limit(1),
  ]);
  const version = (ncciVer.data?.[0] as RefRow | undefined)?.version ?? "EMPTY";

  const [ncci, mue, rates] = await Promise.all([
    admin
      .from("ref_ncci_ptp")
      .select("code1, code2, modifier_allowed")
      .eq("version", version)
      .eq("modifier_allowed", false), // exclude modifier-allowed pairs (engine seam)
    admin
      .from("ref_mue")
      .select("code, max_units")
      .eq("version", (mueVer.data?.[0] as RefRow | undefined)?.version ?? version),
    admin
      .from("ref_medicare_rates")
      .select("code, national_rate_cents")
      .eq("version", (ratesVer.data?.[0] as RefRow | undefined)?.version ?? version),
  ]);

  return {
    version,
    ncciPtp: (ncci.data ?? []).map((r) => `${r.code1}|${r.code2}`),
    mue: Object.fromEntries((mue.data ?? []).map((r) => [r.code, r.max_units])),
    medicareRatesCents: Object.fromEntries(
      (rates.data ?? []).map((r) => [r.code, Number(r.national_rate_cents)]),
    ),
  };
}

async function auditStep(caseId: string): Promise<{ findings: number }> {
  "use step";
  const state = await assertCaseActive(caseId);
  const admin = createSupabaseAdminClient();

  const { data: docs } = await admin
    .from("documents")
    .select("id, extracted")
    .eq("case_id", caseId)
    .eq("parse_status", "parsed");
  const docIds = (docs ?? []).map((d) => d.id);
  if (docIds.length === 0) throw new Error("no_parsed_documents");

  const { data: lineItems } = await admin
    .from("line_items")
    .select("id, document_id, code, code_system, description_raw, description_plain, units, amount_cents, date_of_service, confidence")
    .in("document_id", docIds);

  const itemized = (docs ?? []).some(
    (d) => (d.extracted as { itemized?: boolean } | null)?.itemized === true,
  );

  const refsJson = await loadLatestRefs();
  const refs = referenceDataFromJson(refsJson);

  const input: EngineInput = {
    caseId,
    itemized,
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
  // the run is visible to consumers only once status='complete'.
  const { data: run, error: runErr } = await admin
    .from("engine_runs")
    .insert({
      case_id: caseId,
      engine_version: result.engineVersion,
      check_versions: result.checkVersions,
      ref_version_map: { ncci_ptp: refsJson.version, mue: refsJson.version, medicare_rates: refsJson.version },
      status: "running",
    })
    .select("id")
    .single();
  if (runErr || !run) throw new Error(`engine_run_insert_failed:${runErr?.code ?? "unknown"}`);

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

  const { error: completeErr } = await admin
    .from("engine_runs")
    .update({ status: "complete", completed_at: new Date().toISOString() })
    .eq("id", run.id)
    .eq("status", "running");
  if (completeErr) throw new Error("engine_run_complete_failed");

  await admin.from("cases").update({ current_run_id: run.id }).eq("id", caseId);

  if (state === "TRIAGED") {
    await admin.from("cases").update({ state: "AUDITED" }).eq("id", caseId).eq("state", "TRIAGED");
  }

  // Store coverage on the run's verdict later; pass only counts through state.
  log("workflow.audit_step.done", { caseId, runId: run.id, count: result.findings.length });
  return { findings: result.findings.length };
}

async function verdictStep(caseId: string): Promise<void> {
  "use step";
  await assertCaseActive(caseId);
  const admin = createSupabaseAdminClient();

  const { data: caseRow } = await admin
    .from("cases")
    .select("id, state, current_run_id")
    .eq("id", caseId)
    .single();
  if (!caseRow?.current_run_id) throw new Error("no_current_run");

  const [{ data: findings }, { data: docs }] = await Promise.all([
    admin.from("findings").select("id, amount_impact_cents").eq("run_id", caseRow.current_run_id),
    admin.from("documents").select("extracted").eq("case_id", caseId).eq("parse_status", "parsed"),
  ]);

  const itemized = (docs ?? []).some(
    (d) => (d.extracted as { itemized?: boolean } | null)?.itemized === true,
  );
  const findingCount = findings?.length ?? 0;

  // Demo router (full D10 v0.2 cascade lands in U12). Honesty gates hold:
  // a partial battery NEVER yields PAY; code-less bills route to GET_ITEMIZED.
  const primary = !itemized ? "GET_ITEMIZED" : findingCount > 0 ? "CONTEST" : "CLEAN_PARTIAL_BATTERY";

  // Recompute coverage for the verdict row (deterministic from the run).
  const { data: liCount } = await admin
    .from("line_items")
    .select("id", { count: "exact", head: true })
    .in(
      "document_id",
      (await admin.from("documents").select("id").eq("case_id", caseId)).data?.map((d) => d.id) ?? [],
    );
  void liCount;

  const { error: verdictErr } = await admin.from("verdicts").insert({
    case_id: caseId,
    run_id: caseRow.current_run_id,
    primary_verdict: primary,
    stacked: [],
    coverage_map: { note: "see engine_runs.check_versions; full coverage rendering in U12" },
    router_version: ROUTER_VERSION,
  });
  if (verdictErr) throw new Error(`verdict_insert_failed:${verdictErr.code ?? "unknown"}`);

  await admin
    .from("cases")
    .update({ state: "VERDICT", primary_verdict: primary })
    .eq("id", caseId)
    .eq("state", "AUDITED");

  log("workflow.verdict_step.done", { caseId, status: primary });
}

export async function processCase(caseId: string) {
  "use workflow";
  await parseDocumentsStep(caseId);
  await autoTriageStep(caseId);
  await auditStep(caseId);
  await verdictStep(caseId);
}
