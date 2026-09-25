/**
 * Unit tests for the eval-runner determinism seams (finding D1):
 *   - CLI_BASE_ARGS pins an explicit --model so a server-side default bump
 *     can't silently reshape graded behavior.
 *   - isTransientCliFailure / withCliRetry retry a flaky CLI turn (timeout,
 *     non-ENOENT spawn error) but NOT a clean non-zero exit (auth failure) or
 *     a missing binary — so a real RED is never re-rolled and a misconfigured
 *     runner never gets masked.
 *
 * eval-runner-v2.ts guards main() behind `import.meta.main`, so importing it
 * here runs only the top-level const/function definitions — no eval spawns.
 */

import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CLI_BASE_ARGS, isTransientCliFailure, withCliRetry } from "./eval-runner-v2.ts";

type CliRun = Awaited<ReturnType<typeof withCliRetry>>;

const run = (failure: string | undefined, exitCode: number | null = 0): CliRun => ({
  stdout: "",
  stderr: "",
  exitCode,
  failure,
});

describe("CLI_BASE_ARGS model pin", () => {
  test("includes an explicit --model with a non-empty value", () => {
    const i = CLI_BASE_ARGS.indexOf("--model");
    expect(i).toBeGreaterThanOrEqual(0);
    const model = CLI_BASE_ARGS[i + 1];
    expect(typeof model).toBe("string");
    expect(model.length).toBeGreaterThan(0);
  });
});

describe("rules-shadow sentinel (issue #536)", () => {
  // Eval sessions run the user's hooks. Without the sentinel, the shadow hook
  // logs every eval turn as if it were real work and pollutes the Phase 1
  // sample. This runs the real runner against a fake `claude` that records
  // the RULES_SHADOW_SENTINEL it was given, so it proves what the child sees.
  test("every claude session the runner starts gets an existing sentinel file", () => {
    const dir = mkdtempSync(join(tmpdir(), "shadow-sentinel-"));
    const seen = join(dir, "seen.txt");
    const fakeClaude = join(dir, "claude");
    writeFileSync(
      fakeClaude,
      [
        "#!/bin/sh",
        '[ "$1" = "--version" ] && { echo "0.0.0 (fake)"; exit 0; }',
        'cat > /dev/null',
        'echo "${RULES_SHADOW_SENTINEL:-UNSET}" >> "$SEEN_FILE"',
        `echo '{"type":"result","subtype":"success","is_error":false,"result":"ok"}'`,
      ].join("\n"),
    );
    chmodSync(fakeClaude, 0o755);

    spawnSync("bun", ["run", join(import.meta.dir, "eval-runner-v2.ts"), "code-clarity"], {
      // A stale operator value must not switch logging back on.
      env: { ...process.env, CLAUDE_BIN: fakeClaude, SEEN_FILE: seen, RULES_SHADOW_SENTINEL: join(dir, "missing") },
      encoding: "utf8",
      timeout: 60_000,
    });

    const lines = readFileSync(seen, "utf8").trim().split("\n");
    // The auth probe plus one session per code-clarity eval.
    expect(lines.length).toBeGreaterThanOrEqual(3);
    for (const sentinel of lines) {
      expect(sentinel).not.toBe("UNSET");
      expect(existsSync(sentinel)).toBe(true);
    }
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("isTransientCliFailure", () => {
  test("timeout is transient", () => {
    expect(isTransientCliFailure(run("timed out after 300s (SIGTERM)"))).toBe(true);
  });

  test("non-ENOENT spawn error is transient", () => {
    expect(isTransientCliFailure(run("spawn error: EAGAIN resource temporarily unavailable"))).toBe(true);
  });

  test("ENOENT spawn error (binary missing) is permanent", () => {
    expect(isTransientCliFailure(run("spawn error: ENOENT no such file"))).toBe(false);
  });

  test("clean non-zero exit (auth failure) is permanent", () => {
    // Auth failures spawn cleanly and exit non-zero — no `failure` string.
    expect(isTransientCliFailure(run(undefined, 1))).toBe(false);
  });

  test("clean success is permanent (not retried)", () => {
    expect(isTransientCliFailure(run(undefined, 0))).toBe(false);
  });
});

describe("withCliRetry", () => {
  test("retries a transient failure up to maxAttempts, then returns last", async () => {
    let calls = 0;
    const retries: number[] = [];
    const result = await withCliRetry(
      async () => {
        calls++;
        return run("timed out after 300s (SIGTERM)");
      },
      2,
      (_prev, n) => retries.push(n),
    );
    expect(calls).toBe(2);
    expect(retries).toEqual([2]);
    expect(result.failure).toContain("timed out");
  });

  test("stops as soon as an attempt is non-transient", async () => {
    let calls = 0;
    const result = await withCliRetry(
      async () => {
        calls++;
        return calls === 1 ? run("timed out after 300s (SIGTERM)") : run(undefined, 0);
      },
      3,
    );
    expect(calls).toBe(2);
    expect(result.failure).toBeUndefined();
  });

  test("does NOT retry an auth-shaped failure (clean non-zero exit)", async () => {
    let calls = 0;
    const result = await withCliRetry(async () => {
      calls++;
      return run(undefined, 1);
    }, 2);
    expect(calls).toBe(1);
    expect(result.exitCode).toBe(1);
  });

  test("does NOT retry a missing-binary (ENOENT) failure", async () => {
    let calls = 0;
    await withCliRetry(async () => {
      calls++;
      return run("spawn error: ENOENT no such file");
    }, 2);
    expect(calls).toBe(1);
  });
});
