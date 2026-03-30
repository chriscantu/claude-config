---
description: MANDATORY for all planning, design, brainstorming, and architecture work — no exceptions
---

# Strategic Planning Mode

<HARD-GATE>
First Principles Decomposition is MANDATORY before proposing any solution, approach,
or design. This applies to ALL work — greenfield projects, feature additions, bug
investigations, and architecture decisions. Do NOT skip this step. Do NOT jump to
solutions, approaches, or tooling before completing it.

When brainstorming or designing, First Principles Decomposition MUST be the very first
step — before asking about visual companions, before proposing approaches, before any
design activity. The sequence is non-negotiable:

1. First Principles Decomposition (steps 1-5 below, ALL mandatory)
2. Fat marker sketch (see fat-marker-sketch.md — also mandatory)
3. Then proceed with detailed design
</HARD-GATE>

## Stage Visibility

At each pipeline transition, announce the current stage:

> **[Stage: First Principles — Step 2: Core Problem]**

When transitioning between major stages (decomposition → approaches → sketch →
detailed design), produce a one-line checkpoint summary:

> **[Checkpoint]** Problem: overdue delegations invisible. Approach: daily briefing
> command. Shape: confirmed. → Entering detailed design.

This keeps the user oriented in long conversations and provides a trail for
re-reading later.

## First Principles Decomposition

Present the decomposition **incrementally, not all at once.** Complete steps 1-2
(ground truth + core problem), present them, and validate with the user before
proceeding to steps 3-5. A wrong assumption in step 1 will poison everything
downstream — catch it early.

### Expert Fast-Track

If the user presents a problem statement that already covers steps 1-3 with
verifiable facts and concrete evidence, acknowledge it rather than re-asking:

"You've already covered ground truth, the core problem, and constraints. Let me
validate my understanding: [1-sentence summary]. If that's right, I'll move to
systems thinking and organizational impact."

This skips re-asking, not analysis. Steps 4-5 still run — they surface things the
user may not have considered.

Before proposing ANY solution, complete these steps in order:

### 1. Establish ground truth
- Ask: "What do we know to be true?" — list only verifiable facts
- Reject inherited assumptions — validate that prior constraints still hold
- Separate facts from opinions, preferences, and convention

### 2. Define the core problem
- What pain exists today? For whom?
- What does success look like from the user's/customer's perspective?
- What is the simplest framing of this problem?
- **Explore the behavioral and emotional dimensions**, not just the functional ones:
  Why do users fail today? What would make them trust this? What makes them quit?
  These questions should surface during the clarifying-question phase, not just in
  the decomposition summary.

<HARD-GATE>
After identifying the primary functional pain, you MUST ask at least one dedicated
follow-up question specifically about other user frictions, emotional barriers, and
behavioral patterns BEFORE presenting the step 1-2 summary. Do NOT fold behavioral
exploration into the summary — surface it through direct questions to the user.
"What else makes this hard for users?" is a mandatory question, not optional.
</HARD-GATE>

### 3. Identify constraints

If constraints were already surfaced during problem definition (e.g., via
define-the-problem), reference and refine them rather than re-asking from scratch.

- What are the real constraints (technical, regulatory, organizational, time)?
- Which constraints are actual and which are assumed?
- What trade-offs are we willing to make?

### 4. Systems thinking (REQUIRED — not optional)
- Map dependencies: what systems, teams, and processes does this change touch?
- Identify feedback loops: will this create positive or negative reinforcement?
- Surface second-order effects: what happens downstream when this ships?
- Consider failure modes: how does this degrade? What's the blast radius?

### 5. Organizational impact (REQUIRED — not optional)
- Who owns what gets affected? Flag cross-team dependencies early
- What's the migration/adoption path for teams consuming this?
- Does this create operational burden? Who carries it?
- Will this scale with team growth or become a bottleneck?

### 6. Only then: explore solution space
- Solutions flow FROM the problem decomposition, not the other way around
- If you can't trace a proposed solution back to a ground truth, challenge it
- **Approaches must be user-problem-focused, not implementation-focused.** Propose
  2-3 ways to solve the user's problem — different user experiences, workflows, or
  product strategies. Technical architecture is a downstream detail that follows
  from the chosen approach, not the other way around.
- Ask: "How does the user experience differ between these approaches?" If the answer
  is "it doesn't" — you're proposing implementation variants, not real alternatives.
- **After the user selects an approach, you MUST produce a fat marker sketch before
  proceeding to any design work.** See fat-marker-sketch.md. Do NOT skip this step.

<HARD-GATE>
Steps 1-5 above are ALL mandatory. Do NOT skip systems thinking or organizational
impact analysis — even for prototypes, POCs, or "simple" projects. Scale the DEPTH
of analysis to the project scope (a prototype gets lighter analysis than a production
system), but every step must be explicitly addressed. If a step is not applicable,
state why rather than silently skipping it.

Do NOT propose approaches until all 5 steps are complete and presented to the user.
</HARD-GATE>

### Scope Calibration

Scale the depth of each step to match the scope. This table sets the **minimum** depth —
go deeper if the problem warrants it.

| Scope           | Steps 1-2          | Steps 3-5               | Sketch         |
|-----------------|--------------------| ------------------------|----------------|
| Prototype / POC | 2-3 sentences each | 1 sentence each         | Napkin-level   |
| Feature         | Full pass          | Paragraph each          | Standard       |
| System/Platform | Full pass          | Dedicated subsections   | Multi-component|

## Decision Framework
- Present options as a trade-off matrix. Lead with **user value** and **problem fit**,
  then cover effort, risk, reversibility, and org impact. Implementation trade-offs
  matter, but they come after user-experience trade-offs.
- Quantify when possible — "faster" is not data, "reduces p99 latency by ~200ms" is
- Recommend one option with clear reasoning, but show your work
- Flag irreversible decisions explicitly — these deserve more scrutiny

## Multi-Session Continuity

When a design spans multiple conversations:

- After completing the decomposition (steps 1-5) and approach selection, offer to
  save a design context summary to `docs/superpowers/decisions/YYYY-MM-DD-<topic>.md`.
  Include: ground truth, problem statement, selected approach, and sketch description.
  Keep it under one page — this is a breadcrumb, not a spec.
- When resuming design work in a new session, check `docs/superpowers/decisions/` and
  `docs/superpowers/problems/` for prior context before re-asking questions that may
  already be answered.
