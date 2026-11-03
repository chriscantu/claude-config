# Self-Check Before Presenting

Run through these checks before showing the sketch. If you catch yourself doing
any of the "too detailed" items, STOP and simplify. If you're missing any of the
"not a sketch" items, add them.

## Too Detailed

- Adding colors, gradients, or fills beyond black/white/gray
- Styling buttons, inputs, or interactive elements with shadows, gradients, or polished radii (uneven hand-drawn border-radius is fine)
- Building detailed flow diagrams with multiple conditional branches
- Filling every field with realistic sample data instead of representative content

## Notes With Borders (Anti-Pattern)

- A box contains more than one bullet — it is now a note card, not a structural region. Split the box into multiple boxes, or drop the bullets to a single label.
- Multiple framed boxes whose only content is prose bullets, with no arrows, flow, or delta between them — that is a list wearing box costumes, not a sketch.
- A before/after diptych whose BEFORE and AFTER differ only in the text inside two symmetric boxes — the delta must be **graphic** (strikethrough, heavier stroke, dashed lines), not "read both and diff in your head."

## Not a Sketch (Too Low Fidelity)

- Outputting a plain text list or prose instead of a visual with boxes/borders
- Using a markdown code block when rendering HTML
- Showing only a single screen instead of the multi-screen journey
- Inheriting a dark theme instead of setting explicit white background
- Missing the FLOW section that maps screen-to-screen connections

## Too High Fidelity (HTML)

- Any color other than black and white, or a dark-mode version of the page
- A second typeface, or a font other than Permanent Marker
- Shadows, fills, gradients, images, icons, or animation
- Layout styling added beyond the template's classes (polish from the Artifact design guidance)

For Excalidraw checks, see `references/excalidraw-rendering.md`.

## Right Level

The sketch should look like something drawn in 2 minutes on a whiteboard — bordered
screen frames, labeled regions inside them, bracketed actions, and a flow summary.

All paths are relative to the skill root directory (`skills/fat-marker-sketch/`).
See `assets/example-fat-marker-sketch.jpg` for a visual reference of the target fidelity.
