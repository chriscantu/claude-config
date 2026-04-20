# Issue #90 split strategy — three problems at three layers

**Date:** 2026-04-20
**Status:** Proposed — awaiting user decision to file child issues
**Related:**
- [#90](https://github.com/chriscantu/claude-config/issues/90) — the monolith being split
- [Escalation 2026-04-20](./2026-04-20-pressure-framing-floor-escalation.md) — evidence that motivated this split
- [Decision doc 2026-04-19](./2026-04-19-multi-turn-eval-signal-channels.md) — tiered-channel model the splits depend on
- [ADR #0004](../../../adrs/0004-define-the-problem-mandatory-front-door.md) — behavioral claim under test
- [ADR #0005](../../../adrs/0005-behavioral-adr-promotion-requires-discriminating-signal.md) — governance rule that blocks #0004 until a child of this split produces discriminating evidence

## Why split

#90 has been worked across four decision docs (04-17, 04-18, 04-19, 04-20) and
three reverted implementation attempts. Each iteration has tried to solve the
issue as a single behavioral bug with a single-layer fix. The 2026-04-20
escalation makes it clear this is structurally three problems at three layers:

1. Front-door routing under pressure framings (turn 1)
2. Chain-progression signal across `claude --resume` (turns 2–3)
3. Named-cost-skip honor contract (orthogonal to either)

Attempting to fix all three with one rule has produced the loop the 04-20
escalation exists to break. Each layer has a different tractable path and a
different substrate; bundling them means every iteration is blocked on whichever
layer the current lever can't reach.

## The three children

### #90-A: Front-door pressure-framing bypass (turn 1)

**Problem:** The skill picker can be bypassed by pressure framings (sunk cost,
fatigue, authority, time pressure, cosmetic minimizer) on turn 1, such that DTP
does not fire even when its `SKIP IF` clause would not have fired either.

**Evidence:** `exhaustion-just-give-me-code`, `sunk-cost-migration` (single-turn),
`authority-low-risk-skip` evals — all pre-existing before #90 was filed. The
04-20 escalation confirmed the loading-order mechanism (M2+M4 rule) *can* flip
some of these green on turn 1 but regresses `honored-skip-named-cost`
regardless of clause order.

**Layer:** front-door routing (rule-layer or substrate-layer, TBD — the 04-20
escalation ruled out text-layer M2+M4).

**Dependency on #90-C:** can't be fully solved without resolving the named-cost
contract, because every rules-layer attempt trades #90-A green for #90-C red.

**Discriminating eval (per ADR #0005):** at minimum `exhaustion-just-give-me-code`
with `tool_input_matches` on `tool=Skill, input.skill=define-the-problem` as the
required-tier assertion. Currently green in isolation; must stay green while
`honored-skip-named-cost` also stays green in the same run.

### #90-B: Chain-progression signal across `--resume` (turns 2–3)

**Problem:** On multi-turn evals, stage-marker emission from `rules/planning.md`
(`[Stage: Systems Analysis]`, `[Stage: Solution Design]`) is unreliable across
`claude --resume`. The Skill tool sometimes re-emits on resumed turns, sometimes
does not — for reasons not fully characterized.

**Evidence:** `sunk-cost-migration-multi-turn` turns 2–3 in both 04-20
iterations. Turn 1 flips structural green under the rule; turns 2–3 fail on
text-marker assertions regardless.

**Layer:** eval substrate + CLI behavior (`claude --resume` re-emission), not
rules/skills.

**Candidate paths:**
- Upgrade the eval substrate to read `type:"user"` / `type:"system"` stream-json
  events (flagged out-of-scope in 2026-04-19 decision doc; revisit).
- Switch multi-turn evals to SDK-based session management (stateful session
  object, not CLI `--resume`).
- Relax text-marker dependence on turns 2–3 in the tiered-channel model and
  name the substrate limit in the ADR (per ADR #0005).

**Discriminating eval:** currently none. Writing one is blocked on picking a
path above.

### #90-C: Named-cost-skip honor contract

**Problem:** When a user explicitly names the cost they're accepting ("skip DTP,
I accept the risk of ..."), the skip must be honored. Rule-layer text describing
the contract cannot discriminate cleanly — any rule that raises the floor on
pressure-pattern-matching also biases against valid named-cost skips. The 04-20
iter2 attempt (exception-first clause ordering) confirmed this is not fixable by
wording.

**Evidence:** `honored-skip-named-cost` regressed across both 04-20 iterations,
regardless of which clause came first in the HARD-GATE.

**Layer:** substrate / protocol — not rules.

**Candidate path:** a dedicated tool-use signal ("I'm honoring a named-cost
skip") the model emits before acting on a skip, similar to how `Skill` is a
structural signal rather than a text marker. This moves the contract from
text-bias territory to structural territory where discrimination is possible.

**Discriminating eval:** currently none. Designing the signal shape is the
precondition.

## Sequencing

| Order | Child | Why first / next / last |
|---|---|---|
| 1 | **#90-A triage** | Remove the known broken single-turn `sunk-cost-migration` eval (ADR #0004 conflict). Smallest change, clears a false-negative from any future gate. Does not require #90-B or #90-C. |
| 2 | **#90-C design** | Design the named-cost-skip structural signal. No implementation yet — design only, since implementation requires harness/SDK support that isn't in the user's control for the CLI. This unblocks #90-A because every #90-A attempt is gated on solving #90-C. |
| 3 | **#90-B path pick** | Decide substrate strategy (stream-json reads vs. SDK session vs. text-marker relaxation). Dependent on how much multi-turn coverage is worth vs. its cost. |
| 4 | **#90-A full attempt** | Only once #90-C has a design and #90-B has a path. Then the original #90 question — can front-door pressure-framing bypass be closed — becomes answerable. |

The sequencing is *not* "do 1 then 2 then 3 then 4 immediately." It is "1 is
cheap and can happen now; 2 and 3 require deliberate design sessions; 4 is
blocked on 2 and 3."

## What the split produces for #90

- #90 itself closes as *superseded by split*, with a link to this doc and the
  three children.
- ADR #0004 remains `Proposed` (per ADR #0005). It cannot promote until #90-A
  resolves with a discriminating eval.
- The infrastructure already shipped (PR #106, PR #107) continues to produce
  diagnostic signal on all three children.

## What the split does NOT do

- It does not commit to a fix for any child. It commits to treating them as
  separate problems with separate tractability.
- It does not change `rules/`, skills, or `rules/planning.md`. None of those
  files are edited by this document.
- It does not retire the 04-20 escalation's rakes. Those apply to #90-A
  attempts and carry forward unchanged.

## Next concrete step

If this split is approved: file three GitHub issues referencing this document
as the source, close #90 with a link to the split, and add the `Promotion
criteria` section to ADR #0004 naming which child must resolve before promotion
is possible.

If not approved: continue working #90 as a monolith. The 04-20 escalation is
the expected outcome in that world — another text-layer iteration will produce
another escalation note.
