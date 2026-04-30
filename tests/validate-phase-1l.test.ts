import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { getuid } from "node:process";
import { join, resolve } from "node:path";

// Regression tests for validate.fish Phase 1l (Delegate-link presence).
//
// Phase 1l asserts each rule that delegates to a planning.md anchor still
// contains the `planning.md#<id>` link. The HARD-GATE silently weakens if a
// contributor deletes the entire delegate paragraph from a dependent rule —
// Phase 1g (drift) only fires on RESTATEMENT, Phase 1k (anchor-link target
// resolution) only fires on DANGLING anchor LINKS, neither catches DELETION.
//
// Tests:
//   A) Clean fixture mirroring real registry → Phase 1l passes
//   B) Deleted delegate link in multi-anchor rule → Phase 1l fails AND
//      surviving anchors in same rule still pass (no first-fail masking)
//   C) Missing dependent rule file → Phase 1l fails loudly
//   D) Empty anchor ID in CSV (trailing comma) → Phase 1l fails
//      (no silent grep-pattern collapse to bare "planning.md#")
//   E) Unreadable rule file → grep I/O error surfaces distinctly
//      (mirrors Phase 1g hardening; not misdirected to "missing link")
//
// Migrated from tests/validate-phase-1l.fish per ADR #0012 (issue #211).

const REPO = resolve(import.meta.dir, "..");
const VALIDATE = join(REPO, "validate.fish");

type RunResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

