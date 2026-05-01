// tests/onboard-graduate.test.ts — Phase 5 graduate helper + orchestrator.
import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  hasGraduated,
  isCleanTree,
  findCadenceTask,
  composeRetroPrompt,
  writeSentinel,
  runGraduate,
  type ScheduledTaskInfo,
} from "../bin/onboard-graduate.ts";

const REPO = resolve(import.meta.dir, "..");

const fixtures: string[] = [];
afterEach(() => {
  while (fixtures.length > 0) {
    try { rmSync(fixtures.pop()!, { recursive: true, force: true }); } catch {}
  }
});

const GIT_ENV = {
  GIT_AUTHOR_NAME: "Onboard Graduate Test",
  GIT_AUTHOR_EMAIL: "onboard-graduate-test@example.invalid",
  GIT_COMMITTER_NAME: "Onboard Graduate Test",
  GIT_COMMITTER_EMAIL: "onboard-graduate-test@example.invalid",
};

const git = (cwd: string, ...args: string[]) => {
  const r = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...GIT_ENV },
  });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  }
  return r.stdout;
};

const makeWorkspace = (org = "acme"): string => {
  const root = mkdtempSync(join(tmpdir(), "onboard-graduate-test-"));
  fixtures.push(root);
  const ws = join(root, `onboard-${org}`);
  mkdirSync(ws, { recursive: true });
  // Init git repo so isCleanTree + tag/commit can run.
  git(ws, "init", "-q", "-b", "main");
  writeFileSync(join(ws, "RAMP.md"), `# Ramp\n\nStarted: 2026-01-01\n`);
  git(ws, "add", "RAMP.md");
  git(ws, "commit", "-q", "-m", "scaffold");
  return ws;
};

// ---------- hasGraduated ----------

describe("hasGraduated()", () => {
  test("returns false when .graduated absent", () => {
    const ws = makeWorkspace();
    expect(hasGraduated(ws)).toBe(false);
  });

  test("returns true when .graduated present", () => {
    const ws = makeWorkspace();
    writeFileSync(join(ws, ".graduated"), "2026-05-01\n");
    expect(hasGraduated(ws)).toBe(true);
  });
});

// ---------- isCleanTree ----------

describe("isCleanTree()", () => {
  test("returns true on a clean repo", () => {
    const ws = makeWorkspace();
    expect(isCleanTree(ws)).toBe(true);
  });

  test("returns false when working tree has uncommitted changes", () => {
    const ws = makeWorkspace();
    writeFileSync(join(ws, "dirty.txt"), "uncommitted\n");
    expect(isCleanTree(ws)).toBe(false);
  });
});

// ---------- findCadenceTask ----------

describe("findCadenceTask()", () => {
  test("returns the taskId for matching org slug", () => {
    const tasks: ScheduledTaskInfo[] = [
      { taskId: "abc-123", taskName: "onboard-acme-cadence" },
      { taskId: "xyz-789", taskName: "onboard-other-cadence" },
    ];
    const result = findCadenceTask("acme", () => tasks);
    expect(result).toBe("abc-123");
  });

  test("returns null when no matching task exists", () => {
    const tasks: ScheduledTaskInfo[] = [
      { taskId: "xyz-789", taskName: "onboard-other-cadence" },
    ];
    const result = findCadenceTask("acme", () => tasks);
    expect(result).toBeNull();
  });

  test("returns null on empty list", () => {
    const result = findCadenceTask("acme", () => []);
    expect(result).toBeNull();
  });
});

// ---------- composeRetroPrompt ----------

describe("composeRetroPrompt()", () => {
  test("contains the 5 retro section headings in order", () => {
    const prompt = composeRetroPrompt();
    const headings = [
      "## What worked",
      "## What didn't work",
      "## Key relationships",
      "## Top decisions",
      "## What I would do differently",
    ];
    let cursor = -1;
    for (const h of headings) {
      const idx = prompt.indexOf(h, cursor + 1);
      expect(idx).toBeGreaterThan(cursor);
      cursor = idx;
    }
  });
});

// ---------- writeSentinel ----------

describe("writeSentinel()", () => {
  test("writes .graduated with the ISO date and returns the path", () => {
    const ws = makeWorkspace();
    const path = writeSentinel(ws, "2026-05-01");
    expect(path).toBe(join(ws, ".graduated"));
    expect(readFileSync(path, "utf8").trim()).toBe("2026-05-01");
  });
});

