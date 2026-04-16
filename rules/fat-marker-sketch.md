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

Saying "skip the sketch" is NOT sufficient on its own. The override must **name the
specific cost** being accepted — not a generic "I accept the trade-off," which doesn't
demonstrate the user knows what they're accepting. Valid phrasings name the cost
directly: "skip the sketch, I accept the rework risk," "override the gate, I'll redraw
if the shape is wrong," or "skip it — I'll eat the wrong-shape risk." Generic
acknowledgements ("I accept the trade-off," "I know the risks," "your call") do NOT
qualify — name the gate, request the specific acknowledgement, and produce the sketch
if it doesn't come (a 2-minute napkin-level rendering is always cheaper than the
rework risk from skipping).

**Time pressure is not an override.** "I have 10 minutes" or "meeting in 5" is a reason
the sketch matters more, not less — a rushed detailed design is the most expensive
thing to throw away. See the rationalization table in the skill for the full list of
combined red flags.

## Producing the Sketch

When it's time to produce the sketch, invoke the `fat-marker-sketch` skill. The skill
contains rendering format, fidelity rules, format taxonomy, examples, validation
questions, and backtracking protocol.

A fat marker sketch is a VISUAL artifact rendered using excalidraw (outline shapes,
Excalifont, transparent background) — not a text list, not a code block, not prose.
Fall back to HTML with bordered boxes if excalidraw is unavailable (requires the
canvas with an active browser/Preview client — see the skill for setup and preflight). If it doesn't have
visible borders around screens and regions, it's not a sketch.
