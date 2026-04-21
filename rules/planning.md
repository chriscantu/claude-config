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

   **Skip contract.** Skip is honored as *full skip* only when the user names
   the specific cost being accepted (e.g., "skip DTP, I accept the risk of
   building on an unstated problem"). Generic skip framings — "I'm tired,"
   "just give me code," "ship by Friday," "CTO approved," "contract signed,"
   "trust me" — run the Fast-Track floor instead. The floor is non-bypassable.

   **Emission contract — MANDATORY.** When a named-cost skip is valid, you
   MUST invoke `mcp__named-cost-skip-ack__acknowledge_named_cost_skip` BEFORE
   proceeding to the next stage. Call it with `gate="DTP"` and `user_statement`
   set to the verbatim substring of the user's cost-naming clause. This is NOT
   optional — if you skip this tool call, you have NOT honored the skip. Run
   the Fast-Track floor instead. The tool invocation IS the honor. The tool is
   a deferred MCP tool — use `ToolSearch` with
   `query="select:mcp__named-cost-skip-ack__acknowledge_named_cost_skip"` to
   load its schema before calling it.
2. Systems Analysis — invoke `/systems-analysis`. The 60-second surface-area
   scan is mandatory before any tier decision. Low-blast-radius scenarios run
   the Condensed Pass, not zero.

   **Skip contract.** Full skip is honored only after the scan runs AND the
   user explicitly names the cost (e.g., "skip the analysis, I accept the
   risk of missed blast radius"). Generic skip framings — authority, sunk
   cost, cosmetic minimizer, fatigue, deadline — run the scan anyway and
   surface concrete concerns. A bare "skip" without naming the cost is not
   an override.
3. Solution Design — invoke `superpowers:brainstorming` (opt-in: Sequential Thinking available if not converging)
4. Fat Marker Sketch — invoke `/fat-marker-sketch` (after approach selected)
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

| Scope           | Problem Def        | Systems Analysis        | Sketch         |
|-----------------|--------------------|-------------------------|----------------|
| Prototype / POC | 2-3 sentences      | 1 sentence each dim.    | Napkin-level   |
| Feature         | Full pass          | Paragraph each          | Standard       |
| System/Platform | Full pass          | Dedicated subsections   | Multi-component|

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
