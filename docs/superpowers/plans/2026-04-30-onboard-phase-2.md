# /onboard Skill — Phase 2 Implementation Plan (Cadence Nags + Status/Mute)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` (single-implementer recommended; see Execution Mode below) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire `schedule` integration so a single per-ramp daily cron task fires milestone-miss checks (W2/W4/W6/W8/W10 boundary days) and activity-velocity checks (daily during W2–W6, default 7-day inactivity threshold). Ship `bin/onboard-status.fish` for `/onboard --status <org>` and `/onboard --mute <category>`. Mute state persists in `RAMP.md` `## Cadence Mutes`.

**Architecture:** Day-0 scaffold (Phase 1 helper) is unchanged. After it returns, `skills/onboard/SKILL.md` instructs Claude to invoke `mcp__scheduled-tasks__create_scheduled_task` once per ramp, registering a daily cron whose self-contained `description` reads the workspace's `RAMP.md`, gates on mute state, and writes nag lines to `<workspace>/NAGS.md`. Status/mute helpers are fish — RAMP.md edits and date math, no logic-heavy parsing (per `memory/onboard_fish_vs_ts_inflection.md`).

**Tech Stack:** fish shell (helpers), TypeScript + `bun:test` (tests), `mcp__scheduled-tasks__create_scheduled_task` (Claude-side, doc-only — not unit-tested).

**Spec:** [docs/superpowers/specs/2026-04-30-onboard-design.md](../specs/2026-04-30-onboard-design.md) (committed `cd5c530`). Phase 2 line: 171.

