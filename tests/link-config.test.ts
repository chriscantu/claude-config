import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, lstatSync, unlinkSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Round-trip regression test for bin/link-config.fish.
//
// Asserts that --install (against a fixture HOME) produces a layout that
// --check verifies as 0 errors / 0 missing — i.e. the install loop and
// check_symlink_layout / each_symlink_target agree by construction.
//
// Issue #201, deferred from PR #198 review (pr-test-analyzer Important #1).
//
// Migrated from tests/link-config-test.fish to TypeScript per discussion on
// PR #208: subprocess-style tests gain real assertion lib + IDE support
// without losing anything (we're shelling out to fish either way).
// Pure in-process lib tests remain in fish (see tests/symlinks-test.fish)
// because they `source` the fish lib directly.

const REPO = resolve(import.meta.dir, "..");
const SCRIPT = join(REPO, "bin", "link-config.fish");

type RunResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

const runLinkConfig = (home: string, ...args: string[]): RunResult => {
  const result = spawnSync("fish", [SCRIPT, ...args], {
    env: { ...process.env, HOME: home },
    encoding: "utf8",
  });
  // spawn itself failed (fish missing, fork limit, etc.) → status is null
  // and result.error holds the real cause. Surface it directly so a CI
  // failure shows the spawn error instead of a misleading "exit -1".
  if (result.error) throw result.error;
  return {
    exitCode: result.status ?? -1,
    stdout: result.stdout,
    stderr: result.stderr,
  };
};

// expect(...).toBe(0) on a non-zero exit shows only the diff. The fish
// origin printed the captured log on failure so CI logs explained why the
// script exited non-zero. Preserve that affordance: throw an Error whose
// message includes label + stdout + stderr when a run did not match
// expectations. Use for exit-code assertions and the rare cases where the
// next assertion depends on the run having succeeded.
const assertExit = (label: string, r: RunResult, expected: "zero" | "non-zero") => {
  const ok = expected === "zero" ? r.exitCode === 0 : r.exitCode !== 0;
  if (!ok) {
    throw new Error(
      `${label}: expected ${expected} exit, got ${r.exitCode}\n--- stdout ---\n${r.stdout}--- stderr ---\n${r.stderr}`,
    );
  }
};

const fixtures: string[] = [];
const makeFixtureHome = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "link-config-test-"));
  fixtures.push(dir);
  return dir;
};

afterEach(() => {
  while (fixtures.length > 0) {
    const dir = fixtures.pop()!;
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup; tmpdir reaper handles stragglers.
    }
  }
});

describe("link-config.fish round-trip", () => {
  test("--install on empty HOME succeeds, --check verifies clean", () => {
    const home = makeFixtureHome();

    const install = runLinkConfig(home, "--install");
    assertExit("--install on empty HOME", install, "zero");

    const check = runLinkConfig(home, "--check");
    assertExit("--check after clean install", check, "zero");

    const badLines = check.stdout
      .split("\n")
      .filter((line) => /^(MISSING|STALE|ERROR)/.test(line));
    expect(badLines).toEqual([]);
  });

  test("re-running --install is idempotent (linked=0, already-ok>0)", () => {
    const home = makeFixtureHome();

    const first = runLinkConfig(home, "--install");
    assertExit("first --install", first, "zero");

    const second = runLinkConfig(home, "--install");
    assertExit("second --install", second, "zero");

    const summary = second.stdout
      .split("\n")
      .find((line) => line.startsWith("Summary:"));
    expect(summary).toBeDefined();
    // Anchor to literal `Summary: linked=0 ` prefix so a future format
    // token like `relinked=0` cannot false-pass.
    expect(summary!).toStartWith("Summary: linked=0 ");
    expect(summary!).toMatch(/already-ok=[1-9]/);
  });

  test("--check exits non-zero with STALE line when symlink is broken", () => {
    const home = makeFixtureHome();

    const install = runLinkConfig(home, "--install");
    assertExit("setup --install", install, "zero");

    // Break one symlink: re-point CLAUDE.md (always present) at a
    // nonexistent target.
    const brokenDst = join(home, ".claude", "CLAUDE.md");
    expect(lstatSync(brokenDst).isSymbolicLink()).toBe(true);
    unlinkSync(brokenDst);
    const nonce = Math.random().toString(36).slice(2);
    symlinkSync(`/tmp/nonexistent-link-target-${nonce}`, brokenDst);

    const check = runLinkConfig(home, "--check");
    assertExit("--check on broken symlink", check, "non-zero");
    const staleLine = check.stdout
      .split("\n")
      .find((line) => /^STALE link:.*CLAUDE\.md/.test(line));
    expect(staleLine).toBeDefined();
  });
});
