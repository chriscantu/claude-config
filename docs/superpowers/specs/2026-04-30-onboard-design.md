# /onboard — Senior Eng Leader 90-Day Ramp Orchestrator

**Date**: 2026-04-30
**Issue**: #12 (re-scoped from "codebase onboarding guide" to leadership-ramp orchestrator)
**Status**: Design approved

## Problem Statement

**User**: Newly-hired senior engineering leader (Director / VP), day 1–90 of new role at unfamiliar org.

**Problem**: Compressed ramp window forces simultaneous trust-building, organizational learning, and quick-win delivery. Stakeholder-interview synthesis is the bottleneck — easy to drown in detail, easy to miss the right interviewees — yet a sharp SWOT reflected back to stakeholders is the proven trust-builder and prioritization input.

**Impact**: Slow synthesis → perceived inactivity in first-impression window (top cost). Wrong stakeholder coverage or gut-feel quick-win pick → wrong bet, trust erodes (second cost). Each ramp rebuilt from scratch, no compounding leverage across ramps.

**Evidence**: User has lived 5 prior EM/Director ramps. Recurring failure modes: synthesis bog + stakeholder-selection gap. Whiteboard → deck pipeline proven. SWOT-via-interviews validated as trust-builder, not just analysis output.

**Constraints**:
- Tooling: Calendar + Gmail only (no Atlassian / Slack / Drive)
- Confidentiality: stakeholder candor preserved; verbatim quotes never reach reflect-back artifacts
- Output format: collaborative + versioned artifact (stakeholders contribute) → final slide deck for presentation
- Cadence: 90-day iterative (stakeholder map → interviews → draft SWOT → reflect-back), not one-shot
- Org-specificity: extract org-unique signal each ramp; no generic template
- NDA boundary: per-org isolation (top failure mode = cross-org contamination)

## Scope

**In scope**:
- Day-0 scaffold of per-org workspace (`~/repos/onboard-<org>/` git-isolated)
- 90-day cadence orchestration (milestones + activity-velocity nags)
- Composition layer over existing skills: `stakeholder-map`, `1on1-prep`, `swot`, `present`, `schedule`, `superpowers:brainstorming`, `productivity`, `memory-management`
- Confidentiality enforcement (one-way `interviews/raw/` → `interviews/sanitized/` boundary; downstream skills refuse raw)
- Graceful degradation when Calendar/Gmail integration unavailable

