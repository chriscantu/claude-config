#!/usr/bin/env bun
// onboard-graduate — Phase 5 graduation flow.
//
// Subcommand:
//   graduate <workspace> [--force] [--retro-from <path>]
//
// Flow (idempotent; each step skips if its done-state already holds):
//   1. parse arg, resolve workspace + org slug
//   2. hasGraduated → if true and no --force, warn + exit 0
//   2a. isCleanTree → if false, abort exit 2
//   3. compose retro to decisions/retro.md (skip if exists)
//   4. commit retro (skip if HEAD already contains it)
//   5. tag ramp-graduated-<ISO> (skip if tag exists)
//   6. push --tags (skip with warning if no remote)
//   7. unschedule cron via MCP (log+continue on failure)
//   8. write .graduated sentinel (FINAL — visible done signal)
//   9. print summary

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { basename, join } from "node:path";

export type ScheduledTaskInfo = { taskId: string; taskName: string };
export type McpLister = () => ScheduledTaskInfo[];
export type McpUpdater = (taskId: string, enabled: boolean) => void;

// ---------- Pure helpers (exported for unit test) ----------

export const hasGraduated = (workspace: string): boolean =>
  existsSync(join(workspace, ".graduated"));

// Runtime sentinel files written by the /onboard surface itself. These
// are intentionally NOT in the scaffold-time .gitignore (Phase 1 source
// is frozen for Phase 5) but are expected to appear as untracked files
// after Phase 2/4/5 commands run. The clean-tree gate ignores them so
// that re-running --graduate --force on a workspace that already has
// `.graduated` or `.graduate-warnings.log` does not trip.
const RUNTIME_SENTINELS: ReadonlySet<string> = new Set([
  ".graduated",
  ".graduate-warnings.log",
  ".calendar-last-paste",
  ".cadence-last-fire",
  ".scaffold-warnings.log",
  "NAGS.md",
  "calendar-suggestions.md",
]);

export const isCleanTree = (workspace: string): boolean => {
  const r = spawnSync("git", ["status", "--porcelain"], {
    cwd: workspace,
    encoding: "utf8",
  });
  if (r.status !== 0) return false;
  const lines = r.stdout.split("\n").filter((l) => l.length > 0);
  for (const line of lines) {
    // Porcelain v1 format: `XY <path>` (two-char status + space + path).
    // Untracked rename forms (`?? old -> new`) do not occur for these
    // sentinels — they are top-level paths written in place.
    const path = line.slice(3);
    if (!RUNTIME_SENTINELS.has(path)) return false;
  }
  return true;
};

export const findCadenceTask = (
  orgSlug: string,
  listFn: McpLister,
): string | null => {
  const target = `onboard-${orgSlug}-cadence`;
  for (const t of listFn()) {
    if (t.taskName === target) return t.taskId;
  }
  return null;
};

export const composeRetroPrompt = (): string =>
  `# 90-Day Ramp Retro

Answer the following five questions. Each section is a level-2 heading.

## What worked

(What habits, decisions, or rituals paid off in the first 90 days?)

## What didn't work

(What did you try that turned out to be a wrong bet — process, tool, framing?)

## Key relationships

(Which 3–5 people most shaped your ramp, and how did that relationship form?)

## Top decisions

(What were the load-bearing decisions you made? Why each one?)

## What I would do differently

(If you started over Monday, what would you change about the first 90 days?)
`;

export const writeSentinel = (workspace: string, isoDate: string): string => {
  const path = join(workspace, ".graduated");
  writeFileSync(path, `${isoDate}\n`);
  return path;
};

// ---------- Orchestrator ----------

export type GraduateOpts = {
  workspace: string;
  orgSlug?: string;
  force?: boolean;
  retroFromPath?: string;
  mcpLister?: McpLister;
  mcpUpdater?: McpUpdater;
  today?: string;
};

const todayIso = (): string => new Date().toISOString().slice(0, 10);

const deriveOrgSlug = (workspace: string): string => {
  const b = basename(workspace);
  return b.startsWith("onboard-") ? b.slice("onboard-".length) : b;
};

const appendWarning = (workspace: string, line: string): void => {
  appendFileSync(
    join(workspace, ".graduate-warnings.log"),
    `${todayIso()}  ${line}\n`,
  );
};

const gitOut = (cwd: string, args: string[]):
  { code: number; stdout: string; stderr: string } => {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  return {
    code: r.status ?? -1,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
  };
};

const tagExists = (workspace: string, tag: string): boolean => {
  const r = gitOut(workspace, ["tag", "--list", tag]);
  return r.code === 0 && r.stdout.trim() === tag;
};

const hasRemote = (workspace: string): boolean => {
  const r = gitOut(workspace, ["remote"]);
  return r.code === 0 && r.stdout.trim().length > 0;
};

const headHasRetro = (workspace: string): boolean => {
  const r = gitOut(workspace, [
    "log",
    "--oneline",
    "-1",
    "--",
    "decisions/retro.md",
  ]);
  return r.code === 0 && r.stdout.trim().length > 0;
};