**Phase 1 reference:** [docs/superpowers/plans/2026-04-30-onboard-phase-1.md](2026-04-30-onboard-phase-1.md) (merged PR [#214](https://github.com/chriscantu/claude-config/pull/214), squash sha `2f36f51`).

**Issue:** [#12](https://github.com/chriscantu/claude-config/issues/12).

---

## Execution Mode

**[Execution mode: single-implementer]** Plan: 7 tasks, ~80 LOC functional change, 2 new source files + 2 modified files (`SKILL.md`, `scaffold.md`). Integration coupling is low — fish helper is standalone, MCP scheduling is doc-only in `SKILL.md`. Per `rules/execution-mode.md`, single-implementer + final review beats per-task subagent dispatch at this size.

---

## Interpretation Anchors (from preamble)

- **Nag delivery (I1):** chose A. Scheduled-task body appends a dated line to `<workspace>/NAGS.md`. `--status` reads `NAGS.md` + `RAMP.md` and prints both. **Dedupe contract:** the cron body MUST grep `NAGS.md` for today's ISO date + nag-class + milestone/category tuple before appending — same nag fires at most once per day per class. Rotation / line-cap is explicitly deferred to Phase 3 (acceptable: 90-day cap × 2 classes = ≤180 lines worst case).
- **Scheduling granularity (I2):** chose C. One daily cron per ramp.
  - **Honest cost:** ~365 fires/ramp; ~300 are no-ops between W6–W13 (milestone classes silent, velocity-class out-of-window). Each no-op fire = one `RAMP.md` read + one `git log` invocation + return. ~1–2s autonomous-session wall time per fire.
  - **Five-fireAt alternative weighed:** 5 milestone one-shots + 1 velocity daily cron during W2–W6 (~30 fires) = ~35 fires total, 10× fewer.
  - **Why C still wins:** (a) graduate cleanup is one MCP delete vs. tracking five `fireAt` IDs across W2/W4/W6/W8/W10 plus a scoped velocity cron; (b) mute-toggle re-evaluates next fire automatically — five-shot design needs per-shot mute injection at registration time, which means `--mute` after scaffold can't retroactively gate already-scheduled fires; (c) cron body is a single self-contained prompt — five-shot design needs five near-identical prompts, fragility multiplier on edits. The 60× fire-cost asymmetry is real but each fire is cheap (no LLM call beyond the cron-body session itself, which is already budgeted by the user when they registered the schedule).
  - **Flip to five-shot if:** post-Phase-2 telemetry shows the daily session is non-trivial cost OR users complain about cron-list noise.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `bin/onboard-status.fish` | new | Dispatch `--status <path>`, `--mute <cat> <path>`, `--unmute <cat> <path>`. Reads `RAMP.md`, edits `## Cadence Mutes`, prints elapsed/next-milestone summary. |
| `tests/onboard-status.test.ts` | new | `bun:test` suite using `mkdtempSync` fixtures with a hand-rolled `RAMP.md`. Covers status output, mute add/remove, unknown-category rejection, idempotent mute. |
| `skills/onboard/cadence-nags.md` | new | Reference doc — the canonical scheduled-task `description` template Claude passes to `mcp__scheduled-tasks__create_scheduled_task` at scaffold time. |
| `skills/onboard/SKILL.md` | modify | Add post-scaffold step: invoke `mcp__scheduled-tasks__create_scheduled_task` with the description from `cadence-nags.md`. Add `--status` / `--mute` / `--unmute` dispatch to fish helper. Update "What Phase 1 deliberately does NOT do" → "What Phase 2 deliberately does NOT do" (Calendar, confidentiality, graduate). |
| `skills/onboard/scaffold.md` | modify | Add one-line cross-link to `cadence-nags.md`. No restated content. |

Phase 2 introduces zero modifications to Phase 1 fish source (`bin/onboard-scaffold.fish`) and zero modifications to existing tests.

---

## Task 1 — Failing test: `--status` prints elapsed weeks + next milestone

**Files:**
- Create: `tests/onboard-status.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
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
```

- [ ] **Step 2: Run test, confirm it fails**

```fish
bun test tests/onboard-status.test.ts
```

Expected: FAIL — script does not exist.

- [ ] **Step 3: Commit failing test**

```fish
git add tests/onboard-status.test.ts
git commit -m "Add failing test for onboard-status --status (#12)"
```

---

## Task 2 — Minimal `bin/onboard-status.fish` skeleton + `--status`

**Files:**
- Create: `bin/onboard-status.fish`

- [ ] **Step 1: Write the script**

```fish
#!/usr/bin/env fish
# Inspect or mute cadence nags for an /onboard workspace.
#
# Usage:
#   bin/onboard-status.fish --status   <workspace-path>
#   bin/onboard-status.fish --mute     <category> <workspace-path>
#   bin/onboard-status.fish --unmute   <category> <workspace-path>
#
# Categories: milestone | velocity   (calendar is Phase 4)

set -l mode ""
set -l category ""
set -l ws ""

set -l i 1
while test $i -le (count $argv)
    set -l arg $argv[$i]
    switch $arg
        case --status
            set mode status
            set i (math $i + 1)
            set ws $argv[$i]
        case --mute --unmute
            set mode (string sub -s 3 $arg)
            set i (math $i + 1)
            set category $argv[$i]
            set i (math $i + 1)
            set ws $argv[$i]
        case '*'
            echo "unknown arg: $arg" >&2
            exit 2
    end
    set i (math $i + 1)
end

if test -z "$ws"
    echo "missing workspace path" >&2
    exit 2
end
if not test -f $ws/RAMP.md
    echo "no RAMP.md at $ws" >&2
    exit 1
end

switch $mode
    case status
        set -l started (string match -r 'Started:\s*([0-9-]+)' < $ws/RAMP.md)[2]
        set -l started_epoch (date -j -f "%Y-%m-%d" $started "+%s" 2>/dev/null; or date -d $started "+%s")
        set -l now_epoch (date "+%s")
        set -l elapsed (math "($now_epoch - $started_epoch) / 86400")
        echo "Workspace: $ws"
        echo "Elapsed:   $elapsed days"
        set -l next (string match -r '\| (W[0-9]+) \| ([^|]+)\| \[ \]' < $ws/RAMP.md | head -3)
        if test -n "$next[1]"
            echo "Next milestone: $next[2] ($next[3])"
        else
            echo "Next milestone: (all checked)"
        end
        echo ""
        echo "Mutes:"
        sed -n '/## Cadence Mutes/,/##/p' $ws/RAMP.md | grep -E '^- ' ; or echo "  (none)"
end
```

- [ ] **Step 2: Make executable**

```fish
chmod +x bin/onboard-status.fish
```

- [ ] **Step 3: Run test, confirm it passes**

```fish
bun test tests/onboard-status.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```fish
git add bin/onboard-status.fish
git commit -m "onboard-status: --status reads RAMP.md, prints elapsed + next milestone (#12)"
```

---

## Task 3 — Failing test: `--mute milestone` appends to `## Cadence Mutes`

**Files:**
- Modify: `tests/onboard-status.test.ts`

- [ ] **Step 1: Add the failing tests**

Append to `tests/onboard-status.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run, confirm fails**

```fish
bun test tests/onboard-status.test.ts
```

Expected: FAIL on all three (mute mode is a no-op in the skeleton).

- [ ] **Step 3: Commit failing tests**

```fish
git add tests/onboard-status.test.ts
git commit -m "Add failing tests for onboard-status --mute (#12)"
```

---

## Task 4 — Implement `--mute` and `--unmute`

**Files:**
- Modify: `bin/onboard-status.fish`

- [ ] **Step 1: Add category validation + mute/unmute branches**

Insert after the arg-parse block, before the `switch $mode`:

```fish
if test "$mode" = mute -o "$mode" = unmute
    if not contains $category milestone velocity
        echo "unknown category: $category (allowed: milestone | velocity)" >&2
        exit 2
    end
end
```

**Critical fish-semantics note.** `(cat file)` in fish splits on newlines and produces a LIST. `string replace -r` then iterates per-element, so any pattern containing literal `\n` will never match. Force single-string semantics via `| string collect` before passing to `string replace`. Both `mute` and `unmute` branches rely on this.

Extend the trailing `switch $mode`:

```fish
    case mute
        # Force single-string semantics — without `string collect`, multi-line
        # regex patterns silently no-op (see plan Task 4 note).
        set -l ramp (cat $ws/RAMP.md | string collect)
        # Drop "(none)" placeholder if present.
        set ramp (string replace -r '(## Cadence Mutes\n\n)\(none\)\n' '$1' -- $ramp | string collect)
        # Append category if not already listed.
        if not string match -rq "(?m)^- $category\$" -- $ramp
            set ramp (string replace -r '(## Cadence Mutes\n\n(?:- [a-z]+\n)*)' "\$1- $category\n" -- $ramp | string collect)
        end
        printf '%s' $ramp > $ws/RAMP.md
    case unmute
        set -l ramp (cat $ws/RAMP.md | string collect)
        set ramp (string replace -r "(?m)^- $category\n" '' -- $ramp | string collect)
        # Re-insert (none) marker if Cadence Mutes is now empty.
        if not string match -rq '(?m)## Cadence Mutes\n\n- ' -- $ramp
            set ramp (string replace -r '(## Cadence Mutes\n\n)(?!\(none\))' '$1(none)\n' -- $ramp | string collect)
        end
        printf '%s' $ramp > $ws/RAMP.md
end
```

**If the regex chain fails the failing tests from Task 3 / Task 5 after this fix:** fall back to a `sed -i` block that operates on the file directly (no fish-list intermediary). The implementation MUST satisfy the existing tests; do not adjust the tests to match a weaker impl.

- [ ] **Step 2: Run test, confirm it passes**

```fish
bun test tests/onboard-status.test.ts
```

Expected: PASS — all status + mute tests green.

- [ ] **Step 3: Commit**

```fish
git add bin/onboard-status.fish
git commit -m "onboard-status: implement --mute and --unmute with idempotent edits (#12)"
```

---

## Task 5 — Failing test: `--unmute` round-trip + status reflects mute state

**Files:**
- Modify: `tests/onboard-status.test.ts`

- [ ] **Step 1: Add tests**

```typescript
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
```

- [ ] **Step 2: Run, confirm pass**

```fish
bun test tests/onboard-status.test.ts
```

Expected: PASS — Task 4's impl is intended to cover both round-trip and status-mute-display, but this is conditional on the fish regex chain working correctly under `string collect` semantics. If FAIL, fix in `bin/onboard-status.fish` (likely a regex tweak or fall back to `sed`) and re-run before committing. Do NOT relax the tests.

- [ ] **Step 3: Commit**

```fish
git add tests/onboard-status.test.ts
git commit -m "onboard-status: cover unmute round-trip + status mute display (#12)"
```

---

## Task 6 — Write `skills/onboard/cadence-nags.md` (reference doc)

**Files:**
- Create: `skills/onboard/cadence-nags.md`

This file is the canonical `description` body Claude passes to `mcp__scheduled-tasks__create_scheduled_task` at scaffold time. It is doc-only — no fish, no tests. The autonomous session that fires the cron reads this prompt cold.

- [ ] **Step 1: Write the reference doc**

```markdown
# Cadence Nag — Scheduled-Task Description

Phase 2 wires ONE recurring scheduled task per ramp, registered at day-0 scaffold via
`mcp__scheduled-tasks__create_scheduled_task`. The autonomous session fires daily,
reads the workspace `RAMP.md`, and writes nag lines to `<workspace>/NAGS.md` when
checks fail.

## Registration parameters

| Field | Value |
|---|---|
| `taskName` | `onboard-<org-slug>-cadence` |
| `cronExpression` | `0 9 * * *` (09:00 daily, local TZ) |
| `description` | The body below, with `<WORKSPACE_ABS_PATH>` and `<ORG_SLUG>` substituted by SKILL.md before the MCP call |

## Description body (substitute placeholders before passing to MCP)

```
You are firing the daily cadence-nag check for the <ORG_SLUG> onboarding ramp.

Workspace: <WORKSPACE_ABS_PATH>
RAMP file: <WORKSPACE_ABS_PATH>/RAMP.md
Nags file: <WORKSPACE_ABS_PATH>/NAGS.md

Steps:

1. Read <WORKSPACE_ABS_PATH>/RAMP.md. Parse `Started:` (YYYY-MM-DD) and the
   `## Cadence Mutes` section. Build a set of muted categories from lines
   matching `^- (milestone|velocity)$`.

2. Compute elapsed_days = today - Started. elapsed_weeks = floor(elapsed_days / 7).

3. **Milestone-miss check** (skip if `milestone` is muted):
   On elapsed_weeks ∈ {2, 4, 6, 8, 10}, find the matching `| W<n> | ... | [ ] |`
   row. If unchecked, build the candidate line:

       <ISO date>  milestone  W<n>  <milestone text>

   Before appending, grep <WORKSPACE_ABS_PATH>/NAGS.md for the exact prefix
   `<ISO date>  milestone  W<n>` — if a line with that prefix already exists
   for today, SKIP the append (dedupe contract: at most one milestone-class
   line per W<n> per day).

4. **Velocity check** (skip if `velocity` is muted, skip outside W2–W6):
   When 14 ≤ elapsed_days ≤ 42, run `git -C <WORKSPACE_ABS_PATH> log -1
   --format=%ct -- interviews/raw/`. If empty OR (today_epoch - last_commit_epoch)
   > 7 * 86400, build the candidate line:

       <ISO date>  velocity  no 1on1-prep capture in 7+ days

   Before appending, grep <WORKSPACE_ABS_PATH>/NAGS.md for the exact prefix
   `<ISO date>  velocity` — if any line with that prefix already exists for
   today, SKIP the append (dedupe contract: at most one velocity-class line
   per day).

5. If neither check fires (or both dedupe-skip), do nothing. No NAGS.md
   write, no other side effects.

6. Do NOT modify RAMP.md. Do NOT push to remote. Do NOT invoke other skills.

Constraints:
- Workspace path is absolute. Treat any relative path as a bug; abort.
- If RAMP.md is missing, abort with stdout "RAMP.md missing — ramp may have
  graduated; consider deleting this scheduled task."
- Output is fire-and-forget. The user reads NAGS.md via /onboard --status.
```

## Why one task instead of five (per-milestone) one-shots

- Single MCP call at scaffold; single cleanup at `--graduate` (Phase 5).
- Mute toggles take effect on next fire — no per-milestone task to re-issue.
- Cron-fired session self-gates on elapsed weeks; cost of a no-op fire is one
  RAMP.md read.

## What this doc deliberately does NOT cover

- Calendar-watch nag class — Phase 4.
- Removal at `--graduate` — Phase 5 (will call `mcp__scheduled-tasks__update_scheduled_task`
  or the deletion equivalent).
- Confidentiality refusal in the autonomous session — Phase 3 (the session reads
  `RAMP.md` only, never `interviews/raw/` content; only the git mtime).
```

- [ ] **Step 2: Validate**

```fish
fish validate.fish
```

Expected: PASS — reference doc is structural markdown, no canonical-string drift triggers.

- [ ] **Step 3: Commit**

```fish
git add skills/onboard/cadence-nags.md
git commit -m "onboard: add cadence-nags reference doc for Phase 2 schedule wiring (#12)"
```

---

## Task 7 — Wire `SKILL.md` Phase 2 dispatch + post-scaffold MCP call

**Files:**
- Modify: `skills/onboard/SKILL.md`
- Modify: `skills/onboard/scaffold.md`

- [ ] **Step 1: Update `skills/onboard/SKILL.md`**

Append a new section after step 7 ("Print next-step guidance"):

```markdown
8. **Register the cadence-nag scheduled task** (Phase 2).

   a. Read [cadence-nags.md](cadence-nags.md) and copy the literal text inside
      the "Description body" code fence into a working buffer.

   b. Perform exactly two literal find/replace pairs on the buffer (string
      replace, NOT regex — placeholders appear verbatim):

      | Find | Replace with |
      |---|---|
      | `<WORKSPACE_ABS_PATH>` | absolute path of the scaffolded workspace (e.g., `/Users/<user>/repos/onboard-acme`) |
      | `<ORG_SLUG>` | kebab-case org slug (the basename of the workspace minus the `onboard-` prefix) |

      After substitution, scan the buffer for any remaining `<` `>` pairs —
      if any exist, ABORT and surface the missed placeholder. Do not pass an
      under-substituted body to the MCP.

   c. Call:

      ```
      mcp__scheduled-tasks__create_scheduled_task(
        taskName       = "onboard-<ORG_SLUG>-cadence",
        cronExpression = "0 9 * * *",
        description    = <substituted buffer from step b>,
      )
      ```

      The `taskName` argument also takes a literal `<ORG_SLUG>` substitution.

   d. If the MCP tool is unavailable, surface the failure to the user and
      continue — the workspace is usable without nags; the user can re-run
      `/onboard --status <org>` on demand. Do NOT silently skip; the user
      needs to know nags are not registered.
```

Add a new section "## Status, mute, and unmute" before "## What Phase 1 deliberately does NOT do":

```markdown
## Status, mute, and unmute

`/onboard --status <org>` → run `bin/onboard-status.fish --status <workspace-path>`.
Prints elapsed days, next unchecked milestone, and current mutes.

`/onboard --mute <category>` → run `bin/onboard-status.fish --mute <category> <workspace-path>`.
Categories: `milestone` | `velocity`. (`calendar` is Phase 4.) Mute state persists in
`RAMP.md` `## Cadence Mutes`.

`/onboard --unmute <category>` → run `bin/onboard-status.fish --unmute <category> <workspace-path>`.
```

Rename existing section "## What Phase 1 deliberately does NOT do" → "## What this skill deliberately does NOT do (yet)" and trim to the still-deferred items:

```markdown
## What this skill deliberately does NOT do (yet)

- Enforce the raw → sanitized confidentiality boundary at downstream-skill read time
  (Phase 3 — directory layout and .gitignore are in place; refusal logic in /swot
  and /present wires up later)
- Calendar API integration (Phase 4)
- `--graduate` retro + archive, including unscheduling the cadence task (Phase 5)
```

- [ ] **Step 2: Add cross-link in `skills/onboard/scaffold.md`**

Append one line under "## Flags":

```markdown
For Phase 2 cadence wiring (status / mute / unmute / scheduled-task description), see
[cadence-nags.md](cadence-nags.md).
```

- [ ] **Step 3: Validate skill structure**

```fish
fish validate.fish
```

Expected: PASS.

- [ ] **Step 4: Run full TS test suite + typecheck**

```fish
bun test tests/onboard-status.test.ts
bun test tests/onboard-scaffold.test.ts
bunx tsc --noEmit
```

Expected: all PASS — Phase 1 tests still green, Phase 2 tests green.

- [ ] **Step 5: Smoke test the helpers**

```fish
set -l scratch (mktemp -d)
bin/onboard-scaffold.fish --target $scratch/onboard-smoke --cadence standard --no-gh
bin/onboard-status.fish --status $scratch/onboard-smoke
bin/onboard-status.fish --mute milestone $scratch/onboard-smoke
bin/onboard-status.fish --status $scratch/onboard-smoke
bin/onboard-status.fish --unmute milestone $scratch/onboard-smoke
rm -rf $scratch
```

Expected: status prints elapsed=0 days + W0/W2 next-milestone; mute appears in second status; final RAMP.md `Cadence Mutes` shows `(none)`.

- [ ] **Step 6: Commit**

```fish
git add skills/onboard/SKILL.md skills/onboard/scaffold.md
git commit -m "onboard: wire Phase 2 status/mute dispatch + cadence-nag MCP registration (#12)"
```

- [ ] **Step 7: Open PR (manual — implementation lands separately from THIS plan PR)**

```fish
echo "## Summary
Phase 2 of /onboard: cadence-nag scheduling via mcp__scheduled-tasks +
bin/onboard-status.fish for --status / --mute / --unmute. Mute state in RAMP.md.

## Test plan
- [ ] bun test tests/onboard-status.test.ts passes
- [ ] bun test tests/onboard-scaffold.test.ts still passes (Phase 1 untouched)
- [ ] bunx tsc --noEmit clean
- [ ] fish validate.fish passes
- [ ] Smoke: scaffold throwaway workspace, status / mute / unmute round-trip,
      assert RAMP.md \"## Cadence Mutes\" returns to (none) after unmute
- [ ] Manual: mcp__scheduled-tasks__list_scheduled_tasks shows
      onboard-<slug>-cadence with cron 0 9 * * *
- [ ] Manual: spawn one cron-body session against a fixture workspace, assert
      NAGS.md dedupe holds (run twice on same day → file unchanged on 2nd run)

## Out of scope (later phases)
- Phase 3 confidentiality boundary enforcement at downstream-skill layer
- Phase 4 Calendar integration
- Phase 5 --graduate (will unschedule the cadence task)

🤖 Generated with [Claude Code](https://claude.com/claude-code)" > /tmp/onboard-phase2-pr.md

git push -u origin <branch-name>
gh pr create --title "/onboard Phase 2 — cadence nags + status/mute (#12)" --body-file /tmp/onboard-phase2-pr.md
```

---

## Self-Review Checklist (run after writing the code, before opening the implementation PR)

1. **Spec coverage** — every Phase 2 line in spec section "Implementation Phases" is covered:
   - Schedule integration for milestone nags ✅ (Task 6 + 7)
   - Schedule integration for velocity nags ✅ (Task 6 + 7)
   - `--status` ✅ (Tasks 1–2)
   - `--mute <category>` ✅ (Tasks 3–4)
   - Mute persistence in `RAMP.md` ✅ (Task 4 — edits `## Cadence Mutes`)
   - ~80 LOC budget — fish helper ~50 LOC, ref doc ~50 lines (docs not code), SKILL.md ~25 line delta
2. **Placeholder scan** — no `TBD` / `TODO` in code or plan.
3. **Type consistency** — flag/category names match across:
   - `bin/onboard-status.fish` (`--status` `--mute` `--unmute`; `milestone` `velocity`)
   - `tests/onboard-status.test.ts` (same set)
   - `skills/onboard/SKILL.md` ("Status, mute, and unmute" section)
   - `skills/onboard/cadence-nags.md` (description body — `milestone`, `velocity`, no `calendar`)
4. **Phase boundary respected** — no Calendar code, no confidentiality refusal logic, no `--graduate`. Interview-raw access in cadence-nags.md is git-mtime only, never file content.
5. **No Phase 1 regression** — `tests/onboard-scaffold.test.ts` runs unchanged. `bin/onboard-scaffold.fish` not modified.
6. **Memory hooks honored**:
   - `onboard_fish_vs_ts_inflection.md` — status helper is shell-tool sequencing → fish ✅
   - `onboarding_toolkit_manual_first.md` — Calendar deferred ✅; nag delivery is local file write, no SaaS coupling ✅
7. **MCP call locality** — `mcp__scheduled-tasks__create_scheduled_task` is invoked from `SKILL.md` (Claude-side), not from fish. Fish never calls MCP. ✅
8. **Substitution sanity** — after Task 7 Step 1.b runs, the buffer contains zero `<...>` placeholder pairs before MCP call. Abort path verified.
9. **Dedupe contract honored** — cadence-nags.md description body greps NAGS.md for today's date+class+W<n> tuple before append. Manual smoke (running cron body twice in same day) confirms zero duplicate lines.
10. **Fish single-string semantics** — every `string replace -r` in `bin/onboard-status.fish` operates on a buffer produced by `| string collect`. No bare `(cat file)` feeding multi-line regex.

---

## What Phase 3 Picks Up

- Tag UX in `/1on1-prep` (modify-existing vs. wrap) — open question Q1 in spec.
- Refusal logic in `/swot` and `/present`: skill checks path, aborts on
  `interviews/raw/`. Integration tests across skill boundaries.
- Attribution-pattern pre-render check before `/present` — open question Q2 (regex
  grammar, name-detection threshold, override copy).
- The `cadence-nags.md` description body already restricts itself to RAMP.md +
  git-mtime reads — Phase 3 adds an explicit assertion and a refusal-on-raw-path
  test.

Phase 3's plan ships in `docs/superpowers/plans/<date>-onboard-phase-3.md` once
Phase 2 lands.
