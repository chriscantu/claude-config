---
description: Pressure-framing routing, scope-tier memory check, and emergency-bypass sentinel for the planning-pipeline floor
---

# Pressure-Framing Floor

This file is the canonical home for pressure-framing detection,
scope-tier routing, and the emergency-bypass sentinel mechanism. It is
loaded alongside [`planning-pipeline.md`](planning-pipeline.md) and
[`skip-contract.md`](skip-contract.md). All three together implement
the floor that fires at the Problem Definition step of the pipeline
and inherits to every downstream HARD-GATE.

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
no reminder fires; the rest of this file's gates evaluate
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

Honor full skip ONLY via the
[Emission contract](skip-contract.md#emission-contract) (MCP
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
**Emergency bypass — sentinel file check.** The pressure-framing floor
above is the default. A `DISABLE_PRESSURE_FLOOR` sentinel file provides
runtime rollback without a revert chain. Apply the check ONLY at the
moment you have detected a pressure framing AND are about to invoke
`Skill(define-the-problem)` on pressure-framing grounds — never pre-check
on unrelated prompts. The full mechanics — the exact Bash check command,
the `BYPASS_ACTIVE` / `BYPASS_INACTIVE` handling, the bypass banner
contract, and the project-local-vs-global file precedence — live in
[`references/pressure-framing-bypass.md`](references/pressure-framing-bypass.md).
When `BYPASS_INACTIVE` (or the check is ambiguous), your next action MUST
be the `Skill(define-the-problem)` tool-use.
