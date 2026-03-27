---
description: During brainstorming, require a fat marker sketch of the recommended approach before detailed design
---

# Fat Marker Sketch Before Detailed Design

When running superpowers:brainstorming (or any design process that proposes approaches
before detailing them), add this step between approach selection and detailed design:

## When to Sketch

After proposing 2-3 approaches and the user selects one — before presenting detailed
design sections.

## What to Sketch

Present a **fat marker sketch** of the recommended approach. This is the lowest-fidelity
representation that answers "is this the right thing?" before committing to details.

Choose the format that fits the feature:

- **Process/workflow feature**: A simple numbered flow or rough state diagram showing
  the steps the user will go through. No edge cases, no error handling — just the
  happy path shape.
- **UI/output feature**: A text-based wireframe showing what the user will see. Use
  ASCII or markdown — not pixel-perfect, just layout and content hierarchy.
- **CLI/command feature**: Show the command invocation and a rough example of the
  output the user would see. Fake data is fine.
- **System/integration feature**: A simple box-and-arrow diagram (Mermaid) showing
  what talks to what.

## Fidelity Level

Think Sharpie on a whiteboard, not Figma. The sketch should:

- Fit in one screen
- Take under 2 minutes to produce
- Be disposable — it's a conversation tool, not a deliverable
- Show the **shape** of the experience, not the details
- Omit edge cases, error states, and configuration options

## After the Sketch

Ask: "Does this feel like the right shape, or should we rethink the approach before
going deeper?"

- If the user confirms: proceed to detailed design sections
- If the user pushes back: revise the sketch or reconsider the approach before
  investing in details
- If the sketch reveals the approach is wrong: go back to approach selection

The sketch is NOT saved to disk or included in the spec. It's a conversation artifact
that prevents expensive design rework.
