import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

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

const extractPhase1u = (r: RunResult): string => {
  const combined = `${r.stdout}\n${r.stderr}`;
  const lines = combined.split("\n");
  const headerIdx = lines.findIndex((line) =>
    line.includes("── Phase 1u: slash-trigger collision"),
  );
  if (headerIdx < 0) {
    throw new Error(
      `Phase 1u header not found.\n--- stdout ---\n${r.stdout}\n--- stderr ---\n${r.stderr}`,
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
  const dir = mkdtempSync(join(tmpdir(), "validate-phase-1u-"));
  for (const sub of ["rules", "skills", "agents", "commands", "adrs", "hooks", "bin", "tests"]) {
    mkdirSync(join(dir, sub), { recursive: true });
  }
  fixtures.push(dir);
  return dir;
};

const seedSkill = (repo: string, name: string, description: string): string => {
  const skillDir = join(repo, "skills", name);
  mkdirSync(skillDir, { recursive: true });
  const path = join(skillDir, "SKILL.md");
  const body = `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`;
  writeFileSync(path, body);
  return path;
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
      console.error(
        `afterEach: rmSync failed for ${dir}: ${(e as Error).message}`,
      );
    }
  }
});

describe("validate.fish Phase 1u (slash-trigger collision, #442)", () => {
  test("A: two skills both claim /foo → hard fail", () => {
    const repo = makeRepoFixture();
    seedSkill(repo, "alpha", 'Use when the user says /foo, "do alpha".');
    seedSkill(repo, "beta", 'Use when the user says /foo, "do beta".');
    const result = runValidate(repo);
    const out = extractPhase1u(result);
    expect(out).toMatch(/✗.*\/foo.*collision/);
    expect(out).toMatch(/alpha/);
    expect(out).toMatch(/beta/);
    expect(result.exitCode).toBe(1);
  });

  test("B: each skill claims its own /name (self-claim) → passes", () => {
    const repo = makeRepoFixture();
    seedSkill(repo, "alpha", "Use when the user says /alpha, do alpha things.");
    seedSkill(repo, "beta", "Use when the user says /beta, do beta things.");
    const out = extractPhase1u(runValidate(repo));
    expect(out).not.toMatch(/✗.*collision/);
    expect(out).toMatch(/✓.*alpha.*\/alpha/);
    expect(out).toMatch(/✓.*beta.*\/beta/);
  });

  test("C: skill with no slash trigger in description → skipped", () => {
    const repo = makeRepoFixture();
    seedSkill(repo, "no-slash", "Auto-triggers on natural-language patterns; no slash form.");
    const out = extractPhase1u(runValidate(repo));
    expect(out).toMatch(/no-slash.*no slash trigger/);
    expect(out).not.toMatch(/✗.*no-slash/);
  });

  test("D: no skills present → loud fail", () => {
    const repo = makeRepoFixture();
    const out = extractPhase1u(runValidate(repo));
    expect(out).toMatch(/✗.*Phase 1u.*no SKILL.md/);
  });

  test("E: skill claims another skill's name as foreign trigger → fail", () => {
    const repo = makeRepoFixture();
    seedSkill(repo, "real", "Use when the user says /real, do real things.");
    seedSkill(repo, "impostor", "Use when the user says /real, do other things.");
    const result = runValidate(repo);
    const out = extractPhase1u(result);
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
    const out = extractPhase1u(runValidate(repo));
    expect(out).toMatch(/✓.*owner.*\/owner/);
    expect(out).toMatch(/✓.*describer.*\/describer/);
    expect(out).not.toMatch(/✗.*collision/);
  });
});
