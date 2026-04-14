# Self-Check Before Presenting

Run through these checks before showing the sketch. If you catch yourself doing
any of the "too detailed" items, STOP and simplify. If you're missing any of the
"not a sketch" items, add them.

## Too Detailed

- Adding colors, gradients, or fills beyond black/white/gray
- Styling buttons, inputs, or interactive elements with shadows, gradients, or polished radii (uneven hand-drawn border-radius is fine)
- Building detailed flow diagrams with multiple conditional branches
- Filling every field with realistic sample data instead of representative content

## Not a Sketch (Too Low Fidelity)

- Outputting a plain text list or prose instead of a visual with boxes/borders
- Using a markdown code block when rendering HTML
- Showing only a single screen instead of the multi-screen journey
- Inheriting a dark theme instead of setting explicit white background
- Missing the FLOW section that maps screen-to-screen connections

## Excalidraw-Specific

- Font size below 13px anywhere in the sketch — will render blurry; fix by reducing element count, not font size
- All elements created in a single `batch_create_elements` call — staged drawing (4 passes) is required so the user sees the sketch emerge live

## Right Level

The sketch should look like something drawn in 2 minutes on a whiteboard — bordered
screen frames, labeled regions inside them, bracketed actions, and a flow summary.

All paths are relative to the skill root directory (`skills/fat-marker-sketch/`).
See `assets/example-fat-marker-sketch.jpg` for a visual reference of the target fidelity.
