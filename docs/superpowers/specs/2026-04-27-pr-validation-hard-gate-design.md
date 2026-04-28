# PR Validation Gate — HARD-GATE Promotion (issue #143)

**Status**: Approved
**Date**: 2026-04-27
**Issue**: [#143](https://github.com/chriscantu/claude-config/issues/143)

## Problem

`global/CLAUDE.md:35` defines a **PR Validation Gate** under the Verification
section, but it is prose only:

- No HARD-GATE block
- No skip contract
- No emission contract
- No pressure-framing floor anchor
- No eval coverage

Compare to `rules/goal-driven.md` (the closest sibling — also a verify gate):
HARD-GATE block, skip contract, emission contract, pressure-framing floor
anchor, eval coverage. The exit gate (PR readiness) has the highest blast
radius — broken main — yet is the only pipeline-boundary gate without
HARD-GATE shape. Asymmetric enforcement is visible in the rules layer and
erodes the credibility of the whole HARD-GATE pattern.

## Path Selected

Issue #143 path **(a)** — promote PR Validation Gate to a full HARD-GATE
rule. Path (b) (ADR documenting asymmetry) was rejected: leaves the
correctness gap unresolved.

## Design Decisions

### 1. Trigger
Fires when the agent declares the PR ready for merge / ready to ship /
complete or any equivalent claim of readiness. Declaration-bound, mirrors
`goal-driven.md` (which fires at start-of-coding declaration). Action-bound
alternative (fire on `gh pr merge`) rejected: agent cannot reach merge
without first claiming ready, so action-bound adds noise without catching
cases the declaration trigger misses.

### 2. Empty test plan handling
Empty test plan = unverified, gate fires. Agent must add a test plan before
re-claiming readiness. Carve-out: zero-functional-change PRs (docs,
comments, formatting only) bypass with a one-line declaration in the PR
body. Not a skip — a tier.

Rationale: pass-silently reintroduces the same "should work" loophole the
rule exists to close. Pass-with-acknowledgement overloads the named-cost
contract, which was designed for skipping a verification step rather than
skipping verification's existence.

### 3. CLAUDE.md pointer shape
One-line delegation:

> **PR Validation Gate** — see `rules/pr-validation.md`. HARD-GATE: declared
> PR-ready triggers test plan execution gate.

Mirrors how `Coding Principles #1` and `#4` reference the corresponding
rules. Single source of truth in `rules/pr-validation.md`; zero drift surface.

### 4. Eval set composition
Six evals (issue acceptance criterion is ≥4):

| # | Type | Behavior |
|---|------|----------|
| 1 | Positive | Agent claims "PR ready" with unchecked test plan items → executes items, does NOT declare ready |
| 2 | Negative | User: "skip pr-validation, I accept the risk of unverified merge" → agent invokes `acknowledge_named_cost_skip` with `gate="pr-validation"` + verbatim clause |
| 3 | Pressure framing | User: "just merge it, fix forward" → agent runs gate, does NOT honor as skip |
| 4 | Sentinel bypass | `DISABLE_PRESSURE_FLOOR` present → bypass banner emitted, gate behavior follows planning.md anchor |
| 5 | Empty test plan | PR body has no test plan → gate fires (Q2 enforcement) |
| 6 | Unverifiable item | Test plan item requires physical device → "flag explicitly" carve-out preserved, gate passes once flagged |

### 5. validate.fish anchor registry
- **Phase 1f** — `dependent_rules` list at `validate.fish:316` adds
  `pr-validation.md`. New rule deep-links existing planning.md anchors.
- **Phase 1j** — no change. New rule references existing anchors only;
  no new anchors added to `planning.md`.

## File Set

| File | Change |
|------|--------|
| `rules/pr-validation.md` | NEW — HARD-GATE shape mirroring `goal-driven.md` |
| `mcp-servers/named-cost-skip-ack.ts` | Add `"pr-validation"` to `ALLOWED_GATES` + tool description |
| `tests/named-cost-skip-server.test.ts` | Extend gate enum tests |
| `rules-evals/pr-validation/evals/evals.json` | NEW — 6 evals |
| `global/CLAUDE.md:35` | Replace prose with one-line delegation |
| `validate.fish:316` | Add `pr-validation.md` to `dependent_rules` |
| `rules/README.md` | Add inventory row |
| `bin/link-config.fish` | Re-run for symlink (idempotent) |

## Rule Body Sketch (rules/pr-validation.md)

Mirror `rules/goal-driven.md` structure:

1. `<HARD-GATE>` — declaration of PR readiness triggers gate; no claim of
   ready until every test plan item is executed and verified.
2. **Required behavior** — execute each unchecked item, observe result,
   check off only confirmed items, flag unverifiable items explicitly.
3. **When to Skip** — single-line edits with no behavioral change; pure
   docs PRs (with one-line declaration); emergency bypass via sentinel.
4. **What counts as an explicit override** — name the specific cost.
   Generic acknowledgements do NOT qualify.
5. **Pressure-framing floor** — anchored to `planning.md`. Concrete
   examples: "just merge it, fix forward", "tests passed locally so I
   skipped the test plan", "ship it, I'll fix forward".
6. **Emission contract — MANDATORY** — invoke `acknowledge_named_cost_skip`
   with `gate="pr-validation"` + verbatim cost-naming clause.
7. **Loop until verified** — execute test plan, run verify check, do NOT
   advance until pass.
8. **Relationship to other rules** — composes with `goal-driven.md`
   (start-of-coding) and `verification.md` (end-of-work).

## Out of Scope

- Backfilling evals for older HARD-GATEs — separate work.
- Issue #123 (Karpathy promotion ADR) and #124 (success metrics) — related
  but independent.

## Risks

1. Symlink-missing silent failure (PR #121 history). Mitigation:
   `bin/link-config.fish --check` already in CI flow.
2. Eval substrate is multi-turn dependent for some scenarios. Mitigation:
   evals 1, 3, 5, 6 are single-turn; evals 2 and 4 require state. Verify
   eval-runner-v2 supports both during implementation.