const runValidate = (fixture: string, validateScript = VALIDATE): RunResult => {
  const result = spawnSync("fish", [validateScript], {
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

// Capture only the Phase 1l block — header line through the next blank line.
// Mirrors the fish original's `sed -n '/── Delegate-link presence/,/^$/p'`.
// Combine stdout + stderr so a failure printed on either stream is captured.
const extractPhase1l = (r: RunResult): string => {
  const combined = `${r.stdout}\n${r.stderr}`;
  const lines = combined.split("\n");
  const headerIdx = lines.findIndex((line) =>
    line.includes("── Delegate-link presence"),
  );
  if (headerIdx < 0) {
    throw new Error(
      `Phase 1l header not found in validate.fish output — phase may have been renamed/removed.\n--- stdout ---\n${r.stdout}\n--- stderr ---\n${r.stderr}`,
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
const tmpFiles: string[] = [];

const makeFixture = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "validate-phase-1l-"));
  for (const sub of ["rules", "skills", "agents", "commands", "adrs"]) {
    mkdirSync(join(dir, sub), { recursive: true });
  }
  fixtures.push(dir);
  return dir;
};

// Seed every dependent rule registered in Phase 1l with all its registered
// anchor links. Anchor list mirrors the canonical registry in validate.fish.
const seedFullRegistry = (fixture: string): void => {
  const rules = join(fixture, "rules");
  writeFileSync(
    join(rules, "planning.md"),
    "# planning sentinel (Phase 1l does not read this; sibling phases may)\n",
  );
  writeFileSync(
    join(rules, "fat-marker-sketch.md"),
    "Floor: planning.md#pressure-framing-floor planning.md#emission-contract planning.md#emergency-bypass-sentinel\n",
  );
  writeFileSync(
    join(rules, "execution-mode.md"),
    "Floor: planning.md#pressure-framing-floor planning.md#emission-contract planning.md#emergency-bypass-sentinel planning.md#trivial-tier-criteria\n",
  );
  writeFileSync(
    join(rules, "goal-driven.md"),
    "Floor: planning.md#pressure-framing-floor planning.md#emission-contract planning.md#emergency-bypass-sentinel\n",
  );
  writeFileSync(
    join(rules, "pr-validation.md"),
    "Floor: planning.md#pressure-framing-floor planning.md#emission-contract planning.md#emergency-bypass-sentinel\n",
  );
  writeFileSync(
    join(rules, "think-before-coding.md"),
    "Floor: planning.md#emission-contract planning.md#trivial-tier-criteria\n",
  );
};

const TMP_PREFIX = tmpdir();

afterEach(() => {
  while (tmpFiles.length > 0) {
    const f = tmpFiles.pop()!;
    if (!f.startsWith(TMP_PREFIX)) {
      console.error(`afterEach: refusing to clean non-tmp path ${f}`);
      continue;
    }
    try {
      unlinkSync(f);
    } catch {
      // best-effort
    }
  }
  while (fixtures.length > 0) {
    const dir = fixtures.pop()!;
    if (!dir.startsWith(TMP_PREFIX)) {
      console.error(`afterEach: refusing to clean non-tmp path ${dir}`);
      continue;
    }
    // Restore perms in case a test chmod 000'd a file inside.
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

describe("validate.fish Phase 1l (delegate-link presence)", () => {
  test("A: clean fixture with all delegate links → Phase 1l passes", () => {
    const fixture = makeFixture();
    seedFullRegistry(fixture);
    const out = extractPhase1l(runValidate(fixture));
    expect(out).not.toContain("missing delegate link");
    expect(out).not.toContain("grep returned error status");
  });

  test("B: deleted link in multi-anchor rule → fail surfaces AND surviving anchors still pass", () => {
    const fixture = makeFixture();
    seedFullRegistry(fixture);
    // fat-marker-sketch is registered for 3 anchors; drop pressure-framing-floor
    // but keep the other two. Asserts the inner loop does NOT break on first
    // fail — the surviving pass lines must still appear.
    writeFileSync(
      join(fixture, "rules", "fat-marker-sketch.md"),
      "Only: planning.md#emission-contract planning.md#emergency-bypass-sentinel\n",
    );
    const out = extractPhase1l(runValidate(fixture));
    expect(out).toContain(
      "rules/fat-marker-sketch.md missing delegate link to planning.md#pressure-framing-floor",
    );
    expect(out).toContain(
      "rules/fat-marker-sketch.md delegates to planning.md#emission-contract",
    );
    expect(out).toContain(
      "rules/fat-marker-sketch.md delegates to planning.md#emergency-bypass-sentinel",
    );
  });

  test("C: missing dependent rule file → Phase 1l fails loudly", () => {
    const fixture = makeFixture();
    seedFullRegistry(fixture);
    unlinkSync(join(fixture, "rules", "fat-marker-sketch.md"));
    const out = extractPhase1l(runValidate(fixture));
    expect(out).toContain(
      "delegate-registry rule missing: rules/fat-marker-sketch.md",
    );
  });

  test("D: empty anchor ID in CSV (trailing comma) → Phase 1l fails", () => {
    // Phase 1l's empty-anchor guard prevents `planning.md#` (no anchor) from
    // matching incidentally on any anchored link. The registry is hard-coded
    // in validate.fish, so simulate the bad-input case via a temp validator
    // copy whose registry has been surgically edited to inject a trailing
    // comma.
    const fixture = makeFixture();
    seedFullRegistry(fixture);
    const original = readFileSync(VALIDATE, "utf8");
    const patched = original.replace(
      '"think-before-coding.md|emission-contract,trivial-tier-criteria"',
      '"think-before-coding.md|emission-contract,"',
    );
    expect(patched).not.toBe(original);
    const tmpValidate = join(
      tmpdir(),
      `validate-phase-1l-${Math.random().toString(36).slice(2)}.fish`,
    );
    writeFileSync(tmpValidate, patched);
    tmpFiles.push(tmpValidate);
    const out = extractPhase1l(runValidate(fixture, tmpValidate));
    expect(out).toContain("empty anchor ID");
  });

  // chmod 000 does not block reads when running as root; fish original
  // skipped in this case rather than failing. Use skipIf so bun reports
  // the skip explicitly — a bare `return;` would mark Test E as PASS,
  // hiding that the grep-error-surface assertion never ran.
  test.skipIf(getuid?.() === 0)(
    "E: unreadable rule file → grep I/O error surfaces distinctly",
    () => {
      const fixture = makeFixture();
      seedFullRegistry(fixture);
      chmodSync(join(fixture, "rules", "fat-marker-sketch.md"), 0o000);
      const out = extractPhase1l(runValidate(fixture));
      expect(out).toContain("grep returned error status");
    },
  );
});
