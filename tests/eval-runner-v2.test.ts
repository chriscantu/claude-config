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
