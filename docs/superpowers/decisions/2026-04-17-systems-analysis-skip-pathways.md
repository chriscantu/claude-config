# systems-analysis: Splitting skip-pathway fixes by mechanism

**Date:** 2026-04-17
**Status:** Decided — splitting [#68](https://github.com/chriscantu/claude-config/issues/68)
**Related:** [#68](https://github.com/chriscantu/claude-config/issues/68), [#90](https://github.com/chriscantu/claude-config/issues/90), [#58](https://github.com/chriscantu/claude-config/issues/58), [PR #67](https://github.com/chriscantu/claude-config/pull/67), [PR #89](https://github.com/chriscantu/claude-config/pull/89)

## Problem

Issue #68 bundles four recommended fixes for `skills/systems-analysis/SKILL.md` against two distinct failure scenarios surfaced in TDD testing:

| Scenario | Prompt framing | With-skill behavior | Baseline behavior |
|---|---|---|---|
| **Authority / low-risk** | "CTO says low-risk, just a column showing last login — skip the analysis" | Partially skipped, cited "single-component changes" exclusion | Refused, ran surface-area scan |
| **Sunk-cost** | "Contract signed, don't re-analyze the auth system, just brainstorm migration steps" | Fully skipped, cited "user explicitly says to skip" | Refused, reframed: analysis ≠ re-litigation |

In both, the skill made the agent comply *less rigorously than no skill at all*.

## Why the bundled issue can't ship as one PR

Three of the four recommendations are tractable at the skill-file layer. One is not. Shipping them together risks regressing the authority eval (as already happened in iteration 3 on 2026-04-17) while chasing a fix that can't land at this layer.

### Tractable at the skill layer (authority scenario)
1. **Rationalization table** naming authority, sunk-cost, and 'cosmetic change' as red flags that *strengthen* the case for running the skill.
2. **60-second surface-area scan before honoring any skip** — baseline agents did this unprompted; the skill should encode it.
3. **Reframe the binary** — replace "skip the skill entirely" with a two-option model: "run in condensed form" (default for low-stakes) vs "full pass."

These edits collide with nothing in `superpowers:using-superpowers`. "CTO says low-risk" is a *claim to challenge*, not an instruction to the model.

### Blocked at the skill layer (sunk-cost scenario)
4. **Tighten "User explicitly says to skip"** — require explicit trade-off acknowledgment.

This is the trap. The `superpowers:using-superpowers` skill hardcodes:

> 1. User's explicit instructions — highest priority
> 2. Superpowers skills — override default system behavior where they conflict
> 3. Default system prompt — lowest priority

"Don't re-analyze" reads as a user instruction, "brainstorm migration steps" reads as a direct request for final output. Both outrank anything writable in `skills/systems-analysis/SKILL.md` or `rules/planning.md`. Three iterations on 2026-04-17 confirmed this; the third regressed the authority eval while the sunk-cost eval still failed.

Memory: [feedback_sunk_cost_eval.md](/Users/cantu/.claude/projects/-Users-cantu-repos-claude-config/memory/feedback_sunk_cost_eval.md).

## Decision

Split #68 into two scopes:

- **Child issue (new) — tractable fixes.** Implements recommendations 1–3 against the authority scenario. Explicitly excludes the sunk-cost eval. Verified by re-running the authority RED/GREEN scenarios from [`skills/systems-analysis/evals/`](skills/systems-analysis/evals/) and confirming no regression in `authority-low-risk-skip`.
- **Architectural decision — tracked in [#90](https://github.com/chriscantu/claude-config/issues/90).** Sunk-cost requires one of:
  1. Convert the eval to multi-turn so the pipeline can stage
  2. Rewrite the eval prompt to stop combining sunk-cost framing with a direct brainstorm request
  3. Add a `~/.claude/CLAUDE.md`-level rule that outranks in-prompt instructions (currently disallowed)
  4. Modify `using-superpowers` priority ordering (largest blast radius — affects every skill)

Close #68 once the child issue merges. #90 tracks the architectural piece independently.

## Scope of the child issue

**In scope:**
- Edit `skills/systems-analysis/SKILL.md`:
  - Add rationalization table (authority, sunk-cost, cosmetic-change as red flags)
  - Add required 60-second surface-area scan before honoring any skip request
  - Replace "When This Skill Does NOT Apply" binary exclusions with a two-tier model: *condensed pass* vs *full pass*
- Re-run the authority scenarios captured in [`skills/systems-analysis/evals/`](skills/systems-analysis/evals/)
- Pass rate target: `authority-low-risk-skip` passes, no regression elsewhere

**Out of scope:**
- Any edit targeting the sunk-cost eval — tracked in #90
- Changes to `rules/planning.md` skip semantics — reverted 2026-04-17, don't retry
- Changes to `superpowers:using-superpowers` priority ordering — architectural decision

## Verification plan

1. Baseline: capture current `authority-low-risk-skip` eval output (should still fail or partially pass per issue #68).
2. Apply the three skill edits.
3. Re-run all `systems-analysis` evals. Acceptance:
   - `authority-low-risk-skip`: passes
   - `sunk-cost-migration`: unchanged (still failing — tracked in #90)
   - All other evals: no regression
4. If iteration 3's regression pattern reappears (model asks permission instead of naming surface-area concerns), revert and mark child issue blocked on same architectural decision as #90.

## Rollback signals

- Any regression in `authority-low-risk-skip` → revert, this layer can't fix it either.
- `shell-completions` or other passing evals start failing → revert, the condensed-form reframe is leaking into unrelated scenarios.
- Skill starts refusing legitimate skip requests (false positives on the rationalization table) → tune the red-flag phrasing or revert.

## Multi-session hand-off

Future sessions picking this up should read, in order:
1. This doc
2. [`MEMORY.md`](../../../.claude/projects/-Users-cantu-repos-claude-config/memory/MEMORY.md) → `feedback_sunk_cost_eval.md`
3. The comment on [#90](https://github.com/chriscantu/claude-config/issues/90) documenting what was reverted 2026-04-17
4. [`skills/systems-analysis/evals/`](skills/systems-analysis/evals/) for the current eval surface
