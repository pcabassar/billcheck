import type { CheckId, CoverageEntry, Finding, LineItem } from "@billcheck/shared";

/**
 * Engine-local types (arch D2). The engine never touches the DB — reference
 * data is injected by the caller (the audit workflow step loads versioned
 * ref_* rows and builds a ReferenceData snapshot).
 */

/** Per-table reference version labels (F05: provenance is per table, never conflated). */
export interface ReferenceVersions {
  ncciPtp: string;
  mue: string;
  medicareRates: string;
  fapPolicies: string;
}

/** One hospital's published financial-assistance thresholds (C9, U11). */
export interface FapPolicy {
  hospitalName: string;
  state: string;
  /** Income threshold for FREE care, as a multiple of the federal poverty level. */
  thresholdFreeFpl: number | null;
  /** Income threshold for DISCOUNTED care, FPL multiple. */
  thresholdDiscountFpl: number | null;
}

/** A single versioned reference snapshot. Keys mirror the ref_* tables (U2). */
export interface ReferenceData {
  /** Version label per reference table, e.g. "2026Q2" or "TEST1" (append-only sets, never mutated). */
  versions: ReferenceVersions;
  /** NCCI procedure-to-procedure pairs as "code1|code2" (column1 = comprehensive, column2 = component). */
  ncciPtp: Set<string>;
  /** Medically Unlikely Edits: code → max units. */
  mue: Map<string, number>;
  /** Medicare PFS national rates in integer cents: code → cents. */
  medicareRatesCents: Map<string, number>;
  /** Seeded hospital financial-assistance policies (C9). */
  fapPolicies: FapPolicy[];
}

/** JSON-friendly shape of ReferenceData, used by eval fixtures (input.json). */
export interface ReferenceDataJson {
  versions: ReferenceVersions;
  ncciPtp: string[];
  mue: Record<string, number>;
  medicareRatesCents: Record<string, number>;
  fapPolicies: FapPolicy[];
}

/** Income band from triage (S4) — coarse, FAP screening only. */
export type IncomeBand = "under_2x_fpl" | "2x_to_4x_fpl" | "over_4x_fpl";

/** Coverage facts the audit step assembles from triage + documents (U10/U11). */
export interface EngineCoverage {
  /** Self-pay + GFE in hand (triage flag) — C8 may run. */
  c8Enabled: boolean;
  /** Income band given (triage flag) — C9 may run. */
  c9Enabled: boolean;
  incomeBand: IncomeBand | null;
}

export interface EngineInput {
  caseId: string;
  /** Line items grouped by source document; paired facility/professional docs share a case. */
  lineItems: LineItem[];
  /** Which document each line item came from is on the LineItem itself. */
  itemized: boolean;
  /** Printed total of the bill (sum across bill documents), integer cents. */
  billTotalCents?: number | null;
  /** Printed total of the Good Faith Estimate document, if one was provided (C8). */
  gfeTotalCents?: number | null;
  /** Sum of printed receipt totals — the user's proven payments (C13). */
  receiptsTotalCents?: number | null;
  /** Provider identity for FAP matching (C9) — from the classifier's dedupe fields. */
  providerName?: string | null;
  /** Two-letter state from triage, for FAP matching (C9). */
  providerState?: string | null;
  coverage?: EngineCoverage;
}

/**
 * Engine findings carry an evidenceKey on top of the shared Finding shape:
 * a deterministic stable string (e.g. "C3:code:date:docId") backing the DB
 * unique constraint (run_id, check_id, evidence_key).
 */
export type EngineFinding = Finding & { evidenceKey: string };

export interface EngineResult {
  engineVersion: string;
  /** check id → check version, for engine_runs.check_versions. */
  checkVersions: Record<string, string>;
  findings: EngineFinding[];
  coverage: CoverageEntry[];
}

export interface CheckDef {
  id: CheckId;
  version: string;
  /** Static, PHI-free explanation used as coverage reason when the check skips. */
  skipReason: string;
  /** Returns null when the check cannot run on this input (→ skipped_no_data). */
  run: (input: EngineInput, refs: ReferenceData) => EngineFinding[] | null;
}
