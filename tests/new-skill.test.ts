import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const REPO = resolve(import.meta.dir, "..");
const SCRIPT = resolve(REPO, "bin", "new-skill");
const SCRATCH_SLUG = "test-new-skill-scratch";
const SCRATCH_DIR = resolve(REPO, "skills", SCRATCH_SLUG);

const run = (...args: string[]) =>
  spawnSync("fish", [SCRIPT, ...args], { cwd: REPO, encoding: "utf8" });

afterEach(() => {
  // Always clean the scratch slug, even if a test failed mid-scaffold.
  rmSync(SCRATCH_DIR, { recursive: true, force: true });
});

describe("bin/new-skill", () => {
  test("--dry-run prints intended files without writing", () => {
    const r = run("--dry-run", SCRATCH_SLUG);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(`skills/${SCRATCH_SLUG}/SKILL.md`);
    expect(r.stdout).toContain(`skills/${SCRATCH_SLUG}/evals/README.md`);
    expect(r.stdout).toContain("(dry-run) no files written");
    expect(existsSync(SCRATCH_DIR)).toBe(false);
  });

  test("rejects invalid slug", () => {
    const r = run("BAD_Slug");
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("invalid slug");
    expect(existsSync(resolve(REPO, "skills", "BAD_Slug"))).toBe(false);
  });

  test("rejects collision with existing skill", () => {
    const r = run("swot");
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("already exists");
  });

  test("rejects unknown flag", () => {
    const r = run("--bogus", SCRATCH_SLUG);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("unknown flag");
  });

  test("real scaffold produces validate-clean skill with slug substituted", () => {
    const r = run(SCRATCH_SLUG);
    expect(r.status).toBe(0);
    expect(existsSync(resolve(SCRATCH_DIR, "SKILL.md"))).toBe(true);
    expect(existsSync(resolve(SCRATCH_DIR, "evals", "README.md"))).toBe(true);
    expect(existsSync(resolve(SCRATCH_DIR, "references", ".gitkeep"))).toBe(true);

    // evals.json is intentionally NOT scaffolded — runner rejects empty arrays.
    expect(existsSync(resolve(SCRATCH_DIR, "evals", "evals.json"))).toBe(false);

    const skillMd = readFileSync(resolve(SCRATCH_DIR, "SKILL.md"), "utf8");
    expect(skillMd).toContain(`name: ${SCRATCH_SLUG}`);
    expect(skillMd).not.toContain("SKILL_NAME");

    expect(r.stdout).toContain("validates clean");
  });
});
