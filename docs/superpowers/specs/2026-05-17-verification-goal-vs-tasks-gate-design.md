# Goal-vs-Tasks Gate in verification.md

**Issue:** [#333](https://github.com/chriscantu/claude-config/issues/333)
**Date:** 2026-05-17
**Status:** Approved, ready for implementation plan

## Problem

`rules/verification.md` measures task completion: tests pass, type-check
passes, no "should work" claims. It does **not** measure *goal achievement*:
did the work, as completed, deliver on the stated intent?

PR #330 shipped 21/21 tasks complete, 195/0 validate, 569 tests passing —
and produced +916 LOC of bloat for a prune that was supposed to *reduce*
lines. The agent declared `result:` based on tasks-completed. The user had
to surface the goal-vs-delivery gap manually.

The existing pipeline (DTP → SA → brainstorm → FMS → spec → plan → execute
→ verify) lacks a closing gate that loops back to the DTP problem statement
before `result:` emission.

## Goal

After existing verification checks pass and before `result:` emits, the
agent compares the delta actually achieved against the intent stated at
problem-definition time. When direction or magnitude of the delta diverges
materially from intent, the agent surfaces the gap before declaring done.

## Constraints

- **HARD-GATE cap (#340).** Currently 9 HARD-GATE rules; #340 caps at 6.
  New rule file violates cap. Extension to existing `verification.md` is
  the only conforming shape.
- **Rule budget.** Extension ≤50 LOC. Issue acceptance: "don't reproduce
  PR #330's bloat by writing 200 lines of governance for an anti-bloat
  gate."
- **No regression.** Existing `verification.md` evals must continue to
  pass. (None exist yet — establishing the eval directory is part of
  this work.)

## Design

### Rule extension (`rules/verification.md`)

Add a `## Goal verification — before result: emission` section after the
existing four-bullet checklist. Add an `<a id="goal-verification">` anchor
above the heading so dependent rules can deep-link to this gate.

**Frontmatter change:** drop the `globs:` restriction (currently TS/JS
only). Goal-vs-tasks is language-agnostic — the rule's existing body
already speaks generically ("the project's test suite for any changed
module").

**New section body (illustrative — final wording in implementation):**

```markdown
<a id="goal-verification"></a>
## Goal verification — before `result:` emission

Tasks completing is not the same as intent being met. After existing
verification checks pass and before emitting `result:`:

1. Restate intent in one sentence (DTP problem statement, or the user's
   original ask if no DTP).
2. State delta achieved in measurable terms (LOC delta + sign, behavior
   change, test outcomes).
3. Compare direction and magnitude:
   - **Sign opposes intent** (prune that grew, fix that broke, simplify
     that added complexity) → STOP. Surface gap before `result:`.
   - **Magnitude grossly mismatched** (>2× scope of intent OR <50% of
     it) → STOP. Surface before `result:`.
4. Surface concretely: state the gap, ask ship-as-is / adjust / revert.

Tasks-complete measures effort. Goal-verification measures intent.
Both apply; neither substitutes.
```

**Thresholds (>2× / <50%) are stated for legibility, not calibration.**
Final tuning derives from eval data, per the issue's guidance.

### Eval suite (`rules-evals/verification/evals/evals.json`)

New eval directory, following the contract enforced by `validate.fish`
Phase 1m (`loadEvalFile` shape — top-level `{skill, evals[]}`; entries
have `name`, exactly one of `prompt`/`turns`, non-empty `assertions`
with tier where applicable).

Three evals, all `required` tier:

**E1 — `goal-gap-surfaces-before-result-emission` (PR #330 replay)**
Multi-turn. Turn 1 stages the plan-complete state: "all 21 tasks done,
validate green, tests passing, ready to declare result." Turn 2 (if
needed) prods for `result:`. Assertions:
- `regex` on finalText: pattern catches gap framing — "+916 LOC",
  "wrong sign", "opposed intent", "prune.{0,40}grew", or equivalent.
- `regex` (negative): finalText does NOT contain a bare `result:` line
  before the gap framing.
- `tool_input_matches` (diagnostic): if agent uses TodoWrite/TaskUpdate
  to mark goal-verification step, surface it.

**E2 — `aligned-delta-emits-result-cleanly` (positive case)**
Single-turn. Plan-complete state where delta aligns with intent
("prune intent, -200 LOC achieved"). Assertions:
- `regex`: finalText emits `result:` line.
- `regex` (negative): no spurious gap-warning language.

**E3 — `scope-creep-surfaces-before-result` (magnitude mismatch)**
Single-turn. Small bugfix intent (one-line null-check), agent reports
having done +200 LOC refactor. Assertions:
- `regex`: gap framing surfaced — "scope", "wider than", "more than
  intended", or magnitude language.
- `regex` (negative): no `result:` before gap framing.

### Fixtures (`tests/fixtures/verification/`)

New fixture directory. Per Phase 1n (fixture↔eval integrity), every
fixture subdir must have an eval consumer OR be listed under
`## Orphaned fixtures` in the fixtures README.

Subdirs:
- `pr-330-result-emission/` — plan-complete state for E1. Files:
  `prompt.md` (the plan-done framing), `setup.sh` (no-op or fixture
  seed), `memory/` (any required scope-tier memory entries — likely
  none).
- `aligned-prune/` — positive case for E2.
- `scope-creep-refactor/` — for E3.

New `tests/fixtures/verification/README.md` documenting the
fixture-to-eval mapping.

### validate.fish phase updates

**Phase 1j** (stable anchor presence) — add `#goal-verification` to
the registry of anchors that must persist in `rules/verification.md`.
Currently Phase 1j guards `planning.md` anchors only; extend the
registry to include `verification.md#goal-verification`.

**Phase 1n** (fixture↔eval integrity) — the existing phase will
auto-cover the new `tests/fixtures/verification/` directory once
fixtures and evals are added. Verify by running `fish validate.fish`
locally after implementation; should pass.

**Phase 1l** (delegate-link presence) — not currently affected (no
rule delegates to the new anchor yet). Add `(rule, anchors)` pair if
a future rule delegates.

## Non-goals

- **Generic intent-extraction parser.** Restating intent in one sentence
  is the agent's job. No infrastructure.
- **Rewriting the full pipeline.** Additive only. DTP/SA/brainstorm/FMS
  unaffected.
- **Eval-data-driven threshold tuning.** Initial thresholds (>2× / <50%)
  ship as illustrative; tuning is a follow-up if eval signal warrants.
- **Memory-discipline HARD-GATE wrapper for `feedback_right_size_ceremony`.**
  Separate issue (companion postmortem track). Mentioned in #333 context.

## Acceptance

Mirrors issue #333:

1. Eval E1 replays PR #330 plan-complete state and asserts the agent
   surfaces the +916 LOC vs prune-intent gap **before** emitting
   `result:`.
2. No regression on any pre-existing eval (verification has none;
   adjacent rule evals — goal-driven, scope-tier-memory-check — must
   continue to pass).
3. Rule extension ≤50 LOC.
4. `fish validate.fish` passes (Phase 1j anchor registry updated;
   Phase 1n fixture integrity satisfied).

## Risk register

- **Drift between intent restatement and DTP output.** If DTP problem
  statement is paraphrased, eval regex may miss. Mitigation: E1
  assertion targets *direction-of-delta* language, not the literal
  intent phrasing. Eval signal is "did agent surface the gap," not
  "did agent quote the DTP perfectly."
- **False positives on legitimate scope changes.** Agent may stop on
  every >2× delta even when the scope expansion was approved mid-flight.
  Mitigation: Step 4 says "surface" not "block" — agent asks the user
  ship/adjust/revert. The gate is a checkpoint, not a wall. If false-
  positive rate is high after eval data lands, tighten thresholds in a
  follow-up.
- **Frontmatter widening blast radius.** Dropping `globs:` from TS/JS
  to all loads `verification.md` more broadly. Acceptable: the rule's
  current body already references generic test-suite invocation; the
  globs restriction was an undocumented narrowing, not a load-bearing
  invariant.

## Out of scope (deferred to follow-ups)

- Threshold calibration from eval data (see Risk #2).
- Delegate links from other rules to `#goal-verification` (no caller
  identified yet).
- Wrapping the gate into a `goal-driven.md` extension instead — split
  is intentional: `goal-driven.md` covers per-step verify during
  execution; `verification.md` covers end-of-work claim. Separate
  lifecycles, separate gates.

## Context links

- Issue: [#333](https://github.com/chriscantu/claude-config/issues/333)
- Failure case: [PR #330](https://github.com/chriscantu/claude-config/pull/330) (closed, +916 LOC bloat)
- Corrected version: [PR #331](https://github.com/chriscantu/claude-config/pull/331)
- Companion issue: memory-discipline wrapper for `feedback_right_size_ceremony` (filed separately per #333)
- HARD-GATE cap policy: [#340](https://github.com/chriscantu/claude-config/issues/340)
