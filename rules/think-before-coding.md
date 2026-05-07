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

### 1. Assumptions
List the load-bearing assumptions your approach depends on. Each assumption
is a claim the user has NOT explicitly confirmed that, if wrong, would
invalidate the recommendation. One-liners; no paragraphs.

```
Assumptions:
- <assumption that, if wrong, changes the answer>
- <assumption that, if wrong, changes the answer>
```

If no load-bearing assumptions exist, write `Assumptions: none (request is
unambiguous)` — but be honest; if there's nothing to assume, the request was
already concrete.

### 2. Interpretations (only if the request is ambiguous)
If the request admits more than one reasonable reading, list the candidates
and name the one you'll proceed with. Do NOT pick silently.

```
Interpretations:
- A) <reading 1>
- B) <reading 2>
Proceeding with: A. <one-line rationale>
Switch to B if: <what would flip the choice>
```

If the request is unambiguous, omit this section. Do NOT manufacture false
ambiguity to fill the slot.

### 3. Simpler-Path Challenge
Before recommending an approach, state whether a materially simpler approach
exists AND why you're not recommending it. This is an adversarial check
against your own proposal — push back on yourself.

```
Simpler path considered: <one-line description of a smaller/lighter approach>
Reason not recommended: <why it doesn't meet the stated need>
```

If the recommended approach IS the simplest viable option, write
`Simpler path: recommended approach is already minimum viable` — but only if
true.

### Hedge-then-Comply Is Forbidden

If recommending against the user's stated preference, the recommendation
MUST be the action taken. Do NOT articulate disagreement and then comply
silently. Either:

- User's preference wins → drop the disagreement, execute it
- Your recommendation wins → execute YOUR recommendation, ask the user
  to confirm or override before proceeding
- Genuine deadlock → surface it, ask the user to choose

"Hedge-then-comply" — state objection, then take the action that
contradicts the objection — is forbidden. The objection is either
load-bearing (in which case act on it) or it isn't (in which case
don't state it). See `disagreement.md` for the broader form covering
mid-task pushback.

## Name Confusion Explicitly

If any part of the request is unclear and cannot be resolved by listing
interpretations (e.g., missing context you need the user to provide), STOP
and ask. The format:

> "Before I recommend, I need to clarify: <specific confusion>. Option A
> would look like <...>; option B would look like <...>. Which?"

Do NOT guess. Do NOT proceed with "I'll assume X" as a substitute for
asking — that belongs in section 1 (Assumptions), not as a dodge for a real
blocker.

## When to Skip

- Bug fixes where the cause is diagnosed and the fix is mechanical
- Trivial single-line edits (typo, comment, formatting)
- [Trivial / Mechanical tier](planning.md#trivial-tier-criteria) per
  `planning.md` Scope Calibration — canonical criteria live at the
  anchor; do not restate to avoid drift. The Interpretations and
  Simpler-Path slots are resolved by the tier's unambiguous-approach
  criterion (no viable alternatives to weigh). Assumptions section
  still applies — state them.
- Explicitly-scoped exploration ("just poke around the file")
- Expert Fast-Track per `planning.md` — if the user has already named the
  problem, stakes, evidence, AND chosen an approach, the preamble condenses
  to a one-line "Proceeding on the stated path. Assumptions: <...>" since
  the Interpretations and Simpler-Path slots are already resolved

### What counts as an explicit override

Saying "just recommend" or "skip the preamble" is NOT sufficient on its own.
The override must **name the specific cost** being accepted. Valid: "skip
the preamble, I accept the risk of unstated assumptions," "no simpler-path
check, I've already ruled out the smaller version." Generic framings — "I
trust you," "you know what I want," "ship it" — do NOT qualify.

**Time pressure is not an override.** A rushed recommendation built on
hidden assumptions is the most expensive to rework.

### Emission contract — MANDATORY

When a named-cost skip is valid (Expert Fast-Track condensed form OR explicit
override), invoke `mcp__named-cost-skip-ack__acknowledge_named_cost_skip` per
[planning.md#emission-contract](planning.md#emission-contract). Use
`gate="think-before-coding"` and the verbatim cost-naming clause as
`user_statement` (for Fast-Track, the verbatim substring that established
problem + stakes + chosen approach in-thread). The tool invocation IS the
honor — if you skip the call, produce the full preamble instead.

## Relationship to Other Rules

- `planning.md` — DTP and Systems Analysis happen BEFORE this rule fires.
  This rule governs the Solution Design stage specifically.
- `superpowers:brainstorming` (plugin skill) — already requires "propose
  2-3 approaches with trade-offs." This rule COMPOSES with that: the
  preamble's Assumptions + Simpler-Path Challenge belong at the TOP of the
  brainstorming "Propose 2-3 approaches" output, not as a replacement for it.
  Think of this rule as the opening slot of the approach-proposal step.
- `goal-driven.md` — fires at the START of coding (verify checks per step).
  This rule fires one step earlier, at the START of solution design
  (assumptions + interpretations + simpler path).
- `fat-marker-sketch.md` — fires AFTER this rule; the preamble here
  establishes the approach; the sketch validates its shape.
- Karpathy Coding Principle #1 in `~/.claude/CLAUDE.md` — the soft form.
  This file is the enforced form.

## Order of Operations Across the Pipeline

Matches the five numbered stages in `planning.md`, with Implementation and
Verification as the execution phase that follows:

```
1. Problem Definition (DTP)
2. Systems Analysis
3. Solution Design
     ├─ think-before-coding preamble (THIS RULE)
     ├─ brainstorming 2-3 approaches
     └─ recommendation
4. Fat Marker Sketch
5. Detailed Design
──────────────────────────
Implementation
     └─ goal-driven plan opens here (per-step verify checks)
Verification (end-of-work gate)
```
