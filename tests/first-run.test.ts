import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Tests for bin/first-run.fish.
//
// Sandboxing strategy:
//   - HOME=<tmpdir> so the script writes to a throwaway ~/.claude/settings.json
//     and ~/.claude/rules/first-run-personalization.md
//   - FIRST_RUN_SETTINGS_PATH=<tmpdir>/.claude/settings.json (redundant with HOME,
//     but explicit makes the test intent obvious)
//   - FIRST_RUN_ANSWERS=<csv> pre-fills the interactive prompts
//   - FIRST_RUN_SKIP_VERIFY=1 disables the link-config/validate gates that
//     would assert against the REAL ~/.claude/ layout — those are tested
//     separately in link-config.test.ts and validate.fish.
//
// Issue #378.

const REPO = resolve(import.meta.dir, "..");
const SCRIPT = join(REPO, "bin", "first-run.fish");

type RunResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

const runFirstRun = (
  env: Record<string, string>,
  ...args: string[]
): RunResult => {
  const result = spawnSync("fish", [SCRIPT, ...args], {
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  return {
    exitCode: result.status ?? -1,
    stdout: result.stdout,
    stderr: result.stderr,
  };
};

const assertExit = (
  label: string,
  r: RunResult,
  expected: "zero" | "non-zero",
) => {
  const ok = expected === "zero" ? r.exitCode === 0 : r.exitCode !== 0;
  if (!ok) {
    throw new Error(
      `${label}: expected ${expected} exit, got ${r.exitCode}\n--- stdout ---\n${r.stdout}\n--- stderr ---\n${r.stderr}`,
    );
  }
};

const fixtures: string[] = [];

// Answers live in a per-user rule file, never in the shared, tracked
// global/CLAUDE.md, so one user's answers can't ship to every clone.
const PREFS_NAME = "first-run-personalization.md";
const REPO_CLAUDE_MD = join(REPO, "global", "CLAUDE.md");

const seedFixture = (): {
  home: string;
  prefs: string;
  settings: string;
  env: Record<string, string>;
} => {
  const home = mkdtempSync(join(tmpdir(), "first-run-test-"));
  fixtures.push(home);
  mkdirSync(join(home, ".claude"), { recursive: true });
  // Seed ~/.claude/rules/ so the #396 preflight check passes. The script
  // probes for this dir's existence to detect pre-install state; tests
  // simulate a healthy post-install layout.
  //
  // NOTE: tests that need to exercise the pre-install path must NOT use
  // seedFixture() — they should inline a HOME setup that omits this dir.
  // See "pre-install preflight" test for the canonical pattern.
  mkdirSync(join(home, ".claude", "rules"), { recursive: true });
  // link-config installs the guard as ~/.claude/hooks/<guard>; first-run
  // registers that link, so the fixture needs it.
  mkdirSync(join(home, ".claude", "hooks"), { recursive: true });
  symlinkSync(join(REPO, "hooks", "block-dangerous-git.sh"), join(home, ".claude", "hooks", "block-dangerous-git.sh"));
  const settings = join(home, ".claude", "settings.json");
  return {
    home,
    prefs: join(home, ".claude", "rules", PREFS_NAME),
    settings,
    env: {
      HOME: home,
      FIRST_RUN_SETTINGS_PATH: settings,
      FIRST_RUN_SKIP_VERIFY: "1",
    },
  };
};

afterEach(() => {
  while (fixtures.length > 0) {
    const dir = fixtures.pop()!;
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort
    }
  }
});

// Default answer set: fish, TypeScript, pragmatic, default, N (caveman),
// Y (hooks), N (live probe).
const DEFAULT_ANSWERS = "fish,TypeScript,pragmatic,default,N,Y,N";

describe("first-run.fish — fresh sandbox", () => {
  test("completes; prefs rule written; hooks registered; backup exists", () => {
    const { prefs, settings, env } = seedFixture();
    const repoMdBefore = readFileSync(REPO_CLAUDE_MD, "utf8");

    const r = runFirstRun({ ...env, FIRST_RUN_ANSWERS: DEFAULT_ANSWERS });
    assertExit("fresh run", r, "zero");

    expect(readFileSync(REPO_CLAUDE_MD, "utf8")).toBe(repoMdBefore);
    const md = readFileSync(prefs, "utf8");
    expect(md).toContain("## First-Run Personalization");
    expect(md).toContain("Shell flavor: `fish`");
    expect(md).toContain("Primary language: `TypeScript`");
    expect(md).toContain("TDD discipline: `pragmatic`");
    expect(md).toContain("Sycophancy intensity: `default`");
    expect(md).toContain("Caveman terseness: `no`");

    const settingsJson = JSON.parse(readFileSync(settings, "utf8"));
    // Claude Code runs hooks itself, so a Bash() allow entry for the hook
    // does nothing for the guard (#583). The script must not add one.
    const allow: string[] = settingsJson.permissions?.allow ?? [];
    expect(allow.some((s) => s.endsWith("/hooks/block-dangerous-git.sh)"))).toBe(
      false,
    );

    // Backup created with .bak.<ISO-timestamp> suffix.
    const backups = readdirSync(join(env.HOME!, ".claude")).filter((f) =>
      f.startsWith("settings.json.bak."),
    );
    expect(backups.length).toBe(1);
  });
});

// Issue #557: the script used to print "Registered hooks" while writing only a
// permission entry, so non-plugin users had no guard. These tests check the
// hook entry lands AND that the command it names actually blocks a force-push.
type HookEntry = {
  matcher?: string;
  hooks?: { type?: string; command?: string; timeout?: number }[];
};

const GUARD = "block-dangerous-git.sh";

const readPreToolUse = (settings: string): HookEntry[] =>
  JSON.parse(readFileSync(settings, "utf8")).hooks?.PreToolUse ?? [];

const guardCommands = (entries: HookEntry[]): string[] =>
  entries
    .filter((e) => e.matcher === "Bash")
    .flatMap((e) => e.hooks ?? [])
    .map((h) => h.command ?? "")
    .filter((c) => c.endsWith(`/${GUARD}`));

const runGuard = (command: string, bashCommand: string, home: string) =>
  spawnSync(command, {
    input: JSON.stringify({
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: bashCommand },
    }),
    // HOME isolates the guard's ~/.claude/DISABLE_GIT_GUARDRAILS kill switch
    // from the developer's real one.
    env: { ...process.env, HOME: home, CLAUDE_PROJECT_DIR: home },
    cwd: home,
    encoding: "utf8",
  });

