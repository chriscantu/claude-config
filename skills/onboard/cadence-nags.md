# Cadence Nag — Scheduled-Task Description

Phase 2 wires ONE recurring scheduled task per ramp, registered at day-0 scaffold via
`mcp__scheduled-tasks__create_scheduled_task`. The autonomous session fires daily,
reads the workspace `RAMP.md`, and writes nag lines to `<workspace>/NAGS.md` when
checks fail.

## Schema invariants (load-bearing)

The autonomous session below depends on three RAMP.md schema invariants. If
`skills/onboard/ramp-template.md` changes any of them, this file AND the
description body of every live MCP-registered cadence task must be updated:

1. `Started: YYYY-MM-DD` line — single source of truth for elapsed time.
2. `## Cadence Mutes` section header with `^- (milestone|velocity|calendar)$` lines
   (or literal `(none)`).
3. `| W<n> | <milestone text> | [ ] |` (unchecked) / `| W<n> | … | [x] |`
   (checked) — table-row format, double-pipe delimited, with `<n>` the
   integer week index. The table is cadence-dependent; the autonomous
   session derives the candidate week set FROM the table itself rather
   than hardcoding.

## NAGS.md line format (load-bearing for dedupe)

Each appended line has THREE fields separated by **two ASCII spaces**:

    <ISO-date>  <class>  <detail>

Examples:

    2026-04-30  milestone  W2  Stakeholder map >=80%
    2026-04-30  velocity  no interviews/raw/ activity in 7+ days

Two spaces (not one) is the field delimiter — milestone text contains single
spaces. A future maintainer collapsing to single space will silently break
dedupe. Do not change.

## Registration parameters

| Field | Value |
|---|---|
| `taskName` | `onboard-<org-slug>-cadence` |
| `cronExpression` | `0 9 * * *` (09:00 daily, local TZ) |
| `description` | The body below, with `{{WORKSPACE_ABS_PATH}}` and `{{ORG_SLUG}}` substituted by SKILL.md before the MCP call |

Scaffold-time placeholders use `{{NAME}}` form so they do not collide with
runtime-side angle-bracket markers (`<ISO date>`, `<n>`, etc.) used by the
autonomous session itself. The substitution-completeness scan below
greps for the literal `{{` token; angle brackets are NOT scanned.

## Scaffold-time registration protocol

SKILL.md Procedure step 8 dispatches here. Run these steps verbatim.

### Step A — Substitute placeholders

Copy the literal text inside the "Description body" code fence below into a
working buffer. Perform exactly two literal find/replace pairs (string
replace, NOT regex — placeholders appear verbatim):

| Find | Replace with |
|---|---|
| `{{WORKSPACE_ABS_PATH}}` | absolute path of the scaffolded workspace (e.g., `/Users/<user>/repos/onboard-acme`) |
| `{{ORG_SLUG}}` | kebab-case org slug (basename of the workspace minus the `onboard-` prefix) |

After substitution, scan the buffer for any remaining `{{` token. If any
exist, ABORT and surface the missed placeholder. Do not pass an
under-substituted body to the MCP. Note: angle-bracket markers like
`<ISO date>` are RUNTIME-side placeholders for the autonomous session
itself — do NOT scan for `<...>` pairs (would false-positive on every
scaffold). Only `{{NAME}}` is a scaffold-time placeholder.

### Step B — Call the MCP

```
mcp__scheduled-tasks__create_scheduled_task(
  taskName       = "onboard-{{ORG_SLUG}}-cadence",
  cronExpression = "0 9 * * *",
  description    = <substituted buffer from Step A>,
)
```

The `taskName` argument also takes a literal `{{ORG_SLUG}}` substitution.

### Step C — Failure fallback (MCP unavailable or call fails)

If the MCP tool is unavailable OR the call fails, you MUST:

1. Append a one-line warning to `<workspace>/.scaffold-warnings.log`:

       <ISO date>  cadence-nag-not-registered  <reason: tool unavailable | call failed: <err>>

