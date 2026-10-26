import { describe, expect, test } from "bun:test";
import { chmodSync, writeFileSync } from "node:fs";
import { getuid } from "node:process";
import { join } from "node:path";
import { runPhase, useFixtures } from "./validate-harness";

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

const makeFixture = useFixtures("validate-phase-1g-");

describe("validate.fish Phase 1g (canonical-string drift)", () => {
  test("A: empty rules/ dir → fails loudly", () => {
    const fixture = makeFixture();
    const out = runPhase(fixture, "1g").block;
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

    const out = runPhase(fixture, "1g").block;
    expect(out).toContain("grep returned error status");
  });

  test("C: clean fixture → all four canonical labels pass, no drift", () => {
    const fixture = makeFixture();
    writeFileSync(
      join(fixture, "rules", "planning-pipeline.md"),
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

    const out = runPhase(fixture, "1g").block;
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

    const out = runPhase(fixture, "1g").block;
    expect(out).toMatch(/drift:.*restated in rules\/drifted\.md/);
  });

  test("E: non-existent CLAUDE_CONFIG_REPO_DIR → exit 1", () => {
    const nonce = Math.random().toString(36).slice(2);
    const badDir = `/tmp/claude-config-nonexistent-${nonce}`;
    const r = runPhase(badDir, "1g");
    expect(r.exitCode).toBe(1);
  });

  // Asserts Phase 1g treats two label families independently: Trivial-tier
  // strings at their canonical home (planning-pipeline.md) do NOT trigger
  // drift while a disagreement.md canonical string in the same file DOES. Catches a registry coupling regression where adjusting one
  // family's pattern accidentally widens or narrows the other.
  test("H: Trivial-tier (canonical) + Hedge-then-Comply (drift) co-exist in same file → independent verdicts", () => {
    const fixture = makeFixture();
    writeFileSync(
      join(fixture, "rules", "planning-pipeline.md"),
      [
        "# canonical home for Trivial-tier criteria",
        "≤ ~200 LOC functional change",
        "Single component / single-file primary surface",
        "Unambiguous approach (one obvious design",
        "Low blast radius (no cross-team",
        "",
        "## Co-tenant: disagreement string (should drift — canonical is disagreement.md)",
        "The falsehood is the asserted agreement, restated here.",
        "",
      ].join("\n"),
    );
    writeFileSync(join(fixture, "rules", "other.md"), "# unrelated rule\n");

    const out = runPhase(fixture, "1g").block;
    // Trivial-tier strings live at canonical home → no drift
    expect(out).toContain("Trivial-tier LOC criterion: no drift");
    expect(out).toContain("Trivial-tier surface criterion: no drift");
    expect(out).toContain("Trivial-tier approach criterion: no drift");
    expect(out).toContain("Trivial-tier blast-radius criterion: no drift");
    // Hedge-then-Comply string is restated outside disagreement.md → drift fires
    expect(out).toContain("Hedge-then-Comply falsehood definition");
    expect(out).toMatch(/drift:.*planning-pipeline\.md/);
    // No Trivial-tier drift mention
    expect(out).not.toMatch(/drift:.*Trivial-tier/);
  });
});
