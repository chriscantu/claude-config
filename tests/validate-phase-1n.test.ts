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
import { getuid } from "node:process";
import { join, resolve } from "node:path";

// Regression tests for validate.fish Phase 1n (Fixture ↔ eval integrity).
//
// Phase 1n closes the silent-failure mode where:
//   - a fixture under tests/fixtures/<skill>/ rots after rename/delete with no
//     CI signal that it lost its eval consumer; OR
//   - an evals.json prompt references a fixture path that no longer exists
//     on disk (dangling reference, eval silently still "runs" with bad path).
//
// Tests:
//   A) Clean fixture: every dir consumed, no orphans → passes (no fail/warn)
//   B) Eval references a fixture that doesn't exist on disk → hard fail
//   C) Fixture exists, no eval consumer, NOT in README orphan list → hard fail
//   D) Fixture exists, no eval consumer, listed in README "## Orphaned
//      fixtures" → warn-only (no fail). Asserts negative-twin: NO fail line
//      mentioning the documented orphan name appears (catches a future fall-
//      through bug that emits BOTH warn and fail simultaneously).
//   E) tests/fixtures/<skill>/README.md missing → hard fail
//      (Q3-C: fixture-to-eval contract documentation required)
//   F) skills/<skill>/evals/evals.json missing → distinct hard fail
//      (fixtures present without an eval consumer file)
//   H) "## Orphaned fixtures" heading renamed (e.g. "### Orphaned fixtures")
//      → orphan list not recognized → previously-tolerated fixture now fails
//      (heading is part of the contract; rename must trip the gate)
//   I) Zero-state: tests/fixtures/ directory absent entirely → Phase 1n
//      emits the documented zero-state pass and does not regress to fail
//   J) Unreadable evals.json (chmod 000) → grep I/O error surfaces distinctly
//      via status ≥ 2 path; not silently misclassified as "zero references"
//      (which would mask every dangling-fixture fail in Side B)
//
// Issue #234, ADR #0012 (TS-native test).

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

