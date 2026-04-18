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
Proposed

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
