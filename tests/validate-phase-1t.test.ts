import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

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

const REPO = resolve(import.meta.dir, "..");
const VALIDATE = join(REPO, "validate.fish");

type RunResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

const runValidate = (fixture: string): RunResult => {
  const result = spawnSync("fish", [VALIDATE], {
    env: { ...process.env, CLAUDE_CONFIG_REPO_DIR: fixture },
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  return {
    exitCode: result.status ?? -1,
    stdout: result.stdout,
    stderr: result.stderr,
  };
};

const extractPhase1t = (r: RunResult): string => {
  const combined = `${r.stdout}\n${r.stderr}`;
  const lines = combined.split("\n");
  const headerIdx = lines.findIndex((line) =>
    line.includes("── Phase 1t: per-rule LOC ceiling"),
  );
  if (headerIdx < 0) {
    throw new Error(
      `Phase 1t header not found.\n--- stdout ---\n${r.stdout}\n--- stderr ---\n${r.stderr}`,
    );
  }
  const slice: string[] = [];
  for (let i = headerIdx; i < lines.length; i++) {
    slice.push(lines[i]);
    if (i > headerIdx && lines[i] === "") break;
  }
  return slice.join("\n");
};

const fixtures: string[] = [];

const makeRepoFixture = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "validate-phase-1t-"));
  for (const sub of ["rules", "skills", "agents", "commands", "adrs", "hooks", "bin", "tests"]) {
    mkdirSync(join(dir, sub), { recursive: true });
  }
  fixtures.push(dir);
  return dir;
};

const seedRule = (repo: string, name: string, lineCount: number): string => {
  const path = join(repo, "rules", `${name}.md`);
  const frontmatter = `---\ndescription: stub for Phase 1t fixture\n---\n`;
  // frontmatter = 3 lines. Pad body to total exactly lineCount.
  const bodyLines = Math.max(0, lineCount - 3);
  const body = bodyLines > 0 ? Array(bodyLines).fill("line").join("\n") + "\n" : "";
  writeFileSync(path, frontmatter + body);
  return path;
};

const TMP_PREFIX = tmpdir();

afterEach(() => {
  while (fixtures.length > 0) {
    const dir = fixtures.pop()!;
    if (!dir.startsWith(TMP_PREFIX)) {
      console.error(`afterEach: refusing to clean non-tmp path ${dir}`);
      continue;
    }
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch (e) {
      console.error(
        `afterEach: rmSync failed for ${dir}: ${(e as Error).message}`,
      );
    }
  }
});

describe("validate.fish Phase 1t (per-rule LOC ceiling, issue #443)", () => {
  test("A: rule at ceiling (250 LOC) → passes", () => {
    const repo = makeRepoFixture();
    seedRule(repo, "at-ceiling", 250);
    const out = extractPhase1t(runValidate(repo));
    expect(out).toMatch(/✓.*at-ceiling.*250.*\/250/);
    expect(out).not.toMatch(/✗.*at-ceiling/);
  });

  test("B: rule over ceiling (251 LOC) → hard fail with LOC + ceiling cite", () => {
    const repo = makeRepoFixture();
    seedRule(repo, "bloated", 251);
    const result = runValidate(repo);
    const out = extractPhase1t(result);
    expect(out).toMatch(/✗.*bloated.*251.*250/);
    expect(out).toMatch(/decompose|split/);
    expect(result.exitCode).toBe(1);
  });

  test("C: rule well under ceiling → passes", () => {
    const repo = makeRepoFixture();
    seedRule(repo, "lean", 50);
    const out = extractPhase1t(runValidate(repo));
    expect(out).toMatch(/✓.*lean.*50.*\/250/);
  });

  test("D: README.md and GOVERNANCE.md over ceiling → exempt", () => {
    const repo = makeRepoFixture();
    seedRule(repo, "README", 500);
    seedRule(repo, "GOVERNANCE", 500);
    seedRule(repo, "real-rule", 100);
    const out = extractPhase1t(runValidate(repo));
    expect(out).not.toMatch(/✗.*README/);
    expect(out).not.toMatch(/✗.*GOVERNANCE/);
    expect(out).toMatch(/✓.*real-rule/);
  });

  test("E: empty rules/ → loud fail (no rules to scan)", () => {
    const repo = makeRepoFixture();
    const result = runValidate(repo);
    const out = extractPhase1t(result);
    expect(out).toMatch(/✗.*Phase 1t.*no loadable rules/);
  });

  test("F: mixed clean + over → only offender fails", () => {
    const repo = makeRepoFixture();
    seedRule(repo, "clean", 100);
    seedRule(repo, "over", 300);
    const out = extractPhase1t(runValidate(repo));
    expect(out).toMatch(/✓.*clean.*100.*\/250/);
    expect(out).toMatch(/✗.*over.*300.*250/);
  });
});
