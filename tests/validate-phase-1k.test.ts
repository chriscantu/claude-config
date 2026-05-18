import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { getuid } from "node:process";
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
    // Restore perms in case a test chmod 000'd a file inside.
    spawnSync("chmod", ["-R", "u+rw", dir], { encoding: "utf8" });
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
    // Skip mechanism is two-layered: (1) the `(`…`)` boundary + basename
    // charset rejects path-bearing or scheme-bearing refs at the regex stage,
    // (2) the `test -f rules/<basename>` check rejects refs to basenames not
    // present in rules/. This test covers (1) for the skills/ path; case I
    // covers (2) for a basename that exists in rules/ but is referenced
    // through a path prefix.
    const fixture = makeFixture();
    seedTargets(fixture);
    writeFileSync(
      join(fixture, "rules", "tdd-pragmatic.md"),
      "See [skill](../skills/foo/SKILL.md#some-anchor).\n",
    );
    const out = extractPhase1k(runValidate(fixture));
    expect(out).not.toContain("SKILL.md#some-anchor");
    expect(out).not.toContain("DEAD ANCHOR");
  });

  test("E: cache hit path — multiple rules linking same target with mixed valid/invalid anchors", () => {
    // Cache stores defined-anchor lists per target file with literal `\n`
    // join/split. If the round-trip ever drifts (e.g. mixed escape semantics
    // between writer and reader), a cache hit would misreport every lookup.
    // Two rules link planning.md: one valid, one valid + one typo. Cache is
    // populated on the first rule's first link; the second rule exercises
    // the cache-hit branch for both a positive and negative case.
    const fixture = makeFixture();
    seedTargets(fixture);
    writeFileSync(
      join(fixture, "rules", "rule_one.md"),
      "[link](planning.md#pressure-framing-floor)\n",
    );
    writeFileSync(
      join(fixture, "rules", "rule_two.md"),
      "[ok](planning.md#emission-contract) and [bad](planning.md#nonexistent)\n",
    );
    const out = extractPhase1k(runValidate(fixture));
    expect(out).toContain(
      "rules/rule_one.md links planning.md#pressure-framing-floor → resolves",
    );
    expect(out).toContain(
      "rules/rule_two.md links planning.md#emission-contract → resolves",
    );
    expect(out).toContain(
      "rules/rule_two.md links planning.md#nonexistent → DEAD ANCHOR",
    );
  });

  test("F: same-file fragment link `](#section)` → no Phase 1k line", () => {
    // The regex requires `(basename.md#…)`, so `](#anchor)` produces no
    // match and no PASS/FAIL line. Locks the contract — if a future
    // contributor broadens the regex to include same-file refs, this
    // assertion fails and forces an explicit decision about heading-anchor
    // resolution.
    const fixture = makeFixture();
    seedTargets(fixture);
    writeFileSync(
      join(fixture, "rules", "tdd-pragmatic.md"),
      "See [section](#some-heading) for details.\n",
    );
    const out = extractPhase1k(runValidate(fixture));
    expect(out).not.toContain("tdd-pragmatic.md links");
    expect(out).not.toContain("DEAD ANCHOR");
  });

  test("G: external https URL containing `.md#` → no Phase 1k line", () => {
    // The basename charset excludes `:` and `/`, so a markdown link to an
    // external URL like `[doc](https://example.com/foo.md#bar)` is rejected
    // at the regex stage and produces no PASS/FAIL line.
    const fixture = makeFixture();
    seedTargets(fixture);
    writeFileSync(
      join(fixture, "rules", "tdd-pragmatic.md"),
      "External: [doc](https://example.com/foo.md#bar).\n",
    );
    const out = extractPhase1k(runValidate(fixture));
    expect(out).not.toContain("foo.md#bar");
    expect(out).not.toContain("DEAD ANCHOR");
  });

  test("H: anchor IDs with uppercase + underscore charset are validated, not skipped", () => {
    // Pre-fix, the reference regex required `[a-z0-9-]+` for the anchor ID
    // while the `<a id>` extractor accepted any non-quote char. A defined
    // `<a id="Foo_Bar">` paired with link `file.md#Foo_Bar` would silently
    // skip — no DEAD ANCHOR fired. Both a valid uppercase/underscore link
    // and a typo'd one must now fire pass/fail respectively.
    const fixture = makeFixture();
    const rules = join(fixture, "rules");
    writeFileSync(
      join(rules, "planning.md"),
      ['<a id="Foo_Bar"></a>', "# Foo Bar", ""].join("\n"),
    );
    writeFileSync(
      join(rules, "disagreement.md"),
      "stub for fixture seeding (other tests rely on this file existing)\n",
    );
    writeFileSync(
      join(rules, "rule_uppercase.md"),
      "[good](planning.md#Foo_Bar) [bad](planning.md#Foo_Baz)\n",
    );
    const out = extractPhase1k(runValidate(fixture));
    expect(out).toContain(
      "rules/rule_uppercase.md links planning.md#Foo_Bar → resolves",
    );
    expect(out).toContain(
      "rules/rule_uppercase.md links planning.md#Foo_Baz → DEAD ANCHOR",
    );
  });

  test("I: path-prefixed ref to basename that exists in rules/ → no false-positive", () => {
    // A reference like `[link](../docs/planning.md#alpha)` shares its
    // basename with `rules/planning.md`. Pre-fix, the regex matched
    // `planning.md#alpha` anywhere in the string and the existence check
    // passed against `rules/planning.md` — producing a misleading "resolves"
    // line tied to the wrong file. The `(`…`)` boundary now anchors the
    // match at an opening paren immediately preceding the basename, so the
    // path-prefixed form no longer matches.
    const fixture = makeFixture();
    seedTargets(fixture);
    writeFileSync(
      join(fixture, "rules", "tdd-pragmatic.md"),
      "Wrong file: [link](../docs/planning.md#pressure-framing-floor).\n",
    );
    const out = extractPhase1k(runValidate(fixture));
    expect(out).not.toContain("tdd-pragmatic.md links planning.md");
  });

  // chmod 000 does not block reads when running as root; sibling Phase 1l
  // skipped in this case rather than failing. Use skipIf so bun reports
  // the skip explicitly.
  test.skipIf(getuid?.() === 0)(
    "J: unreadable rule file → grep I/O error surfaces distinctly",
    () => {
      const fixture = makeFixture();
      seedTargets(fixture);
      writeFileSync(
        join(fixture, "rules", "rule_unreadable.md"),
        "[link](planning.md#pressure-framing-floor)\n",
      );
      chmodSync(join(fixture, "rules", "rule_unreadable.md"), 0o000);
      const out = extractPhase1k(runValidate(fixture));
      expect(out).toContain("grep returned error status");
    },
  );

  test("K: anchorless target cache miss does not corrupt subsequent cache hits (#353)", () => {
    // Regression for #353. Cache stores parallel arrays — anchor_cache_files
    // (basenames) and anchor_cache_anchors (joined anchor IDs). When a target
    // has ZERO `<a id="...">` definitions, the pre-fix implementation appended
    // a basename to the files array but appended ZERO elements to the anchors
    // array (because the joined command substitution produced no output). On
    // subsequent cache hits for ANY other target, anchor_cache_anchors[$idx]
    // retrieved the wrong slot and the contains-check failed with a spurious
    // DEAD ANCHOR for links that target valid anchors.
    //
    // Repro: rule_alpha.md links to BOTH an anchorless target (primes cache
    // with misaligned indices) AND an anchored target (cache miss → fresh
    // grep, correct). rule_beta.md then links to the anchored target — this
    // exercises the cache HIT branch. Pre-fix: rule_beta's link reports DEAD.
    // Post-fix: both arrays stay aligned and the link resolves.
    const fixture = makeFixture();
    const rules = join(fixture, "rules");
    writeFileSync(
      join(rules, "rule_alpha.md"),
      "Empty: [x](target_empty.md#nope)\nGood: [v](target_good.md#valid)\n",
    );
    writeFileSync(
      join(rules, "rule_beta.md"),
      "Good again: [v](target_good.md#valid)\n",
    );
    writeFileSync(
      join(rules, "target_empty.md"),
      "no anchor definitions in this file\n",
    );
    writeFileSync(
      join(rules, "target_good.md"),
      '<a id="valid"></a>\n# valid\n',
    );

    const out = extractPhase1k(runValidate(fixture));

    // True positive still fires.
    expect(out).toContain(
      "rules/rule_alpha.md links target_empty.md#nope → DEAD ANCHOR",
    );
    // Cache-miss resolution for target_good.md succeeds (rule_alpha's 2nd ref).
    expect(out).toContain(
      "rules/rule_alpha.md links target_good.md#valid → resolves",
    );
    // Bug-exposing assertion: cache-HIT resolution for target_good.md from
    // rule_beta must also succeed. Pre-fix this reports DEAD ANCHOR because
    // the cache_anchors array is short by one slot.
    expect(out).toContain(
      "rules/rule_beta.md links target_good.md#valid → resolves",
    );
    expect(out).not.toContain(
      "rules/rule_beta.md links target_good.md#valid → DEAD ANCHOR",
    );
  });
});
