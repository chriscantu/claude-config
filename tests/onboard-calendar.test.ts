// tests/onboard-calendar.test.ts
import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REPO = resolve(import.meta.dir, "..");
const CAL = join(REPO, "bin", "onboard-calendar.ts");

const fixtures: string[] = [];

const runCal = (input: string, ...args: string[]) => {
  const r = spawnSync("bun", ["run", CAL, ...args], { input, encoding: "utf8" });
  return { exitCode: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
};

afterEach(() => {
  while (fixtures.length > 0) {
    try { rmSync(fixtures.pop()!, { recursive: true, force: true }); } catch {}
  }
});

describe("bin/onboard-calendar.ts parse", () => {
  test("parses freeform 'Name <email>' lines", () => {
    const input = "Sarah Chen <sarah@acme.com>\nMarcus Diaz <marcus@acme.com>\n";
    const r = runCal(input, "parse", "-");
    expect(r.exitCode).toBe(0);
    const events = JSON.parse(r.stdout);
    expect(events).toEqual([
      { name: "Sarah Chen", email: "sarah@acme.com" },
      { name: "Marcus Diaz", email: "marcus@acme.com" },
    ]);
  });

  test("parses freeform 'Name — email' (em-dash separator)", () => {
    const r = runCal("Priya Patel — priya@acme.com\n", "parse", "-");
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual([
      { name: "Priya Patel", email: "priya@acme.com" },
    ]);
  });

  test("parses bare-name lines (email absent)", () => {
    const r = runCal("Sarah Chen\n", "parse", "-");
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual([{ name: "Sarah Chen", email: null }]);
  });

  test("parses ICS subset ATTENDEE;CN=...:mailto:...", () => {
    const input = "ATTENDEE;CN=Sarah Chen:mailto:sarah@acme.com\n";
    const r = runCal(input, "parse", "-");
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual([
      { name: "Sarah Chen", email: "sarah@acme.com" },
    ]);
  });

  test("ignores blank lines and surrounding whitespace", () => {
    const r = runCal("\n  Sarah Chen <sarah@acme.com>  \n\n", "parse", "-");
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual([
      { name: "Sarah Chen", email: "sarah@acme.com" },
    ]);
  });

  test("handles empty input — emits []", () => {
    const r = runCal("", "parse", "-");
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual([]);
  });
});
