import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  REQUIRED_TIER_GREP_REGEX,
  REQUIRED_TIER_LITERAL,
  type AssertionTier,
} from "./evals-lib";

// Coupling tests for validate.fish Phase 1r (ADR #0019, issue #399).
//
// Phase 1r counts the literal substring `"tier": "required"` via grep against
// every skills/<name>/evals/evals.json. The eval substrate's canonical tier
// vocabulary lives in this file (`tests/evals-lib.ts`). Without an enforced
// link, a future refactor that renames `tier` → `severity`, replaces the
// string `"required"` with a numeric tier, or otherwise diverges would leave
// Phase 1r silently passing every suite as "0 required-tier assertions found"
// (zero-state pass at the wrong layer; ADR #0019 evaporates without signal).
//
// These tests bind Phase 1r's grep pattern, the substrate's exported
// constants, and the AssertionTier type literals together. A rename in any
// one of the three trips a test failure here before Phase 1r silently
// degrades.

const REPO_ROOT = resolve(import.meta.dir, "..");
const VALIDATE_FISH = resolve(REPO_ROOT, "validate.fish");

describe("Phase 1r coupling — substrate ↔ validator", () => {
  test("REQUIRED_TIER_LITERAL matches the AssertionTier 'required' variant", () => {
    // Compile-time check: literal value must remain a valid AssertionTier.
    const required: AssertionTier = "required";
    expect(REQUIRED_TIER_LITERAL).toBe(`"tier": "${required}"`);
  });

  test("REQUIRED_TIER_GREP_REGEX is the exact pattern Phase 1r greps for", () => {
    const validateSrc = readFileSync(VALIDATE_FISH, "utf8");
    // The substring is wrapped in single quotes inside validate.fish; assert
    // the regex appears verbatim. If validate.fish is rewritten to use a
    // different pattern, this test fails — forcing the substrate constant to
    // move with it.
    expect(validateSrc).toContain(`'${REQUIRED_TIER_GREP_REGEX}'`);
  });

  test("REQUIRED_TIER_GREP_REGEX matches REQUIRED_TIER_LITERAL", () => {
    // The grep regex is a POSIX bracket-expression variant of the literal.
    // Convert to JS regex and verify the literal substring is matched.
    // [[:space:]] → \s.
    const jsRegex = new RegExp(
      REQUIRED_TIER_GREP_REGEX.replace(/\[\[:space:\]\]/g, "\\s"),
    );
    expect(jsRegex.test(REQUIRED_TIER_LITERAL)).toBe(true);
  });

  test("AssertionTier union includes 'required'", () => {
    // Belt-and-suspenders: rename the union variant and the first test fails
    // at the type level (no `required` to assign), but a runtime check
    // documents the contract for readers without a TS step.
    const tier: AssertionTier = "required";
    expect(tier).toBe("required");
  });
});