// Capture only the Phase 1n block — header through next blank line. Combine
// stdout+stderr so failures on either stream are seen. Sibling-phase failures
// on the seeded fixture do not fail this suite — assertions target Phase 1n only.
const extractPhase1n = (r: RunResult): string => {
  const combined = `${r.stdout}\n${r.stderr}`;
  const lines = combined.split("\n");
  const headerIdx = lines.findIndex((line) =>
    line.includes("── Fixture ↔ eval integrity"),
  );
  if (headerIdx < 0) {
    throw new Error(
      `Phase 1n header not found — phase may have been renamed/removed.\n--- stdout ---\n${r.stdout}\n--- stderr ---\n${r.stderr}`,
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
  const dir = mkdtempSync(join(tmpdir(), "validate-phase-1n-"));
  for (const sub of ["rules", "skills", "agents", "commands", "adrs"]) {
    mkdirSync(join(dir, sub), { recursive: true });
  }
  fixtures.push(dir);
  return dir;
};

// Seed a single skill 'archx' with one fixture 'good/' that's consumed by one
// eval. Returns paths the test can mutate.
type Seed = {
  repo: string;
  fixturesRoot: string;
  evalsJson: string;
  fixturesReadme: string;
};

const seedClean = (): Seed => {
  const repo = makeRepoFixture();
  const skill = "archx";
  const fixturesRoot = join(repo, "tests", "fixtures", skill);
  const goodFixture = join(fixturesRoot, "good");
  mkdirSync(goodFixture, { recursive: true });
  writeFileSync(join(goodFixture, ".gitkeep"), "");

  const fixturesReadme = join(fixturesRoot, "README.md");
  writeFileSync(
    fixturesReadme,
    [
      "# Fixtures — archx",
      "",
      "## Criterion → Fixture matrix",
      "",
      "| Eval | Fixture | Why |",
      "|---|---|---|",
      "| `consumes-good` | `good/` | smoke fixture |",
      "",
      "## Orphaned fixtures (no eval consumer)",
      "",
      "(none currently)",
      "",
    ].join("\n"),
  );

  const evalsDir = join(repo, "skills", skill, "evals");
  mkdirSync(evalsDir, { recursive: true });
  const evalsJson = join(evalsDir, "evals.json");
  writeFileSync(
    evalsJson,
    JSON.stringify(
      {
        skill,
        evals: [
          {
            name: "consumes-good",
            prompt: `/archx --repos tests/fixtures/${skill}/good`,
            assertions: [
              { type: "regex", pattern: "ok", tier: "required", description: "stub" },
            ],
          },
        ],
      },
      null,
      2,
    ),
  );

  return { repo, fixturesRoot, evalsJson, fixturesReadme };
};

const TMP_PREFIX = tmpdir();

afterEach(() => {
  while (fixtures.length > 0) {
    const dir = fixtures.pop()!;
    if (!dir.startsWith(TMP_PREFIX)) {
      console.error(`afterEach: refusing to clean non-tmp path ${dir}`);
      continue;
    }
    // Restore perms in case a test chmod 000'd a file inside (Test J).
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

describe("validate.fish Phase 1n (fixture ↔ eval integrity)", () => {
  test("A: clean fixture — consumed dir, README present → passes with no fail/warn", () => {
    const { repo } = seedClean();
    const out = extractPhase1n(runValidate(repo));
    expect(out).toContain(
      "tests/fixtures/archx/good consumed by eval",
    );
    expect(out).toContain(
      "evals.json reference tests/fixtures/archx/good exists",
    );
    expect(out).not.toContain("has no eval consumer");
    expect(out).not.toContain("does not exist on disk");
    expect(out).not.toContain("README.md missing");
  });

  test("B: dangling eval reference — evals.json names fixture that doesn't exist → hard fail", () => {
    const { repo, evalsJson } = seedClean();
    // Add an eval pointing at a fixture path that was never created.
    writeFileSync(
      evalsJson,
      JSON.stringify(
        {
          skill: "archx",
          evals: [
            {
              name: "consumes-good",
              prompt: "/archx --repos tests/fixtures/archx/good",
              assertions: [
                { type: "regex", pattern: "ok", tier: "required", description: "stub" },
              ],
            },
            {
              name: "consumes-ghost",
              prompt: "/archx --repos tests/fixtures/archx/ghost-fixture",
              assertions: [
                { type: "regex", pattern: "ok", tier: "required", description: "stub" },
              ],
            },
          ],
        },
        null,
        2,
      ),
    );
    const out = extractPhase1n(runValidate(repo));
    expect(out).toContain(
      "references tests/fixtures/archx/ghost-fixture which does not exist on disk",
    );
    // Side A still passes for the consumed fixture — no first-fail masking.
    expect(out).toContain(
      "tests/fixtures/archx/good consumed by eval",
    );
  });

  test("C: undocumented orphan — fixture dir w/o eval consumer, not in README → hard fail", () => {
    const { repo, fixturesRoot } = seedClean();
    // Add a second fixture that no eval references and no README row mentions.
    const stranded = join(fixturesRoot, "stranded");
    mkdirSync(stranded, { recursive: true });
    writeFileSync(join(stranded, ".gitkeep"), "");
    const out = extractPhase1n(runValidate(repo));
    expect(out).toContain(
      "tests/fixtures/archx/stranded has no eval consumer and is not listed under '## Orphaned fixtures'",
    );
    // Consumed sibling still passes.
    expect(out).toContain(
      "tests/fixtures/archx/good consumed by eval",
    );
  });

  test("D: documented orphan — fixture listed under '## Orphaned fixtures' → warn, no fail", () => {
    const { repo, fixturesRoot, fixturesReadme } = seedClean();
    const stranded = join(fixturesRoot, "stranded");
    mkdirSync(stranded, { recursive: true });
    writeFileSync(join(stranded, ".gitkeep"), "");
    writeFileSync(
      fixturesReadme,
      [
        "# Fixtures — archx",
        "",
        "## Criterion → Fixture matrix",
        "",
        "| Eval | Fixture | Why |",
        "|---|---|---|",
        "| `consumes-good` | `good/` | smoke fixture |",
        "",
        "## Orphaned fixtures (no eval consumer)",
        "",
        "| Fixture | Intent |",
        "|---|---|",
        "| `stranded/` | future eval coverage |",
        "",
      ].join("\n"),
    );
    const out = extractPhase1n(runValidate(repo));
    expect(out).toContain(
      "tests/fixtures/archx/stranded unconsumed but documented as orphan",
    );
    expect(out).not.toContain(
      "tests/fixtures/archx/stranded has no eval consumer and is not listed",
    );
    // Negative-twin: NO fail-line mentioning `stranded` appears anywhere in
    // the slice. Catches a future fall-through bug that emits BOTH warn and
    // fail simultaneously (the substring assertion above would still pass).
    expect(out).not.toMatch(/✗.*stranded/);
  });

  test("E: README missing — tests/fixtures/<skill>/README.md absent → hard fail (Q3-C)", () => {
    const { repo, fixturesReadme } = seedClean();
    rmSync(fixturesReadme);
    const out = extractPhase1n(runValidate(repo));
    expect(out).toContain(
      "tests/fixtures/archx/README.md missing — fixture-to-eval contract documentation required",
    );
  });

  test("F: evals.json missing — fixtures present without consumer file → distinct hard fail", () => {
    const { repo, evalsJson } = seedClean();
    rmSync(evalsJson);
    const out = extractPhase1n(runValidate(repo));
    expect(out).toContain(
      "or rules-evals/archx/evals/evals.json) missing — fixtures under tests/fixtures/archx/",
    );
    // Fail message must be distinct from the README-missing fail (Test E) so
    // a contributor knows which side of the contract is broken.
    expect(out).not.toContain("README.md missing — fixture-to-eval");
  });

  test("H: orphan-section heading renamed (### instead of ##) → orphan unrecognized → hard fail", () => {
    // The awk parser keys on `^## Orphaned fixtures`. A subsection (`###`) or
    // capitalized variant must NOT be treated as the canonical orphan list —
    // otherwise contributors could silently downgrade the section and bypass
    // the gate.
    const { repo, fixturesRoot, fixturesReadme } = seedClean();
    const stranded = join(fixturesRoot, "stranded");
    mkdirSync(stranded, { recursive: true });
    writeFileSync(join(stranded, ".gitkeep"), "");
    writeFileSync(
      fixturesReadme,
      [
        "# Fixtures — archx",
        "",
        "## Criterion → Fixture matrix",
        "",
        "| Eval | Fixture | Why |",
        "|---|---|---|",
        "| `consumes-good` | `good/` | smoke fixture |",
        "",
        "### Orphaned fixtures",
        "",
        "| Fixture | Intent |",
        "|---|---|",
        "| `stranded/` | future eval coverage |",
        "",
      ].join("\n"),
    );
    const out = extractPhase1n(runValidate(repo));
    expect(out).toContain(
      "tests/fixtures/archx/stranded has no eval consumer and is not listed under '## Orphaned fixtures'",
    );
    // Must NOT have downgraded to warn — heading rename should not be
    // silently treated as the canonical orphan list.
    expect(out).not.toContain(
      "tests/fixtures/archx/stranded unconsumed but documented as orphan",
    );
  });

  test("I: zero-state — no tests/fixtures/ dir at all → Phase 1n emits documented pass, does not fail", () => {
    const repo = makeRepoFixture();
    // Deliberately do NOT create tests/fixtures/ — just the standard repo
    // skeleton from makeRepoFixture(). Phase 1n must not regress to fail
    // when there's nothing to validate (fresh-repo contract).
    const out = extractPhase1n(runValidate(repo));
    expect(out).toContain(
      "no tests/fixtures/<skill>/ directories — Phase 1n has nothing to validate",
    );
    expect(out).not.toMatch(/✗/);
  });

  // chmod 000 does not block reads when running as root; mirror Phase 1l Test
  // E and skip explicitly so bun reports the skip rather than silently passing
  // an assertion that never ran.
  test.skipIf(getuid?.() === 0)(
    "J: unreadable evals.json → grep I/O error surfaces distinctly (not silent zero-refs)",
    () => {
      const { repo, evalsJson } = seedClean();
      chmodSync(evalsJson, 0o000);
      const out = extractPhase1n(runValidate(repo));
      expect(out).toContain("grep returned error status");
      expect(out).toContain("skills/archx/evals/evals.json");
      // Must NOT have silently classified as "no references" — if it had,
      // every dangling-reference assertion in Side B would have been masked.
      expect(out).not.toContain(
        "evals.json reference tests/fixtures/archx/good exists",
      );
    },
  );
});
