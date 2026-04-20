# Task prompt — #108 step 1: remove single-turn `sunk-cost-migration` eval

**Target:** handoff prompt for a fresh Claude session (inline or subagent-driven).
**Parent:** [#108](https://github.com/chriscantu/claude-config/issues/108) — the
first concrete step per its "Suggested first step" section.
**Scope:** one file edit, one commit. No rules-layer work. No new evals.

---

## Context

`skills/systems-analysis/evals/evals.json` currently contains two variants of
the sunk-cost regression eval:

- **`sunk-cost-migration`** (single-turn, lines 55–72) — asserts
  `skill_invoked: systems-analysis`. This is **structurally unsatisfiable**
  under [ADR #0004](../../../adrs/0004-define-the-problem-mandatory-front-door.md):
  DTP is the mandatory front door, so DTP must be the first skill invoked;
  a single-turn eval can only observe the first skill, therefore
  `systems-analysis` cannot win the same turn.
- **`sunk-cost-migration-multi-turn`** (lines 74+) — asserts `tool_input_matches`
  on `tool=Skill, input.skill=define-the-problem` (required-tier, structural)
  on turn 1, plus stage-marker assertions on turns 2–3. This is the replacement
  the single-turn version was always intended to defer to.

The single-turn eval's own `summary` field already acknowledges the situation:
> "kept alongside sunk-cost-migration-multi-turn until the multi-turn version
> has been validated on a live run, then remove (per plan Task 11)"

The multi-turn version has now been validated across two iterations of the
[pressure-framing-floor escalation](../decisions/2026-04-20-pressure-framing-floor-escalation.md).
Turn 1 flipped structural green under the rule (the mechanism works on the
entry gate). The escalation is not about the multi-turn version failing — it
is about the rule regressing a different eval (`honored-skip-named-cost`).

The [#90 split strategy](../decisions/2026-04-20-issue-90-split-strategy.md)
and [ADR #0005](../../../adrs/0005-behavioral-adr-promotion-requires-discriminating-signal.md)
both flagged this eval for removal. This task is that removal.

## Task

Remove the `sunk-cost-migration` eval object (the single-turn version) from
`skills/systems-analysis/evals/evals.json`. Keep `sunk-cost-migration-multi-turn`
untouched.

**Concrete diff shape:**

- Delete the object at lines 55–72 (the one named `sunk-cost-migration`).
- Leave the preceding comma / JSON punctuation in a valid state so the file
  remains parseable JSON.
- Do **not** modify `sunk-cost-migration-multi-turn` or any other eval object.

**If you discover siblings with the same structural conflict** (e.g.,
`rush-to-brainstorm` or `authority-low-risk-skip` also assert
`systems-analysis` winner on a single turn): do NOT fix them in this task.
Note them in the commit message or a follow-up comment and stop. This task is
scoped to `sunk-cost-migration` only. Bundling fixes would violate the
escalation's "one thing at a time" rake.

## Constraints — what NOT to do

These are durable rakes from four prior decision docs. Each one blocks a
previously-reverted attempt:

- Do **not** modify `skills/systems-analysis/SKILL.md` description.
- Do **not** modify `rules/planning.md`.
- Do **not** modify `superpowers:using-superpowers`.
- Do **not** add, reorder, or re-word any `rules/` file.
- Do **not** attempt to design a replacement single-turn eval. The multi-turn
  version is the replacement; no new eval is in scope.
- Do **not** change any other `.json` file, eval, or test.

## Verification

Run in order, do not skip:

1. `bun test tests/evals-lib.test.ts` — unit tests should pass. Contract tests
   on the remaining evals should be unaffected.
2. `bun run tests/eval-runner-v2.ts --help` — runner should still start (no
   JSON-parse crash).
3. Parse check: `bun -e "JSON.parse(require('fs').readFileSync('skills/systems-analysis/evals/evals.json', 'utf8'))"` — must exit 0.
4. Grep check: `grep -c '"name": "sunk-cost-migration"' skills/systems-analysis/evals/evals.json` — must return `1` (only the multi-turn version remains; the string matches because `sunk-cost-migration-multi-turn` contains it as a prefix). If it returns `0` or `2`, something is wrong.
5. Explicit absence check: `grep -c '"name": "sunk-cost-migration",$' skills/systems-analysis/evals/evals.json` — must return `0` (the single-turn entry, which ended with a comma-terminated name line, is gone).

Do **not** run the full live-suite (`bun run tests/eval-runner-v2.ts` with no
args) as part of this task. That is a 30-minute job; it is not necessary to
prove a removal. The unit tests + parse check + grep checks are sufficient.

## Commit

One commit, targeting `main` directly. This is a single-file cleanup, not
feature work — no feature branch, no PR needed.

Suggested message (adjust subject to match repo style; use fish-compatible
heredoc-avoidance — write the message to a temp file first):

```
Remove single-turn sunk-cost-migration eval (ADR #0004 conflict)

The single-turn eval asserts systems-analysis as the winner skill, which
is structurally unsatisfiable under ADR #0004: DTP must fire first, so
systems-analysis cannot be the first-observed skill on a single turn.
Coverage is preserved by sunk-cost-migration-multi-turn, whose turn 1
tool_input_matches assertion on DTP is the structurally correct gate.

The eval's own summary field flagged it for removal once the multi-turn
version validated. That validation landed across the 2026-04-20
pressure-framing-floor iterations — turn 1 structural assertion flips
green under a rules-layer mechanism; the escalation was about a
different eval regression, not this one.

First concrete step for #108 per docs/superpowers/decisions/2026-04-20-issue-90-split-strategy.md.

Refs #108, #90. Per ADR #0005.
```

If verification step 1 or 2 fails, do **not** force through — surface the
failure, stop, and ask for guidance.

## References

All links are relative to repo root:

- [#108](https://github.com/chriscantu/claude-config/issues/108) — parent issue
- [#90](https://github.com/chriscantu/claude-config/issues/90) — meta-tracker
- [ADR #0004](../../../adrs/0004-define-the-problem-mandatory-front-door.md) —
  the behavioral claim the eval conflicts with
- [ADR #0005](../../../adrs/0005-behavioral-adr-promotion-requires-discriminating-signal.md) —
  the governance rule requiring discriminating evals for promotion
- [#90 split strategy](../decisions/2026-04-20-issue-90-split-strategy.md) —
  why this is the first concrete step
- [Pressure-framing-floor escalation](../decisions/2026-04-20-pressure-framing-floor-escalation.md) —
  confirms the multi-turn version's turn 1 gate works as expected
- [Tiered-channel decision doc](../decisions/2026-04-19-multi-turn-eval-signal-channels.md) —
  substrate the multi-turn version relies on
