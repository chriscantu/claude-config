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
   the Fast-Track floor instead. The tool invocation IS the honor. If the
   tool appears in the deferred-tool list rather than the active tool list,
   load its schema first with `ToolSearch` using
   `query="select:mcp__named-cost-skip-ack__acknowledge_named_cost_skip"`;
   otherwise call it directly.

   **Pressure-framing floor.** Framings below are pressure signals, not
   cost-naming skips. They DO NOT bypass DTP — they *strengthen* the
   case for Fast-Track. Categories are semantic; example phrases are
   illustrative, not exhaustive — match on the underlying mechanism, not
   the literal wording:
   - **Authority** — external-approval invocation ("CTO/VP/lead approved",
     "contract signed", "budget approved", "the board voted", "legal signed off")
   - **Sunk cost** — commitment-consistency framing ("already committed",
     "don't re-analyze", "decision is made", "we've already chosen")
   - **Exhaustion** — fatigue framing ("I'm tired", "we've been at this
     for hours", "just give me", "stop asking questions")
   - **Deadline** — time-pressure framing ("ship by Friday", "meeting in
     10 minutes", "needs to ship today")
   - **Stated-next-step** — skip-DTP framing that names a later stage as
     the destination ("skip DTP and X", "don't do problem definition",
     "bypass the pipeline"). A bare "just brainstorm" from a user who has
     already satisfied DTP inputs in-thread (named problem + stakes +
     evidence) is Expert Fast-Track, not a pressure framing — validate
     understanding and proceed.

   Honor full skip ONLY via the Emission contract above (MCP
   `acknowledge_named_cost_skip` tool-use with verbatim cost-naming
   clause). Anything else — even combinations of pressure framings —
   invokes `Skill(define-the-problem)` first. When routing a pressure
   framing to DTP, include a one-line example of valid skip phrasing in
   the response (e.g., "To skip DTP, name the cost: `skip DTP, I accept
   <specific risk>`") so the user can exit cleanly if they genuinely want
   to bypass.

   **Architectural invariant.** Front-door enforcement lives in the rules
   layer because it fires BEFORE any skill loads — a skill cannot catch
   its own failure-to-load. Within-skill behavior lives in SKILL.md.

   **Emergency bypass — sentinel file check.** The pressure-framing
   floor above is the default. A sentinel file provides runtime
   rollback without a revert chain. Apply this check ONLY at the
   moment you have detected a pressure framing AND are about to
   invoke `Skill(define-the-problem)` on pressure-framing grounds.
   Do NOT pre-check on unrelated prompts.

   When the check applies, run via Bash tool. The command MUST
   print explicit `BYPASS_ACTIVE` or `BYPASS_INACTIVE` to stdout —
   raw `test -f` returns only an exit code, which the Bash tool
   does not surface reliably. Use:

   ```
   if test -f .claude/DISABLE_PRESSURE_FLOOR || test -f ~/.claude/DISABLE_PRESSURE_FLOOR; then echo BYPASS_ACTIVE; else echo BYPASS_INACTIVE; fi
   ```

   - stdout contains `BYPASS_ACTIVE`: do NOT invoke DTP on
     pressure-framing grounds. Route as Expert Fast-Track would
     route absent the floor. The emission contract still applies
     to genuine named-cost skips. Because bypass silently removes
     a safety rail, you MUST emit a visible banner on the FIRST
     pressure-framed prompt of the session where the bypass is
     observed — literal form:
     `⚠️ Pressure-framing floor BYPASSED (sentinel file present). Delete ~/.claude/DISABLE_PRESSURE_FLOOR or ./.claude/DISABLE_PRESSURE_FLOOR to restore.`
     The banner goes BEFORE any routing response. Subsequent
     pressure-framed prompts in the same session may omit the
     banner to reduce noise, but the bypass behavior still
     applies.
   - stdout contains `BYPASS_INACTIVE`: your NEXT tool invocation
     MUST be a `Skill` tool-use with `skill="define-the-problem"`.
     You MAY emit at most one short preface line before that
     tool-use: either the canonical `[Stage: Problem Definition]`
     marker required by Stage Visibility, or a single routing
     sentence (e.g., "Pressure framing detected — routing to
     DTP."). Do NOT describe the floor mechanics, do NOT explain
     that DTP applies, and do NOT list the skip phrasing as an
     alternative in lieu of invoking the tool — the `Skill`
     tool-use IS the application of the floor. A response that
     stops at text after `BYPASS_INACTIVE`, or uses the preface
     allowance to narrate the floor instead of invoking the
     skill, is a floor-bypass and is forbidden.

   Do NOT guess the result from empty output. If stdout is empty
   or ambiguous, the check failed — treat as `BYPASS_INACTIVE`
   and invoke the Skill tool as above. The check is the rollback
   safety valve, not an optional suppression — running the check
   AND finding `BYPASS_INACTIVE` MUST result in a Skill tool-use
   for `define-the-problem` as the immediate next action.
   Skipping the check on a pressure-framed prompt without running
   it is equivalent to bypassing the floor and is forbidden.

   To enable the bypass, a user creates either file:

   - Project-local: `./.claude/DISABLE_PRESSURE_FLOOR` (checked first)
   - Global: `~/.claude/DISABLE_PRESSURE_FLOOR` (fallback)

   File existence alone triggers bypass — content ignored. Bypass is
   intentionally visible: `ls ~/.claude/ .claude/ 2>/dev/null | grep
   DISABLE_PRESSURE_FLOOR`. Prefer fixing regressions over leaving
   the flag on — a permanent bypass defeats the floor entirely.
   Delete the file to restore.
2. Systems Analysis — invoke `/systems-analysis`. The 60-second surface-area
   scan is mandatory before any tier decision. Low-blast-radius scenarios run
   the Condensed Pass, not zero.

   **Skip contract.** Full skip is honored only after the scan runs AND the
   user explicitly names the cost (e.g., "skip the analysis, I accept the
   risk of missed blast radius"). Generic skip framings — authority, sunk
   cost, cosmetic minimizer, fatigue, deadline — run the scan anyway and
   surface concrete concerns. A bare "skip" without naming the cost is not
   an override.

   Floor enforcement (pressure-framing routing, emission contract, sentinel
   bypass) is anchored in the DTP step 1 block above. Per
   [ADR #0006 rejection](../adrs/0006-systems-analysis-pressure-framing-floor.md),
   the model generalizes that anchor to the active pipeline stage — a
   per-gate floor block here adds no eval-measurable load given the DTP
   anchor. If the generalization ever fails under a new pressure framing,
   reintroduce a per-gate block with evals that discriminate it.
3. Solution Design — invoke `superpowers:brainstorming` (opt-in: Sequential Thinking available if not converging)
4. Fat Marker Sketch — invoke `/fat-marker-sketch` (after approach selected).
   See `rules/fat-marker-sketch.md` for the HARD-GATE, pressure-framing
   floor, emission contract, and sentinel bypass.
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
