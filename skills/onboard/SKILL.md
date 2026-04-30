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
      | `{{WORKSPACE_ABS_PATH}}` | absolute path of the scaffolded workspace (e.g., `/Users/<user>/repos/onboard-acme`) |
      | `{{ORG_SLUG}}` | kebab-case org slug (the basename of the workspace minus the `onboard-` prefix) |

      After substitution, scan the buffer for any remaining `{{` token. If any
      exist, ABORT and surface the missed placeholder. Do not pass an
      under-substituted body to the MCP. Note: angle-bracket markers like
      `<ISO date>` are RUNTIME-side placeholders for the autonomous session
      itself — do NOT scan for `<...>` pairs (would false-positive on every
      scaffold). Only `{{NAME}}` is a scaffold-time placeholder.

   c. Call:

      ```
      mcp__scheduled-tasks__create_scheduled_task(
        taskName       = "onboard-{{ORG_SLUG}}-cadence",
        cronExpression = "0 9 * * *",
        description    = <substituted buffer from step b>,
      )
      ```

      The `taskName` argument also takes a literal `{{ORG_SLUG}}` substitution.

   d. If the MCP tool is unavailable OR the call fails, you MUST:

      i.   Append a one-line warning to `<workspace>/.scaffold-warnings.log`:
           `<ISO date>  cadence-nag-not-registered  <reason: tool unavailable | call failed: <err>>`
      ii.  Replace the user-facing "Workspace ready" success message from
           step 7 with: "Workspace partially ready — cadence-nag scheduler
           NOT registered. See `<workspace>/.scaffold-warnings.log`. Re-run
           `/onboard --register-nags <org>` once the scheduled-tasks MCP is
           available." (The `--register-nags` flag is Phase 5; until then,
           the warning persists on disk so a human can re-scaffold or
           manually invoke the MCP.)
      iii. Do NOT silently continue. The persistent on-disk warning is the
           contract — a transient terminal echo is insufficient (scrolls
           off, never recoverable).

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
final), MUST run the attribution check:

```fish
bun run <repo-root>/bin/onboard-guard.ts attribution-check \
  <workspace>/decks/slidev/<deck>/slides.md \
  <workspace>/stakeholders/map.md
```

Exit code 3 means the deck contains stakeholder names from `map.md`.
Surface the guard's stderr (file:line:phrase report) to the user and
require explicit `override` token before proceeding. Anything else aborts.

**Override is enforced HERE, by the SKILL.md body — not by the guard
itself.** The helper exits 3 and emits the report; the calling skill
prompts for `override` and decides whether to proceed. This keeps the
helper pure (no interactive I/O) and centralizes UX in the skill.

See [refusal-contract.md](refusal-contract.md) for override semantics.

The gate runs PER render — re-renders re-check. There is no persistent
override state.

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
