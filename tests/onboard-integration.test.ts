// tests/onboard-integration.test.ts
import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runGraduate, type ScheduledTaskInfo } from "../bin/onboard-graduate.ts";

const REPO = resolve(import.meta.dir, "..");
const SCAFFOLD = join(REPO, "bin", "onboard-scaffold.fish");
const GUARD = join(REPO, "bin", "onboard-guard.ts");

const fixtures: string[] = [];

// Git identity env vars so the scaffold's initial `git commit` works on CI
// runners without a global ~/.gitconfig. Mirrors tests/onboard-scaffold.test.ts.
const GIT_ENV = {
  GIT_AUTHOR_NAME: "Onboard Integration Test",
  GIT_AUTHOR_EMAIL: "onboard-integration-test@example.invalid",
  GIT_COMMITTER_NAME: "Onboard Integration Test",
  GIT_COMMITTER_EMAIL: "onboard-integration-test@example.invalid",
};

const scaffoldWorkspace = (org: string): string => {
  const root = mkdtempSync(join(tmpdir(), "onboard-int-test-"));
  fixtures.push(root);
  const target = join(root, `onboard-${org}`);
  const r = spawnSync(
    "fish",
    [SCAFFOLD, "--target", target, "--cadence", "standard", "--no-gh"],
    { encoding: "utf8", env: { ...process.env, ...GIT_ENV } },
  );
  if (r.status !== 0) {
    throw new Error(`scaffold failed: ${r.stderr}`);
  }
  return target;
};

