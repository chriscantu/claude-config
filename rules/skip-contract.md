---
description: Named-cost skip mechanics and per-gate emission contract for HARD-GATE rules across the planning pipeline
---

# Skip Contract & Emission Contract

This file is the canonical home for skip-and-honor mechanics that govern
every HARD-GATE rule. It is loaded alongside
[`planning-pipeline.md`](planning-pipeline.md) and
[`pressure-framing-floor.md`](pressure-framing-floor.md). All three
together implement the floor that fires at the Problem Definition step
of the pipeline and inherits to every downstream HARD-GATE.

<a id="skip-contract"></a>
**Skip contract.** Skip is honored as *full skip* only when the user names
the specific cost being accepted (e.g., "skip DTP, I accept the risk of
building on an unstated problem"). Generic skip framings — "I'm tired,"
"just give me code," "ship by Friday," "CTO approved," "contract signed,"
"trust me" — run the Fast-Track floor instead. The floor is non-bypassable.

<a id="emission-contract"></a>
**Emission contract — MANDATORY.** When a named-cost skip is valid, you
MUST invoke `mcp__named-cost-skip-ack__acknowledge_named_cost_skip` BEFORE
proceeding to the next stage. Call it with `gate="DTP"` (or the per-gate
value from the table below) and `user_statement` set to the verbatim
substring of the user's cost-naming clause. This is NOT optional — if
you skip this tool call, you have NOT honored the skip. Run the
Fast-Track floor instead. The tool invocation IS the honor. If the
tool appears in the deferred-tool list rather than the active tool list,
load its schema first with `ToolSearch` using
`query="select:mcp__named-cost-skip-ack__acknowledge_named_cost_skip"`;
otherwise call it directly.

<a id="override-skip-contract"></a>

## Skip override — what counts

Saying "skip the gate" is NOT sufficient on its own. An override must
**name the specific cost** being accepted. Valid forms cite the gate by
name AND the specific risk accepted: "skip the sketch, I accept the
rework risk"; "no verify checks, I'll catch breakage in review"; "skip
pr-validation, I accept the risk of unverified merge"; "skip DTP, I
accept the risk of building on an unstated problem". Generic
acknowledgements ("trust me," "I accept the trade-off," "your call,"
"I know the risks," "you know what I want," "ship it") do NOT qualify
— name the gate, request the specific cost acknowledgement, and
produce the gate's required artifact if it doesn't come.

**Time pressure is not an override.** "Quick fix," "just do it," "demo in 10
minutes," "ship by Friday," "5 minutes left," "I have 10 minutes," "meeting in 5" make
the gate more important, not less — a rushed unverified output is the
most expensive thing to land.

<a id="emission-contract-per-gate"></a>

## Emission contract — per-gate skip honor

When a named-cost skip is valid for any HARD-GATE rule (not just DTP),
invoke `mcp__named-cost-skip-ack__acknowledge_named_cost_skip` BEFORE
proceeding past the gate. The tool invocation IS the honor — if you
skip the call, produce the gate's required artifact instead. Deferred-tool
schema load: see [Emission contract](#emission-contract).

Per-gate `gate=` values (the `user_statement` argument is always the
verbatim cost-naming clause from the user's message):

| Rule / skill gate | `gate=` value |
|---|---|
| `define-the-problem` (DTP) | `DTP` |
| `goal-driven.md` | `goal-driven` |
| `fat-marker-sketch.md` | `fat-marker-sketch` |
| `pr-validation.md` | `pr-validation` |
| `think-before-coding.md` | `think-before-coding` |

For "Only USER cost-naming counts" + the autonomous-loop four-exit list
(Pass / Carve-out / Sentinel bypass / Hard-block), see the Emission
contract section in `rules/pr-validation.md`.
