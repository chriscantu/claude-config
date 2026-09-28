import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { runPhase, useFixtures } from "./validate-harness";

// Regression tests for validate.fish Phase 1t (per-rule LOC ceiling, issue #443).
//
// Substrate-cost prevention: every HARD-GATE rule under rules/ pre-loads on
// every prompt. Without a ceiling, accretion drifts silently and compresses
// only reactively (#435, #440). Phase 1t fails CI when any loadable rule
// breaches 250 LOC, forcing decompose-or-split before merge.
//
// Scope: rules/*.md EXCLUDING README.md and GOVERNANCE.md (per GOVERNANCE
// "NOT symlinked into ~/.claude/rules/" — repo-internal docs, not
// per-prompt substrate).
//
// Tests:
//   A) Rule at ceiling (250 LOC) → passes
//   B) Rule over ceiling (251 LOC) → hard fails
//   C) Rule well under ceiling → passes
//   D) README.md and GOVERNANCE.md over ceiling → exempt, no fail
//   E) Zero-state: empty rules/ → loud fail (no rules to scan)
//   F) Mixed: one passing rule + one over → only the offender fails

const makeRepoFixture = useFixtures("validate-phase-1t-", ["rules", "skills", "agents", "commands", "adrs", "hooks", "bin", "tests"]);

const seedRule = (repo: string, name: string, lineCount: number): string => {
  const path = join(repo, "rules", `${name}.md`);
  const frontmatter = `---\ndescription: stub for Phase 1t fixture\n---\n`;
  // frontmatter = 3 lines. Pad body to total exactly lineCount.
  const bodyLines = Math.max(0, lineCount - 3);
  const body = bodyLines > 0 ? Array(bodyLines).fill("line").join("\n") + "\n" : "";
  writeFileSync(path, frontmatter + body);
  return path;
};

describe("validate.fish Phase 1t (per-rule LOC ceiling, issue #443)", () => {
  test("A: rule at ceiling (250 LOC) → passes", () => {
    const repo = makeRepoFixture();
    seedRule(repo, "at-ceiling", 250);
    const out = runPhase(repo, "1t").block;
    expect(out).toMatch(/✓.*at-ceiling.*250.*\/250/);
    expect(out).not.toMatch(/✗.*at-ceiling/);
  });

  test("B: rule over ceiling (251 LOC) → hard fail with LOC + ceiling cite", () => {
    const repo = makeRepoFixture();
    seedRule(repo, "bloated", 251);
    const result = runPhase(repo, "1t");
    const out = result.block;
    expect(out).toMatch(/✗.*bloated.*251.*250/);
    expect(out).toMatch(/decompose|split/);
    expect(result.exitCode).toBe(1);
  });

  test("C: rule well under ceiling → passes", () => {
    const repo = makeRepoFixture();
    seedRule(repo, "lean", 50);
    const out = runPhase(repo, "1t").block;
    expect(out).toMatch(/✓.*lean.*50.*\/250/);
  });

  test("D: README.md and GOVERNANCE.md over ceiling → exempt", () => {
    const repo = makeRepoFixture();
    seedRule(repo, "README", 500);
    seedRule(repo, "GOVERNANCE", 500);
    seedRule(repo, "real-rule", 100);
    const out = runPhase(repo, "1t").block;
    expect(out).not.toMatch(/✗.*README/);
    expect(out).not.toMatch(/✗.*GOVERNANCE/);
    expect(out).toMatch(/✓.*real-rule/);
  });

  test("E: empty rules/ → loud fail (no rules to scan)", () => {
    const repo = makeRepoFixture();
    const result = runPhase(repo, "1t");
    const out = result.block;
    expect(out).toMatch(/✗.*Phase 1t.*no loadable rules/);
  });

  test("F: mixed clean + over → only offender fails", () => {
    const repo = makeRepoFixture();
    seedRule(repo, "clean", 100);
    seedRule(repo, "over", 300);
    const out = runPhase(repo, "1t").block;
    expect(out).toMatch(/✓.*clean.*100.*\/250/);
    expect(out).toMatch(/✗.*over.*300.*250/);
  });
});
