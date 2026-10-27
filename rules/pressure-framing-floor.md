---
description: Pressure-framing routing and emergency-bypass sentinel for the planning-pipeline floor
---

# Pressure-Framing Floor

This file is the canonical home for pressure-framing detection
and the emergency-bypass sentinel mechanism. It is
loaded alongside [`planning-pipeline.md`](planning-pipeline.md) and
[`skip-contract.md`](skip-contract.md). All three together implement
the floor that fires at the Problem Definition step of the pipeline
and inherits to every downstream HARD-GATE.

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
