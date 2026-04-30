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