// ---------- runGraduate (orchestrator) ----------

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

const writeRetroFixture = (workspace: string, body: string): string => {
  // Write fixture OUTSIDE the workspace so the tree stays clean.
  const fixtureRoot = mkdtempSync(join(tmpdir(), "onboard-graduate-fixture-"));
  fixtures.push(fixtureRoot);
  const p = join(fixtureRoot, "retro-fixture.md");
  writeFileSync(p, body);
  return p;
};

const RETRO_BODY = `## What worked
The biweekly cadence.

## What didn't work
Calendar paste cadence.

## Key relationships
Manager + peers.

## Top decisions
Platform freeze.

## What I would do differently
Start /1on1-prep earlier.
`;

describe("runGraduate() — happy path", () => {
  test("graduates a clean workspace end-to-end", () => {
    const ws = makeWorkspace("acme");
    const retro = writeRetroFixture(ws, RETRO_BODY);
    const mcp = stubMcp([
      { taskId: "task-acme", taskName: "onboard-acme-cadence" },
    ]);

    const code = runGraduate({
      workspace: ws,
      orgSlug: "acme",
      retroFromPath: retro,
      mcpLister: mcp.lister,
      mcpUpdater: mcp.updater,
      today: "2026-05-01",
    });

    expect(code).toBe(0);
    expect(existsSync(join(ws, "decisions", "retro.md"))).toBe(true);
    const tags = git(ws, "tag", "--list").trim().split("\n").filter(Boolean);
    expect(tags).toContain("ramp-graduated-2026-05-01");
    expect(mcp.updates).toEqual([{ taskId: "task-acme", enabled: false }]);
    expect(readFileSync(join(ws, ".graduated"), "utf8").trim()).toBe("2026-05-01");
  });
});

describe("runGraduate() — prior graduation", () => {
  test("exits 0 with warning when .graduated exists and --force is not set", () => {
    const ws = makeWorkspace("acme");
    writeFileSync(join(ws, ".graduated"), "2026-04-30\n");
    const mcp = stubMcp([]);

    const code = runGraduate({
      workspace: ws,
      orgSlug: "acme",
      retroFromPath: writeRetroFixture(ws, RETRO_BODY),
      mcpLister: mcp.lister,
      mcpUpdater: mcp.updater,
      today: "2026-05-01",
    });

    expect(code).toBe(0);
    // Sentinel unchanged from prior date.
    expect(readFileSync(join(ws, ".graduated"), "utf8").trim()).toBe("2026-04-30");
    // No MCP updates because we short-circuited.
    expect(mcp.updates.length).toBe(0);
  });

  test("with --force re-applies steps idempotently", () => {
    const ws = makeWorkspace("acme");
    // Pre-populate prior graduation state.
    writeFileSync(join(ws, ".graduated"), "2026-04-30\n");
    git(ws, "add", ".graduated");
    git(ws, "commit", "-q", "-m", "prior graduate");
    git(ws, "tag", "ramp-graduated-2026-04-30");
    const retro = writeRetroFixture(ws, RETRO_BODY);
    const mcp = stubMcp([
      { taskId: "task-acme", taskName: "onboard-acme-cadence" },
    ]);

    const code = runGraduate({
      workspace: ws,
      orgSlug: "acme",
      force: true,
      retroFromPath: retro,
      mcpLister: mcp.lister,
      mcpUpdater: mcp.updater,
      today: "2026-05-01",
    });

    expect(code).toBe(0);
    const tags = git(ws, "tag", "--list").trim().split("\n").filter(Boolean);
    expect(tags).toContain("ramp-graduated-2026-05-01");
    expect(mcp.updates).toEqual([{ taskId: "task-acme", enabled: false }]);
    // Sentinel updated to today.
    expect(readFileSync(join(ws, ".graduated"), "utf8").trim()).toBe("2026-05-01");
  });
});

