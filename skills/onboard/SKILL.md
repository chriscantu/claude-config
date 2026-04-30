---
name: onboard
description: >
  Use when the user says /onboard <org>, "scaffold a new ramp", "set up
  onboarding workspace for <org>", or starts a new senior eng leader role.
  Day-0 scaffolder for a per-org ramp workspace; Phase 1 only — cadence nags,
  confidentiality enforcement, Calendar integration, and graduation ship in
  later phases. Do NOT use for codebase / architecture onboarding (see
  `architecture-overview` skill, issue #44).
status: experimental
version: 0.1.0
---

# /onboard — Senior Eng Leader 90-Day Ramp Orchestrator

Phase 1 (this implementation): scaffolds a per-org git-isolated workspace at
`~/repos/onboard-<org>/` with the canonical directory tree, `.gitignore`,
`RAMP.md` from a chosen cadence preset, stakeholder seed file, and an
optionally created private GitHub remote (user-confirmed at scaffold time).

**Announce at start:** "I'm using the onboard skill to scaffold your <org> ramp workspace."

## When to Use

- `/onboard <org-name>` — day-0 scaffold for a new senior leadership role
- "Set up onboarding workspace for <org>"
- "Scaffold a new ramp"

## When NOT to Use

- Codebase / architecture onboarding (use `architecture-overview`, issue #44)
- Resuming a graduated ramp (Phase 5 territory; not yet implemented)
- Cadence-nag re-arming, mute toggles, calendar integration (Phases 2–4)

## Procedure

1. Confirm the org slug. Default to a kebab-case form of the org name. → verify: user confirms or supplies override
2. Confirm the workspace target path. Default `~/repos/onboard-<slug>/`. → verify: path is absolute, parent exists
3. Ask the cadence preset:

   > Pick cadence: aggressive | **standard** | relaxed

   → verify: user picks one of the three valid values
4. Ask whether to create a private GitHub remote:

   > Create a private GitHub repo for this ramp now? Y/N (default Y)

   → verify: user answers Y or N
5. Run `bin/onboard-scaffold.fish --target <path> --cadence <preset> --gh-create yes|no`. → verify: exit 0; target dir exists with `RAMP.md`, `.gitignore`, `stakeholders/map.md`, a `.git` dir, and the per-org subdirs `stakeholders/`, `interviews/raw/`, `interviews/sanitized/`, `swot/`, `decks/slidev/`, `decisions/`
6. Capture manager-handoff inputs (see [manager-handoff.md](manager-handoff.md))
   directly into `<target>/stakeholders/map.md` via the section prompts there.
   → verify: each of the four section headers has at least the canonical "(none yet)" placeholder OR captured content
7. Print next-step guidance:

   > Workspace ready at <path>. Next: invoke /stakeholder-map to flesh out the seed
   > and /1on1-prep when you book your first interview.

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

## Status, mute, and unmute

`/onboard --status <org>` → run `bin/onboard-status.fish --status <workspace-path>`.
Prints elapsed days, next unchecked milestone, and current mutes.

`/onboard --mute <category>` → run `bin/onboard-status.fish --mute <category> <workspace-path>`.
Categories: `milestone` | `velocity`. (`calendar` is Phase 4.) Mute state persists in
`RAMP.md` `## Cadence Mutes`.

`/onboard --unmute <category>` → run `bin/onboard-status.fish --unmute <category> <workspace-path>`.

## Backtracking

If `bin/onboard-scaffold.fish` exits non-zero, surface the stderr directly to
the user and stop. The most common cause is the target dir already containing
files (clobber-refusal); ask the user whether to choose a different path.

## What this skill deliberately does NOT do (yet)

- Enforce the raw → sanitized confidentiality boundary at downstream-skill read time
  (Phase 3 — directory layout and .gitignore are in place; refusal logic in /swot
  and /present wires up later)
- Calendar API integration (Phase 4)
- `--graduate` retro + archive, including unscheduling the cadence task (Phase 5)

## References

Read on demand, not upfront:

- [scaffold.md](scaffold.md) — dir layout, scaffold flow, helper flag reference
- [ramp-template.md](ramp-template.md) — RAMP.md preset templates
- [manager-handoff.md](manager-handoff.md) — manager-handoff capture prompts
