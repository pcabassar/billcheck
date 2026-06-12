import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runEngine, type EngineInput } from "../src/run";
import type { Finding } from "@billcheck/shared";

/**
 * Golden-case eval harness (plan U8/U15, non-negotiable per arch D2).
 * Each fixture dir contains input.json (EngineInput) and expected.json
 * ({ findings: Finding[] }). Expected findings are computed BY HAND from the
 * reference tables — never captured from engine output (plan, review A5).
 * CI fails on any regression.
 */

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

const fixtureDirs = readdirSync(FIXTURES_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

describe("engine golden fixtures", () => {
  it("has at least one fixture", () => {
    expect(fixtureDirs.length).toBeGreaterThan(0);
  });

  it.each(fixtureDirs)("fixture %s produces expected findings", (dir) => {
    const input = JSON.parse(
      readFileSync(join(FIXTURES_DIR, dir, "input.json"), "utf8"),
    ) as EngineInput;
    const expected = JSON.parse(
      readFileSync(join(FIXTURES_DIR, dir, "expected.json"), "utf8"),
    ) as { findings: Finding[] };

    const result = runEngine(input);

    expect(result.findings).toEqual(expected.findings);
    // Coverage map must always account for every check, in any state.
    expect(result.coverage).toHaveLength(13);
  });
});
