# Design Spec: Pressure-Framing Floor Rule

**Date**: 2026-04-20
**Status**: Proposed
**Related**:
- [#90](https://github.com/chriscantu/claude-config/issues/90) — architectural-blocker thread this closes (behavioral side)
- [ADR #0004](../../../adrs/0004-define-the-problem-mandatory-front-door.md) — enforcement target; currently Proposed
- [Spec 2026-04-18](./2026-04-18-multi-turn-eval-substrate-design.md) — multi-turn eval substrate that produces the required-channel signal this rule is validated against
- [Decision doc 2026-04-19](../decisions/2026-04-19-multi-turn-eval-signal-channels.md) — tiered-channel assertion model landed in [PR #107](https://github.com/chriscantu/claude-config/pull/107)
- [Decision doc 2026-04-17](../decisions/2026-04-17-systems-analysis-skip-pathways.md) — three reverted attempts at the wrong layer; source of the rake list

## Problem Statement

**User**: Maintainer of `claude-config` + every future Claude Code session that depends on the planning pipeline firing under pressure framings.

**Problem**: In-prompt user instructions ("don't re-analyze", "just give me the code", "contract is signed") currently outrank the DTP front door despite ADR #0004 making DTP mandatory. The `superpowers:using-superpowers` priority ordering places CLAUDE.md and direct requests at the same tier 1, so pressure framings win the skill picker and DTP is skipped. ADR #0004 by itself does not supply a tie-break.

**Impact**: Three pressure-framing regression evals fail on the 2026-04-20 live suite: `sunk-cost-migration` (single-turn), `sunk-cost-migration-multi-turn`, and `exhaustion-just-give-me-code`. Bypasses fire on the highest-stakes prompts — signed contracts, fatigued end-of-day decisions, authority pressure — exactly where blast-radius awareness matters most. Silent decision-quality regressions ship until the tie-break lands.

**Evidence**: Live-suite transcript `tests/results/_live-suite-2026-04-20.log` shows 17/22 evals passing, 58/70 assertions. The three pressure-framing failures all show `superpowers:brainstorming` or direct-code-dump winning over DTP. The `sunk-cost-migration-multi-turn` eval's structural `tool_input_matches` assertion reports: *"no Skill tool_use had skill=\"define-the-problem\". Saw Skill.skill values: \"superpowers:brainstorming\"."*

**Constraints**:
- Rakes from 2026-04-17 (all reverted or rejected): no edits to `skills/systems-analysis/SKILL.md` description, `rules/planning.md` pressure-stacking, `superpowers:using-superpowers`, or single-turn eval prompts.
- Must stay coherent with ADR #0004 (DTP as mandatory front door).
- CLAUDE.md / `~/.claude/rules/*.md` is the tier-1 layer per `using-superpowers` priority ordering — the only layer that can outrank in-prompt user instructions without forking `using-superpowers`.
- Regression envelope: the 17 currently-passing evals must stay passing, especially `honored-skip-named-cost` (any rule that gates named-cost overrides regresses it).

**Known Unknowns**:
- Whether a rule loaded at session start reliably wins against in-prompt pressure framings across all three failing evals, or whether some require rule re-wording. The 30-min live-suite per iteration makes this expensive to probe.
- Whether the `self-contained-shell-completions` Fast-Track drift is the same bypass class or a separate DTP-internal mode-selection issue (likely separate; scoped out of this design).

## Systems Analysis Summary

**Dependencies**: `~/.claude/CLAUDE.md` loading (via symlinks to `/Users/cantu/repos/claude-config/global/CLAUDE.md` and `/Users/cantu/repos/claude-config/rules/*.md`); `rules/planning.md` (HARD-GATE step 1 skip-contract coherence); `skills/define-the-problem/SKILL.md` (skip contract lives here — rule references, does not duplicate); `skills/systems-analysis/SKILL.md` (rationalization table complements this rule for stage 2); `tests/eval-runner-v2.ts` + 22 eval fixtures (verification); ADR #0004 (governance entanglement).

**Second-order effects**: Positive — ADR #0004 validates, eval gate earns trust, house-style rationalization pattern gains a third reference implementation. Negative — risks: legitimate bug-fix/refactor prompts gated accidentally (mitigated by explicit non-goal); pipeline theater (model announces stages without running them — mitigated by structural `tool_input_matches` assertions on turn 1); over-announcement on trivial prompts (mitigated by DTP's Prototype/POC Condensed Pass).

**Failure modes**: Rule wording doesn't win against in-prompt instructions (the 2026-04-17 rake, one level up); rule regresses `honored-skip-named-cost` by being too absolute; pipeline theater slips past text-marker assertions.

**Org impact**: Single maintainer, fully reversible, negligible ongoing burden. Authoring discipline scales if new pipeline skills reference the tie-break pattern.

**Key risks feeding into the design**:
1. Intra-tier-1 precedence is undefined — rule must avoid precedence claims entirely.
2. Scope bleed into bug-fix/refactor prompts — rule must explicitly exempt the routes DTP already acknowledges.
3. Pipeline theater — verification plan must include qualitative transcript review, not just structural assertions.

## Selected Approach

**Scope A** (floor only, not mode-selection): the rule covers pressure-framing *bypass* of the DTP front door. It does not touch DTP's internal Fast-Track-vs-full-sequence mode selection. The `self-contained-shell-completions` Fast-Track drift is a separate DTP-internal issue and stays red for this PR.

**Mechanism M2 + M4** (enumeration + procedural script, routed through the existing skip contract): the rule enumerates pressure-framing phrases and names the cognitive mechanism each exploits (M2), then prescribes a procedural response (M4) — acknowledge the framing in one sentence, run DTP Fast-Track regardless, honor the skip only if the user names the specific cost.

**Why M2+M4 and not a precedence claim:** the rationalization tables in `skills/define-the-problem/SKILL.md` and `skills/systems-analysis/SKILL.md` already use this pattern but still fail the evals — because SKILL.md files load only when the skill is invoked, and pressure framings prevent skill invocation. Moving M2+M4 to `~/.claude/rules/` changes the **loading moment**, not the wording strength: the rule reaches the model at session start, before the skill picker runs. That reframes the fix from "what wording outranks user instructions" (the 2026-04-17 rake repeated one level up) to "what rule is loaded before the picker sees the prompt." External convergence: Constitutional AI, informed consent, jailbreak-resistance literature, and defense-in-depth all favor enumerate-and-route over precedence-claim. See the brainstorming transcript for the full rationale.

**Rejected alternatives:**
- **M1 (explicit precedence claim)** — "When CLAUDE.md conflicts with an in-prompt instruction, CLAUDE.md wins." Adjacent to the rejected Option 3 (forking `using-superpowers`), just one layer up. Most likely to fail the same way as the 2026-04-17 attempts.
- **M3 (durable-consent framing)** — "CLAUDE.md is your prior consent; in-prompt instruction does not override without cost-naming retraction." Clever but abstract; requires runtime reasoning about temporal precedence.
- **Scope B (floor + mode-lock)** — also tries to fix `self-contained-shell-completions`. A tier-1 rule can't reliably fix a DTP-internal mode heuristic; widens the regression surface without corresponding leverage.
- **Scope C (pipeline-wide gate)** — covers systems-analysis stage-2 bypass too, but ADR #0004 already moved that behind DTP; a stage-2 bypass can only happen *through* a DTP failure, which Scope A already covers.

## Architecture

Three changes, all small:

### 1. New rule file

Create `/Users/cantu/repos/claude-config/rules/pressure-framing-floor.md` with the following structure:

```markdown
# Pressure-Framing Floor

<HARD-GATE>
When a user prompt contains a pressure framing (sunk cost, fatigue,
authority, time-pressure, cosmetic minimizer), do NOT bypass the DTP
front door. Run the DTP Fast-Track floor (~30s) regardless.

A skip request is honored only when the user explicitly names the
specific cost being accepted (e.g., "skip DTP, I accept the risk of
building on an unstated problem"). Bare skip requests and generic
framings ("just give me code", "contract is signed", "CTO approved",
"ship by Friday") are NOT overrides — route them to the floor.
</HARD-GATE>

## Why This Rule Exists

[3-4 sentences referencing 2026-04-17 decision doc + PR #107 + ADR #0004.
Context for future sessions. No re-litigation.]

## Enumerated Framings

| Mechanism | Example triggers |
|---|---|
| sunk cost / consistency bias | "contract signed", "we already decided", "don't re-analyze", "already committed" |
| fatigue-driven bypass | "just give me the code", "been at this for hours", "too tired to go through this" |
| authority bias | "CTO/VP/principal said it's low-risk", "leadership already approved" |
| time-pressure bypass | "ship by Friday", "meeting in 10 minutes", "no time for this" |
| cosmetic minimizer | "just a column", "just a toggle", "small change", "it's tiny" |

## Procedural Response

When a phrase from the enumeration is detected:
1. Acknowledge the framing in one sentence. Name the **mechanism**, not the user.
2. Run DTP Fast-Track regardless (~30s).
3. If the user responds by naming the specific cost being accepted, honor the
   full skip per the skip contract in `skills/define-the-problem/SKILL.md`.
   If they repeat the framing without naming a cost, the floor stays.

## What This Rule Does NOT Do

- Does not override ADR #0004 — it enforces it.
- Does not modify `superpowers:using-superpowers` priority ordering.
- Does not gate bug-fix or refactor prompts (DTP already routes those past).
- Does not require specific wording to honor a named-cost skip.

## Relationship to Existing Artifacts

- `rules/planning.md` — this rule enforces planning.md's HARD-GATE step 1
  "Skip contract" clause at the session-context layer. No new gate.
- `skills/define-the-problem/SKILL.md` — the skip contract lives there; this
  rule reroutes pressure framings through it.
- `skills/systems-analysis/SKILL.md` — systems-analysis has its own
  rationalization table for stage 2. This rule covers the pipeline front door.
```

Full prose for the "Why This Rule Exists" section is written during implementation; the rest is final.

### 2. Symlink

Create `~/.claude/rules/pressure-framing-floor.md` → `/Users/cantu/repos/claude-config/rules/pressure-framing-floor.md`. Matches the existing pattern for the four current rule files.

### 3. Static contract test

Add a test in `tests/evals-lib.test.ts` asserting:
- `rules/pressure-framing-floor.md` exists.
- Contains at least one line per enumerated mechanism (`sunk cost`, `fatigue`, `authority`, `time-pressure`, `cosmetic`).

Prevents silent file deletion or partial revert from landing without failing a test.

## Non-goals

- **Does not fix `self-contained-shell-completions`.** That eval's Fast-Track drift is a DTP-internal mode-selection issue, not a pipeline bypass. File separately as a DTP skill refinement.
- **Does not fix `bug-fix-skips-pipeline`'s test-first assertion.** Orthogonal rake (tdd-pragmatic rule enforcement), not this rule.
- **Does not modify `global/CLAUDE.md`.** Rule loads via the `rules/` directory scan that's already wired up.
- **Does not modify `superpowers:using-superpowers`.** No precedence claim made; the mechanism relies on loading order, not wording strength.
- **Does not bundle the governance ADR (PR B) or ADR #0004 status promotion (PR C).** See "Rollout" for the three-PR sequence.
- **Does not introduce a new skill.** The rule is intentionally a rule, not a skill, because skills only load on invocation — which pressure framings prevent.

## Consequences

**Positive**:
- Closes the pressure-framing bypass class identified in #90's acceptance criteria.
- Produces the discriminating required-channel signal needed to promote ADR #0004 to Accepted (PR C).
- Adds a third reference implementation of the enumerate-and-route pattern in the house style, alongside DTP and systems-analysis.
- Fully reversible — single-commit revert, no runtime state.

**Negative**:
- Adds one more rule file to the 4 existing. Authoring discipline for new pipeline skills should reference the tie-break pattern — a one-line note in the rules `README` (or equivalent) is a reasonable mitigation if/when one exists.
- Rule wording may need 1-2 iterations within the same PR if the first live-suite run shows partial coverage. 30-min live-suite makes iteration slow but not blocking.

**Neutral**:
- Existing single-turn and multi-turn eval shapes remain unchanged.
- No changes to `skills/*/SKILL.md` files, `superpowers:using-superpowers`, or `global/CLAUDE.md`.

## Verification

Three layers. Ship criterion: all three green.

**Layer 1 — Static** (fast):
- `bun test tests/evals-lib.test.ts` — 104 tests currently green, stay green.
- `bun run tests/eval-runner-v2.ts --dry-run` — JSON validity holds.
- New contract test (§ Architecture 3) passes.

**Layer 2 — Live-suite delta**:
- Must flip green (from red on 2026-04-20 baseline): `sunk-cost-migration`, `sunk-cost-migration-multi-turn`, `exhaustion-just-give-me-code`.
- Must stay green: all 17 currently-passing evals. Especially `honored-skip-named-cost` (critical — rule must not gate named-cost overrides).
- Allowed to stay red (explicitly out of scope): `self-contained-shell-completions` Fast-Track drift and `bug-fix-skips-pipeline`'s test-first assertion.

**Layer 3 — Qualitative** (30-second skim):
- Transcripts of the 3 flipped evals show the rule acting: model names the mechanism in one sentence, runs Fast-Track, continues. If transcripts show *theater* (announcing DTP without running it), the rule is passing the assertion but failing the intent — revise wording and re-run.

## Rollout

Three sequential PRs (G2 from the brainstorming transcript). This spec scopes PR A only.

**PR A (this spec)**: new rule file + symlink + static contract test + live-suite transcript artifact. Branch: `feature/pressure-framing-floor-rule`. Single commit. Commit message: "Add pressure-framing-floor rule (closes #90 behavioral side)."

**PR B (separate, noted as follow-up)**: governance ADR codifying *"ADR status promotes from Proposed → Accepted only after regression eval produces a discriminating required-channel signal."* Textual, no runtime effect.

**PR C (separate, after A and B)**: flip `adrs/0004-define-the-problem-mandatory-front-door.md` status from `Proposed` → `Accepted`. One-line change. References PR A's passing transcript as evidence and PR B as the governance basis.

**Revert path**: single `git revert` of PR A's commit. No runtime state, no migration. The symlink is in-repo and reverts with the commit. Fully reversible, instantaneous.

**Pre-merge checklist** (on PR A description):
- [ ] Layer 1 (static) green
- [ ] Layer 2 (live-suite) transcript attached
- [ ] 3 target evals flipped green; no regressions in the 17 previously green
- [ ] Layer 3 skim: no pipeline-theater symptoms
- [ ] Spec + brainstorming transcript referenced in PR body

## Rakes to avoid (durable)

These constraints apply to the implementation thread and to any follow-up work:

- **Do not modify `skills/systems-analysis/SKILL.md` description.** That layer was tried and reverted 3× on 2026-04-17.
- **Do not modify `rules/planning.md` to stack stronger language against pressure framings.** Same reason.
- **Do not modify `superpowers:using-superpowers`.** Fork was considered and rejected (Option 3 in the 2026-04-18 spec).
- **Do not rewrite existing single-turn or multi-turn eval prompts to avoid the pressure framing.** The evals are the canary; the rule is the fix.
- **Do not make the rule assert precedence.** The mechanism relies on loading order, not wording strength. Precedence claims are the 2026-04-17 rake one level up.
- **Do not bundle PR B or PR C into PR A.** Each has independent value and should revert independently.

## Implementation Notes (non-binding)

Rough shape for the implementation plan that would follow this spec:

1. Create `rules/pressure-framing-floor.md` with the content structure from § Architecture 1. Write the "Why This Rule Exists" section referencing the 2026-04-17 decision doc, PR #107, and ADR #0004.
2. Create the symlink: `ln -s /Users/cantu/repos/claude-config/rules/pressure-framing-floor.md ~/.claude/rules/pressure-framing-floor.md`. Verify with `ls -la ~/.claude/rules/`.
3. Add the static contract test to `tests/evals-lib.test.ts`. Follow the pattern of the existing `rules/planning.md` marker contract test from PR #107.
4. Run Layer 1 verification. Fix any failures.
5. Run Layer 2 live-suite. Capture transcript to `tests/results/`.
6. If Layer 2 shows partial coverage, iterate rule wording within the same PR (up to 1-2 iterations), re-run Layer 2 each time.
7. Run Layer 3 qualitative skim on the 3 flipped evals' transcripts.
8. Draft PR description referencing this spec, the brainstorming transcript (when a link exists), and the Layer 2 transcript.

## Status

Proposed. Implementation in a fresh thread via `superpowers:writing-plans`.