2. Replace the user-facing "Workspace ready" success message with:

   > Workspace partially ready — cadence-nag scheduler NOT registered. See
   > `<workspace>/.scaffold-warnings.log`. Re-run `/onboard --register-nags
   > <org>` once the scheduled-tasks MCP is available.

   (The `--register-nags` flag is Phase 5; until then, the warning persists
   on disk so a human can re-scaffold or manually invoke the MCP.)

3. Do NOT silently continue. The persistent on-disk warning is the
   contract — a transient terminal echo is insufficient (scrolls off,
   never recoverable).

## Description body (substitute placeholders before passing to MCP)

```
You are firing the daily cadence-nag check for the {{ORG_SLUG}} onboarding ramp.

Workspace: {{WORKSPACE_ABS_PATH}}
RAMP file: {{WORKSPACE_ABS_PATH}}/RAMP.md
Nags file: {{WORKSPACE_ABS_PATH}}/NAGS.md

Steps:

0.5. **Graduated-workspace guard** — defense-in-depth safety net.

   Before any other check, stat {{WORKSPACE_ABS_PATH}}/.graduated. If the
   file exists, the ramp has been graduated; the cron MUST NOT proceed.

   Read the file's first line as `<grad-date>` (ISO YYYY-MM-DD). Then,
   subject to the existing two-space-delimited NAGS.md dedupe contract,
   append exactly one line to {{WORKSPACE_ABS_PATH}}/NAGS.md:

       <ISO date>  graduated  no-op (graduated <grad-date>)

   Dedupe key: `<ISO date>  graduated` prefix. If a line with that prefix
   already exists for today, skip the append. Then exit the autonomous
   session cleanly. Do NOT read RAMP.md, do NOT run the milestone /
   velocity / calendar checks, do NOT update the liveness stamp.

   Rationale: the primary stop mechanism is
   `mcp__scheduled-tasks__update_scheduled_task` with `enabled: false`
   (called from `bin/onboard-graduate.ts` Step 8). If that MCP call
   failed at graduate time, was reverted, or the cron entry was
   re-enabled by hand, the on-disk sentinel still silences fires.
   Stat-only — does NOT widen the autonomous worker's tool surface.

1. Read {{WORKSPACE_ABS_PATH}}/RAMP.md.
   - If the file is missing, append one line to {{WORKSPACE_ABS_PATH}}/../onboard-orphaned-tasks.log:
       <ISO date>  orphan  {{ORG_SLUG}}  RAMP.md missing — consider deleting this scheduled task.
     Then exit. Do not proceed.
   - Parse `Started:` (YYYY-MM-DD). If missing or unparseable, abort
     after logging the same orphaned-tasks line above (class `corrupt`).
   - Parse `## Cadence Mutes`. Build a set of muted categories from
     lines matching `^- (milestone|velocity|calendar)$`.

2. Compute elapsed_days = today - Started. elapsed_weeks = floor(elapsed_days / 7).
   If elapsed_days < 0, abort (RAMP.md Started: is in the future — log to
   orphaned-tasks.log as `corrupt`).

3. **Milestone-miss check** (skip if `milestone` is muted):
   Parse every `| W<n> | <text> | [ ] |` UNCHECKED row from RAMP.md. The
   week set is whatever the cadence's RAMP.md table contains — do NOT
   assume {2,4,6,8,10}; aggressive uses {1,3,4,6,7,9}, relaxed uses
   {3,5,8,10,13,17}, etc.

   For each unchecked row whose week index `n` satisfies n ≤ elapsed_weeks:
   build the candidate line:

       <ISO date>  milestone  W<n>  <text trimmed>

   Before appending, ensure NAGS.md exists (create empty if missing —
   first-fire dedupe contract: a non-existent file counts as no match).
   Then grep NAGS.md for the exact prefix:

       <ISO date>  milestone  W<n>

   (literal two-space delimiter, NOT a regex). If a line with that
   prefix already exists for today, SKIP that row's append. Otherwise
   append.

