# `docs/superpowers/` — Skills Engineering Artifacts

This directory holds the long-running design + execution artifacts for skills,
rules, and infrastructure work in this repo. Each subdirectory has a specific
lifecycle role; the retention rubric below covers when artifacts stay and when
they leave.

## Layout

| Subdirectory | Purpose | Typical author |
|---|---|---|
| `specs/` | Design records — problem statement, scope, acceptance criteria, approach selection. One spec per initiative. | `superpowers:brainstorming` skill output |
| `plans/` | Implementation plans — task list, file structure, exact commands per task. One plan per phase. | `superpowers:writing-plans` skill output |
| `decisions/` | Lightweight breadcrumbs for design decisions made across multiple sessions. | Inline during planning |
| `audits/` | Periodic reviews of skill quality, eval coverage, drift. | Architect re-audit cadence |
| `prompts/` | Session-handoff scratch — copy-paste entry prompts for fresh sessions executing a plan. | Plan execution flow |
| `onboard-runbook.md` | Repo-specific onboarding doc for new contributors to this repo. | Maintainers |

ADRs live at the repo root in `adrs/`, not here. ADRs are decision records with
status (proposed/accepted/superseded); specs are richer narratives that an ADR
may cite.

## Retention Rubric

The implicit retention rule across the project's history (one accidental
deletion in #118 aside): **specs are durable, plans are conditional, prompts
are scratch.** Codify that here so future PRs don't re-litigate.

### Specs (`specs/`) — keep always

A spec is a decision record with broad citation surface:

- ADRs may reference it.
- Commits and PRs cite spec line numbers.
- Future phases of the same initiative use it as the starting point.
- `superpowers:brainstorming` produces it explicitly so the next session has
  context.

Deletion is destructive of institutional memory. Default keep, indefinitely.

**Move to `specs/archive/` when ALL hold:**

1. Initiative is fully shipped (no open phases).
2. No open issue or active follow-up references the spec.
3. The spec is older than 12 months.

The archive subdirectory is for visual hygiene of `specs/`, not for deletion —
the spec content stays in the repo.

### Plans (`plans/`) — keep when any of:

A plan is execution scaffolding. Its value drops sharply once the work ships,
but it has durable value when:

- **(a) Multi-phase initiative** — Phase N's plan informs Phase N+1's plan
  shape (file layout, task granularity, eval pattern). Examples: `/onboard`'s
  five phase plans, `/strategy-doc` Phase 1 informing the deferred Phase 2
  RFC mode.
- **(b) Open follow-up issue references it** — issues filed during or after
  the work cite plan task numbers or fixture references; deleting orphans the
  citation.
- **(c) PR body or ADR links to it** — historical citations need the file to
  resolve.

If none of (a)/(b)/(c) hold, the plan is pure scratch and SHOULD be deleted in
the same PR that ships the work, with a short rationale in the commit
message.

When in doubt: keep. The cost of an extra plan in `plans/` is ~750 lines of
static markdown. The cost of a broken citation is ambiguity.

### Decisions (`decisions/`) — keep always

These are intentionally lightweight breadcrumbs (a few hundred words each).
They support cross-session continuity for design work that spans multiple
conversations. Same archive-not-delete rule as specs.

### Prompts (`prompts/`) — delete after work ships

Prompts in `prompts/` are session-handoff scratch — copy-paste entry prompts
for "open a fresh session and execute Phase N of plan X." Once the phase
ships, the prompt has zero forward value (the next phase needs a different
prompt anyway).

Delete in the same PR that ships the phase. Pattern reference: `8c81f6f`
removed `/onboard` Phase 2/3/4 prompts when those phases shipped.

The one exception: if a prompt is referenced from a still-open follow-up
issue (rare), keep until the follow-up resolves.

### Audits (`audits/`) — keep always

Re-audit cadence is the only durable mechanism for catching skill drift. Each
audit is a point-in-time snapshot; deleting one breaks the trend signal.

## Pre-merge checklist for skill / rule PRs

Before merging a PR that adds or modifies skills/rules:

- [ ] Spec committed in `specs/` (if new initiative).
- [ ] Plan committed in `plans/` (if multi-task implementation).
- [ ] Plan retention category named in PR body — (a) multi-phase, (b)
      open-issue cite, (c) PR cite, or (d) scratch-to-be-deleted.
- [ ] If (d): plan deletion staged in the same PR with rationale in the
      commit message.
- [ ] Prompts in `prompts/` for the shipped phase deleted.

This checklist prevents the implicit-rule drift that motivated this rubric
(see `2026-05-08-strategy-doc-review` exchange for the discussion that
produced it).
