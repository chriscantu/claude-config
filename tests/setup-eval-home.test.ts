import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Tests for bin/setup-eval-home.fish against a fixture HOME. Never touches
// the real ~/.claude-eval (it holds the user's eval login).

const REPO = resolve(import.meta.dir, "..");
const SCRIPT = join(REPO, "bin", "setup-eval-home.fish");

let home: string;
let evalHome: string;

const run = (extraEnv: Record<string, string> = {}) => {
  const r = spawnSync("fish", [SCRIPT, "--no-auth-check"], {
    env: { ...process.env, HOME: home, ...extraEnv },
    encoding: "utf8",
  });
  if (r.error) throw r.error;
  return { exitCode: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
};

const settings = () => JSON.parse(readFileSync(join(evalHome, "settings.json"), "utf8"));

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "eval-home-"));
  evalHome = join(home, ".claude-eval");
  mkdirSync(join(home, ".claude", "plugins"), { recursive: true });
  const hook = (command: string) => ({ type: "command", command });
  writeFileSync(
    join(home, ".claude", "settings.json"),
    JSON.stringify({
      model: "opus",
      hooks: {
        PreToolUse: [{ matcher: "Bash", hooks: [hook(`${home}/.claude/hooks/x.sh`)] }],
        SessionStart: [{ hooks: [hook(`${home}/.claude/hooks/config-release-update.sh`)] }],
      },
    }),
  );
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

describe("setup-eval-home.fish", () => {
  test("links the checkout into the eval folder", () => {
    expect(run().exitCode).toBe(0);
    expect(readlinkSync(join(evalHome, "CLAUDE.md"))).toBe(join(REPO, "global", "CLAUDE.md"));
  });

  test("rewrites hook paths to the eval folder", () => {
    run();
    expect(settings().hooks.PreToolUse[0].hooks[0].command).toBe(`${evalHome}/hooks/x.sh`);
    expect(settings().model).toBe("opus");
  });

  test("drops the release updater", () => {
    run();
    expect(settings().hooks.SessionStart).toBeUndefined();
  });

  test("links plugins", () => {
    run();
    expect(readlinkSync(join(evalHome, "plugins"))).toBe(join(home, ".claude", "plugins"));
  });

  test("backs up a real plugins dir once", () => {
    mkdirSync(join(evalHome, "plugins"), { recursive: true });
    writeFileSync(join(evalHome, "plugins", "marker"), "x");
    expect(run().exitCode).toBe(0);
    expect(existsSync(join(evalHome, "plugins.bak", "marker"))).toBe(true);
    expect(lstatSync(join(evalHome, "plugins")).isSymbolicLink()).toBe(true);
    expect(run().exitCode).toBe(0);
  });

  test("exits 2 when plugins.bak already exists beside a real plugins dir", () => {
    mkdirSync(join(evalHome, "plugins"), { recursive: true });
    mkdirSync(join(evalHome, "plugins.bak"), { recursive: true });
    expect(run().exitCode).toBe(2);
  });

  test("CLAUDE_EVAL_HOME overrides the path", () => {
    const custom = join(home, "custom-eval");
    expect(run({ CLAUDE_EVAL_HOME: custom }).exitCode).toBe(0);
    expect(readlinkSync(join(custom, "CLAUDE.md"))).toBe(join(REPO, "global", "CLAUDE.md"));
    expect(existsSync(evalHome)).toBe(false);
  });

  test("links first-run-personalization.md when present", () => {
    mkdirSync(join(home, ".claude", "rules"), { recursive: true });
    writeFileSync(join(home, ".claude", "rules", "first-run-personalization.md"), "p");
    run();
    expect(readlinkSync(join(evalHome, "rules", "first-run-personalization.md"))).toBe(
      join(home, ".claude", "rules", "first-run-personalization.md"),
    );
  });
});
