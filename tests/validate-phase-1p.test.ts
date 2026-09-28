import { describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runPhase, useFixtures } from "./validate-harness";

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
//   B) Multiple on-disk dirs without README bullets → FAIL once per missing
//      dir (catches a future refactor that early-exits the loop after the
//      first failure)
//   C) Multiple README bullets without on-disk dirs → FAIL once per missing
//      dir (same early-exit refactor guard, opposite side)
//   D) Zero-state: rules-evals/ absent entirely → documented pass, no fail
//   E) rules-evals/ exists but README.md missing → FAIL
//   F) README missing "Current suites:" header (structural rot) → FAIL even
//      when both lists are empty (catches the vacuous-pass mode where a
//      rotted README + zero on-disk subdirs would otherwise pass silently)
//   G) README chmod-000 → grep error status ≥ 2 surfaces as a distinct
//      "grep returned error status" fail rather than misleading
//      "missing from README" cascade. Skipped when running as root (chmod
//      restrictions don't apply).
//   H) Malformed bullet (uppercase slug) is silently rejected by the strict
//      filter regex — pins this as intentional. An on-disk dir paired with
//      an off-format bullet still triggers "missing from README" because
//      the filter discards the bullet.
//
// Issue #361 (adjacent README backfill), ADR #0012 (TS-native test).

const makeMinFixture = useFixtures("validate-phase-1p-", ["rules", "skills", "agents", "commands", "adrs", "hooks", "bin", "tests"]);

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

describe("validate.fish Phase 1p (rules-evals README suite inventory)", () => {
  test("A: README bullets match on-disk dirs → pass", () => {
    const fixture = makeMinFixture();
    seedRulesEvals(fixture, ["alpha", "beta"], ["alpha", "beta"]);
    const out = runPhase(fixture, "1p").block;
    expect(out).not.toContain("✗");
    expect(out).toMatch(/suite list matches on-disk dirs \(2 suites\)/);
  });

  test("B: multiple on-disk dirs without README bullets → FAIL once per missing dir", () => {
    const fixture = makeMinFixture();
    // Three orphan dirs (gamma, delta, epsilon) verify the loop emits one
    // fail per missing entry — catches a future refactor that early-exits
    // after the first failure.
    seedRulesEvals(
      fixture,
      ["alpha", "beta", "gamma", "delta", "epsilon"],
      ["alpha", "beta"],
    );
    const out = runPhase(fixture, "1p").block;
    expect(out).toContain("✗");
    expect(out).toMatch(/rules-evals\/gamma\/ exists on disk but missing from README\.md/);
    expect(out).toMatch(/rules-evals\/delta\/ exists on disk but missing from README\.md/);
    expect(out).toMatch(/rules-evals\/epsilon\/ exists on disk but missing from README\.md/);
  });

  test("C: multiple README bullets without on-disk dirs → FAIL once per missing dir", () => {
    const fixture = makeMinFixture();
    // Three phantom bullets (ghost, wraith, specter) verify the opposite-
    // side loop also emits one fail per entry.
    seedRulesEvals(fixture, ["alpha"], ["alpha", "ghost", "wraith", "specter"]);
    const out = runPhase(fixture, "1p").block;
    expect(out).toContain("✗");
    expect(out).toMatch(/lists 'ghost\/' but no such directory exists/);
    expect(out).toMatch(/lists 'wraith\/' but no such directory exists/);
    expect(out).toMatch(/lists 'specter\/' but no such directory exists/);
  });

  test("D: rules-evals/ absent → documented zero-state pass", () => {
    const fixture = makeMinFixture();
    const out = runPhase(fixture, "1p").block;
    expect(out).not.toContain("✗");
    expect(out).toMatch(/no rules-evals\/ directory.*Phase 1p has nothing to validate/);
  });

  test("E: rules-evals/ exists but README.md missing → FAIL", () => {
    const fixture = makeMinFixture();
    const dir = join(fixture, "rules-evals", "alpha", "evals");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "evals.json"), JSON.stringify({ skill: "alpha", evals: [] }));
    const out = runPhase(fixture, "1p").block;
    expect(out).toContain("✗");
    expect(out).toMatch(/README\.md missing/);
  });

  test("F: README missing 'Current suites:' header → FAIL (structural rot)", () => {
    // Vacuous-pass guard: a rotted README (no header, zero bullets) plus
    // an empty rules-evals/ dir would silently pass the bidirectional
    // check without the header presence guard.
    const fixture = makeMinFixture();
    const dir = join(fixture, "rules-evals");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "README.md"),
      "# rules-evals\n\nSee root README.\n",
    );
    const out = runPhase(fixture, "1p").block;
    expect(out).toContain("✗");
    expect(out).toMatch(/missing 'Current suites:' header.*structural rot/);
  });

  test("G: README chmod-000 → grep error-status FAIL (not misleading missing-bullet cascade)", () => {
    if (process.getuid?.() === 0) return; // chmod has no effect as root
    const fixture = makeMinFixture();
    seedRulesEvals(fixture, ["alpha"], ["alpha"]);
    const readmePath = join(fixture, "rules-evals", "README.md");
    chmodSync(readmePath, 0o000);
    try {
      const out = runPhase(fixture, "1p").block;
      expect(out).toContain("✗");
      expect(out).toMatch(/grep returned error status \d+/);
      // Negative twin: the bullet-cascade message must NOT fire — that's
      // the misleading silent-failure mode this test guards against.
      expect(out).not.toMatch(/rules-evals\/alpha\/ exists on disk but missing from README/);
    } finally {
      chmodSync(readmePath, 0o644);
    }
  });

  test("H: malformed bullet (uppercase slug) rejected by strict filter regex", () => {
    // Pins intentional behavior: a bullet with characters outside the slug
    // regex's [a-z0-9_-] class is silently dropped, so the paired on-disk
    // dir reads as missing-from-README. Documents the strict-filter contract.
    const fixture = makeMinFixture();
    const dir = join(fixture, "rules-evals", "Alpha", "evals");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "evals.json"), JSON.stringify({ skill: "Alpha", evals: [] }));
    writeFileSync(
      join(fixture, "rules-evals", "README.md"),
      [
        "# rules-evals",
        "",
        "Current suites:",
        "",
        "- `Alpha/` — uppercase slug, filter rejects",
        "",
      ].join("\n"),
    );
    const out = runPhase(fixture, "1p").block;
    expect(out).toContain("✗");
    expect(out).toMatch(/rules-evals\/Alpha\/ exists on disk but missing from README/);
  });
});
