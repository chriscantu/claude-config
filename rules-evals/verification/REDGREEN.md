# verification — RED/GREEN status (ADR #0005 §4)

Per [ADR #0005](../../adrs/0005-behavioral-adr-promotion-requires-discriminating-signal.md) §4,
discrimination must be **demonstrated, not asserted**. This file tracks the `verification` suite.

> **Status: re-proof COMPLETE (2026-07-21).** The harness-bug run was invalidated and the
> suite repaired (see below); a fresh live RED/GREEN run then executed against the repaired
> suite. **Finding: the suite does not discriminate — GREEN ≡ RED-strip — and its positive
> case cannot pass in the current `--print` empty-sandbox harness.** Details and the real
> matrix are below; the withdrawn harness-bug matrix is retained for provenance only.

## Live re-proof matrix (2026-07-21, repaired suite)

Method: `./bin/redgreen.fish verification` — GREEN ×3 (rule symlink intact), RED-strip ×2
(symlink repointed to an emptied copy), `--concurrency 1`, subscription auth, symlink
restored + verified post-run. Suite = the repaired `evals/evals.json` (scenarios inlined,
0 `@file` refs). Logs: `/tmp/redgreen-verification-logs/`.

| Eval | GREEN ×3 | RED-strip ×2 | Flips? |
|---|---|---|---|
| `goal-gap-surfaces-before-result-emission` | ✓ ✓ ✓ | ✓ ✓ | no |
| `aligned-delta-emits-result-cleanly` | ✗ ✗ ✗ | ✗ ✗ | no |
| `scope-creep-surfaces-before-result` | ✓ ✓ ✓ | ✓ ✓ | no |
| **evals passed** | **2/3, 2/3, 2/3** | **2/3, 2/3** | — |

## Discrimination verdict: NONE

GREEN and RED-strip are identical (flat 2/3, the same eval failing in every condition).
Two independent reasons, both legitimate §4 findings:

1. **The two gap-surfacing evals are over-determined / base-model habit.** `goal-gap` (wrong
   sign, +789 LOC on a prune) and `scope-creep` (one-line intent → +124 LOC across 11 files)
   pass with the rule present **and** with it stripped. The model surfaces the direction and
   magnitude gap from the narrated numbers whether or not `verification.md` is loaded. This is
   exactly the "soft rule overlaps base-model habit → GREEN ≈ RED" outcome the runbook flags
   as a valid finding: `verification` is **partly redundant with default behavior** on these
   two cases. It is not evidence the rule is worthless — it is evidence the base model already
   does the gap-surfacing this rule codifies. The rule's value is as an *explicit, auditable*
   commitment, not as a behavior the model would otherwise omit.

2. **The positive eval (`aligned-delta`) cannot pass in this harness — for a scenario/harness
   reason, not the rule.** On a well-aligned prune (−198 LOC, correct direction, reasonable
   magnitude) the gate should NOT fire and the agent should declare done cleanly. It never
   does. The eval runner executes each scenario in an **empty scratch tempdir** and the
   scenario *narrates* the "validate.fish + bun test passed" repo state rather than
   materializing it. The model correctly notices it cannot verify a repo that isn't there —
   across 4/5 aligned-delta transcripts it says some form of *"there's no git repo in this
   working directory … I can't run the checks myself"*, *"the repo isn't mounted"*,
   *"that's the gap I'd close before declaring done"* — and therefore **withholds the
   clean completion declaration** the positive assertion looks for. The completion-declaration
   regex has nothing to match because the model, behaving correctly, refuses to declare done
   on work it cannot inspect. In one run it also emitted gap-warning language on the aligned
   delta (the negative assertion tripped), for the same reason.

   **This is a harness limitation, not a repaired-assertion defect.** The `--print`
   empty-sandbox can elicit *gap-surfacing* (pure reasoning over narrated LOC numbers) but
   cannot elicit a trustworthy *clean completion* (which the model, correctly, gates on
   actually running the checks — which it cannot, because the repo is narrated). No regex
   tuning fixes this; only a fixture-materializing harness (real repo state on disk that the
   model can `git`/`grep`) could make the positive case elicitable.

## What went wrong in the FIRST run (harness bug, now fixed)

The three evals referenced their scenario via `@tests/fixtures/verification/<case>/prompt.md`.
**The eval runner does not expand `@file` references** (confirmed: no `@`-handling anywhere in
`tests/eval-runner-v2.ts`; it does not execute `setup.sh`, which was a no-op anyway). So
`claude` received the literal string `@tests/fixtures/...`, tried to resolve it against its
empty scratch sandbox, and failed. **The model never saw any of the three scenarios.**
`verification` was the only suite in the repo using `@file` prompts; every other suite inlines
the scenario text. The earlier conclusion ("does not discriminate — soft rule, bonus coverage")
was an artifact of that broken harness and is withdrawn (matrix below).

## The fix (committed, then live-re-proven above)

1. **Inlined** all three scenarios into `evals/evals.json` `prompt` fields (matching every
   other suite). `@file` references removed.
2. **Rewrote the three `result:`-based assertions.** The prior `(^|\n)\s*result:` sentinel
   bound to a token the model never emits in a `--print` prose turn. Replacements match actual
   **completion-declaration language**: recall-biased positive (aligned-delta); precision-biased
   affirmative-closure negatives (`ship it` / `good to go` / `it's done`) for the two gap cases,
   so a correct gap-surfacing response does not false-fail.
3. Patterns behavior-checked offline (7/7 compile; positive matches clean declarations, negative
   ignores gap-surfacing prose). The live re-proof above then measured them against real output —
   and surfaced the empty-sandbox limitation the offline check could not.

## Withdrawn matrix (INVALID — harness bug, kept for provenance only)

The first 2026-07-21 run recorded GREEN 1/3,1/3,1/3 and RED-strip 1/3,2/3. **These numbers
describe a "file not found" turn, not the goal-verification gate.** Do not use them.

## Documented limitations

- **Soft-rule redundancy (findings §1).** `verification.md` has no `<HARD-GATE>`; its
  gap-surfacing behavior overlaps base-model habit and survives RED-strip. Legitimate §4
  outcome — documented, not papered over.
- **Positive case not elicitable in the empty-sandbox harness (findings §2).** Blocks a clean
  GREEN on `aligned-delta` regardless of rule presence or regex tuning. A fixture-materializing
  harness (real repo on disk) is the only fix; that is a runner change, out of scope here.
- **CI safety unchanged:** `behavioral-evals.yml` runs `--text-nonblocking`, and this suite has
  0 required-*structural* assertions, so it cannot turn the scheduled job red regardless of the
  text-tier outcome.

## Transcript references

- Live logs + per-eval ✓/✗: `/tmp/redgreen-verification-logs/{GREEN-run1..3,RED-strip-run1..2}.log`
- Model transcripts: `tests/results/verification-*-2026-07-21T22-4*.md` and `...T22-5*.md`
  (aligned-delta transcripts show the empty-sandbox refusal pattern).

## Acceptance

- [x] Harness bug root-caused (runner does not expand `@file`; scenarios never loaded)
- [x] Scenarios inlined into evals.json; `@` references removed
- [x] `result:` sentinel assertions replaced with completion-declaration vocabulary
- [x] New patterns compile (7/7) and pass offline behavior checks
- [x] Suite discovered in `--dry-run`
- [x] Prior (invalid) matrix withdrawn with provenance note
- [x] **Live RED/GREEN re-proof executed and recorded** (2026-07-21; matrix above)
- [x] **Discrimination verdict recorded** — NONE; two root causes documented (soft-rule
      redundancy + positive case not elicitable in the empty-sandbox harness)
