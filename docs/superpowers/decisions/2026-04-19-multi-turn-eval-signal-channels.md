# Multi-turn eval: tiered-channel assertion model (Approach D)

**Date:** 2026-04-19
**Status:** Decided — design-only; implementation handoff pending
**Related:**
- [PR #106](https://github.com/chriscantu/claude-config/pull/106) — multi-turn eval substrate that surfaced the observability gap
- [Spec 2026-04-18](../specs/2026-04-18-multi-turn-eval-substrate-design.md) — merged spec that parked signal-channel follow-up as out-of-scope
- [Decision doc 2026-04-17](./2026-04-17-systems-analysis-skip-pathways.md) — three reverted attempts and the rake class this closes
- [ADR #0004](../../../adrs/0004-define-the-problem-mandatory-front-door.md) — intent under test; governance status flagged but not decided here
- [#90](https://github.com/chriscantu/claude-config/issues/90) — original architectural-blocker thread

## Problem

The multi-turn sunk-cost eval produces no actionable pass/fail. Turns 2–3 report
`(none)` for `skill_invoked_in_turn` because the `Skill` tool is not re-emitted
across `claude --resume` once a skill is loaded — by design, not a bug. The chain
fires end-to-end, but the assertion vocabulary can't discriminate "model drifted
and skipped pipeline stages" from "model held the line and didn't need to
re-invoke a loaded skill."

Concrete consequence for the maintainer:

- Cannot wire the eval as a merge gate. "Must pass" fails forever; "advisory" is
  ignored. Either setting is degenerate.
- Cannot validate ADR #0004. The substrate was built to produce data on whether
  the ADR closes the pressure-framing gap; its current output answers neither yes
  nor no.
- Silent regressions ship. Any change weakening sunk-cost handling produces the
  same transcript as the current baseline.

Net: the PR shipped regression coverage for sunk-cost drift and does not
currently have regression coverage for sunk-cost drift.

## Prerequisite finding

The live-run transcript referenced in the PR #106 Status block
(`tests/results/systems-analysis-sunk-cost-migration-multi-turn-v2-multiturn-2026-04-19T20-04-42.md`)
**is not present in-repo**. Latest result timestamp is `19:52:32` and no file
matches `*multiturn*`. The "Regime 2 inconclusive" claim this follow-up rests on
is not reproducibly cited. Implementation thread must regenerate the live run and
commit the transcript before designing against its claimed behavior.

## Decision: Approach D — tiered-channel assertion model

Every assertion carries a tier. The runner's new meta-check stage gates on
required-tier signal presence across all turns. Diagnostic-tier assertions are
captured and reported but never gate pass/fail.

**Shape (per the 2026-04-19 fat-marker sketch):**

```
(1) chain run  →  (2) extract  →  (3) evaluate  →  (4) meta-check  →  (5) report
                                      ↑                  ↓
                            contract test      silent-no-fire guard
                            (planning.md         (required assertions
                             markers)             with zero matches
                                                  fail loud)
```

**Five components:**

1. **New assertion variant `tool_input_matches`** on the per-turn path. Reads
   `toolUses[].input` by tool name + input-key matcher (e.g.,
   `tool=Skill, input.skill=define-the-problem`). The model cannot emit this
   shape without actually invoking the tool — it is the most spoof-resistant
   channel and is what required-tier assertions on turn 1 should target.

2. **Tier metadata on every assertion**: `tier: "required" | "diagnostic"`, with
   `required` as the default for backward compatibility. Tier is per-assertion,
   not per-turn — an eval can mix required and diagnostic assertions on the same
   turn.

3. **Meta-check stage in the runner**. After per-turn and chain-level evaluation,
   iterate required assertions. For each: did the assertion match ≥1 signal
   across all turns it was eligible to run against? If zero, emit a
   `SILENT-FIRE FAILURE` (distinct label from a normal assertion miss) and fail
   the eval even if per-turn passes were recorded. This closes the silent-no-fire
   rake class at the substrate layer, not per-eval.

4. **Transcript reporter extension**. Per-assertion tier + matched/unmatched
   state + which diagnostic channels fired. A reader looking at a green transcript
   can tell *which* required channel carried the pass.

5. **Contract test on planning.md markers** in `tests/evals-lib.test.ts`. Loads
   `rules/planning.md` and asserts the expected `[Stage: ...]` markers are
   present. Planning.md rot fails loud at unit-test time rather than silently at
   eval time months later. This turns text-marker rot into a fast red test, not
   a confusing eval failure.

**Exit-code contract:** exit 0 iff all required-tier assertions passed AND the
meta-check recorded no silent-fire failures.

## Why D over B and C

| Failure mode | A (single) | B (AND all) | C (OR + meta) | **D (tiered)** |
|---|---|---|---|---|
| Drift via prose spoofing | depends on channel | catches | misses | **catches** (required channel is structural) |
| Channel rot (planning.md edit) | fails on rot | fails on rot | survives | **survives** (rot caught upstream by contract test; eval gate depends only on required channel) |
| Authoring cost | low | high | high | medium |
| Silent-no-fire | orthogonal | orthogonal | closed by meta-check | **closed by meta-check** |
| Failure timing | — | months later (rot noise) | authoring-time | **authoring-time** (bad required channel is visible when picked) |

B's hidden cost is rot-noise months later: an unrelated planning.md edit breaks
the eval, the maintainer spends an hour treating it as drift, and trust in the
gate erodes. In a single-maintainer repo, coordinated-update discipline across
two files is a known-bad pattern. C trades spoof resistance for rot resistance —
the wrong trade for an eval whose purpose is detecting drift. D picks the
spoof-resistant gate and handles rot in a separate, dedicated test.

## Acknowledged caveat

For turns 2–3 on `--resume`, the expected behavior under re-pressure may be
purely conversational ("holding the line"). In that regime no structural tool-use
may be emitted, and the required channel for that turn collapses to a text
marker — partially reopening the spoofing concern. The implementation must be
honest that D is **structural where possible, text-marker where necessary**, not
uniformly structural.

This is tolerable because turn 1 stays structural (the entry gate is
spoof-resistant) and the meta-check catches silent-no-fire across all turns. A
prose-only drift on turns 2–3 that *also* fakes the text marker is still a
regression — but an unambiguously caught one (the turn-1 gate had to pass for
the chain to reach turn 2).

## Out of scope

- **Implementation.** This is a design-only thread. Hand off to a fresh thread
  with a plan file per `superpowers:writing-plans` once prereqs below are met.
- **ADR #0004 status question.** Whether the ADR should be demoted from
  `Implemented` to `Accepted`/`Proposed` pending discriminating evidence is a
  separable governance decision. A proposal worth carrying forward: *ADR status
  promotes from Proposed to Accepted only after the regression eval produces a
  discriminating required-channel signal.* That rule is a one-time decision with
  a long tail and should be filed as its own ADR or tenet, not bundled with this
  design.
- **`extractSignals` event-type expansion.** Reading `type:"user"` and
  `type:"system"` stream-json events is flagged as future work. Not required for
  D to land — `toolUses[]` already contains the signal `tool_input_matches`
  needs. Defer until an assertion type actually needs hook-event data.

## Implementation-thread prerequisites

Before writing the plan, the implementation thread must:

1. **Regenerate and commit a live multi-turn sunk-cost transcript.** The currently
   cited one doesn't exist. Without it, the "Regime 2 inconclusive" framing is
   an unverified claim.
2. **Confirm `tool_input_matches` input-key matcher grammar.** Simple equality on
   `input.skill` is the starting point; decide whether glob/regex matching on
   tool-input fields is in scope for v1 or deferred.
3. **Decide default tier for backward compatibility.** Proposal: `required` by
   default so existing 8 evals' 71 assertions don't silently demote to
   diagnostic on load. Validate this doesn't break any existing eval under the
   new meta-check.

## Rakes carried forward (durable)

From the 2026-04-17 decision doc and the 2026-04-18 spec — these apply to the
implementation thread too:

- Do not modify `skills/systems-analysis/SKILL.md` description.
- Do not modify `rules/planning.md` to stack stronger language against pressure
  framings.
- Do not modify `superpowers:using-superpowers`.
- Do not rewrite the existing single-turn sunk-cost eval prompt to avoid the
  pressure framing.

All four rakes are about refusing to fix at the *wrong architectural layer*. D
lands entirely in the eval substrate — no skill, rule, or using-superpowers
edits — so none of them are triggered by this design.
