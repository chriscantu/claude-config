import { describe, expect, test } from "bun:test";
import { chmodSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REPO, runPhase, useFixtures } from "./validate-harness";

// Regression tests for validate.fish Phase 1o (scope-tier hook artifacts).
//
// Phase 1o asserts:
//   - hooks/scope-tier-memory-check.sh exists in the repo
//   - hooks/scope-tier-memory-check.sh is executable
//   - tests/evals-lib.ts contains `additional_context?: string` (substrate contract)
//
// Tests:
//   A) Real repo → Phase 1o passes on all checks
//   B) Hook file deleted → FAIL with "missing" message
//   C) Hook not executable → FAIL with "not executable"
//   D) evals-lib.ts missing additional_context → FAIL with "additional_context"

// Build a minimal fixture containing only the files Phase 1o needs.
// runPhase runs Phase 1o alone, so other phases never see this sparse fixture.
const makeMinFixture = useFixtures("validate-phase-1o-", ["rules", "skills", "agents", "commands", "adrs", "hooks", "bin", "tests"]);

// Copy the real hook, installer, and evals-lib into a fixture dir.
const seedPhase1oArtifacts = (dir: string): void => {
  const realHook = readFileSync(join(REPO, "hooks", "scope-tier-memory-check.sh"));
  const hookDest = join(dir, "hooks", "scope-tier-memory-check.sh");
  writeFileSync(hookDest, realHook);
  chmodSync(hookDest, 0o755);

  const realInstaller = readFileSync(join(REPO, "bin", "install-scope-tier-hook.fish"));
  const installerDest = join(dir, "bin", "install-scope-tier-hook.fish");
  writeFileSync(installerDest, realInstaller);
  chmodSync(installerDest, 0o755);

  const realEvalsLib = readFileSync(join(REPO, "tests", "evals-lib.ts"), "utf8");
  writeFileSync(join(dir, "tests", "evals-lib.ts"), realEvalsLib);
};

describe("validate.fish Phase 1o (scope-tier hook artifacts)", () => {
  test("A: real repo artifacts present → Phase 1o passes", () => {
    const fixture = makeMinFixture();
    seedPhase1oArtifacts(fixture);
    const out = runPhase(fixture, "1o").block;
    expect(out).not.toContain("✗");
    expect(out).toContain("scope-tier-memory-check.sh present");
    expect(out).toContain("Eval.additional_context present");
  });

  test("B: hook file deleted → FAIL with missing message", () => {
    const fixture = makeMinFixture();
    seedPhase1oArtifacts(fixture);
    unlinkSync(join(fixture, "hooks", "scope-tier-memory-check.sh"));
    const out = runPhase(fixture, "1o").block;
    expect(out).toMatch(/scope-tier-memory-check\.sh.*missing/i);
  });

  test("C: hook not executable → FAIL with not-executable message", () => {
    const fixture = makeMinFixture();
    seedPhase1oArtifacts(fixture);
    chmodSync(join(fixture, "hooks", "scope-tier-memory-check.sh"), 0o644);
    const out = runPhase(fixture, "1o").block;
    expect(out).toMatch(/not executable/i);
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
