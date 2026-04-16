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
- The user explicitly says to skip

## Producing the Sketch

When it's time to produce the sketch, invoke the `fat-marker-sketch` skill. The skill
contains rendering format, fidelity rules, format taxonomy, examples, validation
questions, and backtracking protocol.

A fat marker sketch is a VISUAL artifact rendered using excalidraw (outline shapes,
Excalifont, transparent background) — not a text list, not a code block, not prose.
Fall back to HTML with bordered boxes if excalidraw is unavailable (requires both the
canvas server running at localhost:3000 AND an open browser tab on it — verify with
`curl -s localhost:3000/health` showing `websocket_clients >= 1`; see the skill for
setup details). If it doesn't have
visible borders around screens and regions, it's not a sketch.
