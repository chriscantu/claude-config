import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runPhase, useFixtures } from "./validate-harness";

// Regression tests for validate.fish Phase 1u (slash-trigger collision, #442).
//
// At 22 skills today, growing toward 30+, two skills claiming the same
// `/foo` trigger in their frontmatter description silently break the
// router. Phase 1u extracts the slash trigger(s) from every SKILL.md
// frontmatter description, builds a trigger → owner map, and fails when
// two different skills claim the same trigger.
//
// Scope: collision detection only. Frontmatter shape (name, description
// present, name matches dir) is already enforced by Phase 1a.
//
// Tests:
//   A) Two skills both claim /foo → hard fail
//   B) Each skill claims its own /name (self-claim) → passes
//   C) Skill with no slash trigger in description → silently skipped
//   D) Zero-state: no skills/ → loud fail
//   E) Skill claims another skill's name as foreign trigger → fail
//   F) Multiple triggers per description (/foo and /bar) both registered

const makeRepoFixture = useFixtures("validate-phase-1u-", ["rules", "skills", "agents", "commands", "adrs", "hooks", "bin", "tests"]);

const seedSkill = (repo: string, name: string, description: string): string => {
  const skillDir = join(repo, "skills", name);
  mkdirSync(skillDir, { recursive: true });
  const path = join(skillDir, "SKILL.md");
  const body = `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`;
  writeFileSync(path, body);
  return path;
};

describe("validate.fish Phase 1u (slash-trigger collision, #442)", () => {
  test("A: two skills both claim /foo → hard fail", () => {
    const repo = makeRepoFixture();
    seedSkill(repo, "alpha", 'Use when the user says /foo, "do alpha".');
    seedSkill(repo, "beta", 'Use when the user says /foo, "do beta".');
    const result = runPhase(repo, "1u");
    const out = result.block;
    expect(out).toMatch(/✗.*\/foo.*collision/);
    expect(out).toMatch(/alpha/);
    expect(out).toMatch(/beta/);
    expect(result.exitCode).toBe(1);
  });

  test("B: each skill claims its own /name (self-claim) → passes", () => {
    const repo = makeRepoFixture();
    seedSkill(repo, "alpha", "Use when the user says /alpha, do alpha things.");
    seedSkill(repo, "beta", "Use when the user says /beta, do beta things.");
    const out = runPhase(repo, "1u").block;
    expect(out).not.toMatch(/✗.*collision/);
    expect(out).toMatch(/✓.*alpha.*\/alpha/);
    expect(out).toMatch(/✓.*beta.*\/beta/);
  });

  test("C: skill with no slash trigger in description → skipped", () => {
    const repo = makeRepoFixture();
    seedSkill(repo, "no-slash", "Auto-triggers on natural-language patterns; no slash form.");
    const out = runPhase(repo, "1u").block;
    expect(out).toMatch(/no-slash.*no slash trigger/);
    expect(out).not.toMatch(/✗.*no-slash/);
  });

  test("D: no skills present → loud fail", () => {
    const repo = makeRepoFixture();
    const out = runPhase(repo, "1u").block;
    expect(out).toMatch(/✗.*Phase 1u.*no SKILL.md/);
  });

  test("E: skill claims another skill's name as foreign trigger → fail", () => {
    const repo = makeRepoFixture();
    seedSkill(repo, "real", "Use when the user says /real, do real things.");
    seedSkill(repo, "impostor", "Use when the user says /real, do other things.");
    const result = runPhase(repo, "1u");
    const out = result.block;
    expect(out).toMatch(/✗.*\/real.*collision/);
    expect(result.exitCode).toBe(1);
  });

  test("F: cross-references to other skills (`(use /other)`, `collates /baz`) do not trigger collisions", () => {
    const repo = makeRepoFixture();
    seedSkill(repo, "owner", "Use when the user says /owner, do owner things.");
    seedSkill(
      repo,
      "describer",
      "Use when the user says /describer. Do NOT use for X (use /owner) or Y (use /owner).",
    );
    const out = runPhase(repo, "1u").block;
    expect(out).toMatch(/✓.*owner.*\/owner/);
    expect(out).toMatch(/✓.*describer.*\/describer/);
    expect(out).not.toMatch(/✗.*collision/);
  });
});
