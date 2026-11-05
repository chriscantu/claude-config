import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Tests for eval_home_check in bin/lib/eval-home.fish.

const LIB = join(resolve(import.meta.dir, ".."), "bin", "lib", "eval-home.fish");

const roots: string[] = [];
afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

/** A checkout at <root>/real, plus <root>/alias, a symlink to it. */
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "eval-home-"));
  roots.push(root);
  mkdirSync(join(root, "real", "global"), { recursive: true });
  writeFileSync(join(root, "real", "global", "CLAUDE.md"), "x");
  symlinkSync(join(root, "real"), join(root, "alias"));
  const evalDir = join(root, "eval");
  mkdirSync(evalDir);
  return { root, evalDir };
};

const check = (evalDir: string, repo: string) =>
  spawnSync("fish", ["-c", `source ${LIB}; eval_home_check $argv[1]`, repo], {
    env: { ...process.env, CLAUDE_EVAL_HOME: evalDir },
    encoding: "utf8",
  });

describe("eval_home_check", () => {
  test("accepts a checkout reached through a symlinked folder", () => {
    const { root, evalDir } = fixture();
    // link-config resolves --source, so the link holds the real path.
    symlinkSync(join(realpathSync(root), "real", "global", "CLAUDE.md"), join(evalDir, "CLAUDE.md"));
    const r = check(evalDir, join(root, "alias"));
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
  });

  test("refuses a folder linked to a different checkout", () => {
    const { root, evalDir } = fixture();
    mkdirSync(join(root, "other", "global"), { recursive: true });
    writeFileSync(join(root, "other", "global", "CLAUDE.md"), "x");
    symlinkSync(join(root, "other", "global", "CLAUDE.md"), join(evalDir, "CLAUDE.md"));
    const r = check(evalDir, join(root, "alias"));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("Run: fish bin/setup-eval-home.fish");
  });

  test("refuses a missing eval folder", () => {
    const { root } = fixture();
    const r = check(join(root, "nope"), join(root, "real"));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("missing or not set up");
  });
});
