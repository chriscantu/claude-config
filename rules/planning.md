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

   <a id="skip-contract"></a>
   **Skip contract.** Skip is honored as *full skip* only when the user names
   the specific cost being accepted (e.g., "skip DTP, I accept the risk of
   building on an unstated problem"). Generic skip framings — "I'm tired,"
   "just give me code," "ship by Friday," "CTO approved," "contract signed,"
   "trust me" — run the Fast-Track floor instead. The floor is non-bypassable.

   <a id="emission-contract"></a>
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

   <a id="scope-tier-memory-check"></a>
   **Scope-tier memory check (fires BEFORE pressure-framing floor).** A
   `UserPromptSubmit` hook (`hooks/scope-tier-memory-check.sh`) inspects
   every prompt against loaded scope-tier `feedback` memories. When the
   hook detects a match, it injects a `<system-reminder>` beginning with
   the literal prefix `SCOPE-TIER MATCH:`.

   When you receive a `SCOPE-TIER MATCH:` system-reminder:

   1. Acknowledge the match in one visible line:
      `[Scope-tier match: <memory-name>] Routing to direct implementation per stored feedback.`
   2. Route to direct implementation. Skip DTP, Systems Analysis,
      brainstorming, Fat Marker Sketch, and subagent-driven-development.
   3. `execution-mode.md` single-implementer mode, `goal-driven.md`
      per-step verify checks, and `verification.md` end-of-work gate
      STILL apply.

   If you believe the hook fired incorrectly (e.g., the prompt actually
   does require the pipeline), name the specific signal that's wrong and
   ask the user before proceeding: *"Hook fired SCOPE-TIER MATCH on X,
   but Y suggests this needs pipeline. Confirm direct implementation or
   invoke pipeline?"*

   When NO `SCOPE-TIER MATCH:` reminder is present, proceed to the
   pressure-framing floor below (current behavior unchanged).

   **Hook absence is graceful degradation.** If the hook is not
   installed (no `UserPromptSubmit` entry in `~/.claude/settings.json`),
   no reminder fires; the rest of this section's gates evaluate
   normally. The Layer 2 rule text alone is a soft check — the
   structural guarantee comes from Layer 1. Install via
   `fish bin/install-scope-tier-hook.fish`.

   **Sentinel bypass inheritance.** The hook checks the
   `DISABLE_PRESSURE_FLOOR` sentinel before evaluating criteria. When
   the sentinel is present (project-local OR global), the hook exits 0
   (no reminder). Same off-switch as pressure-framing floor and
   Trivial-tier four-criteria check — single flag for emergency
   rollback.

   **Precedence vs Trivial/Mechanical tier.** Scope-tier hook match is
   a fast-path into the same destination as Trivial tier (skip
   DTP/SA/brainstorm/FMS, single-implementer mode). On match, jump
   straight to direct implementation; Trivial-tier four-criteria
   check remains the fallback for prompts WITHOUT a hook match but
   WITH all four criteria satisfiable. Both routes converge.

   **Precedence vs Expert Fast-Track.** Hook match wins; Fast-Track
   still runs DTP (condensed), which scope-tier match skips entirely.

   <a id="pressure-framing-floor"></a>
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

     <a id="fast-track-validation-emission"></a>
     **Fast-Track validation emission — MANDATORY.** Before proceeding
     under this carve-out, you MUST emit a line beginning with the
     literal prefix `Validating my understanding:` followed by a
     single sentence covering named problem, stakes, and evidence.
     Absence of this line — or inability to produce the
     single-sentence summary — means the carve-out does not apply;
     route to DTP per the floor above.
   - **Slash-prefix planning skill** — invoking a planning-shaped skill
     by slash prefix without a problem statement in args. Concrete
     examples: `/sdr <bare description>`, `/adr <bare description>`,
     `/tech-radar <tool name>`, `/tenet-exception <bare description>`,
     `/cross-project <repo name>`. The slash is a routing convenience,
     NOT a named-cost skip — same DTP front-door applies as plain-English
     prompts. If the args ALREADY satisfy DTP inputs (named problem +
     user + stakes), this is Expert Fast-Track per the bare-brainstorm
     carve-out above; otherwise, route to DTP first, then hand off to
     the named skill. The skill's `description` field is NOT a license
     to bypass the gate.

   Honor full skip ONLY via the Emission contract above (MCP
   `acknowledge_named_cost_skip` tool-use with verbatim cost-naming
   clause). Anything else — even combinations of pressure framings —
   invokes `Skill(define-the-problem)` first. When routing a pressure
   framing to DTP, include a one-line example of valid skip phrasing in
   the response (e.g., "To skip DTP, name the cost: `skip DTP, I accept
   <specific risk>`") so the user can exit cleanly if they genuinely want
   to bypass.

   <a id="architectural-invariant"></a>
   **Architectural invariant.** Front-door enforcement lives in the rules
   layer because it fires BEFORE any skill loads — a skill cannot catch
   its own failure-to-load. Within-skill behavior lives in SKILL.md.

   <a id="emergency-bypass-sentinel"></a>
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
   bypass) is anchored in the DTP per-gate block — see step 1 above. Per
   [ADR #0006 rejection](../adrs/0006-systems-analysis-pressure-framing-floor.md),
   the model generalizes that anchor to the active pipeline stage, so an
   SA per-gate block here adds no eval-measurable load given the DTP
   anchor. Reopening requires new evals that fail under DTP-only AND pass
   under DTP+SA — a per-gate block that merely adds text without producing
   that discrimination signal is speculative.
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
emission contract, sentinel bypass) is anchored in the DTP per-gate block — see step 1
above. Sentinel bypass (`DISABLE_PRESSURE_FLOOR`) inherits to this tier: when the
sentinel is active, "this is trivial" claims are honored without the four-criteria
check, same as bypass disables DTP routing on pressure framings. Bypass remains
intentionally visible per step 1's banner contract. Per [ADR #0006 rejection](../adrs/0006-systems-analysis-pressure-framing-floor.md)
and memory note `per_gate_floor_blocks_substitutable.md`, the model generalizes that
anchor to the active pipeline stage, so a Trivial-tier per-gate floor block adds no
eval-measurable load given the DTP anchor. Concrete signals here: "just a small
change," "trivial fix," "quick edit" without the four criteria being demonstrable
from the prompt or a cheap pre-check are pressure framings, NOT tier claims — route
to Prototype/POC tier and run the standard pipeline. The named-cost emission contract
from step 1 (DTP) is NOT a tier-downgrade mechanism; it bypasses individual gates, not
the entire pipeline.

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
