import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runPhase, useFixtures } from "./validate-harness";

// Regression tests for validate.fish Phase 1x (skill visibility drift, #572).
//
// global/skill-overrides.json records which personal skills are hidden from
// the model's skill listing. Claude Code reads `skillOverrides` only from
// user or project settings, and ~/.claude/settings.json is not in git, so the
// committed file is the reviewable copy. Phase 1x warns when the live
// settings file disagrees with it. HOME points at a fixture dir so the test
// never reads the real ~/.claude/settings.json.
//
// Tests:
//   A) No committed overrides file → pass (nothing to check)
//   B) No live settings file (e.g. CI) → pass, check skipped
//   C) Live settings match the committed overrides → pass
//   D) Live settings miss or change an entry → warn naming the skill, exit 0

const makeRepoFixture = useFixtures("validate-phase-1x-", ["rules", "skills", "agents", "commands", "adrs", "hooks", "bin", "tests", "global"]);

const COMMITTED = { skillOverrides: { adr: "user-invocable-only", sdr: "user-invocable-only" } };

const writeCommitted = (repo: string): void => {
  writeFileSync(join(repo, "global", "skill-overrides.json"), JSON.stringify(COMMITTED));
};

// Builds a fake HOME holding .claude/settings.json with the given content.
const makeHome = (repo: string, settings?: object): string => {
  const home = join(repo, "fake-home");
  mkdirSync(join(home, ".claude"), { recursive: true });
  if (settings) writeFileSync(join(home, ".claude", "settings.json"), JSON.stringify(settings));
  return home;
};

describe("validate.fish Phase 1x (skill visibility drift, #572)", () => {
  test("A: no committed overrides file → pass", () => {
    const repo = makeRepoFixture();
    const out = runPhase(repo, "1x", { env: { HOME: makeHome(repo, {}) } }).block;
    expect(out).toMatch(/✓.*no global\/skill-overrides\.json/);
    expect(out).not.toMatch(/⚠|✗/);
  });

  test("B: no live settings file → pass, check skipped", () => {
    const repo = makeRepoFixture();
    writeCommitted(repo);
    const out = runPhase(repo, "1x", { env: { HOME: makeHome(repo) } }).block;
    expect(out).toMatch(/✓.*no .*settings\.json.*skipped/);
    expect(out).not.toMatch(/⚠|✗/);
  });

  test("C: live settings match → pass", () => {
    const repo = makeRepoFixture();
    writeCommitted(repo);
    const home = makeHome(repo, { model: "x", skillOverrides: { ...COMMITTED.skillOverrides, other: "off" } });
    const out = runPhase(repo, "1x", { env: { HOME: home } }).block;
    expect(out).toMatch(/✓.*2 skill overrides match/);
    expect(out).not.toMatch(/⚠|✗/);
  });

  test("D: live settings drift → warn naming each skill, exit 0", () => {
    const repo = makeRepoFixture();
    writeCommitted(repo);
    const home = makeHome(repo, { skillOverrides: { adr: "on" } });
    const result = runPhase(repo, "1x", { env: { HOME: home } });
    expect(result.block).toMatch(/⚠.*adr.*"on".*expected "user-invocable-only"/);
    expect(result.block).toMatch(/⚠.*sdr.*missing/);
    expect(result.exitCode).toBe(0);
  });
});
