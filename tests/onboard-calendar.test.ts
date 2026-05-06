// tests/onboard-calendar.test.ts
import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REPO = resolve(import.meta.dir, "..");
const CAL = join(REPO, "skills", "onboard", "scripts", "onboard-calendar.ts");

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

describe("skills/onboard/scripts/onboard-calendar.ts parse", () => {
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

  test("freeform separator preserves hyphen in email local-part", () => {
    const r = runCal("Sarah Chen — first-last@acme.com\n", "parse", "-");
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual([
      { name: "Sarah Chen", email: "first-last@acme.com" },
    ]);
  });

  test("bracket form preserves hyphen in email local-part", () => {
    const r = runCal("Sarah Chen <first-last@acme.com>\n", "parse", "-");
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual([
      { name: "Sarah Chen", email: "first-last@acme.com" },
    ]);
  });
});

const writeMap = (ws: string, names: string[]): string => {
  const path = join(ws, "stakeholders", "map.md");
  const body =
    "# Stakeholder Map\n\n## Direct reports\n\n" +
    names.map((n) => `- ${n} — Engineer\n`).join("");
  writeFileSync(path, body);
  return path;
};

const makeWorkspace = (): string => {
  const root = mkdtempSync(join(tmpdir(), "onboard-cal-"));
  fixtures.push(root);
  mkdirSync(join(root, "stakeholders"), { recursive: true });
  mkdirSync(join(root, "interviews", "raw"), { recursive: true });
  // RAMP.md needed for the cron NAGS dedupe path; keep it minimal.
  writeFileSync(
    join(root, "RAMP.md"),
    "Started: 2026-04-01\n\n## Cadence Mutes\n\n(none)\n",
  );
  return root;
};

describe("skills/onboard/scripts/onboard-calendar.ts diff", () => {
  test("emits unmatched invitees only", () => {
    const ws = makeWorkspace();
    const map = writeMap(ws, ["Sarah Chen", "Marcus Diaz"]);
    const events = JSON.stringify([
      { name: "Sarah Chen", email: "sarah@acme.com" },
      { name: "Priya Patel", email: "priya@acme.com" },
    ]);
    const eventsFile = join(ws, "events.json");
    writeFileSync(eventsFile, events);
    const r = runCal("", "diff", eventsFile, map);
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual([
      { name: "Priya Patel", email: "priya@acme.com" },
    ]);
  });

  test("matches case-insensitively on display name", () => {
    const ws = makeWorkspace();
    const map = writeMap(ws, ["Sarah Chen"]);
    const events = JSON.stringify([{ name: "sarah chen", email: null }]);
    const eventsFile = join(ws, "events.json");
    writeFileSync(eventsFile, events);
    const r = runCal("", "diff", eventsFile, map);
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual([]);
  });

  test("empty map.md returns all invitees as unmatched", () => {
    const ws = makeWorkspace();
    writeFileSync(join(ws, "stakeholders", "map.md"), "# Stakeholder Map\n\n");
    const events = JSON.stringify([{ name: "Sarah Chen", email: null }]);
    const eventsFile = join(ws, "events.json");
    writeFileSync(eventsFile, events);
    const r = runCal("", "diff", eventsFile, join(ws, "stakeholders", "map.md"));
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual([{ name: "Sarah Chen", email: null }]);
  });

  test("reads events from stdin when first arg is '-' (pipe-chain support)", () => {
    const ws = makeWorkspace();
    const map = writeMap(ws, ["Sarah Chen"]);
    const events = JSON.stringify([
      { name: "Sarah Chen", email: null },
      { name: "Priya Patel", email: null },
    ]);
    const r = runCal(events, "diff", "-", map);
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual([{ name: "Priya Patel", email: null }]);
  });
});

describe("skills/onboard/scripts/onboard-calendar.ts paste (end-to-end)", () => {
  test("writes suggestions.md, stamp file, and single NAGS line", () => {
    const ws = makeWorkspace();
    writeMap(ws, ["Sarah Chen"]);
    const r = runCal(
      "Sarah Chen <sarah@acme.com>\nPriya Patel <priya@acme.com>\n",
      "paste",
      ws,
    );
    expect(r.exitCode).toBe(0);

    const suggestions = readFileSync(join(ws, "calendar-suggestions.md"), "utf8");
    expect(suggestions).toContain("Priya Patel");
    expect(suggestions).not.toContain("Sarah Chen");

    const stamp = readFileSync(join(ws, ".calendar-last-paste"), "utf8").trim();
    expect(stamp).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const nags = readFileSync(join(ws, "NAGS.md"), "utf8");
    const today = new Date().toISOString().slice(0, 10);
    expect(nags).toContain(`${today}  calendar  1 new invitee pending review`);
  });

  test("zero unmatched → no suggestions file written, NAGS line still informs zero", () => {
    const ws = makeWorkspace();
    writeMap(ws, ["Sarah Chen"]);
    const r = runCal("Sarah Chen <sarah@acme.com>\n", "paste", ws);
    expect(r.exitCode).toBe(0);
    expect(existsSync(join(ws, "calendar-suggestions.md"))).toBe(false);
    const nags = readFileSync(join(ws, "NAGS.md"), "utf8");
    expect(nags).toContain("calendar  0 new invitees");
  });
});
