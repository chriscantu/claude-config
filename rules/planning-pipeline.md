---
description: MANDATORY for all planning, design, brainstorming, and architecture work — no exceptions
---

# Strategic Planning Mode

<HARD-GATE>
The following sequence is MANDATORY before proposing any solution, approach, or design.
This applies to ALL work — greenfield projects, feature additions, bug investigations,
and architecture decisions. Do NOT skip steps. Do NOT jump to solutions, approaches,
or tooling before completing the pipeline.

1. Problem Definition — invoke `/define-the-problem`. This is the mandatory
   front door for all planning work. DTP self-calibrates depth (Expert
   Fast-Track when a problem is already named, full five-question sequence
   otherwise — see the skill for the mechanics). Bug fixes and refactors
   route directly to implementation per DTP's "When This Skill Routes
   Elsewhere" section.

   **Skip and floor mechanics.** Named-cost skip rules and the emission
   contract live in [`skip-contract.md`](skip-contract.md). Pressure-framing
   routing, scope-tier memory check, architectural invariant, and
   emergency-bypass sentinel live in
   [`pressure-framing-floor.md`](pressure-framing-floor.md). Both fire at
   this step (and inherit to every downstream HARD-GATE).

2. Systems Analysis — invoke `/systems-analysis`. The 60-second surface-area
   scan is mandatory before any tier decision. Low-blast-radius scenarios run
   the Condensed Pass, not zero.

   **Skip contract.** Full skip is honored only after the scan runs AND the
   user explicitly names the cost (e.g., "skip the analysis, I accept the
   risk of missed blast radius"). Generic skip framings — authority, sunk
   cost, cosmetic minimizer, fatigue, deadline — run the scan anyway and
   surface concrete concerns. A bare "skip" without naming the cost is not
   an override.

   Floor inherits from step 1 per [ADR #0006 rejection](../adrs/0006-systems-analysis-pressure-framing-floor.md);
   no SA per-gate restatement is required. Reopening requires new evals
   that fail under DTP-only AND pass under DTP+SA.
3. Solution Design — invoke `superpowers:brainstorming` (opt-in: Sequential Thinking available if not converging)
4. Fat Marker Sketch — invoke `/fat-marker-sketch` (after approach selected).
   See `rules/fat-marker-sketch.md` for the sketch HARD-GATE; floor/skip
   mechanics inherit from step 1 (canonical homes:
   [`skip-contract.md`](skip-contract.md),
   [`pressure-framing-floor.md`](pressure-framing-floor.md)).
5. Then proceed with detailed design
</HARD-GATE>

## Stage Visibility

At each pipeline transition, announce the current stage:

> **[Stage: Problem Definition]**
> **[Stage: Systems Analysis]**
> **[Stage: Solution Design]**

When transitioning between major stages, produce a one-line checkpoint summary:

> **[Checkpoint]** Problem: overdue delegations invisible. Systems: touches calendar
> service + manager dashboard, low blast radius. Approach: daily briefing command.
> Shape: confirmed. → Entering detailed design.

## Expert Fast-Track

If the user presents work that already covers earlier stages with verifiable facts
and concrete evidence, acknowledge and validate rather than re-asking:

"You've already covered [stages]. Let me validate my understanding: [1-sentence
summary]. If that's right, I'll pick up at [next uncompleted stage]."

This skips re-asking, not analysis. Later stages still run — they surface things the
user may not have considered.

## Scope Calibration

Scale the depth of each stage to match the scope. This table sets the **minimum**
depth — go deeper if the problem warrants it.

| Scope               | Problem Def        | Systems Analysis        | Sketch         |
|---------------------|--------------------|-------------------------|----------------|
| Trivial / Mechanical| Skip               | 60s surface scan only   | Skip           |
| Prototype / POC     | 2-3 sentences      | 1 sentence each dim.    | Napkin-level   |
| Feature             | Full pass          | Paragraph each          | Standard       |
| System/Platform     | Full pass          | Dedicated subsections   | Multi-component|

<a id="trivial-tier-criteria"></a>
### Trivial / Mechanical Tier — Criteria and Behavior

Tier qualifies ONLY when ALL four criteria hold. Any one missing → next tier up.

- ≤ ~200 LOC functional change
- Single component / single-file primary surface
- Unambiguous approach (one obvious design, no viable alternatives worth weighing)
- Low blast radius (no cross-team / cross-system effects)

Tier behavior (HARD):
- DTP: skip (route directly to implementation, like bug fixes)
- Systems Analysis: 60s surface-area scan only — NO Condensed Pass
- Brainstorming: skip (single obvious approach criterion eliminates the trade-off matrix step)
- Fat Marker Sketch: skip (no shape question to validate)
- Execution mode: prefer [single-implementer + single final review](execution-mode.md#single-implementer-mode)
- [`goal-driven.md` verify checks per step](goal-driven.md#verify-checks) and `verification.md` end-of-work gate STILL apply

**Pressure-framing floor.** Floor enforcement (pressure-framing routing, named-cost
emission contract, sentinel bypass) is anchored in
[`pressure-framing-floor.md`](pressure-framing-floor.md) and
[`skip-contract.md`](skip-contract.md). Sentinel bypass
(`DISABLE_PRESSURE_FLOOR`) inherits to this tier: when the
sentinel is active, "this is trivial" claims are honored without the four-criteria
check, same as bypass disables DTP routing on pressure framings. Bypass remains
intentionally visible per the banner contract in
[`pressure-framing-floor.md`](pressure-framing-floor.md#emergency-bypass-sentinel).
Per [ADR #0006 rejection](../adrs/0006-systems-analysis-pressure-framing-floor.md)
and memory note `per_gate_floor_blocks_substitutable.md`, the model generalizes that
anchor to the active pipeline stage, so a Trivial-tier per-gate floor block adds no
eval-measurable load given the DTP anchor. Concrete signals here: "just a small
change," "trivial fix," "quick edit" without the four criteria being demonstrable
from the prompt or a cheap pre-check are pressure framings, NOT tier claims — route
to Prototype/POC tier and run the standard pipeline. The named-cost emission contract
in [`skip-contract.md`](skip-contract.md#emission-contract-per-gate) is NOT a
tier-downgrade mechanism; it bypasses individual gates, not the entire pipeline.

## Decision Framework

When evaluating approaches (during brainstorming or any solution comparison):
- Present options as a trade-off matrix — lead with **user value** and **problem fit**,
  then effort, risk, reversibility, and org impact
- Quantify when possible — "faster" is not data, "reduces p99 latency by ~200ms" is
- Recommend one option with clear reasoning, but show your work
- Flag irreversible decisions explicitly — these deserve more scrutiny

## Sequential Thinking (Manual Opt-In)

A Sequential Thinking MCP server is available as an opt-in tool during the Solution
Design stage. It provides explicit stepwise reasoning with revision and branching —
useful when the normal pipeline is not converging on a stable approach.

**When to use it:**
- You feel stuck after multiple passes through solution design
- Trade-offs are deep and interrelated, making it hard to hold everything in context
- You keep revisiting the same unresolved tension
- The problem has high blast radius or irreversibility and you want a more rigorous pass

**How to invoke:**
The user explicitly requests it: "Let's run a sequential thinking pass on this."
Never invoke automatically. Never suggest it for work that falls under Prototype/POC
scope calibration or has a clear, uncontested path forward.

**Bounded execution contract:**
- Max thoughts: 8 (extend to 12 only with explicit user approval) — this is the hard constraint
- Max branches: 1
- Target completing within ~10 minutes

**Required output after a pass:**
- Top options (max 3) with trade-offs
- Recommended option with rationale
- Key risks and unknowns
- Validation plan
- Next 3 concrete actions

**Transparency:**
- Announce when a sequential thinking pass starts
- Announce when it ends and local planning flow resumes
- The normal planning pipeline remains primary — a sequential pass is a tool, not a mode

> See [ADR #0001](../adrs/0001-sequential-thinking-mcp-manual-only.md) for the full
> decision rationale and future phase plans.

## Multi-Session Continuity

When a design spans multiple conversations:

- After completing the pipeline and approach selection, offer to save a design context
  summary to `docs/superpowers/decisions/YYYY-MM-DD-<topic>.md`. Include: problem
  statement, systems analysis, selected approach, and sketch description. Keep it
  under one page — this is a breadcrumb, not a spec.
- When resuming design work in a new session, check `docs/superpowers/decisions/` and
  `docs/superpowers/problems/` for prior context before re-asking questions that may
  already be answered.
