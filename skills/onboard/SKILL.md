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
5. Run `bin/onboard-scaffold.fish --target <path> --cadence <preset> --gh-create yes|no`. → verify: exit 0; target dir exists with `RAMP.md`, `.gitignore`, `stakeholders/map.md`, and a `.git` dir
6. Capture manager-handoff inputs (see [manager-handoff.md](manager-handoff.md))
   directly into `<target>/stakeholders/map.md` via the section prompts there.
   → verify: each of the four section headers has at least the canonical "(none yet)" placeholder OR captured content
7. Print next-step guidance:

   > Workspace ready at <path>. Next: invoke /stakeholder-map to flesh out the seed
   > and /1on1-prep when you book your first interview.

## Backtracking

If `bin/onboard-scaffold.fish` exits non-zero, surface the stderr directly to
the user and stop. The most common cause is the target dir already containing
files (clobber-refusal); ask the user whether to choose a different path.

## What Phase 1 deliberately does NOT do

- Schedule milestone or activity-velocity nags (Phase 2)
- Enforce the raw → sanitized confidentiality boundary at downstream-skill read time
  (Phase 3 — directory layout and `.gitignore` are in place but the read-refusal
  logic in `/swot` and `/present` is wired up later)
- Calendar API integration (Phase 4)
- `--graduate` retro + archive (Phase 5)

## References

Read on demand, not upfront:

- [scaffold.md](scaffold.md) — dir layout, scaffold flow, helper flag reference
- [ramp-template.md](ramp-template.md) — RAMP.md preset templates
- [manager-handoff.md](manager-handoff.md) — manager-handoff capture prompts
