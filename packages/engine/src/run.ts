import type { CoverageEntry } from "@billcheck/shared";
import { completeCoverage } from "./coverage";
import {
  CHECK_VERSION as C3_VERSION,
  runC3Duplicates,
} from "./checks/c3-duplicates";
import { CHECK_VERSION as C4_VERSION, runC4Ncci } from "./checks/c4-ncci";
import { CHECK_VERSION as C5_VERSION, runC5Mue } from "./checks/c5-mue";
import type {
  CheckDef,
  EngineFinding,
  EngineInput,
  EngineResult,
  ReferenceData,
} from "./types";

/**
 * The audit engine (arch D2): deterministic, versioned, standalone — no UI,
 * auth, network, or DB imports. Checks are pure functions over typed inputs
 * plus an injected, versioned ReferenceData snapshot; LLM judgment checks
 * (C11/C12) run OUTSIDE the engine and feed in as inputs in V1.
 *
 * Core integrity invariant (plan, security #3): document text is untrusted
 * data. The engine consumes only typed line items — no LLM output can create,
 * suppress, or rescore a finding from inside the engine.
 */

export const ENGINE_VERSION = "0.2.0";

/** Deterministic checks: C3/C4/C5 (U8); C13/C8/C10/C9 land in U11; C1/C2/C6 in U16. */
const CHECKS: CheckDef[] = [
  {
    id: "C3",
    version: C3_VERSION,
    skipReason: "needs an itemized bill with billing codes",
    run: runC3Duplicates,
  },
  {
    id: "C4",
    version: C4_VERSION,
    skipReason: "needs billing codes and the NCCI procedure-pair reference set",
    run: runC4Ncci,
  },
  {
    id: "C5",
    version: C5_VERSION,
    skipReason: "needs billing codes with units and the MUE reference set",
    run: runC5Mue,
  },
];

/** check id → check version for every implemented check (engine_runs.check_versions). */
export const CHECK_VERSIONS: Record<string, string> = Object.fromEntries(
  CHECKS.map((c) => [c.id, c.version]),
);

export function runEngine(input: EngineInput, refs: ReferenceData): EngineResult {
  const findings: EngineFinding[] = [];
  const coverage: CoverageEntry[] = [];

  for (const check of CHECKS) {
    const result = check.run(input, refs);
    if (result === null) {
      coverage.push({
        checkId: check.id,
        status: "skipped_no_data",
        reason: check.skipReason,
      });
    } else {
      findings.push(...result);
      coverage.push({ checkId: check.id, status: "ran", reason: null });
    }
  }

  return {
    engineVersion: ENGINE_VERSION,
    checkVersions: CHECK_VERSIONS,
    findings,
    coverage: completeCoverage(coverage),
  };
}
