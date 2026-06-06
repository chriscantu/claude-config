import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

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

const extractPhase1w = (r: RunResult): string => {
  const combined = `${r.stdout}\n${r.stderr}`;
  const lines = combined.split("\n");
  const headerIdx = lines.findIndex((line) =>
    line.includes("── Phase 1w: eval suite name collision"),
  );
  if (headerIdx < 0) {
    throw new Error(
      `Phase 1w header not found.\n--- stdout ---\n${r.stdout}\n--- stderr ---\n${r.stderr}`,
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
  const dir = mkdtempSync(join(tmpdir(), "validate-phase-1w-"));
  for (const sub of [
    "rules",
    "skills",
    "rules-evals",
    "agents",
    "commands",
    "adrs",
    "hooks",
    "bin",
    "tests",
  ]) {
    mkdirSync(join(dir, sub), { recursive: true });
  }
  fixtures.push(dir);
  return dir;
};

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
      console.error(`afterEach: rmSync failed for ${dir}: ${(e as Error).message}`);
    }
  }
});

describe("validate.fish Phase 1w (eval suite name collision, #462)", () => {
  test("A: same name under both roots → hard fail + exit 1", () => {
    const repo = makeRepoFixture();
    seedSuite(repo, "skills", "shared-name");
    seedSuite(repo, "rules-evals", "shared-name");
    const result = runValidate(repo);
    const out = extractPhase1w(result);
    expect(out).toMatch(/✗.*shared-name.*both skills\/ and rules-evals\//);
    expect(out).toMatch(/collision/);
    expect(result.exitCode).toBe(1);
  });

  test("B: unique names across roots → pass, no collision", () => {
    const repo = makeRepoFixture();
    seedSuite(repo, "skills", "skill-suite");
    seedSuite(repo, "rules-evals", "rule-suite");
    const out = extractPhase1w(runValidate(repo));
    expect(out).toMatch(/✓.*no eval suite name collisions/);
    expect(out).not.toMatch(/✗.*collision/);
  });

  test("C: no eval suites under either root → pass (no collision possible)", () => {
    const repo = makeRepoFixture();
    const out = extractPhase1w(runValidate(repo));
    expect(out).toMatch(/✓.*no eval suites under either root/);
    expect(out).not.toMatch(/✗/);
  });

  test("D: same dir name but only one root has evals/evals.json → not a collision", () => {
    const repo = makeRepoFixture();
    seedSuite(repo, "skills", "half-present");
    seedBareDir(repo, "rules-evals", "half-present");
    const out = extractPhase1w(runValidate(repo));
    expect(out).toMatch(/✓.*no eval suite name collisions/);
    expect(out).not.toMatch(/✗.*half-present.*collision/);
  });
});
