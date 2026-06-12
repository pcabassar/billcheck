import {
  CheckId,
  type CoverageEntry,
  type Finding,
  type LineItem,
} from "@billcheck/shared";

/**
 * The audit engine (arch D2): deterministic, versioned, standalone — no UI,
 * auth, or network imports. Checks are pure functions over typed inputs and
 * versioned reference tables; LLM judgment checks (C11/C12) run OUTSIDE the
 * engine and feed in as inputs in V1.
 *
 * Core integrity invariant (plan, security #3): document text is untrusted
 * data. The engine consumes only typed line items — no LLM output can create,
 * suppress, or rescore a finding from inside the engine.
 */

export const ENGINE_VERSION = "0.1.0";

export interface EngineInput {
  caseId: string;
  /** Line items grouped by source document; paired facility/professional docs share a case. */
  lineItems: LineItem[];
  /** Which document each line item came from is on the LineItem itself. */
  itemized: boolean;
}

export interface EngineResult {
  engineVersion: string;
  findings: Finding[];
  coverage: CoverageEntry[];
}

interface CheckDef {
  id: CheckId;
  version: string;
  /** Returns null when the check cannot run on this input (→ skipped_no_data). */
  run: (input: EngineInput) => Finding[] | null;
}

/** Deterministic checks land here starting in U8 (C3, C4, C5), U11 (C13, C8, C10, C9), U16 (C1, C2, C6). */
const CHECKS: CheckDef[] = [];

const ALL_CHECK_IDS = CheckId.options;

export function runEngine(input: EngineInput): EngineResult {
  const findings: Finding[] = [];
  const coverage: CoverageEntry[] = [];
  const implemented = new Set(CHECKS.map((c) => c.id));

  for (const check of CHECKS) {
    const result = check.run(input);
    if (result === null) {
      coverage.push({ checkId: check.id, status: "skipped_no_data", reason: null });
    } else {
      findings.push(...result);
      coverage.push({ checkId: check.id, status: "ran", reason: null });
    }
  }

  for (const id of ALL_CHECK_IDS) {
    if (!implemented.has(id)) {
      coverage.push({ checkId: id, status: "not_yet_available", reason: null });
    }
  }

  return { engineVersion: ENGINE_VERSION, findings, coverage };
}
