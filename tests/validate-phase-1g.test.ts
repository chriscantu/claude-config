import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { getuid } from "node:process";
import { join, resolve } from "node:path";

// Regression tests for validate.fish Phase 1g hardening.
//
// Exercises silent-failure modes that Phase 1g previously masked:
//   A) empty rules/ dir          — drift loop scanned nothing → silent pass
//   B) unreadable rule with drift — `grep -lF 2>/dev/null` swallowed exit 2
//   C) clean fixture              — sanity check the happy path still passes
//   D) drift restatement          — drift detection still fires on regressions
//   E) non-existent CLAUDE_CONFIG_REPO_DIR → exit 1
//
// Migrated from tests/validate-phase-1g.fish per ADR #0012 (issue #210).
// Subprocess-style: shells out to validate.fish with CLAUDE_CONFIG_REPO_DIR
// pointing at fixture dirs.

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

// Capture only the Phase 1g block — header line through the next blank line.
// Mirrors the fish original's `sed -n '/── Canonical-string drift/,/^$/p'`.
// Combine stdout + stderr so a failure printed on either stream is captured.
const extractPhase1g = (r: RunResult): string => {
  const combined = `${r.stdout}\n${r.stderr}`;
  const lines = combined.split("\n");
  const headerIdx = lines.findIndex((line) =>
    line.includes("── Canonical-string drift"),
  );
  if (headerIdx < 0) {
    // Throw with the full captured streams so a renamed/removed Phase 1g
    // header surfaces a debuggable failure instead of an opaque
    // `Expected: not "PHASE_1G_HEADER_MISSING"` diff with no context.
    throw new Error(
      `Phase 1g header not found in validate.fish output — phase may have been renamed/removed.\n--- stdout ---\n${r.stdout}\n--- stderr ---\n${r.stderr}`,
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
const makeFixture = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "validate-phase-1g-"));
  for (const sub of ["rules", "skills", "agents", "commands", "adrs"]) {
    mkdirSync(join(dir, sub), { recursive: true });
  }
  fixtures.push(dir);
  return dir;
};

// Path-prefix guard: bounds chmod -R + rmSync recursive force to tmp paths
// only. Defense-in-depth carry-over from the fish original's `/tmp/*` /
// `/var/folders/*` whitelist — mkdtempSync should always produce paths
// under tmpdir(), but if a future refactor accidentally pushes a non-tmp
// path into fixtures[] we refuse to rm it.
const TMP_PREFIX = tmpdir();

afterEach(() => {
  while (fixtures.length > 0) {
    const dir = fixtures.pop()!;
    if (!dir.startsWith(TMP_PREFIX)) {
      console.error(`afterEach: refusing to clean non-tmp path ${dir}`);
      continue;
    }
    // Restore perms in case a test chmod 000'd a file inside. Surface chmod
    // spawn errors instead of letting a chmod-locked fixture leak across
    // runs (rmSync would then fail and the empty catch would hide it).
    const restore = spawnSync("chmod", ["-R", "u+rw", dir], { encoding: "utf8" });
    if (restore.error) {
      console.error(`afterEach: chmod spawn failed for ${dir}: ${restore.error.message}`);
    } else if (restore.status !== 0) {
      console.error(`afterEach: chmod exited ${restore.status} for ${dir}: ${restore.stderr}`);
    }
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch (e) {
      console.error(`afterEach: rmSync failed for ${dir}: ${(e as Error).message}`);
    }
  }
});

