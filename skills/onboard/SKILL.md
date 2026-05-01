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

8. **Register the cadence-nag scheduled task** (Phase 2). Run the
   scaffold-time registration protocol in [cadence-nags.md](cadence-nags.md)
   § "Scaffold-time registration protocol" — Step A (substitute
   `{{WORKSPACE_ABS_PATH}}` + `{{ORG_SLUG}}` placeholders, scan for missed
   `{{` tokens), Step B (call `mcp__scheduled-tasks__create_scheduled_task`),
   Step C (on MCP unavailable or call failure, append to
   `<workspace>/.scaffold-warnings.log` and surface the partial-ready
   message). Do NOT silently continue on failure.

## Status, mute, and unmute

`/onboard --status <org>` → run `bun run bin/onboard-status.ts --status <workspace-path>`.
Prints elapsed days, next unchecked milestone, and current mutes.

`/onboard --mute <category>` → run `bun run bin/onboard-status.ts --mute <category> <workspace-path>`.
Categories: `milestone` | `velocity`. (`calendar` is Phase 4.) Mute state persists in
`RAMP.md` `## Cadence Mutes`.

`/onboard --unmute <category>` → run `bun run bin/onboard-status.ts --unmute <category> <workspace-path>`.

## Capture and sanitize (Phase 3)

`/onboard --capture <person>` → wrap `/1on1-prep` to capture verbatim notes
into `<workspace>/interviews/raw/` with per-observation sanitization tags
(`attributable | aggregate-only | redact`). See
[capture-and-sanitize.md](capture-and-sanitize.md) for the full flow.

`/onboard --sanitize <workspace>` → emit themes from tagged raw notes into
`<workspace>/interviews/sanitized/`. See
[capture-and-sanitize.md](capture-and-sanitize.md).

Sanitization is the gateway: `/swot` and `/present` refuse to read
`interviews/raw/` per [refusal-contract.md](refusal-contract.md). All
downstream synthesis consumes `interviews/sanitized/` exclusively.

## Pre-render attribution gate (Phase 3)

Before invoking `/present` for any milestone reflect-back (W4 interim, W8
final), MUST run:

```fish
bun run "$CLAUDE_PROJECT_DIR/bin/onboard-guard.ts" attribution-check \
  <workspace>/decks/slidev/<deck>/slides.md \
  <workspace>/stakeholders/map.md
```

(`CLAUDE_PROJECT_DIR` is harness-provided; if unset, walk up from CWD until a
`.git` directory is found.)

On exit 3, surface the guard's stderr (file:line:phrase report) and require
the literal `override` token before proceeding. Override is enforced HERE in
the SKILL.md body — the helper is pure, no interactive I/O. Per-render, no
persistent state.

See [refusal-contract.md](refusal-contract.md) for the full exit-code table
and override semantics.

## Backtracking

If `bin/onboard-scaffold.fish` exits non-zero, surface the stderr directly to
the user and stop. The most common cause is the target dir already containing
files (clobber-refusal); ask the user whether to choose a different path.

## What this skill deliberately does NOT do (yet)

- Calendar API integration (Phase 4)
- `--graduate` retro + archive, including unscheduling the cadence task (Phase 5)

## References

Read on demand, not upfront:

- [scaffold.md](scaffold.md) — dir layout, scaffold flow, helper flag reference
- [ramp-template.md](ramp-template.md) — RAMP.md preset templates
- [manager-handoff.md](manager-handoff.md) — manager-handoff capture prompts
