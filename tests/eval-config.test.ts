import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EvalConfigError, evalConfigEnv } from "./eval-config.ts";

const roots: string[] = [];
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "eval-config-"));
  roots.push(d);
  return d;
};
afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

/** An eval folder whose CLAUDE.md links to <target>/global/CLAUDE.md. */
const linkedEvalDir = (root: string, target: string): string => {
  const dir = join(root, "eval");
  mkdirSync(dir, { recursive: true });
  symlinkSync(join(target, "global", "CLAUDE.md"), join(dir, "CLAUDE.md"));
  return dir;
};

describe("evalConfigEnv", () => {
  test("returns CLAUDE_CONFIG_DIR for a folder linked to this checkout", () => {
    const root = tmp();
    const dir = linkedEvalDir(root, "/the/repo");
    expect(evalConfigEnv({ CLAUDE_EVAL_HOME: dir }, root, "/the/repo")).toEqual({ CLAUDE_CONFIG_DIR: dir });
  });

  test("defaults to <home>/.claude-eval", () => {
    const root = tmp();
    mkdirSync(join(root, ".claude-eval"));
    symlinkSync("/the/repo/global/CLAUDE.md", join(root, ".claude-eval", "CLAUDE.md"));
    expect(evalConfigEnv({}, root, "/the/repo")).toEqual({ CLAUDE_CONFIG_DIR: join(root, ".claude-eval") });
  });

  test("throws EvalConfigError naming the fix when the folder is missing", () => {
    const root = tmp();
    const fn = () => evalConfigEnv({ CLAUDE_EVAL_HOME: join(root, "nope") }, root, "/the/repo");
    expect(fn).toThrow(EvalConfigError);
    expect(fn).toThrow(/fish bin\/setup-eval-home\.fish/);
  });

  test("throws when CLAUDE.md points into a different checkout", () => {
    const root = tmp();
    const dir = linkedEvalDir(root, "/some/other/repo");
    expect(() => evalConfigEnv({ CLAUDE_EVAL_HOME: dir }, root, "/the/repo")).toThrow(EvalConfigError);
  });

  test("accepts a checkout reached through a symlinked folder", () => {
    const root = tmp();
    mkdirSync(join(root, "real", "global"), { recursive: true });
    writeFileSync(join(root, "real", "global", "CLAUDE.md"), "x");
    symlinkSync(join(root, "real"), join(root, "alias"));
    const dir = linkedEvalDir(root, realpathSync(join(root, "real")));
    expect(evalConfigEnv({ CLAUDE_EVAL_HOME: dir }, root, join(root, "alias"))).toEqual({ CLAUDE_CONFIG_DIR: dir });
  });

  test("EVAL_ALLOW_DEFAULT_CONFIG=1 returns {} without checking", () => {
    expect(evalConfigEnv({ EVAL_ALLOW_DEFAULT_CONFIG: "1" }, "/nonexistent", "/the/repo")).toEqual({});
  });
});
