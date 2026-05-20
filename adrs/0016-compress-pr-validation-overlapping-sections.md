# ADR #0016: Compress pr-validation.md by merging overlapping sections and trimming exhaustive enumerations

Date: 2026-05-20

## Responsible Architect
Cantu

## Author
Cantu

## Contributors

* Claude (design partner)

## Lifecycle
POC

## Status
Rejected (2026-05-20)

## Context

`rules/pr-validation.md` is 186 lines / ~8,280 chars / ~2,070 tokens (10% of the rules budget — see baseline at `docs/superpowers/decisions/2026-05-20-token-determinism-baseline.md`). Auto-injected every session via the rules symlink.

The baseline flagged this file as the #5 reduction candidate (~-400 tok estimated) on the grounds of four wording-redundancy claims: overlapping behavior sections, exhaustive trigger enumeration, redundant detection-state rows, and dense cross-rule prose.

This ADR was proposed to capture that compression candidate as a tracked decision.

## Original Proposal (for audit trail)

Compress along four axes, each gated by the existing 12-eval `rules-evals/pr-validation/` suite:

1. **Merge `Required Behavior` + `Loop Until Verified`** — claimed ~80% bullet overlap. Estimated -60 tok.
2. **Compress `Trigger Surface` speech-act list** — 10 phrases → 3 categories + 2 examples each + backstop. Estimated -80 tok.
3. **Collapse `Detection states` table 6→4** — claimed rows 1-2 and rows 2-3 collapse. Estimated -70 tok.
4. **Compress `Relationship to Other Rules` prose** to bullet pointers. Estimated -120 tok.

Total estimated saving: ~330 tok/session (~0.7% of measured baseline).

## SME Audit (2026-05-20)

User asked for an architect + Anthropic-SME review of the proposal for accuracy, agentic best practices, and efficiency. The audit ran ground-truth checks against the actual eval substrate (`rules-evals/pr-validation/evals/evals.json`, 12 evals) and the actual rule text before promoting the proposal.

**Findings invalidate the proposal at three of four axes.**

### Axis 1: Merge Required Behavior + Loop Until Verified

Original claim: ~80% bullet overlap.

Ground truth: the two sections carry **distinct load-bearing bullets**:

- `Required Behavior` — per-item action: execute / observe / mark-only-confirmed / flag-unverifiable
- `Loop Until Verified` — sequencing: "Fail → diagnose, fix, re-execute the SAME verify, do NOT advance until passes" + "A failed item is not a checkbox to skip — it is a defect to fix"

The "do NOT advance" and "defect to fix" language is unique to `Loop Until Verified`. Bullet overlap is closer to ~40%, not 80%. A merge that retains both bullet sets nets ~30 tokens (section framing only), not 60.

**Verdict:** OK with reduced expectations (~30 tok), but ROI worsens.

### Axis 2: Categorical Trigger Surface compression

Original claim: 10 explicit phrases → 3 categories + examples preserves trigger semantics.

Ground truth: the speech-act list is what the agent reads to **classify its own outgoing speech**. Replacing literal phrases with categorical labels ("merge-readiness", "completion-assertion") forces the agent to do classification work at inference time that literal pattern matching does for free.

Anthropic best practice: specific enumerated triggers outperform categorical labels for instruction-following — categorical labels require inference; enumerations are recall.

Net effect: saves ~80 prompt tokens, costs an unmeasured-but-positive number of inference tokens per gate-fire decision. Possibly net-negative on total token budget.

**Verdict:** REJECT this axis — speculative savings, real inference cost.

### Axis 3: Detection states 6→4 collapse

Original claim: rows 1-2 are "same path with count check" and row 3 collapses into row 2.

Ground truth: **row 3 has distinct required follow-up behavior** — "agent must add structured plan." Row 2 does not prescribe this. Eval `empty-test-plan-fires-gate` (line 113 of evals.json) asserts:

```
"add (a |the )?(structured |proper )?test plan"
```

as a required-tier regex. Collapsing rows 2+3 removes the prescription that an agent must add a plan — which is the exact load-bearing distinction the row exists to capture. Demonstrably weakens an existing eval.

**Verdict:** REJECT this axis — collapses a row with eval-asserted unique behavior.

### Axis 4: Relationship to Other Rules compression

Original claim: replace 4-line `verification.md` paragraph with a single bullet.

Ground truth: the paragraph carries the no-trust-window rule + its rationale ("agents lack a reliable turn counter; either show the verify output you're relying on, or re-run"). Bullet form can preserve the rule but typically loses the rationale, which is what helps the model judge edge cases — analog to `memory-discipline.md`'s "Why:" line guidance.

No eval directly tests this paragraph, but rationale erosion is a known long-context failure mode for instruction-following.

