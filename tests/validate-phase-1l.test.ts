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
// Phase 1l asserts each rule that delegates to a floor-trio anchor still
// contains the `<basename>.md#<id>` link. The HARD-GATE silently weakens if a
// contributor deletes the entire delegate paragraph from a dependent rule —
// Phase 1g (drift) only fires on RESTATEMENT, Phase 1k (anchor-link target
// resolution) only fires on DANGLING anchor LINKS, neither catches DELETION.
//
// Tests:
//   A) Clean fixture mirroring real registry → Phase 1l passes
//   B) Deleted delegate link in multi-anchor rule → Phase 1l fails AND
//      surviving anchors in same rule still pass (no first-fail masking)
//   C) Missing dependent rule file → Phase 1l fails loudly
//   D) Empty link token in CSV (trailing comma) → Phase 1l fails
//      (no silent grep-pattern collapse to empty pattern)
//   E) Unreadable rule file → grep I/O error surfaces distinctly
//      (mirrors Phase 1g hardening; not misdirected to "missing link")
//
// Migrated from tests/validate-phase-1l.fish per ADR #0012 (issue #211).
// Updated for issue #375: planning.md split into planning-pipeline.md /
// skip-contract.md / pressure-framing-floor.md. Registry now uses fully
// qualified `<basename>.md#<anchor>` tokens.

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
// By design, failures in sibling phases (1g, 1j, 1k, 1m) on the seeded fixture
// do NOT fail this suite — assertions target the 1l slice only. If a future
// phase tightens against this fixture, audit at that time, don't auto-fail here.
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

const makeFixture = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "validate-phase-1l-"));
  for (const sub of ["rules", "skills", "agents", "commands", "adrs"]) {
    mkdirSync(join(dir, sub), { recursive: true });
  }
  fixtures.push(dir);
  return dir;
};

// Seed every dependent rule registered in Phase 1l with all its registered
// anchor links. Link list mirrors the canonical registry in validate.fish.
const seedFullRegistry = (fixture: string): void => {
  const rules = join(fixture, "rules");
  writeFileSync(
    join(rules, "fat-marker-sketch.md"),
    "Floor: pressure-framing-floor.md#pressure-framing-floor skip-contract.md#emission-contract pressure-framing-floor.md#emergency-bypass-sentinel skip-contract.md#override-skip-contract\n",
  );
  writeFileSync(
    join(rules, "execution-mode.md"),
    "Floor: pressure-framing-floor.md#pressure-framing-floor skip-contract.md#emission-contract pressure-framing-floor.md#emergency-bypass-sentinel planning-pipeline.md#trivial-tier-criteria\n",
  );
  writeFileSync(
    join(rules, "goal-driven.md"),
    "Floor: pressure-framing-floor.md#pressure-framing-floor skip-contract.md#emission-contract pressure-framing-floor.md#emergency-bypass-sentinel skip-contract.md#override-skip-contract skip-contract.md#emission-contract-per-gate\n",
  );
  writeFileSync(
    join(rules, "pr-validation.md"),
    "Floor: pressure-framing-floor.md#pressure-framing-floor skip-contract.md#emission-contract pressure-framing-floor.md#emergency-bypass-sentinel skip-contract.md#override-skip-contract skip-contract.md#emission-contract-per-gate\n",
  );
  writeFileSync(
    join(rules, "think-before-coding.md"),
    "Floor: skip-contract.md#emission-contract planning-pipeline.md#trivial-tier-criteria skip-contract.md#override-skip-contract skip-contract.md#emission-contract-per-gate\n",
  );
  writeFileSync(
    join(rules, "GOVERNANCE.md"),
    "Override delegation: skip-contract.md#override-skip-contract skip-contract.md#emission-contract-per-gate\n",
  );
};

const TMP_PREFIX = tmpdir();