describe("validate.fish Phase 1g (canonical-string drift)", () => {
  test("A: empty rules/ dir → fails loudly", () => {
    const fixture = makeFixture();
    const out = extractPhase1g(runValidate(fixture));
    expect(out).toContain("rules/ directory empty or missing");
  });

  // chmod 000 does not block reads when running as root; fish original
  // skipped in this case rather than failing. Use skipIf so bun reports
  // the skip explicitly — a bare `return;` would mark Test B as PASS,
  // hiding that the grep-error-surface assertion never ran (the exact
  // silent-failure class this suite exists to catch).
  test.skipIf(getuid?.() === 0)("B: unreadable rule file with drift → grep error status surfaces", () => {
    const fixture = makeFixture();
    writeFileSync(join(fixture, "rules", "planning.md"), "# canonical home\n");
    const drift = join(fixture, "rules", "drift_file.md");
    writeFileSync(drift, "≤ ~200 LOC functional change\n");
    chmodSync(drift, 0o000);

    const out = extractPhase1g(runValidate(fixture));
    expect(out).toContain("grep returned error status");
  });

  test("C: clean fixture → all four canonical labels pass, no drift", () => {
    const fixture = makeFixture();
    writeFileSync(
      join(fixture, "rules", "planning.md"),
      [
        "# canonical home with all four canonical strings",
        "≤ ~200 LOC functional change",
        "Single component / single-file primary surface",
        "Unambiguous approach (one obvious design",
        "Low blast radius (no cross-team",
        "",
      ].join("\n"),
    );
    writeFileSync(join(fixture, "rules", "other.md"), "# unrelated rule\n");

    const out = extractPhase1g(runValidate(fixture));
    expect(out).toContain("Trivial-tier LOC criterion: no drift");
    expect(out).toContain("Trivial-tier surface criterion: no drift");
    expect(out).toContain("Trivial-tier approach criterion: no drift");
    expect(out).toContain("Trivial-tier blast-radius criterion: no drift");
    expect(out).not.toContain("rules/ directory empty");
    expect(out).not.toMatch(/drift:/);
  });

  test("D: drift restatement → drift loop fires fail on non-canonical home", () => {
    const fixture = makeFixture();
    writeFileSync(
      join(fixture, "rules", "planning.md"),
      "# canonical\n≤ ~200 LOC functional change\n",
    );
    writeFileSync(
      join(fixture, "rules", "drifted.md"),
      "≤ ~200 LOC functional change\n",
    );

    const out = extractPhase1g(runValidate(fixture));
    expect(out).toMatch(/drift:.*restated in rules\/drifted\.md/);
  });

  test("E: non-existent CLAUDE_CONFIG_REPO_DIR → exit 1", () => {
    const nonce = Math.random().toString(36).slice(2);
    const badDir = `/tmp/claude-config-nonexistent-${nonce}`;
    const r = runValidate(badDir);
    expect(r.exitCode).toBe(1);
  });

  // Tests F and G: scope-tier-memory-check.sh is the canonical home for the
  // nine verb-signal / minimizer / scope-expander / blast-radius keyword lists.
  // Phase 1g detects if any of those strings are restated in rules/*.md files.

  test("F: scope-tier verb-list strings absent from rules/*.md → no drift", () => {
    // Minimal fixture: planning.md with trivial-tier strings (their canonical
    // home) but none of the scope-tier hook strings. Phase 1g must report
    // "no drift" for all nine scope-tier registry entries.
    const fixture = makeFixture();
    writeFileSync(
      join(fixture, "rules", "planning.md"),
      [
        "# canonical home",
        "≤ ~200 LOC functional change",
        "Single component / single-file primary surface",
        "Unambiguous approach (one obvious design",
        "Low blast radius (no cross-team",
        "",
      ].join("\n"),
    );
    writeFileSync(join(fixture, "rules", "other.md"), "# unrelated rule\n");

    const out = extractPhase1g(runValidate(fixture));
    // All nine scope-tier labels should be present with "no drift"
    expect(out).toContain("Scope-tier verb-signal add-row-to: no drift");
    expect(out).toContain("Scope-tier verb-signal update-entry-in: no drift");
    expect(out).toContain("Scope-tier minimizer small-change: no drift");
    expect(out).toContain("Scope-tier scope-expander cross-cutting-change: no drift");
    expect(out).toContain("Scope-tier scope-expander refactor-across: no drift");
    expect(out).toContain("Scope-tier scope-expander introduce-new: no drift");
    expect(out).toContain("Scope-tier blast-radius-word public-API: no drift");
    expect(out).toContain("Scope-tier blast-radius-word breaking-change: no drift");
    expect(out).toContain("Scope-tier blast-radius-word version-bump: no drift");
    // Verify no scope-tier drift failures
    expect(out).not.toMatch(/drift:.*scope-tier-memory-check/i);
  });

  test("G: scope-tier string restated in rules/planning.md → Phase 1g fails with drift message", () => {
    // Append "add row to" (a registered Phase 1g scope-tier pattern) into
    // rules/planning.md. Since planning.md != scope-tier-memory-check.sh,
    // Phase 1g must detect drift and name both the string and the file.
    const fixture = makeFixture();
    writeFileSync(
      join(fixture, "rules", "planning.md"),
      [
        "# planning stub",
        "≤ ~200 LOC functional change",
        "Single component / single-file primary surface",
        "Unambiguous approach (one obvious design",
        "Low blast radius (no cross-team",
        "",
        "## Test marker",
        'verbs: prune, rename, delete (these are "add row to" verbs that trigger scope-tier checks)',
        "",
      ].join("\n"),
    );
    writeFileSync(join(fixture, "rules", "other.md"), "# unrelated rule\n");

    const out = extractPhase1g(runValidate(fixture));
    // Phase 1g fail line names the label (add-row-to) and the offending file.
    // The fail line format is:
    //   drift: 'Scope-tier verb-signal add-row-to' restated in rules/planning.md
    expect(out).toContain("add-row-to");
    expect(out).toContain("planning.md");
    // The drift: prefix signals a failure line, not just a mention
    expect(out).toMatch(/drift:.*planning\.md/);
  });
});