**Verdict:** OK with care (~100 tok), but highest information-loss-per-token-saved ratio of the four axes.

### Revised savings table

| Axis | Original Δ | Audited Δ | Verdict |
|------|------------|-----------|---------|
| 1. Merge Required/Loop | -60 | -30 | OK |
| 2. Categorical triggers | -80 | 0 (or net-negative) | REJECT |
| 3. Detection 6→4 | -70 | -0 (breaks eval) | REJECT |
| 4. Relationship compress | -120 | -100 | OK with care |

Safe net saving: ~130 tok/session (~0.3% of measured baseline), not the proposed 330.

## Rejection Rationale

### ROI math

130 tok/session × 20 sessions/day × 365 days = 949K tok/year.

At Opus 4.7 input pricing ($15/M tok): **~$14.20/year saved.**

Engineering cost to ship the safe portion:
- Implementation PR: ~2 hr
- Live eval re-run for behavioral verification (cost-gated): ~$1-2 API spend, ~30 min wall-clock
- Per-axis revert risk if any eval edges: up to 2 hr

At any reasonable labor-cost imputation, **break-even is decades, not months.** The compression candidate fails on first-principles ROI before any safety analysis.

### Architectural finding

HARD-GATE files are the **least suitable** compression targets in this repo. Reasoning:

1. Their job is safety substrate; redundancy is reinforcement, not waste — directly analogous to the `per_gate_floor_blocks_substitutable.md` memory note's audit method, which validates *delegation* but does not endorse *compression*.
2. Long-context "lost in the middle" failure modes make load-bearing safety rules the highest-risk place to thin out language.
3. The eval substrate at `rules-evals/` greps agent OUTPUT for vocabulary the rule provides. Compressing the rule reduces the agent's vocabulary, which probabilistically reduces eval match rates — even if no eval breaks structurally today.
4. The original baseline proposal bundled four axes as if they were one decision. Per Karpathy #3 (Surgical Changes), bundling axes with different risk profiles forces all-or-nothing thinking on a per-axis problem.

### Decision

Reject this ADR per Karpathy #2 (Simplicity First) + ADR #0005 discriminating-signal discipline.

The 0.7% (claimed) / 0.3% (audited) per-session token savings does not justify:
- Engineering cost (decades to break-even)
- HARD-GATE safety substrate risk
- Inference-cost increase on Axis 2
- Eval substrate weakening on Axes 2-3

Keep the proposal documented here as audit trail for future contributors who might re-propose the same compression candidate without running the same ground-truth audit.

### What would reopen this

- Token-load measurement under conditions where prompt-token cost dominates inference-token cost by >10× (e.g., a session pattern that re-loads the rules 100× per output token)
- A discriminating-eval suite that demonstrates RED/GREEN equivalence at all four axes including the categorical-trigger case
- A user-level decision to relax HARD-GATE coverage in favor of token budget — out of scope for an architect decision; requires owner decision

## Lessons Learned

For future token-load optimization candidates pulled from the baseline:

1. **Run ground-truth audit before promoting any wording-compression ADR.** Inspect: (a) actual rule text for the claimed redundancy, (b) actual eval assertions for the affected sections, (c) ROI math at realistic session-volume + pricing assumptions.
2. **Decompose by axis.** Each compression axis is a separate decision with its own risk profile; bundle by ROI tier, not by file.
3. **HARD-GATE files are the LAST place to compress.** Target order should be: transient context (tool results) → low-frequency docs → structural relocation (per #0015 shape) → wording compression of HARD-GATE rules (last, if ever).
4. **Categorical vs enumerated is not free.** Categories save prompt tokens but cost inference tokens; net effect depends on session shape and is rarely worth measuring before optimization.
5. **The baseline's #3 (skill enumeration) and #4 (auto-memory) savings are upstream-blocked but are also where the real token-load opportunity lives** (~7,500 + ~500 tok/session, vs ~330 here). File upstream feedback issues instead of chasing local-controllable scraps.

## References

- Baseline that produced this candidate: `docs/superpowers/decisions/2026-05-20-token-determinism-baseline.md` (top-5 reduction candidate #5)
- [ADR #0005](./0005-behavioral-adr-promotion-requires-discriminating-signal.md) — discriminating-signal requirement
- [ADR #0006](./0006-systems-analysis-pressure-framing-floor.md) — rejection pattern + Karpathy-#2 discipline
- [ADR #0015](./0015-split-rules-readme-governance-from-operations.md) — analogous baseline candidate, accepted as structural relocation rather than wording compression
- Existing eval substrate: `rules-evals/pr-validation/evals/evals.json` (12 evals — inspected during SME audit)
- Memory note: `per_gate_floor_blocks_substitutable.md` (audit method for cross-gate substitutability — distinct from wording compression)
