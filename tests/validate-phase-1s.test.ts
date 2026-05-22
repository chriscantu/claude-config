import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Regression tests for validate.fish Phase 1s (skill persistence destinations,
// ADR #0020).
//
// Phase 1s closes the silent-failure mode where a skills/<name>/SKILL.md
// declares it reads or writes the plugin-internal memory layer
// (decisions.md / patterns.md). ADR #0020 scopes that layer to plugin-internal
// use; claude-config skills MUST NOT consume it. The lint trips on bare
// positive references and lets exclusion declarations through.
//
// Tests:
//   A) Clean SKILL.md without any decisions.md/patterns.md mention → passes
//   B) SKILL.md with bare positive write reference → hard fails with ADR #0020 cite
//   C) SKILL.md with exclusion declaration ("does NOT write decisions.md") → passes
//   D) Zero-state: no skills/*/SKILL.md → documented pass, no fail
//   E) Mixed: one clean + one bare-write → only the offender fails
//   F) Exclusion via alternate negation marker ("non-addressable") → passes

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

// Capture only the Phase 1s block — header through next blank line.
const extractPhase1s = (r: RunResult): string => {
  const combined = `${r.stdout}\n${r.stderr}`;
  const lines = combined.split("\n");
  const headerIdx = lines.findIndex((line) =>
    line.includes("── Phase 1s: skill persistence destinations"),
  );
  if (headerIdx < 0) {
    throw new Error(
      `Phase 1s header not found.\n--- stdout ---\n${r.stdout}\n--- stderr ---\n${r.stderr}`,
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
  const dir = mkdtempSync(join(tmpdir(), "validate-phase-1s-"));
  for (const sub of ["rules", "skills", "agents", "commands", "adrs"]) {
    mkdirSync(join(dir, sub), { recursive: true });
  }
  fixtures.push(dir);
  return dir;
};

const seedSkill = (repo: string, skill: string, skillMdBody: string): string => {
  const skillDir = join(repo, "skills", skill);
  mkdirSync(skillDir, { recursive: true });
  const skillMd = join(skillDir, "SKILL.md");
  const frontmatter = `---\nname: ${skill}\ndescription: stub for Phase 1s fixture\n---\n\n`;
  writeFileSync(skillMd, frontmatter + skillMdBody);
  return skillMd;
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

describe("validate.fish Phase 1s (skill persistence destinations, ADR #0020)", () => {
  test("A: SKILL.md with no decisions.md/patterns.md references → passes", () => {
    const repo = makeRepoFixture();
    seedSkill(
      repo,
      "clean-skill",
      "# Clean Skill\n\nSaves things to a memory layer named in ADR #0020.\n",
    );
    const out = extractPhase1s(runValidate(repo));
    expect(out).toContain(
      "skills/clean-skill/SKILL.md: no decisions.md/patterns.md references",
    );
    expect(out).not.toMatch(/✗.*clean-skill/);
  });

  test("B: SKILL.md with bare positive write reference → hard fail with ADR #0020 cite", () => {
    const repo = makeRepoFixture();
    seedSkill(
      repo,
      "leaky-skill",
      "# Leaky Skill\n\nThis skill writes its state to `decisions.md` under the plugin layer.\n",
    );
    const out = extractPhase1s(runValidate(repo));
    expect(out).toContain(
      "skills/leaky-skill/SKILL.md: bare reference to decisions.md/patterns.md",
    );
    expect(out).toContain("ADR #0020");
    expect(out).not.toContain(
      "skills/leaky-skill/SKILL.md: no decisions.md/patterns.md references",
    );
  });

  test("C: SKILL.md with exclusion declaration ('does NOT write decisions.md') → passes", () => {
    const repo = makeRepoFixture();
    seedSkill(
      repo,
      "polite-skill",
      "# Polite Skill\n\nThis skill does NOT read or write `decisions.md` or `patterns.md`.\n",
    );
    const out = extractPhase1s(runValidate(repo));
    expect(out).toContain(
      "skills/polite-skill/SKILL.md: all 1 decisions.md/patterns.md mention(s) are exclusion declarations",
    );
    expect(out).not.toMatch(/✗.*polite-skill/);
  });

  test("D: zero-state — no skills/*/SKILL.md → documented pass, no fail", () => {
    const repo = makeRepoFixture();
    // Deliberately no skill files seeded.
    const out = extractPhase1s(runValidate(repo));
    expect(out).toContain(
      "no skills/*/SKILL.md files — Phase 1s has nothing to validate",
    );
    expect(out).not.toMatch(/✗/);
  });

  test("E: mixed — clean skill + bare-write skill → only offender fails", () => {
    const repo = makeRepoFixture();
    seedSkill(
      repo,
      "good-skill",
      "# Good Skill\n\nSaves to user working repo per ADR #0020.\n",
    );
    seedSkill(
      repo,
      "bad-skill",
      "# Bad Skill\n\nWrites to `patterns.md` for fun.\n",
    );
    const out = extractPhase1s(runValidate(repo));
    expect(out).toContain(
      "skills/good-skill/SKILL.md: no decisions.md/patterns.md references",
    );
    expect(out).toContain(
      "skills/bad-skill/SKILL.md: bare reference to decisions.md/patterns.md",
    );
    // First-fail masking guard.
    expect(out).not.toMatch(/✗.*good-skill/);
  });

  test("F: exclusion via 'non-addressable' marker → passes", () => {
    const repo = makeRepoFixture();
    seedSkill(
      repo,
      "alt-marker-skill",
      "# Alt Marker Skill\n\nThe plugin layer (`decisions.md` / `patterns.md`) is non-addressable per ADR #0020.\n",
    );
    const out = extractPhase1s(runValidate(repo));
    expect(out).toContain(
      "skills/alt-marker-skill/SKILL.md: all 1 decisions.md/patterns.md mention(s) are exclusion declarations",
    );
    expect(out).not.toMatch(/✗.*alt-marker-skill/);
  });
});
