---
description: >
  Activate when brainstorming, designing features, proposing approaches, or running
  design workflows. Requires a fat marker sketch after approach selection and before
  detailed design.
---

# Fat Marker Sketch Before Detailed Design

<HARD-GATE>
A fat marker sketch is MANDATORY after the user selects an approach and BEFORE presenting
any detailed design sections. Do NOT skip this step. Do NOT jump to detailed design,
architecture, data models, or component breakdowns without completing the sketch and
getting user confirmation that the shape is right.

If you catch yourself writing detailed design without having sketched first, STOP and
go back to this step.
</HARD-GATE>

## When to Skip

- Changes scoped to a single component with no structural implications
- Bug fixes where the solution shape is obvious from the diagnosis
- The user explicitly overrides the gate **and** acknowledges the trade-off

### What counts as an explicit override

See [Skip override — what counts](skip-contract.md#override-skip-contract).
Time pressure is not an override. For combined red-flag patterns, see
the rationalization table in `skills/fat-marker-sketch/SKILL.md`.

### Skip contract

See [pressure-framing routing](pressure-framing-floor.md#pressure-framing-floor),
[emission contract](skip-contract.md#emission-contract), and
[sentinel bypass](pressure-framing-floor.md#emergency-bypass-sentinel) — canonical mechanics
live in `rules/skip-contract.md` and `rules/pressure-framing-floor.md`.

## Producing the Sketch

When it's time to produce the sketch, invoke the `fat-marker-sketch` skill. The skill
contains rendering format, fidelity rules, format taxonomy, examples, validation
questions, and backtracking protocol.

A fat marker sketch is a VISUAL artifact: an HTML page of thick black bordered boxes
in a marker font, published with the built-in Artifact tool (no server or setup).
Without the Artifact tool, write the same HTML file and open it locally. If it doesn't
have visible borders around screens and regions, it's not a sketch.
