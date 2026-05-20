# ADR #0016: Compress pr-validation.md by merging overlapping sections and trimming exhaustive enumerations

Date: 2026-05-20

## Responsible Architect
Cantu

## Author
Cantu

## Contributors

* Claude (design partner)

## Lifecycle
Steady-state

## Status
Proposed

## Context

`rules/pr-validation.md` is 186 lines / ~8,280 chars / ~2,070 tokens (10% of the rules budget — see baseline at `docs/superpowers/decisions/2026-05-20-token-determinism-baseline.md`). Auto-injected every session via the rules symlink.

Wording analysis identifies four sources of token redundancy without semantic loss:

1. **`Required Behavior` (lines 82-90) duplicates `Loop Until Verified` (lines 153-165).** Both restate: execute each item, observe pass/fail, mark only confirmed, flag unverifiable items. The two sections cite different aspects (per-item action vs loop semantics) but the operative bullets overlap ~80%.
2. **`Trigger Surface` speech-act enumeration (lines 32-35) lists 10 specific phrases plus "Any equivalent phrase."** Per the file's own admission ("Speech-act detection is fuzzy by nature"), the catch-all is what carries the load. Compressing to 2-3 categorical buckets (completion-assertion / merge-readiness / shipping-language) plus the "Any equivalent" backstop preserves the trigger semantics and matches the fuzzy detection model.
3. **`Detection states` table has 6 rows where 4 carry distinct logic.** Rows 1-2 (header present + ≥1 item / + 0 items) are the same path with a count check. Rows 5 (gh unavailable) and 6 (fork without push) are distinct, but row 3 (header absent + prose) collapses into row 2 (no items found = gate fires).
4. **`Relationship to Other Rules` prose (lines 167-186) is dense restatement of cross-rule semantics already captured by anchored deep-links elsewhere.** The `goal-driven.md` ↔ `pr-validation.md` bracketing relationship is described in three different sentences spanning 4 lines.

The four exits in §Emission contract (lines 143-151), the carve-out mechanical adjudication (lines 99-121), the trigger surface fuzz-tolerance commentary (lines 37-39), and the action-bound trigger list (lines 41-49) are NOT compression candidates — each carries discriminating semantics that the existing eval suite (`rules-evals/pr-validation/`, 12 evals) tests for.

Forces in tension:
- **Token budget vs literal-trigger detectability** — the explicit phrase list aids both human readers and eval grep-style assertions; categorical compression risks weakening eval discrimination
- **Wording compression vs HARD-GATE semantic stability** — every load-bearing claim in this file has shipped through PR review; "obvious overlap" between sections often masks a load-bearing distinction
- **Existing eval coverage as safety net** — 12 evals at `rules-evals/pr-validation/` test trigger firing, carve-out adjudication, fork-fallback announcement, and emission-contract enforcement. They are the discriminating signal that proves a compression is safe.

