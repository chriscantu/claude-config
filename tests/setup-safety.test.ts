import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Tests for bin/setup-safety.fish (#591). Each test gets a throwaway HOME so
// the script never touches the real ~/.claude/settings.json.

const REPO = resolve(import.meta.dir, "..");
const SCRIPT = join(REPO, "bin", "setup-safety.fish");
const TEMPLATE = JSON.parse(
  readFileSync(join(REPO, "templates", "safety-settings.json"), "utf8"),
);

const homes: string[] = [];
afterEach(() => {
  for (const h of homes.splice(0)) rmSync(h, { recursive: true, force: true });
});

// A fake HOME with an executable hook link, as link-config would leave it.
const seedHome = (settings?: unknown) => {
  const home = mkdtempSync(join(tmpdir(), "setup-safety-test-"));
  homes.push(home);
  const hooks = join(home, ".claude", "hooks");
  mkdirSync(hooks, { recursive: true });
  const hook = join(hooks, "block-secret-reads.sh");
  writeFileSync(hook, "#!/bin/bash\nexit 0\n");
  chmodSync(hook, 0o755);
  const settingsPath = join(home, ".claude", "settings.json");
  if (settings !== undefined) {
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  }
  return { home, hook, settingsPath };
};

const run = (home: string) => {
  const r = spawnSync("fish", [SCRIPT], {
    env: { ...process.env, HOME: home },
    encoding: "utf8",
  });
  if (r.error) throw r.error;
  return { code: r.status ?? -1, out: r.stdout + r.stderr };
};

const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));

const secretHookCount = (s: any, hook: string) =>
  (s.hooks?.PreToolUse ?? [])
    .flatMap((g: any) => g.hooks ?? [])
    .filter((h: any) => h.command === hook).length;

describe("setup-safety.fish", () => {
  test("adds deny rules, sandbox, and the hook to an empty settings file", () => {
    const { home, hook, settingsPath } = seedHome();
    const r = run(home);
    expect(r.code).toBe(0);
    const s = read(settingsPath);
    for (const rule of TEMPLATE.permissions.deny) {
      expect(s.permissions.deny).toContain(rule);
    }
    expect(s.sandbox.enabled).toBe(true);
    expect(s.sandbox.allowUnsandboxedCommands).toBe(false);
    expect(s.sandbox.excludedCommands).toContain("gh *");
    expect(secretHookCount(s, hook)).toBe(1);
  });

  test("keeps the user's own settings and their explicit sandbox choices", () => {
    const { home, settingsPath } = seedHome({
      theme: "dark",
      permissions: { allow: ["Bash(ls)"], deny: ["Bash(sudo:*)"] },
      sandbox: { enabled: false, excludedCommands: ["docker *"] },
    });
    expect(run(home).code).toBe(0);
    const s = read(settingsPath);
    expect(s.theme).toBe("dark");
    expect(s.permissions.allow).toEqual(["Bash(ls)"]);
    expect(s.permissions.deny[0]).toBe("Bash(sudo:*)");
    // An explicit "off" is the user's call; the script fills gaps only.
    expect(s.sandbox.enabled).toBe(false);
    expect(s.sandbox.excludedCommands).toEqual(["docker *", "gh *"]);
  });

  test("is idempotent: a second run changes nothing", () => {
    const { home, settingsPath } = seedHome({});
    expect(run(home).code).toBe(0);
    const first = readFileSync(settingsPath, "utf8");
    expect(run(home).code).toBe(0);
    expect(readFileSync(settingsPath, "utf8")).toBe(first);
  });

  test("backs up the settings file before writing", () => {
    const { home } = seedHome({ theme: "dark" });
    expect(run(home).code).toBe(0);
    const backups = readdirSync(join(home, ".claude")).filter((f) =>
      f.startsWith("settings.json.bak."),
    );
    expect(backups.length).toBe(1);
    expect(read(join(home, ".claude", backups[0]))).toEqual({ theme: "dark" });
  });

  test("refuses to modify a settings file that is not valid JSON", () => {
    const { home, settingsPath } = seedHome();
    writeFileSync(settingsPath, "{ not json");
    const r = run(home);
    expect(r.code).not.toBe(0);
    expect(readFileSync(settingsPath, "utf8")).toBe("{ not json");
  });

  test("refuses when the hook link is missing, before writing anything", () => {
    const { home, hook, settingsPath } = seedHome({ theme: "dark" });
    rmSync(hook);
    const r = run(home);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("install.fish");
    expect(read(settingsPath)).toEqual({ theme: "dark" });
  });
});
