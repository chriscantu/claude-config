/**
 * Tests for the concurrency primitives in evals-lib.ts:
 *   - runPool: index-preserving worker pool with bounded in-flight count
 *   - createTeardownTracker: refcounted teardown registry
 *
 * Runs without spawning claude — the real eval smoke test against fixtures
 * is run via `bun run tests/eval-runner-v2.ts <skill> --concurrency=N` as
 * part of the end-to-end gate. These unit tests cover the substrate.
 */

import { describe, expect, test } from "bun:test";
import { createTeardownTracker, runLifecycleAsync, runPool } from "./evals-lib.ts";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

describe("runPool", () => {
  test("empty input returns empty array", async () => {
    const result = await runPool([], 4, async () => "x");
    expect(result).toEqual([]);
  });

  test("results land in original index order even under concurrent execution", async () => {
    const items = [50, 10, 30, 5, 20];
    const result = await runPool(items, 3, async (ms, idx) => {
      await sleep(ms);
      return idx;
    });
    expect(result).toEqual([0, 1, 2, 3, 4]);
  });

  test("concurrency=N runs ~N items in parallel (wall-clock check)", async () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const sleepMs = 80;
    const t0 = Date.now();
    await runPool(items, 4, async () => {
      await sleep(sleepMs);
      return null;
    });
    const elapsed = Date.now() - t0;
    // 8 items × 80ms serial = 640ms; concurrency=4 should finish in ~160-260ms.
    // Allow generous headroom for CI/event-loop jitter: must be < 50% of serial.
    expect(elapsed).toBeLessThan(320);
    // Sanity floor: can't finish faster than two batches of 80ms.
    expect(elapsed).toBeGreaterThanOrEqual(150);
  });

  test("concurrency=1 is strictly sequential", async () => {
    const order: number[] = [];
    await runPool([0, 1, 2, 3], 1, async (_, idx) => {
      order.push(idx);
      await sleep(5);
      return idx;
    });
    expect(order).toEqual([0, 1, 2, 3]);
  });

  test("never exceeds N in flight", async () => {
    let inFlight = 0;
    let peakInFlight = 0;
    await runPool(Array.from({ length: 12 }, (_, i) => i), 3, async () => {
      inFlight++;
      peakInFlight = Math.max(peakInFlight, inFlight);
      await sleep(20);
      inFlight--;
      return null;
    });
    expect(peakInFlight).toBeLessThanOrEqual(3);
  });

  test("worker exception propagates", async () => {
    const p = runPool([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error("boom");
      return n;
    });
    await expect(p).rejects.toThrow("boom");
  });

  test("clamps width to items.length when n > items", async () => {
    let peakInFlight = 0;
    let inFlight = 0;
    await runPool([1, 2], 100, async () => {
      inFlight++;
      peakInFlight = Math.max(peakInFlight, inFlight);
      await sleep(5);
      inFlight--;
      return null;
    });
    expect(peakInFlight).toBeLessThanOrEqual(2);
  });
});