export const runGraduate = (opts: GraduateOpts): number => {
  const { workspace, force = false, retroFromPath } = opts;
  const orgSlug = opts.orgSlug ?? deriveOrgSlug(workspace);
  const today = opts.today ?? todayIso();

  if (!existsSync(workspace)) {
    process.stderr.write(`workspace not found: ${workspace}\n`);
    return 1;
  }

  // Step 2: prior-graduation check.
  if (hasGraduated(workspace) && !force) {
    process.stdout.write(
      `already graduated: ${join(workspace, ".graduated")}\n` +
      `Re-run with --force to re-apply graduation steps idempotently.\n`,
    );
    return 0;
  }

  // Step 2a: clean tree check.
  if (!isCleanTree(workspace)) {
    process.stderr.write(
      `aborting: working tree at ${workspace} has uncommitted changes\n` +
      `Commit or stash, then re-run --graduate.\n`,
    );
    return 2;
  }

  // Step 3: compose retro.
  const retroPath = join(workspace, "decisions", "retro.md");
  if (!existsSync(retroPath)) {
    mkdirSync(join(workspace, "decisions"), { recursive: true });
    let body: string;
    if (retroFromPath) {
      body = readFileSync(retroFromPath, "utf8");
    } else {
      // Interactive prompt: emit template to stderr; read full stdin.
      process.stderr.write(composeRetroPrompt());
      process.stderr.write(
        `\n--- Paste your completed retro and EOF (Ctrl-D) when done ---\n`,
      );
      body = readFileSync(0, "utf8");
    }
    writeFileSync(retroPath, body);
    process.stdout.write(`wrote retro: ${retroPath}\n`);
  }

  // Step 4: commit retro.
  if (!headHasRetro(workspace)) {
    const add = gitOut(workspace, ["add", "decisions/retro.md"]);
    if (add.code !== 0) {
      process.stderr.write(`git add failed: ${add.stderr}\n`);
      return 1;
    }
    const commit = gitOut(workspace, [
      "commit",
      "-q",
      "-m",
      `graduate: retro for ${orgSlug}`,
    ]);
    if (commit.code !== 0) {
      // Empty commit (already committed via prior partial run) is the only
      // expected non-zero here; surface anything else as a hard failure.
      process.stderr.write(`git commit failed: ${commit.stderr}\n`);
      return 1;
    }
    process.stdout.write(`committed retro\n`);
  }

  // Step 5: tag.
  const tag = `ramp-graduated-${today}`;
  if (!tagExists(workspace, tag)) {
    const t = gitOut(workspace, ["tag", tag]);
    if (t.code !== 0) {
      process.stderr.write(`git tag failed: ${t.stderr}\n`);
      return 1;
    }
    process.stdout.write(`applied tag: ${tag}\n`);
  }

  // Step 6: push --tags (skip if no remote; log + continue on failure).
  let pushStatus: "pushed" | "no-remote" | "push-failed" = "no-remote";
  if (hasRemote(workspace)) {
    const p = gitOut(workspace, ["push", "--tags"]);
    if (p.code === 0) {
      pushStatus = "pushed";
    } else {
      pushStatus = "push-failed";
      appendWarning(
        workspace,
        `push-failed  git push --tags exited ${p.code}: ${p.stderr.trim()}`,
      );
    }
  }

  // Step 7: unschedule cron via MCP.
  let cronStatus: "paused" | "task-not-found" | "mcp-failed" = "task-not-found";
  if (opts.mcpLister && opts.mcpUpdater) {
    try {
      const taskId = findCadenceTask(orgSlug, opts.mcpLister);
      if (taskId) {
        try {
          opts.mcpUpdater(taskId, false);
          cronStatus = "paused";
        } catch (e) {
          cronStatus = "mcp-failed";
          appendWarning(
            workspace,
            `mcp-update-failed  taskId=${taskId} err=${(e as Error).message}`,
          );
        }
      } else {
        cronStatus = "task-not-found";
        appendWarning(
          workspace,
          `mcp-task-not-found  task not found for slug=${orgSlug} ` +
          `(may have been deleted or never registered)`,
        );
      }
    } catch (e) {
      cronStatus = "mcp-failed";
      appendWarning(
        workspace,
        `mcp-list-failed  err=${(e as Error).message}`,
      );
    }
  } else {
    appendWarning(
      workspace,
      `mcp-not-configured  no MCP lister/updater injected; ` +
      `manually pause via mcp__scheduled-tasks__update_scheduled_task`,
    );
  }

  // Step 8: write sentinel (FINAL — visible done signal + safety-net input).
  writeSentinel(workspace, today);

  // Step 9: summary.
  process.stdout.write(
    `\nGraduation summary for ${orgSlug}\n` +
    `  workspace:   ${workspace}\n` +
    `  retro:       ${retroPath}\n` +
    `  tag:         ${tag}\n` +
    `  push:        ${pushStatus}\n` +
    `  cron:        ${cronStatus}\n` +
    `  sentinel:    ${join(workspace, ".graduated")}\n`,
  );

  return 0;
};

// ---------- CLI entry ----------

const usage = (): number => {
  process.stderr.write(
    "usage: onboard-graduate graduate <workspace> [--force] [--retro-from <path>]\n",
  );
  return 64;
};

const main = (): number => {
  const argv = process.argv.slice(2);
  const sub = argv[0];
  if (sub !== "graduate") {
    process.stderr.write(`unknown subcommand: ${sub ?? "(none)"}\n`);
    return usage();
  }

  let workspace: string | undefined;
  let force = false;
  let retroFromPath: string | undefined;
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--force") {
      force = true;
    } else if (a === "--retro-from") {
      retroFromPath = argv[++i];
    } else if (!workspace) {
      workspace = a;
    } else {
      process.stderr.write(`unexpected arg: ${a}\n`);
      return usage();
    }
  }
  if (!workspace) return usage();

  // CLI mode runs without injected MCP — flow logs the warning and continues.
  return runGraduate({ workspace, force, retroFromPath });
};

if (import.meta.main) process.exit(main());
