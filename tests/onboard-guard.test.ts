// tests/onboard-guard.test.ts
import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REPO = resolve(import.meta.dir, "..");
const GUARD = join(REPO, "bin", "onboard-guard.ts");

type RunResult = { exitCode: number; stdout: string; stderr: string };

const run = (...args: string[]): RunResult => {
  const r = spawnSync("bun", ["run", GUARD, ...args], { encoding: "utf8" });
  if (r.error) throw r.error;
  return { exitCode: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
};

const fixtures: string[] = [];
const makeWorkspace = (): string => {
  const root = mkdtempSync(join(tmpdir(), "onboard-guard-test-"));
  fixtures.push(root);
  const ws = join(root, "onboard-acme");
  mkdirSync(join(ws, "interviews", "raw"), { recursive: true });
  mkdirSync(join(ws, "interviews", "sanitized"), { recursive: true });
  mkdirSync(join(ws, "decks", "slidev"), { recursive: true });
  mkdirSync(join(ws, "stakeholders"), { recursive: true });
  return ws;
};

afterEach(() => {
  while (fixtures.length > 0) {
    try { rmSync(fixtures.pop()!, { recursive: true, force: true }); } catch {}
  }
});

describe("bin/onboard-guard.ts refuse-raw", () => {
  test("exits 0 when path is outside interviews/raw", () => {
    const ws = makeWorkspace();
    const sanitized = join(ws, "interviews", "sanitized", "themes.md");
    writeFileSync(sanitized, "## Theme A\n");
    const r = run("refuse-raw", sanitized);
    expect(r.exitCode).toBe(0);
  });

  test("exits 2 when path is directly under interviews/raw", () => {
    const ws = makeWorkspace();
    const raw = join(ws, "interviews", "raw", "2026-04-15-sarah.md");
    writeFileSync(raw, "Verbatim notes\n");
    const r = run("refuse-raw", raw);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("interviews/raw");
    expect(r.stderr).toContain("refused");
  });

  test("exits 2 when path is nested deeper under interviews/raw", () => {
    const ws = makeWorkspace();
    const nested = join(ws, "interviews", "raw", "2026-Q2", "sarah.md");
    mkdirSync(join(ws, "interviews", "raw", "2026-Q2"), { recursive: true });
    writeFileSync(nested, "Notes\n");
    const r = run("refuse-raw", nested);
    expect(r.exitCode).toBe(2);
  });
});
