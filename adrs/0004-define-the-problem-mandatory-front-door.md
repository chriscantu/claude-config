# ADR #0004: Make define-the-problem the mandatory front door of the planning pipeline

Date: 2026-04-18

## Responsible Architect
Cantu

## Author
Cantu

## Contributors

* Claude (design partner)

## Lifecycle
POC

## Status
Accepted

## Context

The planning pipeline (`rules/planning.md`) routes work through four stages:
problem definition → systems analysis → solution design → fat-marker sketch. Each
stage has a front-door decision: "should this stage run for this prompt, or skip?"

The Problem Definition stage uses a `SKIP IF` clause written in natural language:

> **SKIP IF** the prompt explicitly names a problem ("the problem is X", "the
> issue is Y") AND scopes it to a specific system, component, or workflow so
> impact can be mapped — OR describes a fixed decision with a signed contract
> or committed migration. A surface grievance with no named system ("X is
> broken", "we need Y", "the issue is no dark mode") does NOT qualify — run
> the skill.

The SKIP IF clause is interpreted by the model at runtime against each incoming
prompt. This has produced observed inconsistency:

- Prompts at the boundary of "specific system" vs. "category-level" are routed
  differently across runs of the same prompt.
- [Issue #99](https://github.com/chriscantu/claude-config/issues/99) documents a
  case where the prompt "our CLI tool doesn't have shell completions" was routed
  to DTP as a surface grievance, while the author intended it as specific scope.
- [PR #100](https://github.com/chriscantu/claude-config/pull/100) resolved the
  eval symptom by tightening the fixture prompt, but did not resolve the
  underlying routing ambiguity.

The DTP skill (`skills/define-the-problem/SKILL.md`) already contains an internal
Expert Fast-Track that drafts a problem statement from prompt content and
confirms it, rather than running the full five-question sequence. Today this
fast-track is available only when DTP is invoked — if the SKIP IF fires, DTP
(and its fast-track) are bypassed entirely.

### Forces in tension

- **Consistency vs. efficiency.** Skipping DTP on well-scoped prompts saves one
  conversation turn. But the skip decision is stochastic, producing inconsistent
  UX across otherwise-identical sessions.

- **Two boundaries, doubly fuzzy.** The current architecture has (1) a SKIP IF
  clause in `rules/planning.md` that decides whether DTP runs at all, and (2)
  DTP's internal Expert Fast-Track that decides whether to ask the five questions
  or draft-and-confirm. Both are model-interpreted. A prompt can fall on either
  side of either boundary, compounding inconsistency.

- **Eval fragility.** Evals that assert "skill X does/does-not fire" are
  sensitive to boundary interpretation. The `self-contained-shell-completions`
  eval has regressed multiple times as the SKIP IF phrasing evolved, not because
  the skill changed but because the prompt straddled the boundary.

- **Friction budget on well-scoped prompts.** A user who writes a rigorous
  problem statement expects the pipeline to proceed, not to ask questions they
  already answered. Any solution must keep their overhead low.

- **Skill-layer stability.** Prior sessions explicitly settled that
  `skills/systems-analysis/SKILL.md` and `skills/define-the-problem/SKILL.md`
  descriptions are not the right layer to retry. Routing logic belongs in
  `rules/planning.md`.

## Decision

We will remove the `SKIP IF` clause from `rules/planning.md` step 1. The Problem
Definition stage becomes the **mandatory front door** of the planning pipeline
for all prompts. DTP's internal depth adapts based on prompt content:

1. **Prompt contains a stated problem (any level of scoping):** DTP enters
   Expert Fast-Track by default. It drafts a problem statement from the prompt's
   content, presents it to the user, and fills gaps with **at most 2 targeted
   questions**. On user confirmation, hands off to systems-analysis.

2. **Prompt contains no stated problem (e.g., "let's build X"):** DTP runs the
   full five-question sequence, as it does today.

3. **Bug fixes and refactors:** Unchanged — DTP's existing "does not apply"
   clauses keep routing these directly to their implementation paths.

**Structural enforcement of skip semantics.** A named-cost skip of this gate
is honored only when the model invokes the `acknowledge_named_cost_skip`
MCP tool (tool name
`mcp__named-cost-skip-ack__acknowledge_named_cost_skip`) with
`gate="DTP"` and `user_statement` carrying a verbatim substring of the
user's cost-naming clause. Absence of that tool-use on a honor-claimed
skip is a contract violation. The emission contract lives in both
`rules/planning.md` (always loaded into context via the rules injection) and
`skills/define-the-problem/SKILL.md` (only loaded when DTP is invoked — the
rule copy is the load-bearing one when the user says "skip DTP" and the
skill is never read). See [the named-cost-skip signal design
spec](../docs/superpowers/specs/2026-04-20-named-cost-skip-signal-design.md).

We will **not** build:
- Heuristic classifiers for "how specific is this prompt?"
- Separate skip logic at `systems-analysis` or other downstream stages
- Any parallel routing path that bypasses DTP for planning work

## Consequences

**Positive:**

- **Deterministic routing.** Every planning prompt enters DTP. The
  "is this scoped enough?" judgment call — the source of [#99](https://github.com/chriscantu/claude-config/issues/99)
  and similar regressions — is eliminated.
- **Eval stability.** Evals can assert concrete, stable facts: DTP fires, DTP
  uses fast-track, DTP hands off to systems-analysis. Prompt phrasing no longer
  flips routing.
- **Consistent user experience.** The same mental model every session: "the
  model drafts what it thinks you mean, you confirm or correct, then we move
  on." No surprise skips, no surprise interrogations.
- **Elevates existing capability.** DTP's Expert Fast-Track is promoted from an
  optional optimization inside DTP to the default path. No new skill is required.
- **Closes a class of bugs.** #99-style regressions cannot recur once the SKIP IF
  is gone.

**Negative:**

- **One-turn overhead on well-scoped prompts.** A user who writes a rigorous
  problem statement now pays one confirmation turn before systems-analysis runs.
  This is the cost of consistency.
- **Existing evals need rewriting.** The `self-contained-shell-completions` eval
  in `skills/systems-analysis/evals/evals.json` currently asserts
  `not_skill_invoked: define-the-problem`. Under the new workflow, DTP fires via
  fast-track, so this assertion must flip. Other evals (`rush-to-brainstorm`,
  `authority-low-risk-skip`, `sunk-cost-migration`) must be reviewed for similar
  assumptions.
- **PR [#100](https://github.com/chriscantu/claude-config/pull/100) becomes obsolete.**
  That PR tightened the eval prompt to avoid DTP firing — the opposite of the new
  workflow's behavior. PR #100 should be closed without merging. The eval will be
  rewritten as part of implementing this ADR.
- **Fast-Track is load-bearing.** If DTP's fast-track implementation drifts
  toward the five-question sequence (e.g., over-cautious draft confirmation
  loops), the overhead penalty grows. Fast-Track behavior must be verified by
  eval, not just skill prose.
- **Loses a performance optimization.** Clearly-scoped prompts could previously
  skip DTP entirely. We are trading this optimization for routing consistency.
- **Runtime dependency on a user-owned MCP server.** Honoring a named-cost
  skip requires the `named-cost-skip-ack` MCP server to be registered and
  running. Outage or misregistration causes `honored-skip-named-cost` to
  fail, which demotes this ADR per ADR #0005. This is a new substrate
  risk introduced by Phase 1 of [#110](https://github.com/chriscantu/claude-config/issues/110).

**Neutral:**

- **No new skills, rules, or MCP dependencies.** This is a simplification: one
  rule clause deleted, one existing skill path elevated.
- **`skills/systems-analysis/SKILL.md` is unchanged.** It always receives a
  problem statement from DTP, which is already its expected input.
- **Pipeline shape is unchanged.** The four-stage sequence remains. Only the
  front-door condition becomes unconditional.

## Implementation notes (non-binding)

If this ADR is accepted, the implementation likely touches:

1. `rules/planning.md` — remove the SKIP IF clause from step 1. Add a sentence
   noting that DTP's Expert Fast-Track is the default path when a problem
   statement is present.
2. `skills/define-the-problem/SKILL.md` — strengthen the Expert Fast-Track
   section to be the default, not the fast path. Clarify the "≤2 targeted
   questions" bound.
3. `skills/systems-analysis/evals/evals.json` — rewrite
   `self-contained-shell-completions` assertions. Consider adding a companion
   eval for the vague-prompt case (confirms full five-question sequence runs).
4. `tests/scenarios/systems-analysis.md` — update scenario 2 narrative to match.
5. PR [#100](https://github.com/chriscantu/claude-config/pull/100) — close
   without merging.

## Promotion criteria

This ADR is a **behavioral ADR** (per [ADR #0005](./0005-behavioral-adr-promotion-requires-discriminating-signal.md))
— its Decision section asserts an observable claim: DTP fires as the front door
under all planning prompts, including those carrying pressure framings.
Promotion from `Proposed` to `Accepted` therefore requires a discriminating
eval per ADR #0005's four criteria.

**Required eval conditions — all must hold in a single eval run:**

1. `exhaustion-just-give-me-code` passes with a required-tier assertion of
   `tool_input_matches(tool=Skill, input.skill=define-the-problem)` on turn 1.
   This is the structural channel — the spoof-resistant signal that DTP fired
   under pressure, not a text proxy.
2. `honored-skip-named-cost` passes in the **same run**. The front-door rule
   must not regress the named-cost-skip contract — otherwise it fixes the
   pressure-framing bypass by erasing informed-consent semantics, which is the
   anti-pattern the 2026-04-20 escalation documented.
3. At least one additional pressure-framing eval from the set
   (`sunk-cost-migration` variants, `authority-low-risk-skip`, any successor)
   passes with a structural required-tier assertion. A single eval passing is
   not evidence of a routing-level fix; two independent prompts flipping green
   under the same mechanism is.
4. A discrimination demo exists: a commit, branch, or documented experiment
   where the implementation is deliberately broken produces red required-tier
   results on the evals above; the passing implementation produces green. The
   demonstration must be referenced in the commit or PR that promotes this
   ADR's status.

**Substrate-limit exception (per ADR #0005):** multi-turn stage-marker
assertions on turns 2–3 of resumed sessions are **permanently** classified as
diagnostic-tier, not required-tier, because `claude --resume` does not
reliably re-emit the `Skill` tool across turns and stage-marker text is the
only fallback channel. This limit is substrate-level, not a text-channel
preference. The
[2026-04-21 chain-progression substrate path decision](../docs/superpowers/decisions/2026-04-21-chain-progression-substrate-path.md)
evaluated three resolution paths and accepted path 3 (formal text-marker
relaxation) over path 1 (extractor extension) and path 2 (SDK migration);
the reasoning is preserved in that doc. This ADR's promotion is evaluated on
turn-1 required signals only; multi-turn assertions remain diagnostic-tier
permanently.
[#109](https://github.com/chriscantu/claude-config/issues/109) is the
acceptance record for this classification, not an open resolution path —
future reconsideration requires a new decision doc proposing a different
substrate path.

**Blocking dependency:** [#110](https://github.com/chriscantu/claude-config/issues/110)
Phase 1 has landed (see
[design spec](../docs/superpowers/specs/2026-04-20-named-cost-skip-signal-design.md)
and the discrimination-demo commits in
[PR #111](https://github.com/chriscantu/claude-config/pull/111)).
The named-cost-skip substrate is now structural — the
`acknowledge_named_cost_skip` MCP tool carries the signal, and
`honored-skip-named-cost` uses `tool_input_matches` as its required-tier
assertion. Phase 1 satisfies condition 2 of this section.

## Acceptance evidence

Promoted from Proposed to Accepted on 2026-04-21 via the #108
discrimination demo on branch `feature/108-pressure-framing-front-door`:

- Commit `6b261d0` — broken baseline: Layer C only (eval-shape
  upgrades to required-tier `tool_input_matches`). Required-tier RED
  on two of three target pressure-framing evals
  (`exhaustion-just-give-me-code`, `sunk-cost-migration-multi-turn`
  turn 1); GREEN on `honored-skip-named-cost` (both sides) and on
  `authority-sunk-cost`. Transcript:
  `tests/results/108-pressure-framing-discrimination-demo-broken-2026-04-21T14-35-32.md`.
- Commit `617c66a` — fixed state: Layer C + Layer A (rules/planning.md
  pressure-framing floor block enumerating authority / sunk-cost /
  exhaustion / deadline / stated-next-step framings and routing all
  non-cost-naming framings to `Skill(define-the-problem)`). Required-tier
  GREEN on all four targets in a single run:
  `exhaustion-just-give-me-code` ✓ (discriminating: RED→GREEN),
  `honored-skip-named-cost` ✓ (non-regression witness: GREEN→GREEN —
  condition 2 is a must-not-regress guard, not a discriminator),
  `sunk-cost-migration-multi-turn` turn 1 ✓ (discriminating: RED→GREEN),
  `authority-sunk-cost` ✓ (non-discriminating witness: GREEN→GREEN —
  retained as additional non-regression evidence, not as proof of Layer
  A efficacy). Transcript:
  `tests/results/108-pressure-framing-discrimination-demo-fixed-2026-04-21T14-53-29.md`.

**What actually discriminated.** The red→green transition across the
two commits is carried by **two** evals (`exhaustion-just-give-me-code`
and `sunk-cost-migration-multi-turn` turn 1), satisfying ADR #0005
condition 3 (≥2 independent pressure-framing evals passing structurally).
`authority-sunk-cost` was already GREEN on the broken baseline and
therefore does not carry discrimination weight in this demo — it is
retained in the Acceptance record as a non-regression witness.
Condition 4 (discrimination demo) is satisfied by the two
discriminating evals.

**Known stochastic text-regex flicker.** Non-target evals using
prose-matching regex assertions can flicker across runs because live
model wording varies. On the fixed-state transcript, flickers were
observed on `solution-as-problem-pushback`, `bug-fix-skips-pipeline`,
and `authority-low-risk-skip`. These failures were inspected and
attributed to regex narrowness against valid responses, not Layer A
regression. Future regressions on those three assertions should first
be checked against this pre-known flicker list before being treated as
behavioral regressions. The load-bearing ADR #0005 signals are the
required-tier structural assertions only; text-regex is diagnostic
and expected to flake.

**Rollback procedure.** This ADR's Accepted status depends on commit
`617c66a` (rules/planning.md pressure-framing floor). If that rules
change regresses in user workflows, revert in this order to restore
a coherent state:

1. Revert `d740e2b` (this ADR flip) → ADR returns to Proposed
2. Revert `617c66a` (rules/planning.md floor) → pressure-framing
   protection removed
3. Optionally revert `6b261d0` (evals upgrade) → evals return to
   `skill_invoked` text-channel baseline

Reverting `617c66a` alone without reverting `d740e2b` leaves this ADR
Accepted while citing deleted evidence — an incoherent state. The
revert order preserves ADR coherence at every intermediate commit.
Returning to the pre-ADR-#0004 SKIP-IF-clause architecture (Decision
#7 in ADR #0005's history) requires a new ADR, not a revert chain —
the SKIP IF clause was removed by the earlier implementation of this
ADR and is not carried in these commits.

**Current status rationale:** superseded by the Acceptance evidence
section above. #108 resolved the four-condition blocker via the
[pressure-framing front-door spec](../docs/superpowers/specs/2026-04-21-108-pressure-framing-front-door-design.md);
the historical blocker context (2026-04-20 escalation, M2+M4 rule-out)
is preserved in that spec's Problem statement and Decision #3.
