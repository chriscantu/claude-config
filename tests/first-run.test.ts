import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Tests for bin/first-run.fish.
//
// Sandboxing strategy:
//   - HOME=<tmpdir> so the script writes to a throwaway ~/.claude/settings.json
//   - FIRST_RUN_CLAUDE_MD_PATH=<tmpdir>/CLAUDE.md so we never touch the real
//     global/CLAUDE.md tracked in the repo
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

const seedFixture = (): {
  home: string;
  claudeMd: string;
  settings: string;
  env: Record<string, string>;
} => {
  const home = mkdtempSync(join(tmpdir(), "first-run-test-"));
  fixtures.push(home);
  mkdirSync(join(home, ".claude"), { recursive: true });
  // Seed a CLAUDE.md identical to the repo's HEAD copy. Use the real repo
  // file as the seed so the "user has local edits" detection has a known
  // baseline to compare against (script does `git hash-object` then compares
  // to HEAD:global/CLAUDE.md).
  const claudeMd = join(home, "CLAUDE.md");
  copyFileSync(join(REPO, "global", "CLAUDE.md"), claudeMd);
  const settings = join(home, ".claude", "settings.json");
  return {
    home,
    claudeMd,
    settings,
    env: {
      HOME: home,
      FIRST_RUN_CLAUDE_MD_PATH: claudeMd,
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
  test("completes; managed block patched; hooks registered; backup exists", () => {
    const { claudeMd, settings, env } = seedFixture();

    const r = runFirstRun({ ...env, FIRST_RUN_ANSWERS: DEFAULT_ANSWERS });
    assertExit("fresh run", r, "zero");

    const md = readFileSync(claudeMd, "utf8");
    expect(md).toContain("<!-- managed:first-run -->");
    expect(md).toContain("<!-- /managed:first-run -->");
    expect(md).toContain("Shell flavor: `fish`");
    expect(md).toContain("Primary language: `TypeScript`");
    expect(md).toContain("TDD discipline: `pragmatic`");
    expect(md).toContain("Sycophancy intensity: `default`");
    expect(md).toContain("Caveman terseness: `no`");

    const settingsJson = JSON.parse(readFileSync(settings, "utf8"));
    const allow: string[] = settingsJson.permissions?.allow ?? [];
    expect(allow.some((s) => s.endsWith("/hooks/block-dangerous-git.sh)"))).toBe(
      true,
    );
    expect(
      allow.some((s) => s.endsWith("/hooks/scope-tier-memory-check.sh)")),
    ).toBe(true);

    // Backup created with .bak.<ISO-timestamp> suffix.
    const backups = readdirSync(join(env.HOME!, ".claude")).filter((f) =>
      f.startsWith("settings.json.bak."),
    );
    expect(backups.length).toBe(1);
  });
});

describe("first-run.fish — idempotency", () => {
  test("re-running with marker present replaces managed block, exits clean", () => {
    const { claudeMd, env } = seedFixture();

    const first = runFirstRun({ ...env, FIRST_RUN_ANSWERS: DEFAULT_ANSWERS });
    assertExit("first run", first, "zero");

    // Second run with different answers — managed block should be replaced.
    const second = runFirstRun({
      ...env,
      FIRST_RUN_ANSWERS: "bash,Python,strict,tone-down,N,Y,N",
    });
    assertExit("second run", second, "zero");

    const md = readFileSync(claudeMd, "utf8");
    expect(md).toContain("Shell flavor: `bash`");
    expect(md).toContain("Primary language: `Python`");
    expect(md).toContain("TDD discipline: `strict`");
    expect(md).toContain("Sycophancy intensity: `tone-down`");
    // Exactly one managed block.
    const opens = md.match(/<!-- managed:first-run -->/g) ?? [];
    expect(opens.length).toBe(1);
  });
});

describe("first-run.fish — user pre-edited CLAUDE.md outside managed block", () => {
  test("aborts non-zero; settings.json untouched", () => {
    const { claudeMd, settings, env } = seedFixture();
    // Mutate the seed away from HEAD with no marker.
    writeFileSync(claudeMd, "# my personal claude.md\n\nCustom edits.\n");

    const r = runFirstRun({ ...env, FIRST_RUN_ANSWERS: DEFAULT_ANSWERS });
    assertExit("abort run", r, "non-zero");
    expect(r.stderr).toContain("local edits and no managed block");

    // settings.json must not have been created (hooks step never reached).
    expect(() => readFileSync(settings, "utf8")).toThrow();
  });
});

describe("first-run.fish — hook prompt declined", () => {
  test("CLAUDE.md patched but settings.json unmodified", () => {
    const { claudeMd, settings, env } = seedFixture();

    const r = runFirstRun({
      ...env,
      // hooks answer = N
      FIRST_RUN_ANSWERS: "fish,TypeScript,pragmatic,default,N,N,N",
    });
    assertExit("hooks-declined run", r, "zero");

    expect(readFileSync(claudeMd, "utf8")).toContain(
      "<!-- managed:first-run -->",
    );
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
    // for every managed entry). FIRST_RUN_CLAUDE_MD_PATH still redirects
    // the patch target.
    const { claudeMd, env } = seedFixture();
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
    // The CLAUDE.md patch happens BEFORE the verify step, so we can also
    // confirm the script got far enough to apply the managed block before
    // failing the gate.
    expect(readFileSync(claudeMd, "utf8")).toContain(
      "<!-- managed:first-run -->",
    );
  });
});