This ADR differs from [ADR #0015](./0015-split-rules-readme-governance-from-operations.md) in shape: #0015 was structural relocation (split into two files, change auto-load surface); this is in-file wording compression with no file-count or load-surface change.

## Decision

We will compress `rules/pr-validation.md` along four axes, each gated by the existing `rules-evals/pr-validation/` 12-eval suite:

1. **Merge `Required Behavior` + `Loop Until Verified` into a single `Required Behavior — execute and loop` section.** Preserve all four bullets from each (execute / observe / mark-only-confirmed / flag-unverifiable + pass-action / fail-action / cannot-verify-action). Eliminate the duplicate framing prose. Estimated −60 tokens.

2. **Compress `Trigger Surface` speech-act list from 10 explicit phrases to 3 categories + 2 representative examples each.** Preserve the "Any equivalent phrase asserting completion of the PR scope" backstop verbatim. Categories: completion-assertion ("done", "complete"), merge-readiness ("ready to merge", "good to go"), shipping-language ("shipping this"). Estimated −80 tokens.

3. **Collapse `Detection states` table from 6 rows to 4** by merging "header absent + prose" into "header present + 0 items" (both → gate fires with empty-plan-found semantics). Keep distinct: standard flow, empty plan, no-remote-PR, gh-unavailable hard-fail, fork-without-push. Estimated −70 tokens.

4. **Compress `Relationship to Other Rules` prose** to bullet pointers without re-narrating each relationship. Replace 4-line `verification.md` paragraph with a single bullet citing the no-trust-window rule + a delegate link. Estimated −120 tokens.

**Total estimated saving: ~330 tokens (~16% of file, ~0.7% of measured per-prompt baseline).** Below initial estimate (−400) but conservative — the baseline includes the four compression axes only, not commentary lines that may also trim.

Pre-merge discriminating eval gate (per ADR #0005):
- All 12 existing `rules-evals/pr-validation/` evals must pass on the compressed file with no assertion language adjustments. A failure means the compression removed load-bearing semantics; the compression is reverted at that axis and re-scoped.
- The eval suite's existing RED/GREEN discrimination at trigger-firing, carve-out adjudication, fork-fallback, and emission-contract boundaries IS the safety substrate — no new evals required.
- Verification command in the implementation PR's test plan: `bun run tests/eval-runner-v2.ts --dry-run pr-validation` for schema, then live N=2 run for behavioral discrimination IF cost-authorized at merge time.

## Consequences

Positive:
- **~330 token savings per session** on a HARD-GATE-protected file with existing eval coverage. Lower per-PR token-load reduction than #0015 but lower risk.
- Compressed sections become easier to scan — the duplicate-overlap between `Required Behavior` and `Loop Until Verified` actively obscures the gate's flow on first read.
- Categorical trigger list reduces grep-style false-positives (10 specific phrases vs 3 categories with examples narrows the match surface for unintended trigger fires in agent prose).

Negative:
- **Categorical trigger compression weakens literal-phrase matching for evals or third-party tooling that grep on exact strings.** Existing 12 evals don't appear to do this (they test fired-vs-not-fired behavior, not literal-phrase enumeration), but any future eval that asserts presence of specific trigger phrases would break. Mitigation: keep representative examples in-line so grep paths see them.
- **Wording compression cannot be reversed cheaply** — once merged, distinguishing original from rewritten requires git blame archaeology. Documentation drift over multiple compression rounds is a known failure mode.
- **`Relationship to Other Rules` prose loss removes context for new contributors** who don't yet know what bracketing means. Mitigation: keep at least one full sentence per related rule, not just bare bullets.

Neutral:
- File line count drops from ~186 to ~155-160. No anchor changes — all `<a id="…">` and section headers preserved. Validator phases 1f, 1j, 1l have no new registrations needed.
- The carve-out adjudication section (lines 99-121) is intentionally NOT compressed — its load-bearing role in the four-exit gate (per `rules/pr-validation.md` §Emission contract) requires the mechanical-check wording to remain exact.

## Implementation gate

Per ADR #0005 and the rules/README.md HARD-GATE cap policy: this ADR cannot be marked Accepted until an implementation PR demonstrates that all 12 evals at `rules-evals/pr-validation/` pass on the compressed file (RED/GREEN equivalence with the current file). If even one eval fails, the corresponding compression axis is reverted, the ADR scope shrinks to the remaining axes, and the gate re-runs.

Compression PR test plan must explicitly include the `bun run tests/eval-runner-v2.ts pr-validation` invocation as an unchecked item (cost-gated if live N=2 needed).

## References

- Baseline that produced this candidate: `docs/superpowers/decisions/2026-05-20-token-determinism-baseline.md` (top-5 reduction candidate #5)
- ADR #0005 (discriminating-signal requirement)
- ADR #0015 (split rules/README.md — analogous shape, different mechanism)
- Existing eval substrate: `rules-evals/pr-validation/evals/evals.json` (12 evals)
