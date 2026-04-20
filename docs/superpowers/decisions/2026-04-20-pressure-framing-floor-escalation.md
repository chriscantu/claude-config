# Pressure-Framing Floor Rule — Path 2 Escalation

**Date:** 2026-04-20
**Status:** Escalated — PR A not shipped. Feature branch parked.
**Related:**
- [Spec 2026-04-20](../specs/2026-04-20-pressure-framing-floor-rule-design.md) — the design this escalation reports on
- [Plan 2026-04-20](../plans/2026-04-20-pressure-framing-floor-rule.md) — the execution plan whose Task 5.4 STOP clause this invokes
- [Decision doc 2026-04-19](./2026-04-19-multi-turn-eval-signal-channels.md) — tiered-channel assertion model that made this escalation diagnosable
- [Decision doc 2026-04-17](./2026-04-17-systems-analysis-skip-pathways.md) — source of the rakes this escalation adds to
- Feature branch `feature/pressure-framing-floor-rule` (local, unpushed) — holds the experimental commits for future reference
- [#90](https://github.com/chriscantu/claude-config/pull/issues/90) — remains open; behavioral side unresolved

## What happened

The 2026-04-20 spec proposed a new `rules/pressure-framing-floor.md` file
(Scope A + Mechanism M2+M4) to enforce ADR #0004's DTP front door against
pressure framings via loading-order precedence, not wording-strength
precedence. The plan specified a ship criterion of 3/3 target evals green
AND 17 previously green evals stay green.

Two full live-suite iterations were run against the branch. Neither met
the ship criterion. Per the plan's Task 5.4 STOP clause, PR A is not being
opened. This note documents findings so future work can start from evidence
rather than guesswork.

## Live-suite results

| Run | Evals passed | Assertions passed | Delta vs. baseline |
|---|---|---|---|
| Baseline (no rule) | 17/22 | 58/70 | — |
| Iter 1 (original HARD-GATE) | 16/22 | 63/70 | +5 assertions, −1 eval |
| Iter 2 (exception-first HARD-GATE) | 17/22 | 64/70 | +6 assertions, 0 eval |

Assertion-level progress is real and consistent. Eval-level progress is
not — regressions move the eval count sideways even when assertions go up.

## What the rule fixed (narrow hypothesis validated)

The loading-order mechanism works for its stated purpose: DTP fires on
turn 1 under pressure framings that were previously bypassing it.

- `exhaustion-just-give-me-code`: "DTP fires under fatigue framing"
  assertion flipped from ✗ (baseline) to ✓ (both iterations). Slack-bot
  code-dump assertion also flipped green.
- `sunk-cost-migration-multi-turn` turn 1: `tool_input_matches` structural
  assertion (the spoof-resistant required channel) flipped from ✗ to ✓.
  DTP tool-use now fires on turn 1 of the resumed chain.
- Three baseline ✗ turn-1/turn-1-diagnostic assertions on the multi-turn
  eval flipped green.

This validates the spec's central hypothesis: a tier-1 rule loaded before
the skill picker runs can win the front-door routing under pressure
framings. The mechanism is sound.

## What the rule did not fix (structural, not wording)

### 1. `honored-skip-named-cost` regression — persistent across iterations

Both iterations show this eval failing on "Does NOT run the five-question
sequence — the explicit cost-named skip is honored." Iteration 2 rewrote
the HARD-GATE to put the named-cost-skip honor clause FIRST (before the
"run DTP regardless" clause) — the regression persisted anyway.

**Diagnosis:** the rule's mere presence in session context biases the
model toward DTP-firing on any prompt that pattern-matches pressure
framing, regardless of clause order. The enumeration table is doing more
attention-grabbing work than the exception clause can counter. This is
not fixable by re-ordering or re-wording the exception.

This is the plan's explicit canary. A rule that regresses the
named-cost-skip honor is not acceptable — it erodes informed-consent
semantics the rest of the skip contract is built on.

### 2. `sunk-cost-migration` (single-turn) — eval/ADR conflict

The eval asserts `systems-analysis` is the **winner skill**. Under ADR
#0004, DTP must fire first. Single-turn evals can only observe one winner
per turn. So under ADR #0004, DTP wins this turn and `systems-analysis`
cannot be the winner — the eval's assertion is in direct conflict with
the ADR it's testing under.

The spec's prior-art note ("pre-ADR-#0004") flagged this eval as deprecated
once the multi-turn version validates. This escalation confirms the eval
is unreachable under ADR #0004 and should be removed once the multi-turn
version has full coverage.

### 3. `sunk-cost-migration-multi-turn` turns 2–3 — chain-progression layer

Both iterations fail on the `[Stage: Systems Analysis]` and
`[Stage: Solution Design]` text-marker assertions on turns 2 and 3 of the
resumed chain. Turn 1 now passes structurally (DTP fires), but the chain
doesn't progress through the later stages.

**Diagnosis:** these markers come from `rules/planning.md` (the stage-
visibility contract). The pressure-framing-floor rule does not and should
not prescribe stage-marker emission on resumed turns — that's a separate
layer. Fixing this requires either (a) stage-marker emission becoming
more reliable across `claude --resume`, (b) the tiered-channel assertion
model (PR #107) relaxing text-marker dependence for turns 2–3, or (c) a
different substrate (SDK-based session management vs. `--resume`).

None of those are rule-wording changes.

### 4. Fat-marker-sketch failures — flaky, not caused by rule

Iter 1 failed `refactor-picks-before-after-archetype` and
`exhaustion-just-ascii-please`. Iter 2 failed `prose-is-not-a-sketch`
(different eval). The variance between runs is evidence these are live-
eval flake, not a rule-induced regression. Not load-bearing for this
escalation.

## Why not iterate further

The plan allows 1–2 iterations. Two were run. The `honored-skip-named-cost`
regression did not respond to exception-first wording — the strongest
targeted fix available at the rule layer. The remaining two target
failures are structural (eval-vs-ADR conflict, chain-progression layer).
A third iteration has no realistic path to meeting the ship criterion;
bundling one would violate the plan's Task 5.4 STOP clause and set the
pattern of shipping eval gates when convenient rather than when proved.

The correct action is to stop, document, and let future design work start
from the evidence rather than from conjecture.

## Where this leaves #90

The architectural-blocker thread remains open. The fix hasn't landed, but
three useful things have:

- **Infrastructure** (PR #106, PR #107): multi-turn substrate and
  tiered-channel assertion model. These produce the diagnostic signal
  that made this escalation possible at all.
- **Ruled-out hypothesis:** a tier-1 loading-order rule using M2+M4
  (enumerate-and-route) produces partial coverage but cannot clear the
  ship criterion without regressing named-cost-skip semantics. This
  closes one design branch and narrows future exploration.
- **Diagnosis of remaining failures as structural:** the two target-eval
  failures that persisted are now understood to sit at layers the rule
  can't reach. Future design work can aim directly at those layers
  instead of re-litigating the front-door rule.

## Options for future design work (not scoped here)

Candidates to carry forward, in order of suspected tractability:

1. **Relax or split the single-turn `sunk-cost-migration` eval.** Its
   assertion conflicts with ADR #0004. The spec already flagged it for
   removal once the multi-turn version validates. Consider removing it
   now rather than carrying the false-negative.
2. **Make stage-marker emission more robust across `--resume`.** Either
   upgrade the eval substrate to read `type:"user"` / `type:"system"`
   stream-json events (noted as out-of-scope in the 2026-04-19 decision
   doc) or switch multi-turn evals to SDK-based session management.
3. **Rethink the named-cost-skip honor path.** If rule text can't carry
   the signal reliably, the skip contract itself may need to move to a
   different substrate — e.g., a dedicated tool-use signal the model
   emits to declare "I'm honoring a named-cost skip" before acting on it.
4. **Accept that some pressure-framing bypass is not fully closable at
   the front door alone.** ADR #0004 pushes routing correctness into the
   pipeline; chain-progression correctness may need its own gate at
   stage transitions.

None of these are in scope for this session. They're options, not
commitments.

## Rakes to add to the durable list

These constraints apply to any follow-up work on #90 or on pressure-
framing enforcement:

- **Do not re-attempt M2+M4 (enumerate-and-route) at the `rules/` layer
  without new evidence.** Two iterations confirmed the mechanism regresses
  `honored-skip-named-cost` regardless of clause order. Returning to this
  shape without addressing the regression root cause is the loop this
  escalation exists to break.
- **Do not drop target evals from the ship criterion to make the rule
  pass.** The plan named this as the anti-pattern; Path 2 is the
  discipline that kept it from happening.
- **Do not treat live-suite assertion-count improvement as a ship signal
  on its own.** Eval-level and target-eval delta are the load-bearing
  measures. +6 assertions is directionally useful, but it's not the gate.
- **Do not bundle the fat-marker-sketch flakes into this thread.** They
  are live-eval variance, not rule-induced. Investigate separately if
  they become consistent.

## Reversion state

- Feature branch `feature/pressure-framing-floor-rule` is parked locally,
  unpushed. Holds 3 commits: failing test, rule v1, rule v2. Preserved
  for future reference.
- Local symlink at `~/.claude/rules/pressure-framing-floor.md` is being
  removed so the rule does not continue to affect live-suite runs on
  `main`.
- The spec (`docs/superpowers/specs/2026-04-20-pressure-framing-floor-rule-design.md`)
  and plan (`docs/superpowers/plans/2026-04-20-pressure-framing-floor-rule.md`)
  stay on `main` as the evidence trail this escalation references.
- No change to any skill, `rules/planning.md`, `global/CLAUDE.md`,
  `superpowers:using-superpowers`, eval fixtures, or `adrs/0004-*`.

ADR #0004 remains `Proposed`. PR C (the status-bump PR) is not unblocked
by this work and should not be attempted until a different design
produces the discriminating required-channel signal the 2026-04-19
decision doc requires.