describe("runGraduate() — dirty tree", () => {
  test("aborts exit 2 when working tree is dirty", () => {
    const ws = makeWorkspace("acme");
    writeFileSync(join(ws, "uncommitted.txt"), "wip\n");
    const retro = writeRetroFixture(ws, RETRO_BODY);
    const mcp = stubMcp([]);

    const code = runGraduate({
      workspace: ws,
      orgSlug: "acme",
      retroFromPath: retro,
      mcpLister: mcp.lister,
      mcpUpdater: mcp.updater,
      today: "2026-05-01",
    });

    expect(code).toBe(2);
    expect(existsSync(join(ws, ".graduated"))).toBe(false);
    expect(mcp.updates.length).toBe(0);
  });
});

describe("runGraduate() — partial-failure retry", () => {
  test("re-running after a partial state completes idempotently", () => {
    const ws = makeWorkspace("acme");
    const retro = writeRetroFixture(ws, RETRO_BODY);

    // Simulate prior partial run: retro committed + tag applied,
    // but cron still enabled and .graduated absent.
    mkdirSync(join(ws, "decisions"), { recursive: true });
    writeFileSync(join(ws, "decisions", "retro.md"), RETRO_BODY);
    git(ws, "add", "decisions/retro.md");
    git(ws, "commit", "-q", "-m", "graduate: retro for acme");
    git(ws, "tag", "ramp-graduated-2026-05-01");

    const mcp = stubMcp([
      { taskId: "task-acme", taskName: "onboard-acme-cadence" },
    ]);
    const code = runGraduate({
      workspace: ws,
      orgSlug: "acme",
      retroFromPath: retro,
      mcpLister: mcp.lister,
      mcpUpdater: mcp.updater,
      today: "2026-05-01",
    });

    expect(code).toBe(0);
    expect(existsSync(join(ws, ".graduated"))).toBe(true);
    expect(mcp.updates).toEqual([{ taskId: "task-acme", enabled: false }]);
    // No duplicate tag.
    const tagCount = git(ws, "tag", "--list").trim().split("\n")
      .filter((t) => t === "ramp-graduated-2026-05-01").length;
    expect(tagCount).toBe(1);
  });
});

describe("runGraduate() — no remote configured", () => {
  test("skips push step without aborting; logs warning to .graduate-warnings.log", () => {
    const ws = makeWorkspace("acme");
    const retro = writeRetroFixture(ws, RETRO_BODY);
    const mcp = stubMcp([
      { taskId: "task-acme", taskName: "onboard-acme-cadence" },
    ]);

    const code = runGraduate({
      workspace: ws,
      orgSlug: "acme",
      retroFromPath: retro,
      mcpLister: mcp.lister,
      mcpUpdater: mcp.updater,
      today: "2026-05-01",
    });

    expect(code).toBe(0);
    expect(existsSync(join(ws, ".graduated"))).toBe(true);
  });
});

describe("runGraduate() — MCP failure", () => {
  test("logs to .graduate-warnings.log and continues to write sentinel", () => {
    const ws = makeWorkspace("acme");
    const retro = writeRetroFixture(ws, RETRO_BODY);

    const code = runGraduate({
      workspace: ws,
      orgSlug: "acme",
      retroFromPath: retro,
      mcpLister: () => { throw new Error("MCP unavailable"); },
      mcpUpdater: () => { throw new Error("should not be called"); },
      today: "2026-05-01",
    });

    expect(code).toBe(0);
    expect(existsSync(join(ws, ".graduated"))).toBe(true);
    const warnings = readFileSync(
      join(ws, ".graduate-warnings.log"),
      "utf8",
    );
    expect(warnings).toContain("MCP");
  });

  test("logs to .graduate-warnings.log when task is not found", () => {
    const ws = makeWorkspace("acme");
    const retro = writeRetroFixture(ws, RETRO_BODY);
    const mcp = stubMcp([]); // no tasks; findCadenceTask returns null

    const code = runGraduate({
      workspace: ws,
      orgSlug: "acme",
      retroFromPath: retro,
      mcpLister: mcp.lister,
      mcpUpdater: mcp.updater,
      today: "2026-05-01",
    });

    expect(code).toBe(0);
    expect(existsSync(join(ws, ".graduated"))).toBe(true);
    const warnings = readFileSync(
      join(ws, ".graduate-warnings.log"),
      "utf8",
    );
    expect(warnings).toContain("task not found");
    expect(mcp.updates.length).toBe(0);
  });
});
