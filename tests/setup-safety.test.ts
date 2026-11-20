import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  statSync,
  symlinkSync,
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

// FIRST_RUN_SETTINGS_PATH is dropped so a developer's own value can't point
// the script at their real settings file.
const run = (home: string, extraEnv: Record<string, string> = {}) => {
  const { FIRST_RUN_SETTINGS_PATH: _ignored, ...env } = process.env;
  const r = spawnSync("fish", [SCRIPT], {
    env: { ...env, HOME: home, ...extraEnv },
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
  test("creates the settings file with deny rules, sandbox, and the hook when it is missing", () => {
    const { home, hook, settingsPath } = seedHome();
    const r = run(home);
    expect(r.code).toBe(0);
    const s = read(settingsPath);
    for (const rule of TEMPLATE.permissions.deny) {
      expect(s.permissions.deny).toContain(rule);
    }
    expect(s.sandbox.enabled).toBe(true);
    expect(s.sandbox.allowUnsandboxedCommands).toBe(false);
    // gh runs inside the sandbox now: weaker network isolation lets it pass
    // TLS checks, so it no longer needs an exclusion (#598).
    expect(s.sandbox.enableWeakerNetworkIsolation).toBe(true);
    expect(s.sandbox.excludedCommands).toBeUndefined();
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
    expect(s.sandbox.excludedCommands).toEqual(["docker *"]);
  });

  // Earlier versions of the template added "gh *". The script only adds, so
  // it names the leftover entry instead of removing it.
  test("names a leftover gh exclusion on every run, and keeps it", () => {
    const { home, settingsPath } = seedHome({ sandbox: { excludedCommands: ["gh *"] } });
    for (const r of [run(home), run(home)]) {
      expect(r.code).toBe(0);
      expect(r.out).toContain('"gh *"');
      expect(r.out).toContain("outside the sandbox");
    }
    expect(read(settingsPath).sandbox.excludedCommands).toEqual(["gh *"]);
  });

  test("is idempotent: a second run changes nothing", () => {
    const { home, settingsPath } = seedHome({});
    expect(run(home).code).toBe(0);
    const first = readFileSync(settingsPath, "utf8");
    expect(run(home).code).toBe(0);
    expect(readFileSync(settingsPath, "utf8")).toBe(first);
  });

  // The sandbox blocks new files beside ~/.claude/settings.json (#598). A
  // read-only folder has the same effect: a run with nothing to change must
  // not need to create a temp file there.
  test("a second run passes when nothing can be written beside the settings file", () => {
    const { home, settingsPath } = seedHome({});
    expect(run(home).code).toBe(0);
    const dir = join(home, ".claude");
    chmodSync(dir, 0o555);
    try {
      const r = run(home);
      expect(r.out).toContain("Safety settings already present");
      expect(r.code).toBe(0);
    } finally {
      chmodSync(dir, 0o755);
    }
    expect(readdirSync(dir).filter((f) => f.startsWith("settings.json.")).length).toBe(1);
    expect(read(settingsPath).sandbox.enabled).toBe(true);
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
  test("refuses an empty settings file instead of treating it as {}", () => {
    const { home, settingsPath } = seedHome();
    writeFileSync(settingsPath, "");
    expect(run(home).code).not.toBe(0);
    expect(readFileSync(settingsPath, "utf8")).toBe("");
  });

  test.each([
    ["deny is a string", { permissions: { deny: "Bash(sudo:*)" } }],
    ["sandbox is a boolean", { sandbox: true }],
    ["PreToolUse is an object", { hooks: { PreToolUse: {} } }],
  ])("refuses a settings file where %s, and writes nothing", (_name, bad) => {
    const { home, settingsPath } = seedHome(bad);
    const before = readFileSync(settingsPath, "utf8");
    expect(run(home).code).not.toBe(0);
    expect(readFileSync(settingsPath, "utf8")).toBe(before);
    expect(readdirSync(join(home, ".claude")).sort()).toEqual(["hooks", "settings.json"]);
  });

  test("writes through a symlinked settings file and keeps the link", () => {
    const { home, settingsPath } = seedHome();
    const real = join(home, "dotfiles-settings.json");
    writeFileSync(real, JSON.stringify({ theme: "dark" }));
    symlinkSync(real, settingsPath);
    expect(run(home).code).toBe(0);
    expect(readlinkSync(settingsPath)).toBe(real);
    const s = read(real);
    expect(s.theme).toBe("dark");
    expect(s.sandbox.enabled).toBe(true);
  });

  // The link's target is often in a dotfiles git repo, and settings can hold
  // tokens in env. A backup there could be committed (#598).
  test("backs up a symlinked settings file beside the link, not in the target's folder", () => {
    const { home, settingsPath } = seedHome();
    const dotfiles = join(home, "dotfiles");
    mkdirSync(dotfiles);
    const real = join(dotfiles, "claude-settings.json");
    writeFileSync(real, JSON.stringify({ theme: "dark" }));
    symlinkSync(real, settingsPath);
    expect(run(home).code).toBe(0);
    expect(readdirSync(dotfiles)).toEqual(["claude-settings.json"]);
    const backups = readdirSync(join(home, ".claude")).filter((f) =>
      f.startsWith("settings.json.bak."),
    );
    expect(backups.length).toBe(1);
    expect(read(join(home, ".claude", backups[0]))).toEqual({ theme: "dark" });
  });

  test("keeps the settings file's permissions", () => {
    const { home, settingsPath } = seedHome({ theme: "dark" });
    chmodSync(settingsPath, 0o644);
    expect(run(home).code).toBe(0);
    expect(statSync(settingsPath).mode & 0o777).toBe(0o644);
  });

  test("names every sandbox key you kept that weakens the template, on every run", () => {
    const { home } = seedHome({
      sandbox: { enabled: false, allowUnsandboxedCommands: true },
    });
    for (const r of [run(home), run(home)]) {
      expect(r.code).toBe(0);
      expect(r.out).toContain('"sandbox.enabled": false');
      expect(r.out).toContain('"sandbox.allowUnsandboxedCommands": true');
    }
  });

  test("says jq is missing rather than blaming the template", () => {
    const { home, settingsPath } = seedHome({ theme: "dark" });
    const bin = mkdtempSync(join(tmpdir(), "setup-safety-nojq-"));
    homes.push(bin);
    const dirname = spawnSync("sh", ["-c", "command -v dirname"], { encoding: "utf8" }).stdout.trim();
    symlinkSync(dirname, join(bin, "dirname"));
    const fish = spawnSync("sh", ["-c", "command -v fish"], { encoding: "utf8" }).stdout.trim();
    const { FIRST_RUN_SETTINGS_PATH: _ignored, ...env } = process.env;
    const r = spawnSync(fish, [SCRIPT], {
      env: { ...env, HOME: home, PATH: bin },
      encoding: "utf8",
    });
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toContain("jq is not installed");
    expect(r.stdout + r.stderr).not.toContain("template is not valid JSON");
    expect(read(settingsPath)).toEqual({ theme: "dark" });
  });
  test("explains a symlink it can't follow instead of exiting silently", () => {
    const { home, settingsPath } = seedHome();
    symlinkSync(join(home, "missing-target.json"), settingsPath);
    const r = run(home);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("symlink");
  });

  test("adds a Bash entry when the hook is registered only under another matcher", () => {
    const { home, hook, settingsPath } = seedHome();
    writeFileSync(
      settingsPath,
      JSON.stringify({
        hooks: { PreToolUse: [{ matcher: "Read", hooks: [{ type: "command", command: hook }] }] },
      }),
    );
    expect(run(home).code).toBe(0);
    const bash = read(settingsPath).hooks.PreToolUse.filter((g: any) => g.matcher === "Bash");
    expect(bash.flatMap((g: any) => g.hooks).map((h: any) => h.command)).toContain(hook);
  });

  test("warns when disableAllHooks would stop the hook from running", () => {
    const { home } = seedHome({ disableAllHooks: true });
    const r = run(home);
    expect(r.code).toBe(0);
    expect(r.out).toContain("disableAllHooks");
  });

  // Shims on PATH that stand in for real tools, so a test can force a fixed
  // clock, an interrupt, or a jq failure at one exact step.
  const shimBin = (shims: Record<string, string>) => {
    const bin = mkdtempSync(join(tmpdir(), "setup-safety-shim-"));
    homes.push(bin);
    for (const [name, body] of Object.entries(shims)) {
      const p = join(bin, name);
      writeFileSync(p, `#!/bin/sh\n${body}\n`);
      chmodSync(p, 0o755);
    }
    return { PATH: `${bin}:${process.env.PATH}` };
  };
  const realPath = (tool: string) =>
    spawnSync("sh", ["-c", `command -v ${tool}`], { encoding: "utf8" }).stdout.trim();

  test("two runs in the same second keep two separate backups", () => {
    const { home, settingsPath } = seedHome({ theme: "dark" });
    const env = shimBin({ date: "echo 20260101T000000Z" });
    expect(run(home, env).code).toBe(0);
    writeFileSync(settingsPath, JSON.stringify({ theme: "light" }));
    expect(run(home, env).code).toBe(0);
    const dir = join(home, ".claude");
    const backups = readdirSync(dir).filter((f) => f.startsWith("settings.json.bak."));
    expect(backups.length).toBe(2);
    expect(backups.map((b) => read(join(dir, b)).theme).sort()).toEqual(["dark", "light"]);
  });

  // The script asks for the time right after it creates the temp file, so a
  // date that interrupts the script lands at the worst moment.
  test.each(["INT", "TERM"])("an interrupt (%s) removes the temp file", (sig) => {
    const { home, settingsPath } = seedHome({ theme: "dark" });
    const r = run(home, shimBin({ date: `kill -${sig} $PPID; sleep 1; echo 20260101T000000Z` }));
    expect(r.code).not.toBe(0);
    const dir = join(home, ".claude");
    expect(readdirSync(dir).filter((f) => /^settings\.json\.(?!bak\.)/.test(f))).toEqual([]);
    expect(read(settingsPath)).toEqual({ theme: "dark" });
  });

  // The report is the only jq call whose filter prints "NOTE:".
  test.each([
    ["after a merge", {}],
    ["when nothing changed", "merged-already"],
  ])("says so when the override report fails %s", (_name, start) => {
    const { home } = seedHome({});
    if (start === "merged-already") expect(run(home).code).toBe(0);
    const jq = realPath("jq");
    const r = run(
      home,
      shimBin({ jq: `case "$*" in *NOTE:*) exit 5;; esac\nexec ${jq} "$@"` }),
    );
    expect(r.code).toBe(2);
    expect(r.out).toContain("could not check");
  });
});
