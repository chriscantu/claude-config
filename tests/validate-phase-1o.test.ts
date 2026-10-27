import { describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REPO, runPhase, useFixtures } from "./validate-harness";

// Regression tests for validate.fish Phase 1o (eval substrate field).
//
// Phase 1o asserts:
//   - tests/evals-lib.ts contains `additional_context?: string` (substrate contract)
//
// Tests:
//   A) Real repo → Phase 1o passes
//   D) evals-lib.ts missing additional_context → FAIL with "additional_context"

// Build a minimal fixture containing only the files Phase 1o needs.
// runPhase runs Phase 1o alone, so other phases never see this sparse fixture.
const makeMinFixture = useFixtures("validate-phase-1o-", ["rules", "skills", "agents", "commands", "adrs", "hooks", "bin", "tests"]);

const seedPhase1oArtifacts = (dir: string): void => {
  const realEvalsLib = readFileSync(join(REPO, "tests", "evals-lib.ts"), "utf8");
  writeFileSync(join(dir, "tests", "evals-lib.ts"), realEvalsLib);
};

describe("validate.fish Phase 1o (eval substrate field)", () => {
  test("A: real repo artifacts present → Phase 1o passes", () => {
    const fixture = makeMinFixture();
    seedPhase1oArtifacts(fixture);
    const out = runPhase(fixture, "1o").block;
    expect(out).not.toContain("✗");
    expect(out).toContain("Eval.additional_context present");
  });

  test("D: evals-lib.ts missing additional_context → FAIL with additional_context message", () => {
    const fixture = makeMinFixture();
    seedPhase1oArtifacts(fixture);
    // Remove the additional_context field declaration from evals-lib.ts
    const evalsLib = readFileSync(join(fixture, "tests", "evals-lib.ts"), "utf8");
    const patched = evalsLib.replace(/\s*additional_context\?\s*:\s*string;?/g, "");
    expect(patched).not.toBe(evalsLib); // Guard: patch must have changed something
    writeFileSync(join(fixture, "tests", "evals-lib.ts"), patched);
    const out = runPhase(fixture, "1o").block;
    expect(out).toMatch(/additional_context/i);
    expect(out).toContain("✗");
  });
});
