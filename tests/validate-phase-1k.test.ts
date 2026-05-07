import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Regression tests for validate.fish Phase 1k (Anchor-link target resolution).
//
// Phase 1k scans rules/*.md for cross-rule anchor links of the form
// `<basename>.md#<anchor>` and verifies <anchor> matches an `<a id="...">`
// definition in `rules/<basename>.md`. Generalized in issue #276 from a
// planning.md-only check so typos like `disagreement.md#hedge-than-comply`
// fail loudly instead of silently passing.
//
// Tests:
//   A) Clean fixture with valid cross-rule anchor → Phase 1k passes
//   B) Typo'd anchor in non-planning target → Phase 1k fails (#276 acceptance)
//   C) Existing planning.md# coverage unchanged → Phase 1k still flags typos
//   D) Out-of-scope target (file outside rules/) → silently skipped, no fail

const REPO = resolve(import.meta.dir, "..");
const VALIDATE = join(REPO, "validate.fish");

type RunResult = { exitCode: number; stdout: string; stderr: string };

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

// Capture only the Phase 1k block — header line through the next blank line.
// Sibling-phase failures on the seeded fixture do NOT fail this suite by
// design; assertions target the 1k slice only.
const extractPhase1k = (r: RunResult): string => {
  const combined = `${r.stdout}\n${r.stderr}`;
  const lines = combined.split("\n");
  const headerIdx = lines.findIndex((line) =>
    line.includes("── Anchor-link target resolution"),
  );
  if (headerIdx < 0) {
    throw new Error(
      `Phase 1k header not found.\n--- stdout ---\n${r.stdout}\n--- stderr ---\n${r.stderr}`,
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
  const dir = mkdtempSync(join(tmpdir(), "validate-phase-1k-"));
  for (const sub of ["rules", "skills", "agents", "commands", "adrs"]) {
    mkdirSync(join(dir, sub), { recursive: true });
  }
  fixtures.push(dir);
  return dir;
};

// Seed planning.md and disagreement.md with the anchors the dependent rule
// links into. Mirrors the real repo's planning ↔ disagreement coupling so a
// fixture diff matches the production link shape.
const seedTargets = (fixture: string): void => {
  const rules = join(fixture, "rules");
  writeFileSync(
    join(rules, "planning.md"),
    [
      '<a id="pressure-framing-floor"></a>',
      "# Pressure-framing floor",
      '<a id="emission-contract"></a>',
      "# Emission contract",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(rules, "disagreement.md"),
    ['<a id="hedge-then-comply"></a>', "# Hedge then comply", ""].join("\n"),
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
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch (e) {
      console.error(`afterEach: rmSync failed for ${dir}: ${(e as Error).message}`);
    }
  }
});

describe("validate.fish Phase 1k (anchor-link target resolution)", () => {
  test("A: clean fixture with valid cross-rule anchor → passes", () => {
    const fixture = makeFixture();
    seedTargets(fixture);
    writeFileSync(
      join(fixture, "rules", "think-before-coding.md"),
      "See [Forbidden](disagreement.md#hedge-then-comply).\n",
    );
    const out = extractPhase1k(runValidate(fixture));
    expect(out).toContain(
      "rules/think-before-coding.md links disagreement.md#hedge-then-comply → resolves",
    );
    expect(out).not.toContain("DEAD ANCHOR");
  });

  test("B: typo in non-planning cross-rule anchor → fails (#276 acceptance)", () => {
    const fixture = makeFixture();
    seedTargets(fixture);
    writeFileSync(
      join(fixture, "rules", "think-before-coding.md"),
      "See [Forbidden](disagreement.md#hedge-than-comply).\n",
    );
    const out = extractPhase1k(runValidate(fixture));
    expect(out).toContain(
      "rules/think-before-coding.md links disagreement.md#hedge-than-comply → DEAD ANCHOR",
    );
  });

  test("C: planning.md# coverage unchanged — typo still flagged", () => {
    const fixture = makeFixture();
    seedTargets(fixture);
    writeFileSync(
      join(fixture, "rules", "fat-marker-sketch.md"),
      "Floor: [link](planning.md#emergancy-bypass-sentinel).\n",
    );
    const out = extractPhase1k(runValidate(fixture));
    expect(out).toContain(
      "rules/fat-marker-sketch.md links planning.md#emergancy-bypass-sentinel → DEAD ANCHOR",
    );
  });

  test("D: target file outside rules/ → silently skipped (out of scope)", () => {
    const fixture = makeFixture();
    seedTargets(fixture);
    writeFileSync(
      join(fixture, "rules", "tdd-pragmatic.md"),
      "See [skill](../skills/foo/SKILL.md#some-anchor).\n",
    );
    const out = extractPhase1k(runValidate(fixture));
    // No pass line, no fail line for the out-of-scope target.
    expect(out).not.toContain("SKILL.md#some-anchor");
    expect(out).not.toContain("DEAD ANCHOR");
  });
});
