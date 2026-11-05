import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readlinkSync, mkdtempSync, rmSync, lstatSync, unlinkSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

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

const runLinkConfigIn = (cwd: string, home: string, ...args: string[]): RunResult => {
  // Drop the operator's overrides so every path resolves inside the fixture HOME.
  const env = { ...process.env, HOME: home };
  delete env.CLAUDE_CONFIG_RELEASE_DIR;
  delete env.CLAUDE_EVAL_HOME;
  const result = spawnSync("fish", [SCRIPT, ...args], {
    cwd,
    env,
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

const runLinkConfig = (home: string, ...args: string[]): RunResult => runLinkConfigIn(REPO, home, ...args);

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
      `${label}: expected ${expected} exit, got ${r.exitCode}\n--- stdout ---\n${r.stdout.endsWith("\n") ? r.stdout : r.stdout + "\n"}--- stderr ---\n${r.stderr}`,
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

  test("--install prunes orphan symlinks pointing into repo but not in layout (issue #431)", () => {
    const home = makeFixtureHome();

    const install = runLinkConfig(home, "--install");
    assertExit("setup --install", install, "zero");

    // Plant an orphan: symlink ~/.claude/rules/retired.md → a real file
    // inside the repo (rules/GOVERNANCE.md is in-repo but excluded from
    // the layout, so it's a stable target that always exists). The orphan's
    // dst path (retired.md) is not yielded by each_symlink_target, so it
    // must be pruned. Mirrors the README.md regression that motivated the
    // fix.
    const orphanDst = join(home, ".claude", "rules", "retired.md");
    const orphanTarget = join(REPO, "rules", "GOVERNANCE.md");
    mkdirSync(join(home, ".claude", "rules"), { recursive: true });
    symlinkSync(orphanTarget, orphanDst);
    expect(lstatSync(orphanDst).isSymbolicLink()).toBe(true);

    // --check sees the orphan and exits non-zero.
    const checkBefore = runLinkConfig(home, "--check");
    assertExit("--check with orphan", checkBefore, "non-zero");
    expect(checkBefore.stdout).toMatch(/ORPHAN link:.*retired\.md/);

    // --install (default mode, not first-install) prunes it.
    const reinstall = runLinkConfig(home);
    assertExit("--install with orphan present", reinstall, "zero");
    expect(reinstall.stdout).toMatch(/PRUNED:.*retired\.md/);
    expect(existsSync(orphanDst)).toBe(false);

    // --check now clean.
    const checkAfter = runLinkConfig(home, "--check");
    assertExit("--check after prune", checkAfter, "zero");
  });

  test("--install does NOT prune symlinks pointing outside the repo (foreign-plugin safety)", () => {
    const home = makeFixtureHome();

    const install = runLinkConfig(home, "--install");
    assertExit("setup --install", install, "zero");

    // Simulate another plugin's symlink under ~/.claude/rules/.
    // Target lives outside this repo — the repo-prefix guard inside
    // each_orphan_symlink must keep it untouched.
    const foreignTargetDir = mkdtempSync(join(tmpdir(), "foreign-plugin-"));
    fixtures.push(foreignTargetDir);
    const foreignTarget = join(foreignTargetDir, "from-other-plugin.md");
    // Use Bun's file write — file doesn't need to exist for symlink, but
    // touching it is closer to the real-world case.
    Bun.write(foreignTarget, "# foreign rule\n");
    const foreignDst = join(home, ".claude", "rules", "from-other-plugin.md");
    mkdirSync(join(home, ".claude", "rules"), { recursive: true });
    symlinkSync(foreignTarget, foreignDst);

    const reinstall = runLinkConfig(home);
    assertExit("--install with foreign symlink present", reinstall, "zero");
    expect(reinstall.stdout).not.toMatch(/PRUNED:.*from-other-plugin/);
    expect(existsSync(foreignDst)).toBe(true);
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

  const cloneRelease = (home: string) => {
    const r = spawnSync("git", ["clone", "-q", "--shared", REPO, join(home, ".claude-config-release")], {
      encoding: "utf8",
    });
    if (r.status !== 0) throw new Error(`git clone failed: ${r.stderr}`);
  };

  test("default source is the release copy when one exists", () => {
    const home = makeFixtureHome();
    cloneRelease(home);

    assertExit("--install", runLinkConfig(home, "--install"), "zero");

    expect(readlinkSync(join(home, ".claude", "CLAUDE.md"))).toBe(
      join(home, ".claude-config-release", "global", "CLAUDE.md"),
    );
  });

  test("default source falls back to the checkout with a NOTE", () => {
    const home = makeFixtureHome();

    const install = runLinkConfig(home, "--install");
    assertExit("--install", install, "zero");

    expect(readlinkSync(join(home, ".claude", "CLAUDE.md"))).toBe(join(REPO, "global", "CLAUDE.md"));
    expect(install.stderr).toMatch(/^NOTE: no release copy at /m);
  });

  test("--source and --home override defaults", () => {
    const home = makeFixtureHome();

    const install = runLinkConfig(home, "--install", "--source", REPO, "--home", join(home, "eval"));
    assertExit("--install with overrides", install, "zero");

    expect(readlinkSync(join(home, "eval", "CLAUDE.md"))).toBe(join(REPO, "global", "CLAUDE.md"));
    expect(existsSync(join(home, ".claude"))).toBe(false);
  });

  test("--check flags links into the checkout as STALE once a release copy exists", () => {
    const home = makeFixtureHome();
    assertExit("--install", runLinkConfig(home, "--install"), "zero");
    cloneRelease(home);

    const check = runLinkConfig(home, "--check");
    assertExit("--check", check, "non-zero");
    expect(check.stdout).toMatch(/^STALE link:/m);
  });

  test("relative --source and --home resolve to absolute paths", () => {
    const home = makeFixtureHome();
    const relSource = runLinkConfigIn(dirname(REPO), home, "--source", basename(REPO), "--home", join(home, "a"));
    assertExit("relative --source", relSource, "zero");
    expect(readlinkSync(join(home, "a", "CLAUDE.md"))).toBe(join(REPO, "global", "CLAUDE.md"));

    const relHome = runLinkConfigIn(home, home, "--source", REPO, "--home", "b");
    assertExit("relative --home", relHome, "zero");
    expect(readlinkSync(join(home, "b", "CLAUDE.md"))).toBe(join(REPO, "global", "CLAUDE.md"));
  });

  test("--source that is not a directory exits 2", () => {
    const home = makeFixtureHome();
    const r = runLinkConfig(home, "--source", join(home, "missing"), "--home", join(home, "eval"));
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/--source .*missing.* is not a directory/);
    expect(existsSync(join(home, "eval"))).toBe(false);
  });

  // Cutover: ~/.claude used to link into the checkout. Once the release copy
  // is the source, leftover links into the checkout for files the layout no
  // longer has (a deleted skill) must not survive or pass --check.
  test("links into the old checkout that are not in the layout are reported, then pruned", () => {
    const home = makeFixtureHome();
    cloneRelease(home);
    assertExit("first sync", runLinkConfig(home), "zero");

    const deadSkill = join(home, ".claude", "skills", "retired-skill");
    symlinkSync(join(REPO, "skills", "retired-skill"), deadSkill);
    const oldRule = join(home, ".claude", "rules", "retired.md");
    symlinkSync(join(REPO, "rules", "GOVERNANCE.md"), oldRule);
    const foreignDir = mkdtempSync(join(tmpdir(), "foreign-plugin-"));
    fixtures.push(foreignDir);
    const foreign = join(home, ".claude", "rules", "from-other-plugin.md");
    symlinkSync(join(foreignDir, "x.md"), foreign);

    const check = runLinkConfig(home, "--check");
    assertExit("--check with old-checkout links", check, "non-zero");
    expect(check.stdout).toMatch(/^ORPHAN link: .*skills\/retired-skill/m);
    expect(check.stdout).toMatch(/^ORPHAN link: .*rules\/retired\.md/m);
    expect(check.stdout).not.toMatch(/from-other-plugin/);

    const sync = runLinkConfig(home);
    assertExit("sync", sync, "zero");
    expect(sync.stdout).toMatch(/PRUNED:.*retired-skill/);
    expect(sync.stdout).toMatch(/PRUNED:.*retired\.md/);
    expect(existsSync(oldRule)).toBe(false);
    expect(() => lstatSync(deadSkill)).toThrow();
    expect(lstatSync(foreign).isSymbolicLink()).toBe(true);
    assertExit("--check after prune", runLinkConfig(home, "--check"), "zero");
  });
});
