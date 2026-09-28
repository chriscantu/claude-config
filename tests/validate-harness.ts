import { afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Shared harness for the tests/validate-phase-*.test.ts suites.
//
// Each suite builds a throwaway fixture repo, points validate.fish at it via
// CLAUDE_CONFIG_REPO_DIR, and asserts on one phase's output block. runPhase
// passes `--phase <id>` so only that phase runs: faster than a full run, and
// sibling phases failing on a sparse fixture cannot leak into the exit code.

export const REPO = resolve(import.meta.dir, "..");
export const VALIDATE = join(REPO, "validate.fish");

export type ValidateRun = {
  exitCode: number;
  stdout: string;
  stderr: string;
  lines: string[];
  /**
   * The first phase block in stdout: its `── <title>` header line through
   * the next blank line. Throws if no header is present, so a phase that
   * crashed or printed nothing fails with both streams attached.
   */
  readonly block: string;
};

export type RunOptions = {
  /** Validator to run instead of the repo's validate.fish (e.g. a patched copy). */
  script?: string;
  /** Extra CLI arguments, e.g. ["--log-path", path]. */
  args?: string[];
  /** Extra environment variables for the fish process. */
  env?: Record<string, string>;
};

// Starts at the header rather than line 0 because validate.fish can print a
// pre-phase warning (e.g. the git rev-parse warning when --log-path is set
// on a non-git fixture) before the first block.
const extractBlock = (stdout: string, stderr: string): string => {
  const lines = stdout.split("\n");
  const headerIdx = lines.findIndex((line) => line.startsWith("── "));
  if (headerIdx < 0) {
    throw new Error(
      `No phase header in validate.fish output.\n--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}`,
    );
  }
  const slice: string[] = [];
  for (let i = headerIdx; i < lines.length; i++) {
    slice.push(lines[i]);
    if (i > headerIdx && lines[i] === "") break;
  }
  return slice.join("\n");
};

/** Run every phase of validate.fish against a fixture repo. */
export const runValidate = (
  fixtureDir: string,
  opts: RunOptions = {},
): ValidateRun => {
  const result = spawnSync("fish", [opts.script ?? VALIDATE, ...(opts.args ?? [])], {
    env: { ...process.env, ...opts.env, CLAUDE_CONFIG_REPO_DIR: fixtureDir },
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  const { stdout, stderr } = result;
  return {
    exitCode: result.status ?? -1,
    stdout,
    stderr,
    lines: stdout.split("\n"),
    get block() {
      return extractBlock(stdout, stderr);
    },
  };
};

/** Run a single phase (e.g. "1g") of validate.fish against a fixture repo. */
export const runPhase = (
  fixtureDir: string,
  id: string,
  opts: RunOptions = {},
): ValidateRun =>
  runValidate(fixtureDir, { ...opts, args: ["--phase", id, ...(opts.args ?? [])] });

export const DEFAULT_SUBDIRS = ["rules", "skills", "agents", "commands", "adrs"];

/**
 * Register per-test cleanup and return a factory for fixture repo dirs.
 * Call once at the top level of a test file. Each dir is a fresh mkdtemp
 * with `subdirs` created, removed after every test.
 */
export const useFixtures = (
  prefix: string,
  subdirs: string[] = DEFAULT_SUBDIRS,
): (() => string) => {
  const dirs: string[] = [];
  afterEach(() => cleanupFixtures(dirs));
  return () => {
    const dir = mkdtempSync(join(tmpdir(), prefix));
    dirs.push(dir);
    for (const sub of subdirs) {
      mkdirSync(join(dir, sub), { recursive: true });
    }
    return dir;
  };
};

const TMP_PREFIX = tmpdir();

const cleanupFixtures = (dirs: string[]): void => {
  while (dirs.length > 0) {
    const dir = dirs.pop()!;
    // Bounds the recursive chmod + rm to tmp paths. mkdtempSync always lands
    // under tmpdir(), but a future bug pushing a real path here must not
    // delete it.
    if (!dir.startsWith(TMP_PREFIX)) {
      console.error(`afterEach: refusing to clean non-tmp path ${dir}`);
      continue;
    }
    // Several suites chmod 000 a fixture file to force grep I/O errors;
    // restore perms first or rmSync fails and the fixture leaks.
    const restore = spawnSync("chmod", ["-R", "u+rw", dir], { encoding: "utf8" });
    if (restore.error) {
      console.error(`afterEach: chmod spawn failed for ${dir}: ${restore.error.message}`);
    } else if (restore.status !== 0) {
      console.error(`afterEach: chmod exited ${restore.status} for ${dir}: ${restore.stderr}`);
    }
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch (e) {
      console.error(`afterEach: rmSync failed for ${dir}: ${(e as Error).message}`);
    }
  }
};
