import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Tests for bin/setup-eval-home.fish against a fixture HOME. Never touches
// the real ~/.claude-eval (it holds the user's eval login).

const REPO = resolve(import.meta.dir, "..");
const SCRIPT = join(REPO, "bin", "setup-eval-home.fish");

let home: string;
let evalHome: string;

const run = (extraEnv: Record<string, string> = {}) => {
  // Drop the operator's overrides: the default eval folder must resolve inside
  // the fixture HOME, never to a real one.
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: home };
  delete env.CLAUDE_EVAL_HOME;
  delete env.CLAUDE_CONFIG_RELEASE_DIR;
  const r = spawnSync("fish", [SCRIPT, "--no-auth-check"], {
    env: { ...env, ...extraEnv },
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

  test("ignores the operator's CLAUDE_EVAL_HOME", () => {
    const operator = join(home, "operator-eval");
    const saved = process.env.CLAUDE_EVAL_HOME;
    process.env.CLAUDE_EVAL_HOME = operator;
    try {
      expect(run().exitCode).toBe(0);
    } finally {
      if (saved === undefined) delete process.env.CLAUDE_EVAL_HOME;
      else process.env.CLAUDE_EVAL_HOME = saved;
    }
    expect(existsSync(operator)).toBe(false);
    expect(readlinkSync(join(evalHome, "CLAUDE.md"))).toBe(join(REPO, "global", "CLAUDE.md"));
  });

  test("refuses to use ~/.claude as the eval folder", () => {
    mkdirSync(join(home, "aliases"));
    symlinkSync(join(home, ".claude"), join(home, "aliases", "prod"));
    for (const dir of [join(home, ".claude"), `${join(home, ".claude")}/`, join(home, "aliases", "prod")]) {
      const r = run({ CLAUDE_EVAL_HOME: dir });
      expect(r.exitCode).toBe(2);
      expect(r.stderr).toContain("is your everyday config folder");
    }
    expect(existsSync(join(home, ".claude", "CLAUDE.md"))).toBe(false);
    expect(JSON.parse(readFileSync(join(home, ".claude", "settings.json"), "utf8")).model).toBe("opus");
  });

  test("first run skips rules/execution-mode.md when production registers rules-shadow.sh", () => {
    writeFileSync(
      join(home, ".claude", "settings.json"),
      JSON.stringify({
        hooks: {
          SubagentStart: [{ hooks: [{ type: "command", command: `${home}/.claude/hooks/rules-shadow.sh` }] }],
        },
      }),
    );
    const r = run();
    expect(r.exitCode).toBe(0);
    expect(r.stderr).not.toContain("rules-shadow.sh is not registered");
    expect(existsSync(join(evalHome, "rules", "execution-mode.md"))).toBe(false);
  });
});