describe("createTeardownTracker", () => {
  test("add then drop removes entry at refcount 0", () => {
    const t = createTeardownTracker();
    t.add("rm -f /tmp/x");
    expect(t.snapshot().get("rm -f /tmp/x")).toBe(1);
    t.drop("rm -f /tmp/x");
    expect(t.snapshot().has("rm -f /tmp/x")).toBe(false);
  });

  test("two evals sharing a teardown — both must drop before entry disappears", () => {
    const t = createTeardownTracker();
    t.add("rm /tmp/shared");
    t.add("rm /tmp/shared");
    expect(t.snapshot().get("rm /tmp/shared")).toBe(2);
    t.drop("rm /tmp/shared");
    expect(t.snapshot().get("rm /tmp/shared")).toBe(1);
    t.drop("rm /tmp/shared");
    expect(t.snapshot().has("rm /tmp/shared")).toBe(false);
  });

  test("drop on unknown cmd is a no-op", () => {
    const t = createTeardownTracker();
    expect(() => t.drop("never-added")).not.toThrow();
  });

  test("drain runs each unique cmd ONCE regardless of refcount", () => {
    const t = createTeardownTracker();
    t.add("rm /tmp/a");
    t.add("rm /tmp/a");
    t.add("rm /tmp/a");
    t.add("rm /tmp/b");
    const calls: string[] = [];
    t.drain((cmd) => calls.push(cmd));
    expect(calls.sort()).toEqual(["rm /tmp/a", "rm /tmp/b"]);
  });

  test("drain clears the tracker", () => {
    const t = createTeardownTracker();
    t.add("a");
    t.add("b");
    t.drain(() => {});
    expect(t.snapshot().size).toBe(0);
  });

  test("drain reports per-cmd errors via onError, does not throw", () => {
    const t = createTeardownTracker();
    t.add("ok");
    t.add("bad");
    const errors: Array<{ cmd: string; msg: string }> = [];
    t.drain(
      (cmd) => {
        if (cmd === "bad") throw new Error("kaboom");
      },
      (cmd, msg) => errors.push({ cmd, msg }),
    );
    expect(errors).toEqual([{ cmd: "bad", msg: "kaboom" }]);
  });

  test("snapshot returns a defensive copy", () => {
    const t = createTeardownTracker();
    t.add("x");
    const snap = t.snapshot();
    expect(snap.get("x")).toBe(1);
    // Snapshot is a copy — further mutations to the tracker do not leak.
    t.add("x");
    expect(snap.get("x")).toBe(1);
  });
});

describe("runPool + createTeardownTracker integration", () => {
  test("concurrent workers sharing teardown leave refcount=0 after all drop", async () => {
    const t = createTeardownTracker();
    const shared = "rm /tmp/shared";
    await runPool([1, 2, 3, 4], 4, async () => {
      t.add(shared);
      await sleep(10);
      t.drop(shared);
      return null;
    });
    expect(t.snapshot().size).toBe(0);
  });

  test("if SIGINT-equivalent fires mid-flight, drain still sees pending entries", async () => {
    const t = createTeardownTracker();
    const shared = "rm /tmp/sigint-victim";
    // Simulate two workers in flight, neither has dropped yet.
    t.add(shared);
    t.add(shared);
    expect(t.snapshot().get(shared)).toBe(2);
    const drained: string[] = [];
    t.drain((cmd) => drained.push(cmd));
    expect(drained).toEqual([shared]);
  });
});

describe("runLifecycleAsync teardown-error ordering", () => {
  test("teardown-error message is appended to out buffer AFTER work's log lines", async () => {
    const out: string[] = [];
    const result = await runLifecycleAsync({
      teardown: "rm /tmp/will-fail",
      work: async () => {
        out.push("transcript line 1");
        out.push("transcript line 2");
        return "work-result";
      },
      exec: (cmd) => {
        if (cmd === "rm /tmp/will-fail") throw new Error("teardown blew up");
      },
      onTeardownError: (msg) => out.push(`teardown failed: ${msg}`),
    });

    expect(result).toEqual({ kind: "ok", value: "work-result" });
    expect(out).toEqual([
      "transcript line 1",
      "transcript line 2",
      "teardown failed: teardown blew up",
    ]);
  });

  test("teardown-error fires even when work throws, and lands after any work-side pushes", async () => {
    const out: string[] = [];
    const work = runLifecycleAsync({
      teardown: "rm /tmp/will-fail",
      work: async () => {
        out.push("partial transcript before throw");
        throw new Error("work failed");
      },
      exec: (cmd) => {
        if (cmd === "rm /tmp/will-fail") throw new Error("teardown blew up");
      },
      onTeardownError: (msg) => out.push(`teardown failed: ${msg}`),
    });

    await expect(work).rejects.toThrow("work failed");
    expect(out).toEqual([
      "partial transcript before throw",
      "teardown failed: teardown blew up",
    ]);
  });
});
