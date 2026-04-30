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
  return {
    exitCode: result.status ?? -1,
    stdout: result.stdout,
    stderr: result.stderr,
  };
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
    expect(install.exitCode).toBe(0);

    const check = runLinkConfig(home, "--check");
    expect(check.exitCode).toBe(0);

    const badLines = check.stdout
      .split("\n")
      .filter((line) => /^(MISSING|STALE|ERROR)/.test(line));
    expect(badLines).toEqual([]);
  });

  test("re-running --install is idempotent (linked=0, already-ok>0)", () => {
    const home = makeFixtureHome();

    const first = runLinkConfig(home, "--install");
    expect(first.exitCode).toBe(0);

    const second = runLinkConfig(home, "--install");
    expect(second.exitCode).toBe(0);

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
    expect(install.exitCode).toBe(0);

    // Break one symlink: re-point CLAUDE.md (always present) at a
    // nonexistent target.
    const brokenDst = join(home, ".claude", "CLAUDE.md");
    expect(lstatSync(brokenDst).isSymbolicLink()).toBe(true);
    unlinkSync(brokenDst);
    const nonce = Math.random().toString(36).slice(2);
    symlinkSync(`/tmp/nonexistent-link-target-${nonce}`, brokenDst);

    const check = runLinkConfig(home, "--check");
    expect(check.exitCode).not.toBe(0);
    const staleLine = check.stdout
      .split("\n")
      .find((line) => /^STALE link:.*CLAUDE\.md/.test(line));
    expect(staleLine).toBeDefined();
  });
});
