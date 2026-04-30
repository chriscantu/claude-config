// tests/onboard-status.test.ts
import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REPO = resolve(import.meta.dir, "..");
const SCRIPT = join(REPO, "bin", "onboard-status.fish");

type RunResult = { exitCode: number; stdout: string; stderr: string };

const run = (cwd: string, ...args: string[]): RunResult => {
  const r = spawnSync("fish", [SCRIPT, ...args], { cwd, encoding: "utf8" });
  if (r.error) throw r.error;
  return { exitCode: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
};

const fixtures: string[] = [];
const makeWorkspace = (startedDaysAgo: number, cadence = "standard"): string => {
  const root = mkdtempSync(join(tmpdir(), "onboard-status-test-"));
  fixtures.push(root);
  const ws = join(root, "onboard-acme");
  mkdirSync(ws, { recursive: true });
  const started = new Date(Date.now() - startedDaysAgo * 86_400_000)
    .toISOString().slice(0, 10);
  writeFileSync(
    join(ws, "RAMP.md"),
    `# 90-Day Ramp Plan — acme\n\nCadence: ${cadence}\nStarted: ${started}\n\n` +
    `| Week | Milestone | Status |\n|---|---|---|\n` +
    `| W0 | Workspace scaffolded | [x] |\n` +
    `| W2 | Stakeholder map >=80% | [ ] |\n` +
    `| W4 | >=8 interviews + INTERIM deck | [ ] |\n` +
    `| W6 | SWOT v1 | [ ] |\n\n` +
    `## Cadence Mutes\n\n(none)\n\n## Notes\n\n(scratch)\n`,
  );
  return ws;
};

afterEach(() => {
  while (fixtures.length > 0) {
    try { rmSync(fixtures.pop()!, { recursive: true, force: true }); } catch {}
  }
});

describe("bin/onboard-status.fish --status", () => {
  test("prints elapsed weeks and next unchecked milestone", () => {
    const ws = makeWorkspace(15); // ~2 weeks in
    const r = run(".", "--status", ws);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/Elapsed:\s+\d+\s+days/);
    expect(r.stdout).toContain("Next milestone:");
    expect(r.stdout).toContain("W2");
  });
});

import { readFileSync } from "node:fs";

describe("bin/onboard-status.fish --mute", () => {
  test("appends a category to ## Cadence Mutes and removes (none) marker", () => {
    const ws = makeWorkspace(5);
    const r = run(".", "--mute", "milestone", ws);
    expect(r.exitCode).toBe(0);
    const ramp = readFileSync(join(ws, "RAMP.md"), "utf8");
    expect(ramp).toMatch(/## Cadence Mutes\n\n- milestone\n/);
    expect(ramp).not.toMatch(/## Cadence Mutes\n\n\(none\)/);
  });

  test("muting twice is idempotent", () => {
    const ws = makeWorkspace(5);
    run(".", "--mute", "velocity", ws);
    const r = run(".", "--mute", "velocity", ws);
    expect(r.exitCode).toBe(0);
    const ramp = readFileSync(join(ws, "RAMP.md"), "utf8");
    expect((ramp.match(/^- velocity$/gm) ?? []).length).toBe(1);
  });

  test("rejects unknown category", () => {
    const ws = makeWorkspace(5);
    const r = run(".", "--mute", "yolo", ws);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain("unknown category");
  });
});

describe("bin/onboard-status.fish --unmute", () => {
  test("removes a previously-muted category and restores (none) when empty", () => {
    const ws = makeWorkspace(5);
    run(".", "--mute", "milestone", ws);
    run(".", "--unmute", "milestone", ws);
    const ramp = readFileSync(join(ws, "RAMP.md"), "utf8");
    expect(ramp).toMatch(/## Cadence Mutes\n\n\(none\)/);
  });

  test("--status reflects mute state in output", () => {
    const ws = makeWorkspace(5);
    run(".", "--mute", "velocity", ws);
    const r = run(".", "--status", ws);
    expect(r.stdout).toContain("- velocity");
  });
});