const runGuard = (...args: string[]) => {
  const r = spawnSync("bun", ["run", GUARD, ...args], { encoding: "utf8" });
  return { exitCode: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
};

afterEach(() => {
  while (fixtures.length > 0) {
    try { rmSync(fixtures.pop()!, { recursive: true, force: true }); } catch {}
  }
});

describe("Phase 3 cross-skill integration", () => {
  test("scaffolded workspace + raw note → guard refuses raw path", () => {
    const ws = scaffoldWorkspace("acme");
    const rawNote = join(ws, "interviews", "raw", "2026-04-15-sarah.md");
    writeFileSync(
      rawNote,
      "# 1:1 with Sarah Chen — 2026-04-15\n\n## Observations\n\n" +
      "1. [attributable] Platform rewrite is overdue.\n" +
      "2. [redact] Critical commentary about VP Eng — do not surface.\n",
    );
    const r = runGuard("refuse-raw", rawNote);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("interviews/raw");
    expect(r.stderr).toContain("refused");
  });

  test("scaffolded workspace + sanitized note → guard allows sanitized path", () => {
    const ws = scaffoldWorkspace("acme");
    const sanitized = join(ws, "interviews", "sanitized", "2026-04-15-themes.md");
    writeFileSync(
      sanitized,
      "# Sanitized themes — 2026-04-15\n\n## Aggregate-only themes\n\n" +
      "- Multiple engineering leaders noted: platform rewrite overdue.\n",
    );
    const r = runGuard("refuse-raw", sanitized);
    expect(r.exitCode).toBe(0);
  });

  test("attribution check fires on deck quoting stakeholder by name", () => {
    const ws = scaffoldWorkspace("acme");
    const mapPath = join(ws, "stakeholders", "map.md");
    const existing = readFileSync(mapPath, "utf8");
    writeFileSync(
      mapPath,
      existing + "\n## Direct reports\n\n- Sarah Chen — Senior Engineer\n",
    );
    const deckDir = join(ws, "decks", "slidev", "interim");
    mkdirSync(deckDir, { recursive: true });
    const deckPath = join(deckDir, "slides.md");
    writeFileSync(
      deckPath,
      "# Interim reflect-back\n\nSarah Chen flagged platform risk.\n",
    );
    const r = runGuard("attribution-check", deckPath, mapPath);
    expect(r.exitCode).toBe(3);
    expect(r.stderr).toContain("Sarah Chen");
    expect(r.stderr).toContain("slides.md:3");
  });

  test("attribution check passes on aggregated deck", () => {
    const ws = scaffoldWorkspace("acme");
    const mapPath = join(ws, "stakeholders", "map.md");
    const existing = readFileSync(mapPath, "utf8");
    writeFileSync(
      mapPath,
      existing + "\n## Direct reports\n\n- Sarah Chen — Senior Engineer\n",
    );
    const deckDir = join(ws, "decks", "slidev", "interim");
    mkdirSync(deckDir, { recursive: true });
    const deckPath = join(deckDir, "slides.md");
    writeFileSync(
      deckPath,
      "# Interim reflect-back\n\nMultiple engineering leaders noted platform risk.\n",
    );
    const r = runGuard("attribution-check", deckPath, mapPath);
    expect(r.exitCode).toBe(0);
  });
});

describe("Phase 4 calendar paste", () => {
  test("scaffold + map.md seed + freeform paste → suggestions + stamp + NAGS", () => {
    const ws = scaffoldWorkspace("acme");
    const mapPath = join(ws, "stakeholders", "map.md");
    const existing = readFileSync(mapPath, "utf8");
    writeFileSync(
      mapPath,
      existing + "\n## Direct reports\n\n- Sarah Chen — Senior Engineer\n",
    );

    const cal = join(REPO, "bin", "onboard-calendar.ts");
    const r = spawnSync(
      "bun",
      ["run", cal, "paste", ws],
      {
        input: "Sarah Chen <sarah@acme.com>\nPriya Patel <priya@acme.com>\n",
        encoding: "utf8",
      },
    );
    expect(r.status).toBe(0);

    const suggestions = readFileSync(join(ws, "calendar-suggestions.md"), "utf8");
    expect(suggestions).toContain("Priya Patel");
    expect(suggestions).not.toContain("Sarah Chen");

    const stamp = readFileSync(join(ws, ".calendar-last-paste"), "utf8").trim();
    expect(stamp).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const nags = readFileSync(join(ws, "NAGS.md"), "utf8");
    const today = new Date().toISOString().slice(0, 10);
    expect(nags).toContain(`${today}  calendar  1 new invitee pending review`);
  });

  test("re-running paste on same day does not duplicate NAGS line", () => {
    const ws = scaffoldWorkspace("acme");
    writeFileSync(
      join(ws, "stakeholders", "map.md"),
      "# Stakeholder Map\n\n## Direct reports\n\n- Sarah Chen — SE\n",
    );
    const cal = join(REPO, "bin", "onboard-calendar.ts");
    const input = "Priya Patel <priya@acme.com>\n";

    spawnSync("bun", ["run", cal, "paste", ws], { input, encoding: "utf8" });
    spawnSync("bun", ["run", cal, "paste", ws], { input, encoding: "utf8" });

    const nags = readFileSync(join(ws, "NAGS.md"), "utf8");
    const today = new Date().toISOString().slice(0, 10);
    const matches = nags.split("\n").filter((l) =>
      l.startsWith(`${today}  calendar  `),
    );
    expect(matches.length).toBe(1);
  });
});

describe("Phase 5 full-ramp lifecycle", () => {
  const RETRO_BODY = `## What worked
The biweekly cadence.

## What didn't work
Calendar paste cadence.

## Key relationships
Manager + peers + skip-level + a senior IC.

## Top decisions
Platform freeze + interview rotation.

## What I would do differently
Start /1on1-prep earlier.
`;

  const writeRetroFixture = (root: string, body: string): string => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), "onboard-graduate-fixture-"));
    fixtures.push(fixtureRoot);
    const p = join(fixtureRoot, "retro.md");
    writeFileSync(p, body);
    return p;
  };

  type RecordedUpdate = { taskId: string; enabled: boolean };

  const stubMcp = (tasks: ScheduledTaskInfo[]) => {
    const updates: RecordedUpdate[] = [];
    return {
      lister: () => tasks,
      updater: (taskId: string, enabled: boolean) => {
        updates.push({ taskId, enabled });
      },
      updates,
    };
  };

  // The git commits the lifecycle test creates run inside the scaffolded
  // workspace, which already has a .git from the scaffold. The scaffold
  // commits an initial state; we add fixture data + commit it cleanly so
  // graduate's clean-tree gate passes.
  const commitFixtures = (ws: string): void => {
    const r = spawnSync(
      "git",
      ["-C", ws, "add", "-A"],
      { encoding: "utf8" },
    );
    if (r.status !== 0) throw new Error(`git add: ${r.stderr}`);
    const c = spawnSync(
      "git",
      ["-C", ws, "commit", "-q", "-m", "lifecycle fixtures"],
      { encoding: "utf8", env: { ...process.env, ...GIT_ENV } },
    );
    if (c.status !== 0) throw new Error(`git commit: ${c.stderr}`);
  };

  test("scaffold → sanitized note → calendar paste → graduate end-to-end", () => {
    const ws = scaffoldWorkspace("acme");

    // Simulate Phase 2 cron registration: record a stable taskId we will
    // later assert was paused. The scaffold does not call MCP itself
    // (model-orchestrated step), so we synthesize the registration here.
    const RECORDED_ID = "task-acme-cadence-uuid";
    const tasks: ScheduledTaskInfo[] = [
      { taskId: RECORDED_ID, taskName: "onboard-acme-cadence" },
    ];
    const mcp = stubMcp(tasks);

    // Phase 3: a sanitized note exists.
    const today = new Date().toISOString().slice(0, 10);
    writeFileSync(
      join(ws, "interviews", "sanitized", `${today}-themes.md`),
      "# Sanitized themes\n\n- Multiple leaders noted: platform rewrite overdue.\n",
    );

    // Phase 4: calendar paste stamp.
    writeFileSync(join(ws, ".calendar-last-paste"), `${today}\n`);

    // Commit fixtures so the working tree is clean for graduate.
    commitFixtures(ws);

    // Run graduate with the MCP stub.
    const retro = writeRetroFixture(ws, RETRO_BODY);
    const code = runGraduate({
      workspace: ws,
      orgSlug: "acme",
      retroFromPath: retro,
      mcpLister: mcp.lister,
      mcpUpdater: mcp.updater,
      today,
    });
    expect(code).toBe(0);

    // Assert post-conditions.
    const retroOnDisk = readFileSync(join(ws, "decisions", "retro.md"), "utf8");
    expect(retroOnDisk).toContain("biweekly cadence");
    expect(retroOnDisk).toContain("Platform freeze");
    expect(retroOnDisk).toContain("Start /1on1-prep earlier");

    const tagList = spawnSync(
      "git",
      ["-C", ws, "tag", "--list"],
      { encoding: "utf8" },
    ).stdout.trim().split("\n").filter(Boolean);
    expect(tagList).toContain(`ramp-graduated-${today}`);

    expect(mcp.updates).toEqual([{ taskId: RECORDED_ID, enabled: false }]);

    expect(readFileSync(join(ws, ".graduated"), "utf8").trim()).toBe(today);

    // Re-run without --force: idempotent skip.
    const code2 = runGraduate({
      workspace: ws,
      orgSlug: "acme",
      retroFromPath: retro,
      mcpLister: mcp.lister,
      mcpUpdater: mcp.updater,
      today,
    });
    expect(code2).toBe(0);
    expect(mcp.updates.length).toBe(1); // no new update call

    // Re-run with --force: re-applies; tag does not duplicate (git tag
    // is idempotent against existing name); MCP update is re-issued.
    const code3 = runGraduate({
      workspace: ws,
      orgSlug: "acme",
      force: true,
      retroFromPath: retro,
      mcpLister: mcp.lister,
      mcpUpdater: mcp.updater,
      today,
    });
    expect(code3).toBe(0);
    const tagList2 = spawnSync(
      "git",
      ["-C", ws, "tag", "--list"],
      { encoding: "utf8" },
    ).stdout.trim().split("\n").filter(Boolean);
    const todayTagCount = tagList2.filter(
      (t) => t === `ramp-graduated-${today}`,
    ).length;
    expect(todayTagCount).toBe(1);
    expect(mcp.updates.length).toBe(2); // re-issued under --force

    // onboard-status.ts surfaces graduated state.
    const status = spawnSync(
      "bun",
      ["run", join(REPO, "bin", "onboard-status.ts"), "--status", ws],
      { encoding: "utf8" },
    );
    expect(status.status).toBe(0);
    expect(status.stdout).toContain(`Status: graduated ${today}`);
    expect(status.stdout).not.toContain("Next milestone");
    expect(status.stdout).not.toContain("Mutes");
  });

  test("CLI subprocess (no MCP injection) writes warnings.log + continues", () => {
    const ws = scaffoldWorkspace("acme");
    const today = new Date().toISOString().slice(0, 10);

    const retroFixtureRoot = mkdtempSync(
      join(tmpdir(), "onboard-graduate-cli-fixture-"),
    );
    fixtures.push(retroFixtureRoot);
    const retro = join(retroFixtureRoot, "retro.md");
    writeFileSync(retro, RETRO_BODY);

    const r = spawnSync(
      "bun",
      [
        "run",
        join(REPO, "bin", "onboard-graduate.ts"),
        "graduate",
        ws,
        "--retro-from",
        retro,
      ],
      { encoding: "utf8", env: { ...process.env, ...GIT_ENV } },
    );

    expect(r.status).toBe(0);
    expect(existsSync(join(ws, ".graduated"))).toBe(true);
    const warnings = readFileSync(join(ws, ".graduate-warnings.log"), "utf8");
    expect(warnings).toContain("mcp-not-configured");
  });
});