afterEach(() => {
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

  // Parameterized across all three trio basenames (issue #375 split). Each
  // case picks a dependent rule that delegates to the trio file under test
  // and drops one specific link, asserting Phase 1l fails on the deleted
  // link AND that surviving links in the same rule still report PASS (the
  // inner loop must not break on first fail).
  test.each([
    {
      trioFile: "pressure-framing-floor.md",
      dependent: "fat-marker-sketch.md",
      dropLink: "pressure-framing-floor.md#pressure-framing-floor",
      keepBody:
        "Only: skip-contract.md#emission-contract pressure-framing-floor.md#emergency-bypass-sentinel\n",
      survivingLinks: [
        "skip-contract.md#emission-contract",
        "pressure-framing-floor.md#emergency-bypass-sentinel",
      ],
    },
    {
      trioFile: "skip-contract.md",
      dependent: "goal-driven.md",
      // Drop override-skip-contract rather than emission-contract — the
      // latter is a substring of emission-contract-per-gate, so grep -F
      // would still find it via the longer anchor's presence (a quirk of
      // the substring-match approach, not the test's concern).
      dropLink: "skip-contract.md#override-skip-contract",
      keepBody:
        "Only: pressure-framing-floor.md#pressure-framing-floor skip-contract.md#emission-contract pressure-framing-floor.md#emergency-bypass-sentinel skip-contract.md#emission-contract-per-gate\n",
      survivingLinks: [
        "pressure-framing-floor.md#pressure-framing-floor",
        "skip-contract.md#emission-contract-per-gate",
      ],
    },
    {
      trioFile: "planning-pipeline.md",
      dependent: "execution-mode.md",
      dropLink: "planning-pipeline.md#trivial-tier-criteria",
      keepBody:
        "Only: pressure-framing-floor.md#pressure-framing-floor skip-contract.md#emission-contract pressure-framing-floor.md#emergency-bypass-sentinel\n",
      survivingLinks: [
        "pressure-framing-floor.md#pressure-framing-floor",
        "skip-contract.md#emission-contract",
      ],
    },
  ])(
    "B: deleted $trioFile link in $dependent → fail surfaces AND surviving links still pass",
    ({ dependent, dropLink, keepBody, survivingLinks }) => {
      const fixture = makeFixture();
      seedFullRegistry(fixture);
      writeFileSync(join(fixture, "rules", dependent), keepBody);
      const out = extractPhase1l(runValidate(fixture));
      expect(out).toContain(
        `rules/${dependent} missing delegate link to ${dropLink}`,
      );
      for (const link of survivingLinks) {
        expect(out).toContain(`rules/${dependent} delegates to ${link}`);
      }
    },
  );

  test("C: missing dependent rule file → Phase 1l fails loudly", () => {
    const fixture = makeFixture();
    seedFullRegistry(fixture);
    unlinkSync(join(fixture, "rules", "fat-marker-sketch.md"));
    const out = extractPhase1l(runValidate(fixture));
    expect(out).toContain(
      "delegate-registry rule missing: rules/fat-marker-sketch.md",
    );
  });

  test("D: empty link token in CSV (trailing comma) → Phase 1l fails", () => {
    // Phase 1l's empty-link guard prevents a bare empty pattern from
    // matching incidentally against the rule file. The registry is hard-coded
    // in validate.fish, so simulate the bad-input case via a temp validator
    // copy whose registry has been surgically edited to inject a trailing
    // comma.
    const fixture = makeFixture();
    seedFullRegistry(fixture);
    const original = readFileSync(VALIDATE, "utf8");
    // Coupling: the literal below must match the registry entry in
    // validate.fish verbatim. If the entry is renamed, replace() becomes
    // a no-op — the `expect(patched).not.toBe(original)` guard fails the test
    // loudly so the coupling cannot silently degrade.
    const patched = original.replace(
      '"think-before-coding.md|skip-contract.md#emission-contract,planning-pipeline.md#trivial-tier-criteria,skip-contract.md#override-skip-contract,skip-contract.md#emission-contract-per-gate"',
      '"think-before-coding.md|skip-contract.md#emission-contract,"',
    );
    expect(patched).not.toBe(original);
    // Positive assert: patched content must contain the trailing-comma
    // shape the test depends on. Catches the failure mode where the
    // replace() matched a future-edited literal but produced an
    // unintended substitution silently.
    expect(patched).toContain(
      '"think-before-coding.md|skip-contract.md#emission-contract,"',
    );
    // Write the patched validator inside the fixture so afterEach cleans it
    // automatically via rmSync(dir, recursive) — no parallel tmpFiles[] needed.
    const tmpValidate = join(fixture, "validate-patched.fish");
    writeFileSync(tmpValidate, patched);
    const out = extractPhase1l(runValidate(fixture, tmpValidate));
    expect(out).toContain("empty link token");
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
