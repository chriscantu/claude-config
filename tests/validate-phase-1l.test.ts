import { describe, expect, test } from "bun:test";
import { chmodSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { getuid } from "node:process";
import { join } from "node:path";
import { VALIDATE, runPhase, useFixtures } from "./validate-harness";

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

const makeFixture = useFixtures("validate-phase-1l-");

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

describe("validate.fish Phase 1l (delegate-link presence)", () => {
  test("A: clean fixture with all delegate links → Phase 1l passes", () => {
    const fixture = makeFixture();
    seedFullRegistry(fixture);
    const out = runPhase(fixture, "1l").block;
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
      const out = runPhase(fixture, "1l").block;
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
    const out = runPhase(fixture, "1l").block;
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
    // Write the patched validator inside the fixture so the harness cleanup
    // removes it with the fixture — no parallel tmpFiles[] needed.
    const tmpValidate = join(fixture, "validate-patched.fish");
    writeFileSync(tmpValidate, patched);
    const out = runPhase(fixture, "1l", { script: tmpValidate }).block;
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
      const out = runPhase(fixture, "1l").block;
      expect(out).toContain("grep returned error status");
    },
  );
});
