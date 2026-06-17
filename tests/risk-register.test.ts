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
