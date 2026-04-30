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
  if (headerIdx < 0) return "PHASE_1G_HEADER_MISSING";
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

afterEach(() => {
  while (fixtures.length > 0) {
    const dir = fixtures.pop()!;
    try {
      // Restore perms in case a test chmod 000'd a file inside.
      const restore = spawnSync("chmod", ["-R", "u+rw", dir], { encoding: "utf8" });
      // chmod failure is non-fatal — fall through to rmSync.
      void restore;
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup; tmpdir reaper handles stragglers.
    }
  }
});

describe("validate.fish Phase 1g (canonical-string drift)", () => {
  test("A: empty rules/ dir → fails loudly", () => {
    const fixture = makeFixture();
    const out = extractPhase1g(runValidate(fixture));
    expect(out).not.toBe("PHASE_1G_HEADER_MISSING");
    expect(out).toContain("rules/ directory empty or missing");
  });

  test("B: unreadable rule file with drift → grep error status surfaces", () => {
    if (getuid?.() === 0) {
      // chmod 000 does not block reads when running as root; fish original
      // skips in this case rather than failing.
      return;
    }
    const fixture = makeFixture();
    writeFileSync(join(fixture, "rules", "planning.md"), "# canonical home\n");
    const drift = join(fixture, "rules", "drift_file.md");
    writeFileSync(drift, "≤ ~200 LOC functional change\n");
    chmodSync(drift, 0o000);

    const out = extractPhase1g(runValidate(fixture));
    expect(out).not.toBe("PHASE_1G_HEADER_MISSING");
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
    expect(out).not.toBe("PHASE_1G_HEADER_MISSING");
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
    expect(out).not.toBe("PHASE_1G_HEADER_MISSING");
    expect(out).toMatch(/drift:.*restated in rules\/drifted\.md/);
  });

  test("E: non-existent CLAUDE_CONFIG_REPO_DIR → exit 1", () => {
    const nonce = Math.random().toString(36).slice(2);
    const badDir = `/tmp/claude-config-nonexistent-${nonce}`;
    const r = runValidate(badDir);
    expect(r.exitCode).toBe(1);
  });
});
