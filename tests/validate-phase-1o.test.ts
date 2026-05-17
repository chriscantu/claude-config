import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Regression tests for validate.fish Phase 1o (scope-tier hook artifacts).
//
// Phase 1o asserts:
//   - hooks/scope-tier-memory-check.sh exists in the repo
//   - hooks/scope-tier-memory-check.sh is executable
//   - tests/evals-lib.ts contains `additional_context?: string` (substrate contract)
//
// Tests:
//   A) Real repo → Phase 1o passes on all checks
//   B) Hook file deleted → FAIL with "missing" message
//   C) Hook not executable → FAIL with "not executable"
//   D) evals-lib.ts missing additional_context → FAIL with "additional_context"

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

// Extract only the Phase 1o block from validate.fish output.
// Combines stdout + stderr and slices from the "── Phase 1o" header
// through the next blank line so assertions target only 1o output.
const extractPhase1o = (r: RunResult): string => {
  const combined = `${r.stdout}\n${r.stderr}`;
  const lines = combined.split("\n");
  const headerIdx = lines.findIndex((line) =>
    line.includes("── Phase 1o"),
  );
  if (headerIdx < 0) {
    throw new Error(
      `Phase 1o header not found in validate.fish output — phase may not be implemented yet.\n--- stdout ---\n${r.stdout}\n--- stderr ---\n${r.stderr}`,
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
const TMP_PREFIX = tmpdir();

// Build a minimal fixture containing only the files Phase 1o needs.
// Other phases will produce failures/warnings from this sparse fixture,
// but Phase 1o assertions are extracted by extractPhase1o so sibling-phase
// results don't affect these tests.
const makeMinFixture = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "validate-phase-1o-"));
  fixtures.push(dir);
  // Required subdirs for validate.fish to not error on startup
  for (const sub of ["rules", "skills", "agents", "commands", "adrs", "hooks", "bin", "tests"]) {
    mkdirSync(join(dir, sub), { recursive: true });
  }
  return dir;
};

// Copy the real hook, installer, and evals-lib into a fixture dir.
const seedPhase1oArtifacts = (dir: string): void => {
  const realHook = readFileSync(join(REPO, "hooks", "scope-tier-memory-check.sh"));
  const hookDest = join(dir, "hooks", "scope-tier-memory-check.sh");
  writeFileSync(hookDest, realHook);
  chmodSync(hookDest, 0o755);

  const realInstaller = readFileSync(join(REPO, "bin", "install-scope-tier-hook.fish"));
  const installerDest = join(dir, "bin", "install-scope-tier-hook.fish");
  writeFileSync(installerDest, realInstaller);
  chmodSync(installerDest, 0o755);

  const realEvalsLib = readFileSync(join(REPO, "tests", "evals-lib.ts"), "utf8");
  writeFileSync(join(dir, "tests", "evals-lib.ts"), realEvalsLib);
};

afterEach(() => {
  while (fixtures.length > 0) {
    const dir = fixtures.pop()!;
    if (!dir.startsWith(TMP_PREFIX)) {
      console.error(`afterEach: refusing to clean non-tmp path ${dir}`);
      continue;
    }
    // Restore perms in case a test chmod'd a file inside
    const restore = spawnSync("chmod", ["-R", "u+rw", dir], { encoding: "utf8" });
    if (restore.error) {
      console.error(`afterEach: chmod spawn failed for ${dir}: ${restore.error.message}`);
    } else if (restore.status !== 0) {
      console.error(`afterEach: chmod exited ${restore.status} for ${dir}: ${restore.stderr}`);
    }
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch (e) {
      console.error(`afterEach: rmSync failed for ${dir}: ${(e as Error).message}`);
    }
  }
});

describe("validate.fish Phase 1o (scope-tier hook artifacts)", () => {
  test("A: real repo artifacts present → Phase 1o passes", () => {
    const fixture = makeMinFixture();
    seedPhase1oArtifacts(fixture);
    const out = extractPhase1o(runValidate(fixture));
    expect(out).not.toContain("✗");
    expect(out).toContain("scope-tier-memory-check.sh present");
    expect(out).toContain("Eval.additional_context present");
  });

  test("B: hook file deleted → FAIL with missing message", () => {
    const fixture = makeMinFixture();
    seedPhase1oArtifacts(fixture);
    unlinkSync(join(fixture, "hooks", "scope-tier-memory-check.sh"));
    const out = extractPhase1o(runValidate(fixture));
    expect(out).toMatch(/scope-tier-memory-check\.sh.*missing/i);
  });

  test("C: hook not executable → FAIL with not-executable message", () => {
    const fixture = makeMinFixture();
    seedPhase1oArtifacts(fixture);
    chmodSync(join(fixture, "hooks", "scope-tier-memory-check.sh"), 0o644);
    const out = extractPhase1o(runValidate(fixture));
    expect(out).toMatch(/not executable/i);
  });

  test("D: evals-lib.ts missing additional_context → FAIL with additional_context message", () => {
    const fixture = makeMinFixture();
    seedPhase1oArtifacts(fixture);
    // Remove the additional_context field declaration from evals-lib.ts
    const evalsLib = readFileSync(join(fixture, "tests", "evals-lib.ts"), "utf8");
    const patched = evalsLib.replace(/\s*additional_context\?\s*:\s*string;?/g, "");
    expect(patched).not.toBe(evalsLib); // Guard: patch must have changed something
    writeFileSync(join(fixture, "tests", "evals-lib.ts"), patched);
    const out = extractPhase1o(runValidate(fixture));
    expect(out).toMatch(/additional_context/i);
    expect(out).toContain("✗");
  });
});
