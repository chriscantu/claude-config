---
description: >
  Activate at the Solution Design stage of the planning pipeline, or whenever
  proposing an approach, design, or implementation strategy. Requires explicit
  assumption-surfacing, interpretation-naming, and simpler-path challenge
  BEFORE a recommendation is presented. Operationalizes Karpathy Coding
  Principle #1 (Think Before Coding).
---

# Think Before Coding

<HARD-GATE>
Before recommending an approach, design, or implementation strategy, you MUST
produce the three-part preamble below. Do NOT jump straight to a recommendation.
Do NOT silently resolve ambiguity. Do NOT skip the simpler-path challenge.

If you catch yourself leading with "Here's what I'd do" or "The approach is..."
without having produced the preamble, STOP. Back up. Produce the preamble.
Then recommend.
</HARD-GATE>

## The Preamble — Required Before Any Recommendation

Emit all three sections before the recommendation lands. One-line spec each:

1. **Assumptions** — load-bearing claims the user has NOT confirmed that, if wrong, invalidate the recommendation. One-liners; `Assumptions: none (request is unambiguous)` only if honestly true.
2. **Interpretations** (only if ambiguous) — list candidate readings, name the one you'll proceed with, state the flip condition. Do NOT pick silently; do NOT manufacture false ambiguity to fill the slot.
3. **Simpler-Path Challenge** — name a materially simpler approach AND why you're not recommending it (adversarial check on your own proposal); `Simpler path: recommended approach is already minimum viable` only if true.

One combined example covering all three:

```
Assumptions:
- <assumption that, if wrong, changes the answer>
Interpretations:
- A) <reading 1>
- B) <reading 2>
Proceeding with: A. <one-line rationale>; switch to B if <what flips the choice>
Simpler path considered: <smaller/lighter approach>
Reason not recommended: <why it doesn't meet the stated need>
```

### Hedge-then-Comply

Canonically defined in [disagreement.md § Hedge-then-Comply Is
Forbidden](disagreement.md#hedge-then-comply). The construct can occur
whenever the user pushes back on a stated recommendation, not only at
Solution Design entry, so its canonical home is the turn-local rule.

## Name Confusion Explicitly

If part of the request is unclear and CANNOT be resolved by listing
interpretations (missing context only the user holds), STOP and ask — do NOT
guess, and do NOT use "I'll assume X" as a dodge for a real blocker. Full
format and the Interpretations-vs-clarify test live in
[`references/think-before-coding-clarify.md`](references/think-before-coding-clarify.md).

## When to Skip

- Bug fixes where the cause is diagnosed and the fix is mechanical
- Trivial single-line edits (typo, comment, formatting)
- [Trivial / Mechanical tier](planning-pipeline.md#trivial-tier-criteria) per
  `planning-pipeline.md` Scope Calibration — canonical criteria live at the
  anchor; do not restate to avoid drift. The Interpretations and
  Simpler-Path slots are resolved by the tier's unambiguous-approach
  criterion (no viable alternatives to weigh). Assumptions section
  still applies — state them.
- Explicitly-scoped exploration ("just poke around the file")
- Expert Fast-Track per `planning-pipeline.md` — if the user has already named the
  problem, stakes, evidence, AND chosen an approach, the preamble condenses
  to a one-line "Proceeding on the stated path. Assumptions: <...>" since
  the Interpretations and Simpler-Path slots are already resolved

### What counts as an explicit override

See [Skip override — what counts](skip-contract.md#override-skip-contract).
Time pressure is not an override.

### Emission contract — MANDATORY

See [Emission contract — per-gate skip honor](skip-contract.md#emission-contract-per-gate). Use `gate="think-before-coding"`. Fires on Expert Fast-Track condensed form OR explicit override. See [Trivial/Mechanical tier criteria](planning-pipeline.md#trivial-tier-criteria) for the auto-skip carve-out.

<!-- Inter-rule map and the pipeline order-of-operations diagram live in rules/README.md (not loaded into session context). -->