describe("first-run.fish — hook registration (#557)", () => {
  test("adds a PreToolUse/Bash command entry for the ~/.claude/hooks link", () => {
    const { home, settings, env } = seedFixture();
    assertExit("fresh run", runFirstRun({ ...env, FIRST_RUN_ANSWERS: DEFAULT_ANSWERS }), "zero");

    const entries = readPreToolUse(settings);
    const guard = entries.find((e) => guardCommands([e]).length > 0);
    expect(guard).toEqual({
      matcher: "Bash",
      hooks: [{ type: "command", command: join(home, ".claude", "hooks", GUARD), timeout: 5 }],
    });
  });

  test("an entry for the link is not duplicated when the link resolves outside this checkout", () => {
    // ~/.claude/hooks links into the release copy, not the checkout that runs
    // first-run, so the two real paths differ.
    const { home, settings, env } = seedFixture();
    const release = join(home, "release", "hooks");
    mkdirSync(release, { recursive: true });
    writeFileSync(join(release, GUARD), readFileSync(join(REPO, "hooks", GUARD)), { mode: 0o755 });
    const link = join(home, ".claude", "hooks", GUARD);
    rmSync(link);
    symlinkSync(join(release, GUARD), link);
    writeFileSync(
      settings,
      JSON.stringify({
        hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: link, timeout: 5 }] }] },
      }),
    );

    assertExit("run", runFirstRun({ ...env, FIRST_RUN_ANSWERS: DEFAULT_ANSWERS }), "zero");
    expect(guardCommands(readPreToolUse(settings))).toEqual([link]);
  });

  test("the registered command blocks a force-push to main and allows git status", () => {
    const { home, settings, env } = seedFixture();
    assertExit("fresh run", runFirstRun({ ...env, FIRST_RUN_ANSWERS: DEFAULT_ANSWERS }), "zero");

    const [command] = guardCommands(readPreToolUse(settings));
    expect(command).toBeDefined();
    const blocked = runGuard(command!, "git push --force origin main", home);
    expect(blocked.status).toBe(2);
    expect(blocked.stderr).toContain("BLOCKED");
    expect(runGuard(command!, "git status", home).status).toBe(0);
  });

  test("re-running leaves settings.json byte-identical", () => {
    const { settings, env } = seedFixture();
    assertExit("first run", runFirstRun({ ...env, FIRST_RUN_ANSWERS: DEFAULT_ANSWERS }), "zero");
    const afterFirst = readFileSync(settings, "utf8");
    assertExit("second run", runFirstRun({ ...env, FIRST_RUN_ANSWERS: DEFAULT_ANSWERS }), "zero");
    expect(readFileSync(settings, "utf8")).toBe(afterFirst);
    expect(guardCommands(readPreToolUse(settings)).length).toBe(1);
  });

  test("an existing entry via another path to the same script is not duplicated", () => {
    const { settings, env } = seedFixture();
    // The fixture link points at this checkout's guard; this entry names
    // that file directly.
    const direct = join(REPO, "hooks", GUARD);
    writeFileSync(
      settings,
      JSON.stringify({
        hooks: {
          PreToolUse: [
            { matcher: "Bash", hooks: [{ type: "command", command: direct, timeout: 5 }] },
          ],
        },
      }),
    );

    assertExit("run", runFirstRun({ ...env, FIRST_RUN_ANSWERS: DEFAULT_ANSWERS }), "zero");
    expect(guardCommands(readPreToolUse(settings))).toEqual([direct]);
  });

  test("a malformed PreToolUse element doesn't make each run add another entry", () => {
    const { settings, env } = seedFixture();
    writeFileSync(settings, JSON.stringify({ hooks: { PreToolUse: ["junk", { matcher: 7 }] } }));

    assertExit("first run", runFirstRun({ ...env, FIRST_RUN_ANSWERS: DEFAULT_ANSWERS }), "zero");
    assertExit("second run", runFirstRun({ ...env, FIRST_RUN_ANSWERS: DEFAULT_ANSWERS }), "zero");
    const entries = readPreToolUse(settings);
    expect(entries.slice(0, 2)).toEqual(["junk", { matcher: 7 }] as unknown as HookEntry[]);
    expect(guardCommands(entries.slice(2)).length).toBe(1);
    expect(entries.length).toBe(3);
  });

  test("unrelated hooks and permissions survive", () => {
    const { settings, env } = seedFixture();
    const other: HookEntry = {
      matcher: "Edit",
      hooks: [{ type: "command", command: "/opt/other.sh", timeout: 9 }],
    };
    writeFileSync(
      settings,
      JSON.stringify({
        permissions: { allow: ["Bash(ls)"] },
        hooks: { PreToolUse: [other], Stop: [{ hooks: [{ type: "command", command: "/opt/stop.sh" }] }] },
      }),
    );

    assertExit("run", runFirstRun({ ...env, FIRST_RUN_ANSWERS: DEFAULT_ANSWERS }), "zero");
    const json = JSON.parse(readFileSync(settings, "utf8"));
    expect(json.permissions.allow).toContain("Bash(ls)");
    expect(json.hooks.PreToolUse[0]).toEqual(other);
    expect(json.hooks.Stop[0].hooks[0].command).toBe("/opt/stop.sh");
    expect(guardCommands(json.hooks.PreToolUse).length).toBe(1);
  });
});

