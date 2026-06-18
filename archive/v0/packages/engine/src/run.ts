import type { CoverageEntry } from "@billcheck/shared";
import { completeCoverage } from "./coverage";
import {
  CHECK_VERSION as C3_VERSION,
  runC3Duplicates,
} from "./checks/c3-duplicates";
import { CHECK_VERSION as C4_VERSION, runC4Ncci } from "./checks/c4-ncci";
import { CHECK_VERSION as C5_VERSION, runC5Mue } from "./checks/c5-mue";
import { CHECK_VERSION as C8_VERSION, runC8Gfe } from "./checks/c8-gfe";
import { CHECK_VERSION as C9_VERSION, runC9Fap } from "./checks/c9-fap";
import { CHECK_VERSION as C10_VERSION, runC10Benchmark } from "./checks/c10-benchmark";
import { CHECK_VERSION as C13_VERSION, runC13Payments } from "./checks/c13-payments";
import { CHECK_VERSION as C1_VERSION, runC1Balance } from "./checks/c1-balance";
import { CHECK_VERSION as C2_VERSION, runC2Submission } from "./checks/c2-submission";
import { CHECK_VERSION as C6_VERSION, runC6Carc } from "./checks/c6-carc";
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

export const ENGINE_VERSION = "0.4.0";

/** Deterministic battery: C3/C4/C5 (U8) + C8/C9/C10/C13 (U11) + C1/C2/C6 (U16). C7/C11/C12 are V1. */
const CHECKS: CheckDef[] = [
  {
    id: "C1",
    version: C1_VERSION,
    skipReason: "needs your EOB — add it and we compare what the bill asks vs what your insurer says you owe",
    run: runC1Balance,
  },
  {
    id: "C2",
    version: C2_VERSION,
    skipReason: "needs triage answers about your insurance",
    run: runC2Submission,
  },
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
  {
    id: "C6",
    version: C6_VERSION,
    skipReason: "needs your EOB's adjustment codes and the CARC reference set",
    run: runC6Carc,
  },
  {
    id: "C8",
    version: C8_VERSION,
    skipReason: "needs self-pay triage answers and a Good Faith Estimate document",
    run: runC8Gfe,
  },
  {
    id: "C9",
    version: C9_VERSION,
    skipReason: "needs your income band and a hospital in our financial-assistance set — tell us your hospital",
    run: runC9Fap,
  },
  {
    id: "C10",
    version: C10_VERSION,
    skipReason: "needs coded professional lines with charges and the Medicare rate set",
    run: runC10Benchmark,
  },
  {
    id: "C13",
    version: C13_VERSION,
    skipReason: "needs a payment receipt to compare against the bill's credits",
    run: runC13Payments,
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
