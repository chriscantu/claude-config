# /onboard Recovery Runbook

Tired-you at month 2 of a real ramp. Each scenario ≤3 commands.

## 1. Cron firing on a graduated workspace

1. Verify `<workspace>/.graduated` exists. If yes, the cadence-nags.md
   Step 0.5 guard already silences the cron.
2. `bun run skills/onboard/scripts/onboard-graduate.ts graduate <workspace> --force` —
   re-issues the MCP pause idempotently.
3. Still firing: `mcp__scheduled-tasks__update_scheduled_task(<taskId>,
   enabled: false)`. Look up `<taskId>` via `list_scheduled_tasks`
   filter `onboard-<slug>-cadence`.

## 2. Retro write failed mid-flight

Re-run `bun run skills/onboard/scripts/onboard-graduate.ts graduate <workspace>`. The
skip-if-exists check on `decisions/retro.md` picks up where the prior
run stopped. Edit a partial `retro.md` before re-running.

## 3. Tag applied locally but push failed

`git -C <workspace> push --tags` — direct retry. Or re-run
`--graduate --force` (skip-if-tagged + push retry). Push failures
append to `<workspace>/.graduate-warnings.log`.

## 4. Cadence task ID lost / scaffold partial

`mcp__scheduled-tasks__list_scheduled_tasks(filter:
"onboard-<slug>-cadence")` — if the task exists, capture `taskId` and
call `update_scheduled_task(<taskId>, enabled: false)`. If absent, the
scaffold-time registration never succeeded; `--graduate` logs
`mcp-task-not-found` and proceeds (non-existent task cannot fire).

## 5. Ungraduate (force re-open)

```fish
rm <workspace>/.graduated
git -C <workspace> tag -d ramp-graduated-<date>
```

Then `mcp__scheduled-tasks__update_scheduled_task(<taskId>, enabled: true)`.
Cron resumes on next 09:00 local fire.

## 6. Workspace dirty when graduate runs

`--graduate` exits 2 on uncommitted changes (sentinel allowlist:
`.graduated`, `.graduate-warnings.log`, `.calendar-last-paste`,
`.cadence-last-fire`, `.scaffold-warnings.log`, `NAGS.md`,
`calendar-suggestions.md`). `git -C <workspace> status`; commit or
stash; re-run.

## Known invariant deviations

Audit of `skills/onboard/scripts/onboard-*.ts` (try/catch on every MCP call, stdout+stderr
on every git op, logged path on every file write, validated user input).

- `onboard-status.ts` mute/unmute and `onboard-calendar.ts` paste write
  files without echoing the path on success. Failures throw with
  path-bearing Node errors. Acceptable.
- `onboard-graduate.ts` `writeSentinel` does not log; the orchestrator's
  post-flight summary prints the sentinel path. Invariant satisfied at
  the orchestrator level.
- No silent catches. Every git op captures stdout/stderr. Every MCP
  call wraps in try/catch with `appendWarning` or persistent on-disk
  fallback. Every user-input read validates an allowlist.

## Dogfood findings

End-to-end dogfood ran via `tests/onboard-integration.test.ts` "Phase 5
full-ramp lifecycle" (scaffold → sanitized note → calendar paste →
graduate → status). Findings:

- Runtime sentinel files are not in scaffold-time `.gitignore`. The
  graduate clean-tree gate filters them via `RUNTIME_SENTINELS`.
  Moving them into `.gitignore` is deferred to keep Phase 1 source
  frozen.
- The MCP `create_scheduled_task` call is model-orchestrated from
  SKILL.md, not the fish scaffold. A live ramp must verify by
  inspecting `.scaffold-warnings.log`.
