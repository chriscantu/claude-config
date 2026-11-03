# Excalidraw Rendering (Optional)

Use Excalidraw only when the user asks for it. HTML through the Artifact tool is the
default (see `html-rendering.md`).

Excalidraw needs the `mcp__excalidraw__*` tools and a running canvas server. If the
canvas isn't reachable, tell the user, then render the sketch in HTML right away.
Don't wait for the canvas: a missing server must never stop the design work.

## Style

- Outline-only shapes. No fills.
- Excalifont (the default) for all labels.
- Transparent background, so it reads as a whiteboard.
- Rectangles for screens and regions, arrows for flow connections.
- No colors and no shadows: black strokes only.

## Staged drawing

Build the sketch in 4 passes, so the user sees it appear. Pass 1 makes one
`batch_create_elements` call per screen frame. Passes 2-4 make one call each.

| Pass | What to create | How |
|------|----------------|-----|
| 1. Skeleton | Outermost screen frames only | One call **per frame** |
| 2. Titles + regions | Screen title labels + inner region boxes | Single batch |
| 3. Content + actions | Representative text, inputs, `[buttons]`, radio groups | Single batch |
| 4. Connections | Arrows bound between screens + FLOW text at the bottom | Single batch |

## Font sizes

Excalifont renders blurry below 13px. Never use a fontSize below 13.

| Element | Minimum fontSize |
|---------|-----------------|
| Sketch / composite header | 20px |
| Screen title | 16px |
| Body labels, questions, actions | 13px |

## Self-check

- No font size below the minimums above. Fix crowding by cutting elements, not font size.
- Not all elements in one `batch_create_elements` call.
- No shapes with fills or background colors.
- Background is transparent, not dark or colored.
