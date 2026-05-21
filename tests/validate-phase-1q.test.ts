import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
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
    // Test H chmods the fixture's validate.fish to 000 to force a grep
    // I/O error; restore perms before rmSync so cleanup doesn't fail.
    const restore = spawnSync("chmod", ["-R", "u+rw", dir], { encoding: "utf8" });
    if (restore.error) {
      console.error(`afterEach: chmod failed for ${dir}: ${restore.error.message}`);
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
    // Compute date 13 months back at test-runtime instead of hard-coding —
    // a hard-coded date eventually stops being ≥12mo old in the past or
    // becomes confusing in commit archaeology. ~395 days = safely past
    // the 31536000s (≈365d) threshold Phase 1q uses.
    const staleDate = new Date(Date.now() - 395 * 86400 * 1000)
      .toISOString()
      .slice(0, 10);
    const oldTombstone = [
      `# RETIRED ${staleDate} — synthetic stale tombstone for Phase 1q test`,
      "# Restore: uncomment block + drop .skip on tests/validate-phase-1y.test.ts",
      "# function _phase_1y",
      "# end",
    ].join("\n");
    // Empty log (or no log) means Check 2 stays silent; Check 3 still fires
    // on the tombstone-age signal alone.
    const fixture = makeFixture(synthValidate(["1a"], oldTombstone), "");
    const out = extractPhase1q(runValidate(fixture));
    expect(out).toMatch(
      new RegExp(`tombstone ${staleDate} is ≥12mo old`),
    );
    expect(out).toMatch(/hard-delete eligible/);
  });

  test("C: commented `# function _phase_` without tombstone HARD-FAILs", () => {
    // Three orphan funcs verify the loop emits one fail per missing
    // tombstone — catches a future refactor that early-exits after the
    // first fail. Mirrors Phase 1p Test B / C pattern.
    const orphanFuncs = [
      "# accidentally-commented function with no tombstone",
      "# function _phase_1z",
      "# end",
      "",
      "# another orphan",
      "# function _phase_2a",
      "# end",
      "",
      "# third orphan",
      "# function _phase_2b",
      "# end",
    ].join("\n");
    const fixture = makeFixture(synthValidate(["1a"], orphanFuncs), null);
    const r = runValidate(fixture);
    const out = extractPhase1q(r);
    expect(out).toContain("✗");
    // Count fail lines for missing-tombstone — must be ≥3.
    const failMatches = out.match(/missing tombstone/g) ?? [];
    expect(failMatches.length).toBeGreaterThanOrEqual(3);
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

  test("E: properly-tombstoned commented `# function _phase_` PASSES Check 1", () => {
    // Positive case for Check 1. Pins the intended invariant: a soft-retire
    // with valid tombstone + Restore line MUST NOT trigger HARD-FAIL on
    // tombstone format. Regression guard for the original `echo $preamble
    // | grep` bug where fish space-joined the preamble list and broke the
    // `^# RETIRED` anchor — every real tombstone falsely HARD-FAILed.
    const tombstoned = [
      "# RETIRED 2025-06-01 — synthetic retire for Check 1 positive test",
      "# Restore: uncomment block + drop .skip on tests/validate-phase-1y.test.ts",
      "# function _phase_1y",
      "# end",
    ].join("\n");
    const fixture = makeFixture(synthValidate(["1a"], tombstoned), null);
    const out = extractPhase1q(runValidate(fixture));
    expect(out).toContain("tombstone format OK");
    expect(out).not.toMatch(/missing tombstone/);
    expect(out).not.toMatch(/missing `# Restore:`/);
  });

  test("F: tombstone with date but missing Restore line fires Restore-only fail", () => {
    // Distinct branch in Check 1: RETIRED line present, Restore line absent.
    // Catches a future refactor that collapses the two branches or drops the
    // `# Restore:` regex entirely.
    const restoreless = [
      "# RETIRED 2025-06-01 — tombstone missing Restore hint",
      "# function _phase_1y",
      "# end",
    ].join("\n");
    const fixture = makeFixture(synthValidate(["1a"], restoreless), null);
    const r = runValidate(fixture);
    const out = extractPhase1q(r);
    expect(out).toContain("✗");
    expect(out).toMatch(/missing `# Restore:`/);
    expect(out).not.toMatch(/missing tombstone/);
    expect(r.exitCode).not.toBe(0);
  });

  test("G: --log-path overrides default; Phase 1q reader honors the override", () => {
    // Reader/writer path symmetry: a custom --log-path must be readable by
    // Phase 1q Check 2. Hardcoded default in Phase 1q would silently no-op
    // when the user logs elsewhere. Active phase IDs are intentionally
    // non-colliding ("alpha"/"beta") so the writer's own appends (which use
    // real phase IDs 1a..1q) cannot pollute the recent-window check.
    const fixture = makeFixture(synthValidate(["alpha", "beta"]));
    const customLog = join(fixture, "custom-phase-log.jsonl");
    writeFileSync(customLog, synthLog(100, "alpha"));
    const result = spawnSync("fish", [VALIDATE, "--log-path", customLog], {
      env: { ...process.env, CLAUDE_CONFIG_REPO_DIR: fixture },
      encoding: "utf8",
    });
    if (result.error) throw result.error;
    const r: RunResult = {
      exitCode: result.status ?? -1,
      stdout: result.stdout,
      stderr: result.stderr,
    };
    const out = extractPhase1q(r);
    expect(out).toMatch(/phase beta has 0 firings/);
    expect(out).not.toMatch(/phase alpha has 0 firings/);
  });

  // H: chmod restrictions don't apply to root. spawnSync as root would
  // still read the file regardless of mode bits — skip the test there.
  const skipIfRoot =
    typeof process.getuid === "function" && process.getuid() === 0;
  (skipIfRoot ? test.skip : test)(
    "H: grep I/O error on unreadable validate.fish HARD-FAILs Check 1",
    () => {
      // chmod 000 forces grep to return status 2 (open error). Phase 1q's
      // grep-status guard must catch this rather than silently treating
      // the file as having zero tombstones (false-negative).
      const fixture = makeFixture(synthValidate(["1a"]));
      chmodSync(join(fixture, "validate.fish"), 0o000);
      const r = runValidate(fixture);
      const out = extractPhase1q(r);
      expect(out).toContain("✗");
      expect(out).toMatch(/grep returned error status/);
      expect(r.exitCode).not.toBe(0);
    },
  );

  test("I: --log-path=value form is equivalent to space-separated form", () => {
    // Most CLIs accept both `--flag value` and `--flag=value`; supporting
    // only one is a footgun. Same fixture as Test G but invoked with the
    // `=` form.
    const fixture = makeFixture(synthValidate(["alpha", "beta"]));
    const customLog = join(fixture, "custom-phase-log.jsonl");
    writeFileSync(customLog, synthLog(100, "alpha"));
    const result = spawnSync("fish", [VALIDATE, `--log-path=${customLog}`], {
      env: { ...process.env, CLAUDE_CONFIG_REPO_DIR: fixture },
      encoding: "utf8",
    });
    if (result.error) throw result.error;
    const r: RunResult = {
      exitCode: result.status ?? -1,
      stdout: result.stdout,
      stderr: result.stderr,
    };
    const out = extractPhase1q(r);
    expect(out).toMatch(/phase beta has 0 firings/);
  });

  test("J: multiple stale tombstones each fire their own hard-delete WARN", () => {
    // Three stale tombstones verify Check 3 loop emits one WARN per
    // tombstone — catches a break-after-first refactor on Check 3 mirror
    // to Test C on Check 1.
    const staleDate = new Date(Date.now() - 395 * 86400 * 1000)
      .toISOString()
      .slice(0, 10);
    const otherStale = new Date(Date.now() - 500 * 86400 * 1000)
      .toISOString()
      .slice(0, 10);
    const thirdStale = new Date(Date.now() - 700 * 86400 * 1000)
      .toISOString()
      .slice(0, 10);
    const tombstones = [
      `# RETIRED ${staleDate} — first stale`,
      "# Restore: uncomment",
      "# function _phase_1y",
      "# end",
      "",
      `# RETIRED ${otherStale} — second stale`,
      "# Restore: uncomment",
      "# function _phase_2a",
      "# end",
      "",
      `# RETIRED ${thirdStale} — third stale`,
      "# Restore: uncomment",
      "# function _phase_2b",
      "# end",
    ].join("\n");
    const fixture = makeFixture(synthValidate(["1a"], tombstones), "");
    const out = extractPhase1q(runValidate(fixture));
    const warnMatches = out.match(/hard-delete eligible/g) ?? [];
    expect(warnMatches.length).toBeGreaterThanOrEqual(3);
  });

  test("K: regex-special-char in active phase ID is treated as literal", () => {
    // `1.q` is a legal `_phase_begin` ID (matches `[^"]+`) but its `.` is
    // a regex wildcard. Without grep -F, the recent-window check would
    // match log entries firing phase `1xq` (or any other `1<char>q`) as
    // if they were `1.q` firings → false-negative on the WARN. Test pins
    // grep -F (or equivalent literal-match) behavior.
    const activeIds = ["1.q", "1xq"];
    // Log fires only `1xq`, never the literal `1.q`. With proper literal
    // matching, `1.q` should be flagged as 0-firings.
    const log = synthLog(100, "1xq");
    const fixture = makeFixture(synthValidate(activeIds));
    const customLog = join(fixture, "custom-phase-log.jsonl");
    writeFileSync(customLog, log);
    const result = spawnSync("fish", [VALIDATE, "--log-path", customLog], {
      env: { ...process.env, CLAUDE_CONFIG_REPO_DIR: fixture },
      encoding: "utf8",
    });
    if (result.error) throw result.error;
    const r: RunResult = {
      exitCode: result.status ?? -1,
      stdout: result.stdout,
      stderr: result.stderr,
    };
    const out = extractPhase1q(r);
    expect(out).toMatch(/phase 1\.q has 0 firings/);
    expect(out).not.toMatch(/phase 1xq has 0 firings/);
  });

  test("L: corrupt log line containing literal `\"phase\":\"X\"` substring counts as firing", () => {
    // Phase 1q Check 2 uses literal-substring grep (-qF). A non-JSONL
    // line that happens to contain the bytes `"phase":"1b"` is treated
    // as a 1b firing. This is the known trade-off vs. proper JSON
    // parsing (jq dependency). Test PINS the behavior so a future
    // refactor doesn't silently change it without acknowledging the
    // change.
    const goodLines = Array.from({ length: 99 }, () =>
      `{"ts":"2026-05-10T00:00:00Z","commit":"abc","phase":"1a","status":"pass","duration_ms":0}`,
    );
    const corruptLine = `# this is not JSONL but contains "phase":"1b" in a comment`;
    const log = [...goodLines, corruptLine].join("\n") + "\n";
    const fixture = makeFixture(synthValidate(["1a", "1b"]), log);
    const out = extractPhase1q(runValidate(fixture));
    // 1b appears in the corrupt line's literal substring → counts as
    // a firing → no WARN. Documents the current substring-grep
    // approximation.
    expect(out).not.toMatch(/phase 1b has 0 firings/);
  });
});
