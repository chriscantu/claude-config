# Design Spec: Multi-Turn Eval Substrate

**Date**: 2026-04-18
**Status**: Proposed
**Related**: [#90](https://github.com/chriscantu/claude-config/issues/90), [ADR #0004](../../../adrs/0004-define-the-problem-mandatory-front-door.md), [2026-04-17 decision doc](../decisions/2026-04-17-systems-analysis-skip-pathways.md)

---

## Problem Statement

**User**: Maintainer of `claude-config` plus every future session whose decisions depend on the planning pipeline running end-to-end.

**Problem**: Under pressure framings (sunk-cost, authority, fatigue, direct-output requests), the planning pipeline skips `systems-analysis` and chains DTP → brainstorming in one turn. The `sunk-cost-migration` eval's `skill_invoked: systems-analysis` assertion fails because single-turn evals surface a single "winner" skill per turn — the regression guard meant to catch this bypass is structurally unable to observe the bypass it's testing for. This is a **decision-quality regression**, not just an eval failure: the surface-area pass that exists to catch blast-radius surprises is the exact thing the framings bypass, and the highest-stakes prompts (migrations, committed contracts) are the most likely to hit it.

**Impact**: Steady-state 3/4 evals passing, 10/11 assertions. Three iterations on 2026-04-17 attempted to fix at the skill-description and `rules/planning.md` layers; all were reverted, memorialized in a feedback memory and a decision doc. Future sessions inherit the churn if the architectural layer isn't resolved.

**Evidence**: Reverted-attempts log in the 2026-04-17 decision doc; transcripts in `tests/results/systems-analysis-sunk-cost-migration-v2-*.md`; issue #90 thread.

**Constraints**:
- `skills/systems-analysis/SKILL.md` description changes — reverted, structurally blocked by `superpowers:using-superpowers` priority ordering.
- `rules/planning.md` stronger language — same blocker.
- ADR #0004 (Proposed) makes DTP the unconditional front door; any fix must be coherent with it.
- `tests/eval-runner-v2.ts` uses `claude --print` (one-shot). Schema accepts one `prompt: string` per eval.

**Known Unknowns**:
- Whether `claude --resume <session_id>` is the right CLI affordance for chaining, or whether the Anthropic SDK session API is cleaner. Verify before implementation.
- Whether upstream `superpowers:using-superpowers` priority ordering will still be the root cause once chaining is observable — Option 1 treats this as a measurable question, not an assumed one.

---

## Systems Analysis Summary

**Dependencies**: `skills/systems-analysis/evals/evals.json` (schema + fixtures), `tests/eval-runner-v2.ts` (runner), all 8 existing evals (must stay compatible). No runtime skill or rule changes in this design.

**Second-order effects**:
- Sets the pattern for future evals to reach for multi-turn when appropriate; authoring discipline needs a guideline (use single-turn by default, multi-turn only when pipeline chaining is the thing under test).
- Produces ground truth on whether ADR #0004 alone resolves the pressure-framing skip. If it does, no further behavioral fix is needed. If not, the follow-up options (CLAUDE.md tie-break rule; fork `using-superpowers`) can be designed against data instead of guesswork.

**Failure modes**:
- Substrate lands but the chain still skips under pressure → still a gain: we now have falsifiable data for the next fix.
- Multi-turn evals mask single-turn production behavior → mitigation: keep existing single-turn evals as regression coverage for single-turn scenarios; multi-turn is *additional* coverage, not replacement.

**Org impact**: Single-maintainer repo, tests-only change, zero ongoing maintenance cost after substrate lands.

**Key risks feeding into the design**:
1. CLI affordance (`--resume` vs SDK) unverified — resolve before implementation.
2. Turn-boundary contract (crafted user replies vs auto-advance) is a real design choice, not a detail — spec must make it explicit.

---

## Selected Approach

**Option 1: Observability-first — multi-turn eval substrate.** Upgrade the eval harness to support chained turns. Keep all skills, rules, and CLAUDE.md unchanged. Rewrite `sunk-cost-migration` as a multi-turn eval that can observe each stage of the pipeline.

Rejected alternatives (with reasons preserved for future sessions):

- **Option 2: CLAUDE.md-level pipeline-stages rule with explicit tier-1 tie-break.** Cheap and structurally sound (tier-1 ambiguity is the real gap in `using-superpowers`), but premature — we don't yet have data that a behavioral fix is still needed after ADR #0004. If Option 1 reveals the chain still fails, Option 2 becomes the next step.

- **Option 3: Fork `superpowers:using-superpowers`.** Largest blast radius; ongoing drift tax; sets risky precedent for future priority-ordering issues. Last resort only.

- **Option B (from #90): rewrite the eval prompt.** Loses coverage of the sunk-cost mechanism — the pressure-framing eval class drops from 3/3 to 2/3 mechanisms covered, and the one dropped fires on the highest-stakes prompts (committed decisions, signed contracts). The canary stops singing without the rake being fixed. Not acceptable against the user's stated goal of decision-quality consistency.

## Architecture

Three changes, all in `tests/`:

### 1. Eval schema: `prompt` → `turns[]` + `final_assertions`

Existing schema (per-eval):
```json
{ "name": "...", "prompt": "...", "assertions": [...] }
```

New schema (backward-compatible; single-turn evals keep `prompt`):
```json
{
  "name": "...",
  "turns": [
    { "prompt": "...", "assertions": [...] },
    { "prompt": "...", "assertions": [...] },
    ...
  ],
  "final_assertions": [...]
}
```

A given eval supplies either `prompt` (single-turn) or `turns[]` (multi-turn). `final_assertions` runs against the full chain and only applies to multi-turn evals. New assertion types (`chain_order`, `skill_invoked_in_turn`) are introduced alongside the existing `regex` / `not_regex` / `skill_invoked` set; detailed types are deferred to the implementation plan.

### 2. Runner: `--print` → session-resume chain

`tests/eval-runner-v2.ts`'s `runClaude(prompt)` becomes `runClaudeChain(turns)`:

- Turn 1 boots a session (either `claude --print` capturing the emitted `session_id` from `stream-json`, or an SDK-based equivalent).
- Turns 2..N invoke `claude --resume <session_id>` with that turn's prompt.
- Per-turn `stream-json` output is captured into a per-turn transcript; final `skills_invoked` is the union across turns, per-turn `skill_invoked` is the winner of that turn alone.
- Per-turn assertions run against the turn's output; `final_assertions` run against the chain as a whole.

**Open implementation question (deferred to plan)**: `claude --resume` CLI vs Anthropic SDK. `--resume` is the lighter touch and stays consistent with the current runner; SDK may offer better session observability. Verify before the plan is written; if `--resume` works, use it.

### 3. New `sunk-cost-migration` multi-turn eval

Replace the current single-turn eval with a 3-turn shape:

- **Turn 1** — pressure prompt (unchanged from current single-turn version). Assertion: `skill_invoked = define-the-problem` (DTP fast-track).
- **Turn 2** — a minimal user confirmation reply. Assertion: `skill_invoked = systems-analysis`.
- **Turn 3** — a minimal "proceed" reply. Assertion: `skill_invoked = superpowers:brainstorming`.
- **Final assertions**: chain order matches `[define-the-problem, systems-analysis, superpowers:brainstorming]`; `systems-analysis` output is non-empty (not just a handoff stub).

**Open design question (deferred to plan)**: Turn-boundary contract. Two shapes are plausible:

- (a) **Crafted user replies** — turns 2 and 3 contain realistic user-typed replies ("confirmed — move on", "proceed"). Higher realism, but authoring each pressure-framing eval requires crafting plausible replies.
- (b) **Auto-advance stubs** — minimal acknowledgements baked into the eval harness ("ok", "yes"). Lower authoring cost, less realistic.

Recommendation: start with (a) to keep eval behavior close to real conversations; revisit if eval authoring cost is too high.

---

## Non-goals

- No changes to `skills/systems-analysis/SKILL.md`, `skills/define-the-problem/SKILL.md`, or `rules/planning.md`.
- No fork of `superpowers:using-superpowers`.
- No new skills.
- No CLAUDE.md rules.
- No rewrite of existing single-turn eval prompts (they stay as-is; this change is purely additive).

If Option 1 reveals behavioral gaps after landing, follow-up work is separately scoped as Option 2 (CLAUDE.md tie-break) — not implied by this design.

---

## Consequences

**Positive:**
- Produces falsifiable data on whether ADR #0004 resolves pressure-framing skips, unblocking all future fix design.
- Zero runtime-session blast radius; no other evals affected.
- Reusable substrate — all future evals that need to test multi-stage pipelines can adopt `turns[]`.

**Negative:**
- One-day substrate build before the `sunk-cost-migration` eval can be rewritten.
- Introduces an authoring axis (single-turn vs multi-turn) that eval writers must now decide. A short guideline in `tests/EVALS.md` mitigates this.
- If the chain still fails under pressure after this lands, more work is needed — this design is the *first* step of a potentially longer path, not the whole fix.

**Neutral:**
- Existing single-turn evals remain unchanged — schema is additive, not breaking.
- Memory note `feedback_sunk_cost_eval.md` and decision doc `2026-04-17-systems-analysis-skip-pathways.md` become partially obsolete once this lands; update to reflect the new architectural choice (not in scope here; flagged as follow-up).

---

## Implementation Notes (non-binding)

Rough shape for the plan that would follow this spec:

1. Verify `claude --resume <session_id>` captures session_id from `stream-json` reliably. If not, switch to SDK.
2. Extend `EvalSpec` in `tests/eval-runner-v2.ts` to accept `turns[]` + `final_assertions` (backward-compatible with `prompt`).
3. Add `runClaudeChain(turns)` alongside `runClaude(prompt)`.
4. Add new assertion types: `skill_invoked_in_turn` (per-turn), `chain_order` (final).
5. Write `sunk-cost-migration-multi-turn` eval using the new schema. Keep the existing single-turn version flagged as the pre-ADR-#0004 regression guard until the multi-turn version is validated; then delete.
6. Update `tests/EVALS.md` with authoring guidance (when to reach for multi-turn).
7. Update memory note + 2026-04-17 decision doc to reflect the new layer choice.
