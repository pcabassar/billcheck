import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runEngine } from "../src/run";
import { referenceDataFromJson } from "../src/reference";
import { routeVerdict, type RouterFlags } from "../src/verdict/router";
import type {
  EngineFinding,
  EngineInput,
  ReferenceDataJson,
} from "../src/types";
import type { CoverageStatus, VerdictKind } from "@billcheck/shared";

/**
 * Golden-case eval harness (plan U8/U15, non-negotiable per arch D2).
 * Each fixture dir contains input.json (EngineInput + its own ReferenceData
 * snapshot in JSON form) and expected.json ({ findings, coverage }).
 * Expected findings are computed BY HAND from the reference tables — never
 * captured from engine output (plan, review A5). CI fails on any regression.
 */

type FixtureInput = EngineInput & { refs: ReferenceDataJson };

interface FixtureExpected {
  findings: EngineFinding[];
  /** Expected coverage status for each implemented check (C3/C4/C5 in U8). */
  coverage: Record<string, CoverageStatus>;
  /** Optional end-to-end check (U15): run the D10 router on the engine output. */
  verdict?: VerdictKind;
  /** Triage flags fed to the router when `verdict` is asserted. */
  flags?: RouterFlags;
}

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

const fixtureDirs = readdirSync(FIXTURES_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

function loadFixture(dir: string): {
  input: EngineInput;
  refs: ReferenceDataJson;
  expected: FixtureExpected;
} {
  const { refs, ...input } = JSON.parse(
    readFileSync(join(FIXTURES_DIR, dir, "input.json"), "utf8"),
  ) as FixtureInput;
  const expected = JSON.parse(
    readFileSync(join(FIXTURES_DIR, dir, "expected.json"), "utf8"),
  ) as FixtureExpected;
  return { input, refs, expected };
}

describe("engine golden fixtures", () => {
  it("has at least six fixtures (U8 verification gate)", () => {
    expect(fixtureDirs.length).toBeGreaterThanOrEqual(6);
  });

  it.each(fixtureDirs)("fixture %s produces expected findings", (dir) => {
    const { input, refs, expected } = loadFixture(dir);

    const result = runEngine(input, referenceDataFromJson(refs));

    expect(result.findings).toEqual(expected.findings);
  });

  it.each(fixtureDirs)("fixture %s produces expected coverage", (dir) => {
    const { input, refs, expected } = loadFixture(dir);

    const result = runEngine(input, referenceDataFromJson(refs));

    // Coverage map must always account for every check, in any state.
    expect(result.coverage).toHaveLength(13);

    // Implemented checks must land on the fixture's hand-specified status.
    for (const [checkId, status] of Object.entries(expected.coverage)) {
      const entry = result.coverage.find((c) => c.checkId === checkId);
      expect(entry, `coverage entry for ${checkId}`).toBeDefined();
      expect(entry?.status, `coverage status for ${checkId}`).toBe(status);
    }

    // Every check the fixture does not specify must be not_yet_available —
    // adding a new check requires updating every fixture's expectations.
    for (const entry of result.coverage) {
      if (!(entry.checkId in expected.coverage)) {
        expect(entry.status, `coverage status for ${entry.checkId}`).toBe(
          "not_yet_available",
        );
      }
    }
  });

  // U15: end-to-end golden coverage — fixtures that declare a verdict run the
  // engine output through the D10 router and assert the primary verdict.
  const verdictFixtures = fixtureDirs.filter((dir) => loadFixture(dir).expected.verdict);
  it.each(verdictFixtures)("fixture %s routes to the expected verdict", (dir) => {
    const { input, refs, expected } = loadFixture(dir);
    const result = runEngine(input, referenceDataFromJson(refs));
    const routed = routeVerdict({
      itemized: input.itemized,
      flags: expected.flags ?? {},
      findings: result.findings.map((f) => ({
        checkId: f.checkId,
        confidenceTier: f.confidenceTier,
        amountImpactCents: f.amountImpactCents,
      })),
      coverage: result.coverage,
    });
    expect(routed.primary).toBe(expected.verdict);
  });

  it("covers the V0 verdict matrix across fixtures", () => {
    const verdicts = new Set(verdictFixtures.map((dir) => loadFixture(dir).expected.verdict));
    // The honesty-critical verdicts must each appear in at least one fixture.
    for (const v of ["CONTEST", "PAY", "GET_ITEMIZED", "REJECT", "REDUCE"] as const) {
      expect(verdicts, `matrix missing ${v}`).toContain(v);
    }
  });
});
