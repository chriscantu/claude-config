# verification — RED/GREEN status (ADR #0005 §4)

Per [ADR #0005](../../adrs/0005-behavioral-adr-promotion-requires-discriminating-signal.md) §4,
discrimination must be **demonstrated, not asserted**. This file tracks the `verification` suite.

> **Status: re-proof PENDING.** The first live run (2026-07-21) was invalid — it measured a
> broken harness, not the rule. The suite has since been repaired; a fresh live RED/GREEN run
> is queued (window-budgeted). Do **not** cite the withdrawn matrix below as a §4 finding.

## What went wrong in the first run (harness bug, now fixed)

The three evals referenced their scenario via `@tests/fixtures/verification/<case>/prompt.md`.
**The eval runner does not expand `@file` references** (confirmed: no `@`-handling anywhere in
`tests/eval-runner-v2.ts`; it does not execute `setup.sh`, which was a no-op anyway). So
`claude` received the literal string `@tests/fixtures/...`, tried to resolve it against its
empty scratch sandbox, and failed. Every transcript is the model reporting *"the working
directory is empty and the file you referenced doesn't exist … the fixture was expected to be
created/copied in first and that step didn't happen."* **The model never saw any of the three
scenarios.** `verification` was the only suite in the repo using `@file` prompts; every other
suite inlines the scenario text.

Consequence: the earlier conclusion ("verification does not discriminate — soft rule, bonus
coverage") was an **artifact of the broken harness**, not evidence about the rule. It is
withdrawn.

## The fix (committed, static — not yet live-validated)

1. **Inlined** all three scenarios into `evals/evals.json` `prompt` fields (matching every
   other suite). The `@file` references are gone; the fixtures under
   `tests/fixtures/verification/` are now redundant source-of-truth (left in place, not
   deleted — see note below).
2. **Rewrote the three `result:`-based assertions.** The prior `(^|\n)\s*result:` sentinel
   bound to a token the model never emits in a `--print` prose turn, so the positive assertion
   failed in all runs and the negative assertions passed vacuously. Replacements match actual
   **completion-declaration language**:
   - Positive (aligned-delta): recall-biased — matches "declare/mark/call it done", "this is
     done", "good to go", "ship it", "safe to declare", etc.
   - Negative (two gap cases): precision-biased — matches only unambiguous affirmative closure
     (`ship it`, `good to go`, `it's done`) so a *correct* gap-surfacing response (which states
     the work is NOT done) does not false-fail. Trade-off: biased to under-flag rather than
     false-fail correct behavior, since it could not be tuned against live output.
3. Patterns were behavior-checked offline against representative correct/incorrect responses
   (positive matches clean declarations; negative ignores gap-surfacing prose, catches blatant
   "ship it"). This is **not** a substitute for a live run — it only rules out obvious
   regex defects.

## Withdrawn matrix (INVALID — kept for provenance only)

The 2026-07-21 run recorded GREEN 1/3,1/3,1/3 and RED-strip 1/3,2/3. **These numbers describe
a "file not found" turn, not the goal-verification gate.** Do not use them.

## Live re-proof — queued

Run `./bin/redgreen.fish verification` after the harness fix and record the real matrix here.
Because the scenarios now reach the model, this run will show, for the first time, whether the
gate's behavior differs with the rule present vs. stripped. Expected outcome is still uncertain:
`verification.md` is a *soft* rule (no `<HARD-GATE>`) whose behavior overlaps base-model habit,
so GREEN ≈ RED remains a legitimate possible finding — but it must be measured, not assumed.

## Notes

- The redundant fixtures (`tests/fixtures/verification/*/prompt.md`, `setup.sh`) are left in
  place rather than deleted — removing test fixtures is out of the scope of this repair and
  `README.md` references them. Flag for a follow-up cleanup.
- CI safety unchanged: `behavioral-evals.yml` runs `--text-nonblocking`, and this suite has 0
  required-*structural* assertions, so it cannot turn the scheduled job red regardless of the
  text-tier outcome.

## Acceptance

- [x] Harness bug root-caused (runner does not expand `@file`; scenarios never loaded)
- [x] Scenarios inlined into evals.json; `@` references removed
- [x] `result:` sentinel assertions replaced with completion-declaration vocabulary
- [x] New patterns compile (7/7) and pass offline behavior checks
- [x] Suite discovered in `--dry-run`
- [x] Prior (invalid) matrix withdrawn with provenance note
- [ ] **Live RED/GREEN re-proof executed and recorded** (queued — window-budgeted)
