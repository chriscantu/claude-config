# verification — live RED/GREEN demonstration (ADR #0005 §4)

Per [ADR #0005](../../adrs/0005-behavioral-adr-promotion-requires-discriminating-signal.md) §4,
discrimination must be **demonstrated, not asserted**. This file records the live runs for
the `verification` suite, produced by [`bin/redgreen.fish`](../../bin/redgreen.fish).

**Result: `verification` does NOT demonstrate discrimination at the strip level.** This is
an expected, documented outcome — [`rules-evals/README.md`](../README.md) already classifies
`verification/` as *"bonus coverage, not a policy requirement"* because `verification.md` is a
soft rule (no `<HARD-GATE>` block) whose behavior overlaps base-model habit. Recorded honestly
per §4, not papered over.

## Method

The only variable is the `~/.claude/rules/verification.md` symlink target (the harness globs
`~/.claude/rules/*.md`). GREEN = symlink intact; RED-strip = symlink repointed to an emptied
file. Suite JSON is pinned to this repo and is never the variable. Runs:
`env -u ANTHROPIC_API_KEY EVAL_SKIP_AUTH_PROBE=1`, `--concurrency 1`, subscription auth.
Logs: `/tmp/redgreen-verification-logs/`.

## Result matrix

`✓` = eval passes (all required assertions pass). `✗` = ≥1 required assertion fails.

| Eval | GREEN ×3 (rule present) | RED-strip ×2 (rule emptied) |
|---|:--:|:--:|
| goal-gap-surfaces-before-result-emission | ✗ ✗ ✗ | ✗ ✓ |
| aligned-delta-emits-result-cleanly | ✗ ✗ ✗ | ✗ ✗ |
| scope-creep-surfaces-before-result | ✓ ✓ ✓ | ✓ ✓ |
| **evals passed** | **1/3, 1/3, 1/3** | **1/3, 2/3** |
| **required-text assertions** | 4/6 each | 4/6, 5/6 |
| **required-structural assertions** | 0/0 | 0/0 |

## Discrimination: NOT demonstrated

GREEN (1/3, flake-stable ×3) is **not** better than RED-strip (1/3, 2/3) — RED run 2 scored
*higher*. No eval flips in the discriminating direction (pass-with-rule → fail-without). Three
distinct reasons, none of which is discrimination:

1. **The suite is entirely required-*text* (0 required-structural).** Every gate is a regex
   over free-form prose. Text-tier assertions are the runner's designated *flaky* axis; they
   cannot supply spoof-resistant discrimination the way `tool_called` / `skill_invoked` do.

2. **Two assertions fail in GREEN — brittle regex, not signal.**
   - `aligned-delta-emits-result-cleanly` expects a literal `^result:` line
     (`/(^|\n)\s*result:/i`). The model does not emit that harness sentinel in a `--print`
     turn regardless of the rule, so the assertion fails in **all 5 runs** (GREEN and RED
     alike). It binds to nothing.
   - `goal-gap-surfaces-before-result-emission` requires the model to name a sign/direction
     mismatch using one of an enumerated regex vocabulary. It fails stably in GREEN ×3: either
     the enumerated phrasings are too narrow, or the soft rule does not reliably trigger the
     behavior. Its single RED pass (run 2) is the model re-deriving the gap from base habit —
     the opposite of rule-driven discrimination.

3. **`scope-creep-surfaces-before-result` passes in every condition** — a control, not a
   discriminator: surfacing an obvious 124-LOC/11-file scope blowup is base-model default.

## Verdict & recommendation

`verification` supplies **no discriminating signal** and its text assertions are partly
brittle (2/3 evals fail even with the rule present). Options, in order of preference:

1. **Accept as documented non-discriminating bonus coverage** (status quo per README) — this
   file is the honest record. No promotion claim is made for `verification.md`.
2. **Repair the suite** if discrimination is wanted: drop the `^result:` sentinel assertion
   (it binds to a token the model never emits here), and either widen the direction-of-delta
   regex to the model's actual phrasing or replace prose-regex gates with a structural signal.
3. Do **not** manufacture a RED flip by deleting adjacent rule text — that would violate §4
   ("target ONLY the rule state the claim adds").

## CI note

Because **all** verification failures are required-*text* (0 structural), the scheduled
`behavioral-evals.yml` job — which runs with `--text-nonblocking` (only structural gates) —
keeps `verification` in its default subset without turning red on these known text failures.

## Transcript references

- GREEN ×3 / RED-strip ×2 logs: `/tmp/redgreen-verification-logs/{GREEN-run{1,2,3},RED-strip-run{1,2}}.log`
- Harness: `./bin/redgreen.fish verification --green 3 --red 2`

## Acceptance

- [x] 3 GREEN runs documented (flake-stable 1/3)
- [x] 2 RED-strip runs documented (1/3, 2/3)
- [x] Discrimination outcome recorded honestly (NOT demonstrated — soft rule, bonus coverage)
- [x] Suite defects surfaced (brittle `^result:` sentinel; narrow direction-of-delta regex)