**Out of scope**:
- Codebase / architecture onboarding (handled by separate `architecture-overview` skill, issue #44)
- Interview-prep mode (different lifecycle; lives in job-search tooling)
- Synthesis logic itself (already lives in `swot` and `synthesize-research`)
- Deck rendering (already lives in `present`)

## Approach

Thin orchestrator + scaffolder. User-driven primary; skill nudges on lag. Combines option A (orchestrator) + B (scaffolder) per Q1 selection.

**Architecture**: `/onboard <org>` is a coordinator that (1) scaffolds a git-isolated per-org workspace on day 0, (2) seeds milestone + velocity nag jobs via `schedule`, (3) routes to existing skills at the right cadence, (4) enforces the confidentiality boundary at the filesystem layer, (5) graduates the ramp on quick-win-shipped trigger.

**Why**: All synthesis, deck rendering, and stakeholder modeling already exist as skills. Building net-new content here would duplicate working code (Karpathy #2 Simplicity violation). The genuine gap is the orchestration + cadence + confidentiality-boundary layer that ties them together.

## Invocation

```
/onboard <org-name>           # day-0 scaffold + cadence init
/onboard --status <org>       # show milestone progress, next action
/onboard --mute <category>    # mute nag category: milestone | velocity | calendar
/onboard --graduate <org>     # final retro + archive workspace
```

## Workspace Layout

Per-org git repo at `~/repos/onboard-<org>/`:

```
~/repos/onboard-<org>/
├── RAMP.md                       # 90-day plan, milestones, cadence preset, mutes
├── stakeholders/
│   └── map.md                    # populated by /stakeholder-map
├── interviews/
│   ├── raw/                      # GITIGNORED. Verbatim notes only. Downstream skills refuse to read.
│   └── sanitized/                # Themes only, aggregate-only attribution. Downstream skills consume this.
├── swot/
│   ├── v1.md                     # versioned per week
│   ├── v2.md
│   └── ...
├── decks/
│   └── slidev/                   # Markdown sources rendered to PDF/PPTX via /present. Git-collab native.
├── decisions/
│   ├── quick-win-pick.md
│   └── retro.md
├── TASKS.md                      # ramp-specific tasks via productivity skill
└── .gitignore                    # raw/, .env, **/private/
```

## Cadence (Standard Track — User-Tunable)

Day-1 prompt: cadence preset (`aggressive` | `standard` | `relaxed`). Standard shown:

| Week | Milestone | Artifact |
|---|---|---|
| W0 | Workspace scaffolded; manager-handoff captured | repo init, stakeholder seed list |
| W2 | Stakeholder map ≥80% complete | `stakeholders/map.md` |
| W4 | ≥8 1:1 interviews logged + INTERIM reflect-back deck delivered | `interviews/raw/`, `decks/slidev/interim/` |
| W6 | SWOT v1 draft committed | `swot/v1.md` |
| W8 | FINAL reflect-back deck delivered | `decks/slidev/final/` |
| W10 | Quick-win candidate locked | `decisions/quick-win-pick.md` |
| W13 | Quick-win shipped → graduate | `decisions/retro.md`, archive |

Aggressive = compress timeline ~30%. Relaxed = extend ~30%. User can tweak per-milestone at day-1.

## Skill Composition

Day-0 scaffold:
- Invokes `git init` + `.gitignore` + `gh repo create --private` (optional, prompt user)
- Captures manager-handoff inputs (org chart, top-10 list, key cross-functional partners) → seeds `stakeholder-map`
- Initializes `RAMP.md` from cadence preset
- Initializes `TASKS.md` via `productivity:start`
- Schedules milestone + velocity nag jobs via `schedule`

Ongoing routing (skill-per-week):
- W0: `/stakeholder-map` (seed)
- W1–W13: `/1on1-prep` (continuous, capture into `interviews/raw/`)
- W4: `/present` (interim deck framing: "draft for your input")
- W6: `/swot` (synthesizes from `interviews/sanitized/`)
- W8: `/present` (final deck)
- W10: `/superpowers:brainstorming` (quick-win pick when scoring is tight)
- W13: `/onboard --graduate <org>`

## Confidentiality Boundary

**One-way enforcement at FS layer.**

`interviews/raw/`:
- Gitignored by default
- Verbatim, attributable notes only
- `/swot` and `/present` and any other downstream skill MUST refuse to read this directory (skill checks path; aborts with explicit error if encountered)

`interviews/sanitized/`:
- Themes only, no per-stakeholder attribution
- Aggregate framing ("multiple engineering leaders noted X")
- Git-tracked
- Downstream skills consume EXCLUSIVELY this directory

**Scrub flow**: `/1on1-prep` capture mode requires user to tag every observation as `attributable | aggregate-only | redact` per session. Sanitization step writes only `attributable` (with explicit consent) + `aggregate-only` (anonymized) into `sanitized/`. `redact` content stays raw-only.

**Deck-gen guardrail**: before rendering deck via `/present`, `/onboard` runs an attribution-pattern check on the markdown source — flags any phrase matching stakeholder names from `map.md`. Manual override required to proceed.

## Lag Detection (Hybrid C+D)

Two nag classes, both per-class mutable:

**Milestone-miss (floor)** — schedule-fired check at each W2/W4/W6/W8/W10 boundary. If artifact missing, nag.

**Activity-velocity (supplement)** — daily check between W2-W6. If no `1on1-prep` capture in N days (default 7, user-tunable), nag.

**Calendar-watch (optional)** — when API access available, daily scan flags new invitees missing from `stakeholder-map`. Graceful degrade: when no API, falls back to weekly user-paste of meeting summary, OR disables this nag class entirely.

Mute syntax: `/onboard --mute milestone | velocity | calendar`. Mutes persist in `RAMP.md`.

## Termination (Quick-Win-Shipped Trigger)

Skill graduates when `decisions/quick-win-pick.md` shipped marker is checked off, NOT when calendar week 13 hits. Calendar week 13 = soft target only.

Graduation actions:
- Run final retrospective prompt → write `decisions/retro.md`
- Archive workspace: `git tag ramp-graduated-<date>`, push to remote (if configured), unschedule all nag jobs
- User can re-invoke `/onboard <org>` later to resume; skill warns ramp was previously graduated.

## Failure-Mode Mitigations (from systems-analysis)

| Failure | Mitigation |
|---|---|
| Confidentiality leak in deck | Two-layer storage (raw gitignored) + downstream-skill read refusal + attribution-pattern pre-render check |
| Stakeholder coverage gap | Combo seed (manager handoff + Calendar-watch + archetype coverage check) with graceful degrade |
| Generic template kills trust | Org-specificity enforced — no default SWOT content; all artifacts seeded empty per ramp |
| Reflect-back political backlash | Iterative cadence (W4 interim "draft for your input" lowers stakes before W8 final) |
| Synthesis lag (top cost) | Activity-velocity nag fires by day 7 of inactivity; milestone-miss is floor |
| Wrong-bet quick-win | `/superpowers:brainstorming` escalation when scoring is tight |
| Cross-org workspace contamination | Hard isolation: separate git repo per org, never sub-dir of `claude-config` |

## Implementation Phases

Phase 1 — scaffold + RAMP.md + manager-handoff capture (single-implementer, ~150 LOC)
Phase 2 — schedule integration for milestone + velocity nags (~80 LOC)
Phase 3 — confidentiality boundary enforcement (sanitization tags in `1on1-prep`, refusal checks, attribution-pattern pre-render hook) (~200 LOC + integration tests)
Phase 4 — Calendar-watch optional integration with graceful degrade (~100 LOC)
Phase 5 — `--graduate` retrospective + archive (~60 LOC)

Each phase ships independently. Phases 1-2 deliver MVP scaffolder + cadence; phase 3 is the confidentiality hardening pass; phase 4 is opt-in tooling; phase 5 closes the loop.

## Open Questions (for implementation plan)

1. Sanitization tag UX in `/1on1-prep` — modify existing skill or wrap it? Decision needed before phase 3.
2. Attribution-pattern check — exact regex grammar; threshold for "looks like a name"; confirmation prompt copy.
3. Calendar API choice — Google Calendar API direct vs. existing MCP; fallback paste format.
4. `gh repo create --private` — auto-prompt at scaffold or defer to user? Affects day-0 friction.
