# Graduate — Phase 5 reference

`/onboard --graduate <workspace>` closes a 90-day ramp. Authors a retro,
commits + tags it, pauses the cadence-nag scheduled task, and writes a
`.graduated` sentinel that doubles as the cadence-nag autonomous-session
safety net (see [cadence-nags.md](cadence-nags.md) Step 0.5).

## Synopsis

```fish
bun run "$CLAUDE_PROJECT_DIR/bin/onboard-graduate.ts" graduate <workspace> \
  [--force] [--retro-from <path>]
```

(`CLAUDE_PROJECT_DIR` is harness-provided; if unset, walk up from CWD until
a `.git` directory is found.)

`--force` re-runs every step on an already-graduated workspace
(idempotent: tags do not duplicate; sentinel is overwritten with today's
date; MCP `update_scheduled_task(_, enabled:false)` is re-applied).

`--retro-from <path>` reads the retro body from a file instead of stdin.
Used by the integration test fixture; humans use stdin.

## 9-step sequence (idempotent)

Each step checks its own done-state and skips if already complete.
Re-running `--graduate` after partial failure picks up where it left off.

1. **Parse arg, resolve workspace** — derive org slug from
   `basename(workspace)` (stripping the `onboard-` prefix).
2. **Prior-graduation check** — if `<workspace>/.graduated` exists and
   `--force` is absent, print "already graduated" and exit 0.
2a. **Clean-tree check** — if `git status --porcelain` is non-empty
   AFTER filtering the runtime-sentinel allowlist, abort exit 2. The
   allowlist (`RUNTIME_SENTINELS` in `bin/onboard-graduate.ts`) is
   `.graduated`, `.graduate-warnings.log`, `.calendar-last-paste`,
   `.cadence-last-fire`, `.scaffold-warnings.log`, `NAGS.md`,
   `calendar-suggestions.md` — these are runtime sentinels written by
   the /onboard surface itself and are expected to appear untracked in
   a live ramp. Any OTHER untracked or modified file is the user's
   work in progress; abort. Commit or stash, then re-run.
3. **Compose retro** — if `<workspace>/decisions/retro.md` does NOT
   exist, prompt with the 5-question template (see below) to stderr and
   read the user's response from stdin (or `--retro-from`). Write to
   `decisions/retro.md`.
4. **Commit retro** — if `git log --oneline -- decisions/retro.md` is
   empty, run `git add decisions/retro.md && git commit -m "graduate:
   retro for <slug>"`.
5. **Tag** — if `ramp-graduated-<today-ISO>` does not yet exist, run
   `git tag ramp-graduated-<today-ISO>`.
6. **Push tags** — if a remote is configured, run `git push --tags`. On
   push failure, log to `<workspace>/.graduate-warnings.log` and
   continue. If no remote, skip.
7. **Unschedule cron** — list scheduled tasks via
   `mcp__scheduled-tasks__list_scheduled_tasks`, find by name
   `onboard-<slug>-cadence`, call
   `mcp__scheduled-tasks__update_scheduled_task(taskId, enabled:false)`.
   On failure (MCP unavailable, task not found), log to
   `.graduate-warnings.log` and continue. The
   [cadence-nags.md](cadence-nags.md) Step 0.5 guard is the safety net.
8. **Write sentinel** — `<workspace>/.graduated` with today's ISO date.
   This step is intentionally LAST: writing it before earlier steps
   complete would silence cron during a partial graduation.
9. **Print summary** — workspace, retro path, tag, push status, cron
   status, sentinel path.

## Retro prompt template (5 questions)

```
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
```

The 5 questions are the load-bearing 90-day learning artifact. Answer
honestly — the retro is committed to the workspace history.

## Recovery semantics

`--graduate` is fully idempotent. If any step fails (network, MCP, push),
re-run the same command — every step skips its own work if already done:

- `decisions/retro.md` exists → skip retro composition.
- `git log -- decisions/retro.md` non-empty → skip commit.
- `git tag` lists `ramp-graduated-<today>` → skip tag.
- No remote → skip push.
- `.graduated` exists + no `--force` → exit 0 with warning.

`.graduate-warnings.log` accumulates non-fatal warnings (MCP failure, push
failure, task-not-found). Inspect it after a partial run.

## Manual recovery

When the helper itself fails outright, three procedures unblock you:

### A. Ungraduate (re-open a closed ramp)

```fish
rm <workspace>/.graduated
git -C <workspace> tag -d ramp-graduated-<date>
# Re-enable the scheduled task — replace <taskId> with the value
# emitted by the original create call (or look it up via list).
```

```
mcp__scheduled-tasks__list_scheduled_tasks(filter: "onboard-<slug>-cadence")
mcp__scheduled-tasks__update_scheduled_task(<taskId>, enabled: true)
```

Cron resumes on next fire.

### B. Cron-pause failed at graduate time

The on-disk `.graduated` sentinel + `cadence-nags.md` Step 0.5 guard
already silences fires. To also clear the cron entry:

```
mcp__scheduled-tasks__list_scheduled_tasks(filter: "onboard-<slug>-cadence")
mcp__scheduled-tasks__update_scheduled_task(<taskId>, enabled: false)
```

### C. Tag applied locally but push failed

Either re-run `--graduate` (the skip-if-tagged + push-retry pattern
handles it) or push directly:

```fish
git -C <workspace> push --tags
```
