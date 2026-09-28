import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runPhase, useFixtures } from "./validate-harness";

// Regression tests for validate.fish Phase 1w (eval suite name collision, #462).
//
// The eval runner (tests/eval-runner-v2.ts) discovers suites from two roots —
// skills/<name>/evals/evals.json and rules-evals/<name>/evals/evals.json — and
// exits 1 if the same <name> exists under both. validate.fish Phase 1m only
// checks each evals.json's JSON shape, not cross-root name uniqueness, so a
// collision passed CI green then crashed the runner (the #424 gap). Phase 1w
// replicates discoverSkills' domain (a directory under either root containing
// evals/evals.json) and fails on any name present under both.
//
// Tests:
//   A) Same name under both roots (both have evals/evals.json) → hard fail + exit 1
//   B) Unique names across the two roots → pass, no collision
//   C) Zero-state: no eval suites under either root → pass ("no collision possible")
//   D) Same dir name in both roots but only one has evals/evals.json → not a
//      collision (mirrors discoverSkills requiring the file) → pass

const makeRepoFixture = useFixtures("validate-phase-1w-", ["rules", "skills", "rules-evals", "agents", "commands", "adrs", "hooks", "bin", "tests"]);

// Seed a suite directory with evals/evals.json under skills/ or rules-evals/.
const seedSuite = (repo: string, root: "skills" | "rules-evals", name: string): void => {
  const evalsDir = join(repo, root, name, "evals");
  mkdirSync(evalsDir, { recursive: true });
  const file = { skill: name, evals: [{ name: "case", prompt: "p", assertions: ["a"] }] };
  writeFileSync(join(evalsDir, "evals.json"), JSON.stringify(file));
};

// Seed a bare directory (no evals/evals.json) under a root — present on disk but
// invisible to discoverSkills.
const seedBareDir = (repo: string, root: "skills" | "rules-evals", name: string): void => {
  mkdirSync(join(repo, root, name), { recursive: true });
};

describe("validate.fish Phase 1w (eval suite name collision, #462)", () => {
  test("A: same name under both roots → hard fail + exit 1", () => {
    const repo = makeRepoFixture();
    seedSuite(repo, "skills", "shared-name");
    seedSuite(repo, "rules-evals", "shared-name");
    const result = runPhase(repo, "1w");
    const out = result.block;
    expect(out).toMatch(/✗.*shared-name.*both skills\/ and rules-evals\//);
    expect(out).toMatch(/collision/);
    expect(result.exitCode).toBe(1);
  });

  test("B: unique names across roots → pass, no collision", () => {
    const repo = makeRepoFixture();
    seedSuite(repo, "skills", "skill-suite");
    seedSuite(repo, "rules-evals", "rule-suite");
    const out = runPhase(repo, "1w").block;
    expect(out).toMatch(/✓.*no eval suite name collisions/);
    expect(out).not.toMatch(/✗.*collision/);
  });

  test("C: no eval suites under either root → pass (no collision possible)", () => {
    const repo = makeRepoFixture();
    const out = runPhase(repo, "1w").block;
    expect(out).toMatch(/✓.*no eval suites under either root/);
    expect(out).not.toMatch(/✗/);
  });

  test("D: same dir name but only one root has evals/evals.json → not a collision", () => {
    const repo = makeRepoFixture();
    seedSuite(repo, "skills", "half-present");
    seedBareDir(repo, "rules-evals", "half-present");
    const out = runPhase(repo, "1w").block;
    expect(out).toMatch(/✓.*no eval suite name collisions/);
    expect(out).not.toMatch(/✗.*half-present.*collision/);
  });
});
