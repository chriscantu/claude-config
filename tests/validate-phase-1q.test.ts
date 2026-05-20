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

// Regression tests for validate.fish Phase 1q (retirement signals).
//
// Phase 1q has three checks (issue #352 Stream 3):
//   1. Tombstone format (HARD-FAIL) — every commented `# function _phase_`
//      block must carry a preceding tombstone with date + reason + restore
//      hint. Catches a soft-retire that didn't leave an audit trail.
//   2. Retirement candidate (WARN) — an active phase with 0 firings in the
//      last 100 log entries (silent when log <10 entries to avoid noise on
//      a freshly-bootstrapped log).
//   3. Hard-delete eligible (WARN) — a tombstone aged ≥12 months. Operator
//      can then delete the commented block + test file per the governance
//      H2 in rules/README.md.
//
// Phase 1q reads `$repo_dir/validate.fish` for tombstones AND for the
// active-phase list (derived from `_phase_begin "<id>"` markers); fixtures
// inject a synthetic validate.fish to drive each check independently of the
// real script's content.
//
// Issue #352, plan docs/superpowers/plans/2026-05-18-rules-layer-bloat-prune.md
// (Commit 4). Phase numbered 1q rather than 1p (issue body's '1p') because
// Phase 1p slot was taken by PR #361 (rules-evals suite inventory).

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

const extractPhase1q = (r: RunResult): string => {
  const combined = `${r.stdout}\n${r.stderr}`;
  const lines = combined.split("\n");
  const headerIdx = lines.findIndex((line) => line.includes("── Phase 1q"));
  if (headerIdx < 0) {
    throw new Error(
      `Phase 1q header not found — phase may not be implemented yet.\n--- stdout ---\n${r.stdout}\n--- stderr ---\n${r.stderr}`,
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

// Build a minimal fixture: empty subdirs for earlier phases (they fail
// silently — we only care about Phase 1q output) + a synthetic validate.fish
// + optional state log. validate.fish is the only file Phase 1q reads.
const makeFixture = (
  validateFishContent: string,
  logContent: string | null = null,
): string => {
  const dir = mkdtempSync(join(tmpdir(), "validate-phase-1q-"));
  fixtures.push(dir);
  for (const sub of ["rules", "skills", "agents", "commands", "adrs", "hooks", "bin", "tests"]) {
    mkdirSync(join(dir, sub), { recursive: true });
  }
  writeFileSync(join(dir, "validate.fish"), validateFishContent);
  if (logContent !== null) {
    mkdirSync(join(dir, ".claude/state"), { recursive: true });
    writeFileSync(
      join(dir, ".claude/state/validate-phase-log.jsonl"),
      logContent,
    );
  }
  return dir;
};

// Build a synthetic validate.fish with the given list of active phase IDs
// (rendered as `_phase_begin "<id>"` markers) and an optional raw appendix
// (used to inject tombstones / commented function blocks verbatim).
const synthValidate = (activeIds: string[], appendix = ""): string => {
  const markers = activeIds.map((id) => `_phase_begin "${id}"`).join("\n");
  return `#!/usr/bin/env fish\n# Synthetic validate.fish for Phase 1q fixture\n${markers}\n${appendix}\n`;
};

// Build a synthetic JSONL log: `n` entries, all firing the same `phaseId`.
const synthLog = (n: number, phaseId: string): string => {
  const lines: string[] = [];
  for (let i = 0; i < n; i++) {
    lines.push(
      `{"ts":"2026-05-10T00:00:00Z","commit":"abc1234","phase":"${phaseId}","status":"pass","duration_ms":0}`,
    );
  }
  return lines.join("\n") + (lines.length > 0 ? "\n" : "");
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

describe("validate.fish Phase 1q (retirement signals)", () => {
  test("A: log with 0-firing active phase emits retirement-candidate WARN", () => {
    // Active phases per synthetic validate.fish: 1a, 1b, 1z. Log has 100
    // entries all firing 1a (other phases never fire). Expect WARN for 1b
    // and 1z but not for 1a.
    const fixture = makeFixture(
      synthValidate(["1a", "1b", "1z"]),
      synthLog(100, "1a"),
    );
    const out = extractPhase1q(runValidate(fixture));
    expect(out).toMatch(/phase 1b has 0 firings/);
    expect(out).toMatch(/phase 1z has 0 firings/);
    expect(out).not.toMatch(/phase 1a has 0 firings/);
  });

  test("B: tombstoned phase ≥12mo old emits hard-delete WARN", () => {
    const oldTombstone = [
      "# RETIRED 2024-01-01 — synthetic stale tombstone for Phase 1q test",
      "# Restore: uncomment block + drop .skip on tests/validate-phase-1y.test.ts",
      "# function _phase_1y",
      "# end",
    ].join("\n");
    // Empty log (or no log) means Check 2 stays silent; Check 3 still fires
    // on the tombstone-age signal alone.
    const fixture = makeFixture(synthValidate(["1a"], oldTombstone), "");
    const out = extractPhase1q(runValidate(fixture));
    expect(out).toMatch(/tombstone 2024-01-01 is ≥12mo old/);
    expect(out).toMatch(/hard-delete eligible/);
  });

  test("C: commented `# function _phase_` without tombstone HARD-FAILs", () => {
    // No `# RETIRED YYYY-MM-DD` line preceding the commented function —
    // means a soft-retire shipped without an audit trail. Phase 1q must
    // fail and exit non-zero.
    const orphanFunc = [
      "# accidentally-commented function with no tombstone",
      "# function _phase_1z",
      "# end",
    ].join("\n");
    const fixture = makeFixture(synthValidate(["1a"], orphanFunc), null);
    const r = runValidate(fixture);
    const out = extractPhase1q(r);
    expect(out).toContain("✗");
    expect(out).toMatch(/missing tombstone|RETIRED YYYY-MM-DD/);
    expect(r.exitCode).not.toBe(0);
  });

  test("D: log with <10 entries is silent (no retirement-candidate WARN)", () => {
    // 5 entries — below the threshold that triggers Check 2. Even though
    // 1b and 1z never fire, no retirement-candidate WARN should appear.
    const fixture = makeFixture(
      synthValidate(["1a", "1b", "1z"]),
      synthLog(5, "1a"),
    );
    const out = extractPhase1q(runValidate(fixture));
    expect(out).not.toMatch(/retirement candidate/);
    expect(out).not.toMatch(/has 0 firings/);
  });
});