4. **Velocity check** (skip if `velocity` is muted):
   The window opens after the FIRST unchecked W<n> with n >= 2 in
   the RAMP.md table and stays open until elapsed_weeks exceeds the
   LAST W<n> from the table. (For standard cadence this is roughly
   W2–W13; for aggressive ~W1–W9; for relaxed ~W3–W17.) Outside the
   window, skip the velocity check.

   Inside the window, check filesystem mtime of {{WORKSPACE_ABS_PATH}}/interviews/raw/:

       find {{WORKSPACE_ABS_PATH}}/interviews/raw -type f -mtime -7

   If the find command fails (directory missing, not a directory),
   log to orphaned-tasks.log as `corrupt` and skip.

   Use filesystem mtime, NOT git log — `interviews/raw/` is in
   .gitignore (Phase 1 confidentiality boundary), so `git log` returns
   empty for legitimate captures and would cause daily false-positive
   nags. Filesystem mtime is the correct staleness signal.

   If the find returns ANY file (recent activity), do not nag.
   If the find returns nothing AND the directory has at least one
   pre-existing file (i.e., user has captured before but not in the
   last 7 days), build:

       <ISO date>  velocity  no interviews/raw/ activity in 7+ days

   If the directory is empty and elapsed_days < 14, do not nag (grace
   window for first capture). If elapsed_days >= 14 and the directory
   is still empty, nag with `velocity  no captures yet (workspace 14+ days old)`.

   Dedupe by grepping NAGS.md for the exact prefix `<ISO date>  velocity`
   (two-space delimiter, literal). If any match for today, skip.

5. **Calendar-stale check** (skip if `calendar` is muted):

   Mondays only — if `today.getDay() !== 1` (where 0=Sun, 1=Mon), skip
   this step entirely. The check is a weekly nudge, not daily, to avoid
   burying NAGS.md.

   Read `<workspace>/.calendar-last-paste`:
   - If missing → build the candidate line:

         <ISO date>  calendar  paste new invitee summary (no paste yet)

   - If present, parse the single ISO date line. If `today - paste_date >= 7d`,
     build:

         <ISO date>  calendar  paste new invitee summary (last paste N+ days ago)

     where N is the integer day count.

   - If present and < 7 days stale, do not nag.

   Dedupe by grepping NAGS.md for the exact prefix `<ISO date>  calendar`
   (two-space delimiter, literal). If any match for today, skip.

   The autonomous worker MUST NOT invoke `/onboard --calendar-paste`,
   `mcp__5726bf10-7325-408d-9c0c-e32eaf106ac5__list_events` (or any other
   `mcp__*__list_events` / `mcp__*__get_event` Calendar surface), `fetch(...)`,
   or any other HTTP / network / MCP call. Calendar paste is foreground
   user-initiated only. The cron's job is to remind, not to scan.

6. After the checks (whether or not anything was appended), update a
   liveness stamp at {{WORKSPACE_ABS_PATH}}/.cadence-last-fire with
   the ISO date. This single-line file lets `/onboard --status` confirm
   the cron is alive even on no-op fires.

7. Constraints:
   - Workspace path is absolute. Treat any relative path as a bug; abort.
   - Do NOT modify RAMP.md.
   - Do NOT push to remote.
   - Do NOT invoke other skills.
   - Do NOT read any file under interviews/raw/ — only filesystem
     metadata (mtime via `find`). The Phase 3 confidentiality boundary
     forbids content reads even by autonomous workers.
   - Output is fire-and-forget. The user reads NAGS.md via /onboard --status.
```

## Why one task instead of five (per-milestone) one-shots

- Single MCP call at scaffold; single cleanup at `--graduate` (Phase 5).
- Mute toggles take effect on next fire — no per-milestone task to re-issue.
- Cron-fired session self-gates on elapsed weeks; cost of a no-op fire is
  one RAMP.md read plus one filesystem stat.

## What this doc deliberately does NOT cover

- Calendar live MCP scan — deferred (Phase 4 ships paste-only; live scan in a later phase).
- Surfacing orphan/corrupt warnings to a foreground user — Phase 3 will
  add a `--status` check that reads `<parent>/onboard-orphaned-tasks.log`
  and surfaces unresolved orphans.

The autonomous session now handles graduated workspaces directly via the
Step 0.5 guard above. The primary cron-stop is
`mcp__scheduled-tasks__update_scheduled_task(taskId, enabled: false)`
called from `bin/onboard-graduate.ts`; the Step 0.5 guard is the
defense-in-depth backstop.
