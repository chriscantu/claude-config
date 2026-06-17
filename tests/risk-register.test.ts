import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REPO = resolve(import.meta.dir, "..");
const SCRIPT = join(REPO, "skills/risk-register/scripts/risk-register.ts");

const run = (args: string[]) => {
  const r = spawnSync("bun", ["run", SCRIPT, ...args], { encoding: "utf8" });
  return { code: r.status ?? -1, out: r.stdout ?? "", err: r.stderr ?? "" };
};

const mkWs = (): string => mkdtempSync(join(tmpdir(), "rr-"));
const regOf = (ws: string): string => readFileSync(join(ws, "risks", "register.md"), "utf8");

let wsDirs: string[] = [];
const freshWs = (): string => { const w = mkWs(); wsDirs.push(w); return w; };
afterEach(() => { for (const w of wsDirs) rmSync(w, { recursive: true, force: true }); wsDirs = []; });

const seed = (ws: string): void => {
  run(["add", ws, "--desc", "seed risk", "--today", "2026-05-01"]);
};

describe("add", () => {
  test("one-liner add applies all defaults and writes a block", () => {
    const ws = freshWs();
    const r = run(["add", ws, "--desc", "API auth not rotated", "--today", "2026-06-16"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("Added R-1 (med/med, owner TBD)");
    const text = regOf(ws);
    expect(text).toContain("### R-1: API auth not rotated   <!-- risk:active -->");
    expect(text).toContain("**Likelihood**: med  **Impact**: med");
    expect(text).toContain("**Owner**: TBD");
    expect(text).toContain("**Last reviewed**: 2026-06-16");
  });

  test("creates risks/ dir and register.md when missing", () => {
    const ws = freshWs();
    run(["add", ws, "--desc", "first risk", "--today", "2026-06-16"]);
    expect(existsSync(join(ws, "risks", "register.md"))).toBe(true);
  });

  test("second add increments the ID", () => {
    const ws = freshWs();
    run(["add", ws, "--desc", "one", "--today", "2026-06-16"]);
    run(["add", ws, "--desc", "two", "--today", "2026-06-16"]);
    const text = regOf(ws);
    expect(text).toContain("### R-1: one");
    expect(text).toContain("### R-2: two");
  });

  test("non-default values are stored and echoed", () => {
    const ws = freshWs();
    const r = run(["add", ws, "--desc", "billing", "--likelihood", "high", "--impact", "high", "--owner", "Dana", "--today", "2026-06-16"]);
    expect(r.out).toContain("Added R-1 (high/high, owner Dana)");
    expect(regOf(ws)).toContain("**Likelihood**: high  **Impact**: high");
  });

  test("missing --desc exits nonzero", () => {
    const ws = freshWs();
    const r = run(["add", ws, "--today", "2026-06-16"]);
    expect(r.code).not.toBe(0);
    expect(r.err).toContain("--desc");
  });
});

describe("mutators", () => {
  test("ack bumps last-reviewed without changing status", () => {
    const ws = freshWs(); seed(ws);
    const r = run(["ack", ws, "R-1", "--today", "2026-06-16"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("R-1 acked.");
    const text = regOf(ws);
    expect(text).toContain("<!-- risk:active -->");
    expect(text).toContain("**Last reviewed**: 2026-06-16");
  });

  test("escalate flips sentinel and bumps date", () => {
    const ws = freshWs(); seed(ws);
    const r = run(["escalate", ws, "R-1", "--today", "2026-06-16"]);
    expect(r.out).toContain("R-1 escalated.");
    const text = regOf(ws);
    expect(text).toContain("<!-- risk:escalated -->");
    expect(text).toContain("**Last reviewed**: 2026-06-16");
  });

  test("resolve flips sentinel to resolved", () => {
    const ws = freshWs(); seed(ws);
    const r = run(["resolve", ws, "R-1", "--today", "2026-06-16"]);
    expect(r.out).toContain("R-1 resolved.");
    expect(regOf(ws)).toContain("<!-- risk:resolved -->");
  });

  test("escalate bad ID exits nonzero with list hint, file unchanged", () => {
    const ws = freshWs(); seed(ws);
    const before = regOf(ws);
    const r = run(["escalate", ws, "R-99", "--today", "2026-06-16"]);
    expect(r.code).not.toBe(0);
    expect(r.err).toContain("not found");
    expect(r.err).toContain("list");
    expect(r.err).toContain("R-1"); // highest existing
    expect(regOf(ws)).toBe(before);
  });

  test("escalate on missing register exits nonzero", () => {
    const ws = freshWs();
    const r = run(["escalate", ws, "R-1"]);
    expect(r.code).not.toBe(0);
    expect(r.err).toContain("no register");
  });
});

describe("list", () => {
  test("empty register prints No risks tracked", () => {
    const ws = freshWs();
    const r = run(["list", ws]);
    expect(r.out).toContain("No risks tracked.");
  });

  test("list includes resolved entries with R-N IDs", () => {
    const ws = freshWs(); seed(ws);
    run(["resolve", ws, "R-1", "--today", "2026-06-16"]);
    const r = run(["list", ws]);
    expect(r.out).toContain("R-1");
    expect(r.out).toContain("resolved");
  });
});

describe("review", () => {
  const build = (ws: string): void => {
    // R-1 fresh high/high active; R-2 stale med/high; R-3 escalated; R-4 resolved; R-5 fresh low/low
    run(["add", ws, "--desc", "fresh hh", "--likelihood", "high", "--impact", "high", "--today", "2026-06-15"]);
    run(["add", ws, "--desc", "stale mh", "--likelihood", "med", "--impact", "high", "--today", "2026-05-01"]);
    run(["add", ws, "--desc", "to escalate", "--likelihood", "high", "--impact", "high", "--today", "2026-06-15"]);
    run(["escalate", ws, "R-3", "--today", "2026-06-15"]);
    run(["add", ws, "--desc", "to resolve", "--today", "2026-06-15"]);
    run(["resolve", ws, "R-4", "--today", "2026-06-15"]);
    run(["add", ws, "--desc", "fresh ll", "--likelihood", "low", "--impact", "low", "--today", "2026-06-15"]);
  };

  test("header counts: active(stale) · escalated · resolved", () => {
    const ws = freshWs(); build(ws);
    const r = run(["review", ws, "--today", "2026-06-16", "--stale-days", "14"]);
    expect(r.out).toContain("3 active (1 stale) · 1 escalated · 1 resolved");
  });

  test("resolved excluded from all sections", () => {
    const ws = freshWs(); build(ws);
    const r = run(["review", ws, "--today", "2026-06-16"]);
    expect(r.out).not.toContain("to resolve");
  });

  test("stale section shows age annotation; escalated section present", () => {
    const ws = freshWs(); build(ws);
    const r = run(["review", ws, "--today", "2026-06-16"]);
    expect(r.out).toContain("ESCALATED (1)");
    expect(r.out).toContain("NEEDS REVIEW — stale >14d (1)");
    expect(r.out).toMatch(/\(\d+ days\)/);
  });

  test("two-letter severity tag rendered; no numeric sum", () => {
    const ws = freshWs(); build(ws);
    const r = run(["review", ws, "--today", "2026-06-16"]);
    expect(r.out).toContain("[HH]");
    expect(r.out).not.toMatch(/\bsum\b/i);
  });

  test("top active surfaces fresh high-severity risk", () => {
    const ws = freshWs(); build(ws);
    const r = run(["review", ws, "--today", "2026-06-16"]);
    expect(r.out).toContain("TOP ACTIVE");
    expect(r.out).toContain("fresh hh");
  });

  test("empty register prints No risks tracked", () => {
    const ws = freshWs();
    expect(run(["review", ws]).out).toContain("No risks tracked.");
  });

  test("all-fresh-no-escalated still lists top active", () => {
    const ws = freshWs();
    run(["add", ws, "--desc", "only one", "--today", "2026-06-16"]);
    const r = run(["review", ws, "--today", "2026-06-16"]);
    expect(r.out).toContain("TOP ACTIVE (1 of 1)");
  });
});
