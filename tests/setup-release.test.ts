import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Tests for bin/setup-release.fish. HOME is a fixture, and --repo is a shared
// clone, so the real repo's worktree list and the real ~/.claude stay untouched.

const REPO = resolve(import.meta.dir, "..");
const SCRIPT = join(REPO, "bin", "setup-release.fish");

let root: string;
let home: string;
let clone: string;
let rel: string;

const git = (cwd: string, ...args: string[]) => {
  const r = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
  return { status: r.status ?? -1, out: r.stdout.trim() };
};

const run = (...extra: string[]) => {
  const r = spawnSync("fish", [SCRIPT, "--repo", clone, ...extra], {
    env: { ...process.env, HOME: home, CLAUDE_CONFIG_RELEASE_DIR: rel },
    encoding: "utf8",
  });
  if (r.error) throw r.error;
  return { exitCode: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
};

/** True when PATH exists, even as a dangling link. */
const lstatExists = (path: string) => {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
};

const hookCount = () => {
  const s = JSON.parse(readFileSync(join(home, ".claude", "settings.json"), "utf8"));
  return s.hooks.SessionStart.flatMap((e: any) => e.hooks).filter((h: any) =>
    String(h.command).endsWith("config-release-update.sh"),
  ).length;
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "setup-release-"));
  home = join(root, "home");
  mkdirSync(home);
  rel = join(root, "release");
  clone = join(root, "clone");
  // Bare "origin" gets HEAD as main, so the fixture never needs a local main
  // branch (CI checks out PRs detached).
  const origin = join(root, "origin.git");
  const steps: string[][] = [
    ["init", "-q", "--bare", origin],
    ["-C", REPO, "push", "-q", origin, "HEAD:refs/heads/main"],
    ["clone", "-q", origin, clone],
  ];
  for (const args of steps) {
    const r = spawnSync("git", args, { encoding: "utf8" });
    if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  }
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("setup-release.fish", () => {
  test("creates a detached release copy at origin/main", () => {
    expect(run().exitCode).toBe(0);
    expect(git(rel, "rev-parse", "HEAD").out).toBe(git(clone, "rev-parse", "origin/main").out);
    expect(git(rel, "symbolic-ref", "-q", "HEAD").status).not.toBe(0);
  });

  test("links ~/.claude to the release copy", () => {
    expect(run().exitCode).toBe(0);
    expect(readlinkSync(join(home, ".claude", "CLAUDE.md"))).toBe(join(rel, "global", "CLAUDE.md"));
  });

  test("registers the SessionStart hook once", () => {
    expect(run().exitCode).toBe(0);
    expect(run().exitCode).toBe(0);
    expect(hookCount()).toBe(1);
  });

  test("--install backs up a real file and links to the release copy", () => {
    mkdirSync(join(home, ".claude"), { recursive: true });
    writeFileSync(join(home, ".claude", "CLAUDE.md"), "mine");
    expect(run().exitCode).toBe(2);
    expect(run("--install").exitCode).toBe(0);
    expect(existsSync(join(home, ".claude", "CLAUDE.md.bak"))).toBe(true);
    expect(readlinkSync(join(home, ".claude", "CLAUDE.md"))).toBe(join(rel, "global", "CLAUDE.md"));
  });

  test("backs up an existing settings.json before editing", () => {
    mkdirSync(join(home, ".claude"), { recursive: true });
    writeFileSync(join(home, ".claude", "settings.json"), JSON.stringify({ model: "opus" }));
    expect(run().exitCode).toBe(0);
    expect(readdirSync(join(home, ".claude")).some((f) => f.startsWith("settings.json.bak."))).toBe(true);
    expect(JSON.parse(readFileSync(join(home, ".claude", "settings.json"), "utf8")).model).toBe("opus");
  });

  test("refuses invalid settings.json and leaves it unchanged", () => {
    mkdirSync(join(home, ".claude"), { recursive: true });
    writeFileSync(join(home, ".claude", "settings.json"), "{not json");
    expect(run().exitCode).toBe(2);
    expect(readFileSync(join(home, ".claude", "settings.json"), "utf8")).toBe("{not json");
  });

  test("prunes links into --repo for paths the release copy lacks", () => {
    // A skill that exists only on the working checkout's branch.
    mkdirSync(join(clone, "skills", "branch-only"), { recursive: true });
    mkdirSync(join(home, ".claude", "skills"), { recursive: true });
    const dst = join(home, ".claude", "skills", "branch-only");
    symlinkSync(join(clone, "skills", "branch-only"), dst);
    expect(run().exitCode).toBe(0);
    expect(lstatExists(dst)).toBe(false);
  });

  test("marks the release copy so the hook can recognize it", () => {
    expect(run().exitCode).toBe(0);
    const gitDir = git(rel, "rev-parse", "--absolute-git-dir").out;
    expect(existsSync(join(gitDir, "claude-config-release"))).toBe(true);
  });

  test("refuses a non-git release dir", () => {
    mkdirSync(rel);
    writeFileSync(join(rel, "keep.txt"), "x");
    expect(run().exitCode).toBe(2);
    expect(readdirSync(rel)).toEqual(["keep.txt"]);
    expect(existsSync(join(rel, ".git"))).toBe(false);
  });
});
