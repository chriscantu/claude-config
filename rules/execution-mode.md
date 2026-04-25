---
description: >
  Sizing guard for `superpowers:subagent-driven-development`. Requires the
  controller to choose and announce execution mode (subagent-driven vs.
  single-implementer) before the first implementer dispatch, based on plan
  size and integration coupling. Wraps the plugin-cached skill rather than
  editing it. Composes with `planning.md` Trivial-tier carve-out.
---

# Execution Mode Selection

<HARD-GATE>
Before invoking `superpowers:subagent-driven-development` (per-task two-stage
review across many subagent dispatches), the controller MUST evaluate the
sizing guard below and announce the selected execution mode + rationale.
Subagent-driven-development costs scale with task count, not task complexity
— per-task review on small mechanical tasks burns tokens without proportional
quality return, and integration defects historically surface at the FINAL
cross-task review, not per-task. Match mode to plan size.

If you catch yourself dispatching the first implementer subagent without
having announced a mode decision, STOP. Make the decision visible. Then
proceed.
</HARD-GATE>

## Modes

**Tie-break:** when both modes' triggers fire, single-implementer wins — the
subagent-mode trigger is conjunctive (ALL of), single-implementer is disjunctive
(ANY of). Subagent mode is the more expensive path; require all gates to fire
before paying for it.

### Subagent-driven mode

Use `superpowers:subagent-driven-development` (fresh subagent per task,
spec-compliance review + code-quality review per task) when ALL of:

- Plan has ≥5 tasks AND
- Tasks span ≥2 files AND
- Total functional change ≥ ~300 LOC

OR independently:

- Tasks have integration coupling that benefits from per-task spec review
  (cross-component contracts, shared state, ordered handoffs)

### Single-implementer mode

Use single-implementer + single final review (one implementer carries the
plan; one comprehensive review at the end against the full spec) when ANY of:

- Plan has ≤4 tasks
- All tasks touch the same file
- Each task is a TDD increment ≤50 LOC
- Trivial/Mechanical tier per `rules/planning.md` Scope Calibration
  (canonical criteria definition: ≤200 LOC, single-file primary surface,
  unambiguous approach, low blast radius — do not restate)

The final cross-task review still runs — single-implementer mode trades
per-task gates for one thorough end-of-work review. `verification.md`
still applies.

## Required Announcement

Before the first implementer dispatch, emit a one-line decision:

> **[Execution mode: subagent-driven]** Plan: 7 tasks across 4 files,
> ~480 LOC, integration coupling between auth + session layers. Per-task
> spec review pays for itself.

> **[Execution mode: single-implementer]** Plan: 3 tasks, single file,
> ~120 LOC TDD increments. Final review only.

The announcement is the gate satisfaction. Without it, the gate has not
been honored.

## When to Skip

- Bug fixes (no plan to size)
- Pure exploration with no implementation tasks queued
- The user explicitly directs the mode ("use subagent-driven", "single
  implementer please") — honor the direction, but still announce so the
  decision is auditable

## Pressure-framing floor

Floor enforcement (pressure-framing routing, named-cost emission contract,
sentinel bypass) is anchored in `rules/planning.md` DTP per-gate block. Per
[ADR #0006 rejection](../adrs/0006-systems-analysis-pressure-framing-floor.md)
and memory note `per_gate_floor_blocks_substitutable.md`, the model
generalizes that anchor to the active gate, so a per-gate floor block here
adds no eval-measurable load given the DTP anchor.

Concrete signals here: "this needs the full subagent treatment" or "go
fast, single implementer" without the criteria above being demonstrable
from the plan are pressure framings. Apply the sizing guard against the
actual plan, not the framing. A 12-task / 3-file / 600-LOC plan is
subagent-driven regardless of stated preference for speed; a 2-task /
1-file / 80-LOC plan is single-implementer regardless of stated preference
for thoroughness.

## Relationship to Other Rules

- `rules/planning.md` — Scope Calibration's Trivial/Mechanical tier feeds
  this rule (Trivial → single-implementer). This rule fires AFTER planning
  has produced a plan; it governs HOW the plan is executed, not whether
  one is needed.
- `rules/goal-driven.md` — per-step verify checks apply in BOTH modes.
- `rules/verification.md` — end-of-work gate applies in BOTH modes.
- `superpowers:subagent-driven-development` (plugin skill) — this rule
  WRAPS that skill's invocation. The skill's internal mechanics
  (implementer-prompt, spec-reviewer-prompt, code-quality-reviewer-prompt)
  are unchanged; this rule decides whether to invoke the skill at all.