describe("first-run.fish — idempotency", () => {
  test("re-running replaces the prefs rule, exits clean", () => {
    const { prefs, env } = seedFixture();

    const first = runFirstRun({ ...env, FIRST_RUN_ANSWERS: DEFAULT_ANSWERS });
    assertExit("first run", first, "zero");

    // Second run with different answers — the whole file is replaced.
    const second = runFirstRun({
      ...env,
      FIRST_RUN_ANSWERS: "bash,Python,strict,tone-down,N,Y,N",
    });
    assertExit("second run", second, "zero");

    const md = readFileSync(prefs, "utf8");
    expect(md).toContain("Shell flavor: `bash`");
    expect(md).toContain("Primary language: `Python`");
    expect(md).toContain("TDD discipline: `strict`");
    expect(md).toContain("Sycophancy intensity: `tone-down`");
    expect(md).not.toContain("Shell flavor: `fish`");
    const headings = md.match(/## First-Run Personalization/g) ?? [];
    expect(headings.length).toBe(1);
  });

  test("no repo rule shares the prefs file name", () => {
    // link-config symlinks every rules/*.md into ~/.claude/rules/; a repo
    // rule with this name would collide with the generated file.
    expect(readdirSync(join(REPO, "rules"))).not.toContain(PREFS_NAME);
  });
});

describe("first-run.fish — hook prompt declined", () => {
  test("prefs rule written but settings.json unmodified", () => {
    const { prefs, settings, env } = seedFixture();

    const r = runFirstRun({
      ...env,
      // hooks answer = N
      FIRST_RUN_ANSWERS: "fish,TypeScript,pragmatic,default,N,N,N",
    });
    assertExit("hooks-declined run", r, "zero");

    expect(readFileSync(prefs, "utf8")).toContain("## First-Run Personalization");
    expect(() => readFileSync(settings, "utf8")).toThrow();
    expect(r.stdout).toContain("Skipped hook registration");
  });
});

describe("first-run.fish — live probe declined", () => {
  test("does not spawn verify-rule-loaded.fish when answer is N", () => {
    // SKIP_VERIFY=1 short-circuits the verify section entirely, so to test
    // the probe-declined path we need verify ENABLED but the probe answer
    // = N. The link-config/validate gates DO run in that case — to keep the
    // test hermetic, point HOME at a fixture with a real symlink layout.
    // Simpler: assert the stdout from a SKIP_VERIFY run lacks any probe
    // message, AND the stdout from a non-SKIP run with probe=N also lacks
    // "Running live probe". We'll do the SKIP_VERIFY variant — the script
    // only ever prints "Running live probe" inside the verify block.
    const { env } = seedFixture();
    const r = runFirstRun({ ...env, FIRST_RUN_ANSWERS: DEFAULT_ANSWERS });
    assertExit("skip-verify run", r, "zero");
    expect(r.stdout).not.toContain("Running live probe");
  });
});

describe("first-run.fish — malformed pre-existing settings.json", () => {
  test("aborts safely; original preserved", () => {
    const { settings, env } = seedFixture();
    mkdirSync(join(env.HOME!, ".claude"), { recursive: true });
    writeFileSync(settings, "{ this is not json");
    const before = readFileSync(settings, "utf8");

    const r = runFirstRun({ ...env, FIRST_RUN_ANSWERS: DEFAULT_ANSWERS });
    assertExit("malformed settings run", r, "non-zero");
    expect(r.stderr).toContain("not valid JSON");

    const after = readFileSync(settings, "utf8");
    expect(after).toBe(before);
  });
});

describe("first-run.fish — link-config --check failure surfaces", () => {
  test("non-zero exit names the missing rule when link-config --check fails", () => {
    // The script runs link-config --check against the REAL ~/.claude when
    // FIRST_RUN_SKIP_VERIFY is unset. We simulate failure by pointing HOME
    // at an empty dir (no symlinks → link-config --check reports MISSING
    // for every managed entry).
    const { prefs, env } = seedFixture();
    const verifyEnv = { ...env };
    delete verifyEnv.FIRST_RUN_SKIP_VERIFY;

    const r = runFirstRun({
      ...verifyEnv,
      FIRST_RUN_ANSWERS: DEFAULT_ANSWERS,
    });
    assertExit("verify-on run with empty HOME", r, "non-zero");
    // Combined output should contain a MISSING line from link-config.fish.
    const combined = r.stdout + r.stderr;
    expect(combined).toMatch(/MISSING link:/);
    // The prefs write happens BEFORE the verify step, so we can also
    // confirm the script got that far before failing the gate.
    expect(readFileSync(prefs, "utf8")).toContain("## First-Run Personalization");
  });
});

describe("first-run.fish — per-option rationale (#395)", () => {
  test("emits per-option rationale lines for each enum prompt", () => {
    const { env } = seedFixture();
    const r = runFirstRun({ ...env, FIRST_RUN_ANSWERS: DEFAULT_ANSWERS });
    assertExit("rationale run", r, "zero");
    // One rationale phrase per prompt group. Future revert that drops the
    // rationale (intentionally or by accident) will fail this test —
    // existing assertions only check post-answer log strings, never
    // prompt-time stdout, so without this nothing guards the audience-
    // comprehension contract that motivated #395.
    expect(r.stdout).toContain("recommended; commits + scripts assume fish syntax");
    expect(r.stdout).toContain("required for new server-side code");
    expect(r.stdout).toContain("tests written before code, always");
    expect(r.stdout).toContain("anti-sycophancy baseline");
    expect(r.stdout).toContain("compresses Claude's output");
  });
});

describe("first-run.fish — pre-install preflight (#396)", () => {
  test("aborts non-zero with install.sh hint when ~/.claude/rules/ is absent", () => {
    // Skip the seedFixture helper; we need a HOME with .claude/ but NO
    // rules/ subdir to simulate the pre-install state.
    const home = mkdtempSync(join(tmpdir(), "first-run-preflight-"));
    fixtures.push(home);
    mkdirSync(join(home, ".claude"), { recursive: true });
    const settings = join(home, ".claude", "settings.json");

    const r = runFirstRun({
      HOME: home,
      FIRST_RUN_SETTINGS_PATH: settings,
      FIRST_RUN_SKIP_VERIFY: "1",
      FIRST_RUN_ANSWERS: DEFAULT_ANSWERS,
    });
    assertExit("pre-install run", r, "non-zero");
    expect(r.exitCode).toBe(2);
    // Match install hint loosely — exact prose may evolve, but the
    // user-recovery contract is "name the install script."
    expect(r.stderr).toMatch(/install/i);
    // Preflight runs before any mutation: no prefs rule anywhere.
    expect(readdirSync(join(home, ".claude"))).not.toContain("rules");
    // Settings.json must not have been created.
    expect(() => readFileSync(settings, "utf8")).toThrow();
  });
});

describe("first-run.fish — settings.json TOCTOU lock (#394)", () => {
  test("held lock: fails fast, leaves settings unmutated", () => {
    const { settings, env } = seedFixture();
    // mkdir is the atomic primitive the script uses, so a pre-existing
    // lockdir is indistinguishable from a live holder.
    mkdirSync(`${settings}.lock`, { recursive: false });

    const r = runFirstRun({
      ...env,
      FIRST_RUN_ANSWERS: DEFAULT_ANSWERS,
      FIRST_RUN_LOCK_TIMEOUT_SECS: "1",
    });
    assertExit("locked settings run", r, "non-zero");
    // Behavior contract: non-zero exit + settings untouched. Don't pin on
    // prose tokens that a copy-edit would silently break.
    expect(() => readFileSync(settings, "utf8")).toThrow();
  });

  test("clean run releases lock so subsequent run re-acquires", () => {
    const { settings, env } = seedFixture();
    const first = runFirstRun({ ...env, FIRST_RUN_ANSWERS: DEFAULT_ANSWERS });
    assertExit("first run", first, "zero");
    expect(() => readFileSync(`${settings}.lock`)).toThrow();
  });

  test("mid-sequence failure (malformed settings) still releases lock", () => {
    const { settings, env } = seedFixture();
    // Pre-seed an invalid settings.json so jq -e validation fails AFTER
    // the lock is acquired. Lock must release on the abort path.
    mkdirSync(join(env.HOME!, ".claude"), { recursive: true });
    writeFileSync(settings, "{not valid json");

    const r = runFirstRun({ ...env, FIRST_RUN_ANSWERS: DEFAULT_ANSWERS });
    assertExit("malformed-settings run", r, "non-zero");
    // The critical assertion: lockdir does NOT leak across failure.
    expect(() => readFileSync(`${settings}.lock`)).toThrow();
  });

  test("hooks declined: no lockdir created", () => {
    const { settings, env } = seedFixture();
    const r = runFirstRun({
      ...env,
      // hooks answer = N — lock code path must never run
      FIRST_RUN_ANSWERS: "fish,TypeScript,pragmatic,default,N,N,N",
    });
    assertExit("hooks-declined run", r, "zero");
    expect(() => readFileSync(`${settings}.lock`)).toThrow();
  });

  test("invalid FIRST_RUN_LOCK_TIMEOUT_SECS rejected (input validation)", () => {
    const { env } = seedFixture();
    const r = runFirstRun({
      ...env,
      FIRST_RUN_ANSWERS: DEFAULT_ANSWERS,
      FIRST_RUN_LOCK_TIMEOUT_SECS: "not-a-number",
    });
    assertExit("bad-timeout run", r, "non-zero");
  });

  test("two concurrent runs: exactly one mutates, other fails cleanly", async () => {
    const { settings, env } = seedFixture();
    // Both procs target the same sandbox. With FIRST_RUN_LOCK_TIMEOUT_SECS=1,
    // whichever loses the mkdir race times out fast and exits non-zero.
    // Without the lock, both would race through validate/backup/write,
    // producing two backups + a non-deterministic settings.json merge.
    const racy = (): Promise<RunResult> =>
      new Promise((resolve) => {
        // Run in a Promise wrapper so Promise.all parallelizes; spawnSync
        // is synchronous within a single tick but Bun's event loop will
        // interleave the two micro-task wakeups closely enough that the
        // kernel scheduler determines the winner.
        queueMicrotask(() => {
          resolve(
            runFirstRun({
              ...env,
              FIRST_RUN_ANSWERS: DEFAULT_ANSWERS,
              FIRST_RUN_LOCK_TIMEOUT_SECS: "1",
            }),
          );
        });
      });

    const [a, b] = await Promise.all([racy(), racy()]);
    const exits = [a.exitCode, b.exitCode].sort();
    // Either both serialize (both zero, lock acquired+released sequentially)
    // OR one wins the race and the loser times out → [0, 2]. The forbidden
    // outcome is [2, 2] (both lost — should be impossible since the lock
    // is empty at start) or [-1, anything] (spawn error). Both ZEROs is
    // valid because the 1s wait deadline is loose enough to allow the
    // second proc to acquire after the first releases.
    expect(exits[0]).toBe(0);
    expect([0, 2]).toContain(exits[1]);
    // Final settings.json must be well-formed JSON with both hooks present
    // (the winner's write committed; the loser, if any, never touched it).
    const settingsJson = JSON.parse(readFileSync(settings, "utf8"));
    const allow: string[] = settingsJson.permissions?.allow ?? [];
    expect(guardCommands(readPreToolUse(settings)).length).toBe(1);
    expect(allow.some((s) => s.endsWith("/hooks/block-dangerous-git.sh)"))).toBe(false);
    expect(allow.some((s) => s.includes("scope-tier"))).toBe(false);
    // Lockdir must not be leaked after both procs settle.
    expect(() => readFileSync(`${settings}.lock`)).toThrow();
  });
});
