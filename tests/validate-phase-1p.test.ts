import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Regression tests for validate.fish Phase 1p (rules-evals/README.md suite
// inventory).
//
// Phase 1p closes the silent-failure mode where a new suite under
// rules-evals/<name>/ ships without a corresponding bullet in
// rules-evals/README.md "Current suites:" list. Bidirectional check: every
// on-disk dir must have a bullet, every bullet must resolve to a dir.
//
// Tests:
//   A) README bullets match on-disk dirs → pass
//   B) On-disk dir without README bullet → FAIL with "missing from README.md"
//   C) README bullet without on-disk dir → FAIL with "no such directory exists"
//   D) Zero-state: rules-evals/ absent entirely → documented pass, no fail
//   E) rules-evals/ exists but README.md missing → FAIL
//
// Issue #361 (adjacent README backfill), ADR #0012 (TS-native test).

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

const extractPhase1p = (r: RunResult): string => {
  const combined = `${r.stdout}\n${r.stderr}`;
  const lines = combined.split("\n");
  const headerIdx = lines.findIndex((line) => line.includes("── Phase 1p"));
  if (headerIdx < 0) {
    throw new Error(
      `Phase 1p header not found in validate.fish output — phase may not be implemented yet.\n--- stdout ---\n${r.stdout}\n--- stderr ---\n${r.stderr}`,
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
const TMP_PREFIX = tmpdir();

const makeMinFixture = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "validate-phase-1p-"));
  fixtures.push(dir);
  for (const sub of ["rules", "skills", "agents", "commands", "adrs", "hooks", "bin", "tests"]) {
    mkdirSync(join(dir, sub), { recursive: true });
  }
  return dir;
};

const seedRulesEvals = (
  fixture: string,
  suites: string[],
  readmeBullets: string[],
): void => {
  const dir = join(fixture, "rules-evals");
  mkdirSync(dir, { recursive: true });
  for (const s of suites) {
    const suiteDir = join(dir, s, "evals");
    mkdirSync(suiteDir, { recursive: true });
    writeFileSync(
      join(suiteDir, "evals.json"),
      JSON.stringify({ skill: s, evals: [] }),
    );
  }
  const body = [
    "# Rules-layer evals",
    "",
    "Current suites:",
    "",
    ...readmeBullets.map((b) => `- \`${b}/\` — covers behavior X`),
    "",
  ].join("\n");
  writeFileSync(join(dir, "README.md"), body);
};

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

describe("validate.fish Phase 1p (rules-evals README suite inventory)", () => {
  test("A: README bullets match on-disk dirs → pass", () => {
    const fixture = makeMinFixture();
    seedRulesEvals(fixture, ["alpha", "beta"], ["alpha", "beta"]);
    const out = extractPhase1p(runValidate(fixture));
    expect(out).not.toContain("✗");
    expect(out).toMatch(/suite list matches on-disk dirs \(2 suites\)/);
  });

  test("B: on-disk dir without README bullet → FAIL with missing-from-README", () => {
    const fixture = makeMinFixture();
    seedRulesEvals(fixture, ["alpha", "beta", "gamma"], ["alpha", "beta"]);
    const out = extractPhase1p(runValidate(fixture));
    expect(out).toContain("✗");
    expect(out).toMatch(/rules-evals\/gamma\/ exists on disk but missing from README\.md/);
  });

  test("C: README bullet without on-disk dir → FAIL with no-such-directory", () => {
    const fixture = makeMinFixture();
    seedRulesEvals(fixture, ["alpha"], ["alpha", "ghost"]);
    const out = extractPhase1p(runValidate(fixture));
    expect(out).toContain("✗");
    expect(out).toMatch(/lists 'ghost\/' but no such directory exists/);
  });

  test("D: rules-evals/ absent → documented zero-state pass", () => {
    const fixture = makeMinFixture();
    const out = extractPhase1p(runValidate(fixture));
    expect(out).not.toContain("✗");
    expect(out).toMatch(/no rules-evals\/ directory.*Phase 1p has nothing to validate/);
  });

  test("E: rules-evals/ exists but README.md missing → FAIL", () => {
    const fixture = makeMinFixture();
    const dir = join(fixture, "rules-evals", "alpha", "evals");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "evals.json"), JSON.stringify({ skill: "alpha", evals: [] }));
    const out = extractPhase1p(runValidate(fixture));
    expect(out).toContain("✗");
    expect(out).toMatch(/README\.md missing/);
  });
});
