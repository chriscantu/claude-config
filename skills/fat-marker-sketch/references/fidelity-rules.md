# Fidelity Rules — Step 2 Detail

Apply these fidelity rules regardless of format:

- **Black on white** — black strokes and text. For excalidraw: outline-only shapes on a
  transparent canvas (like marker on a whiteboard). For HTML fallback: set an explicit
  white background and black text on the root element. Do NOT rely on the host page's theme.
- **Journey-focused** — show the full user journey across screens or steps, not a
  single screen in isolation. Number each screen/step.
- **Structural boxes** — each screen is a thick-bordered (4px) rectangle. Regions
  within screens are 3px-bordered rectangles. Use uneven border-radius on every box
  so they look hand-drawn. The boxes ARE the sketch — without them you just have a
  text list.
- **Representative content** — include enough text to understand what each region DOES,
  not just what it IS. "Q: How often paid?" is good — it tells you the screen is a
  guided questionnaire. "Goal Card" is too abstract. But don't write full copy or
  real data for every field.
- **Explicit actions** — label every user action in brackets: [Get Started], [Next],
  [Activate], [+ Add Goal]. These make the flow traceable.
- **No styling** — no colors, no shadows, no fills. For excalidraw: outline-only shapes
  with Excalifont labels. For HTML fallback: uneven border-radius for a hand-drawn feel
  is the one exception. Crude progress indicators (block characters in HTML, thin
  rectangles in excalidraw) are fine for showing proportional state.
- **ASCII-safe characters only** — use `->` for arrows, `[x]` for checked, `[ ]` for
  unchecked. For HTML fallback: do NOT use Unicode arrows or checkmarks — they render
  as garbled text in minimal HTML viewers. For excalidraw: standard ASCII is still
  preferred for simplicity, but Unicode is safe.
- **Show relationships** — how components connect (tap this -> see that, service A calls
  service B). For UI, include a FLOW section mapping connections as plain text.
- **No bullets inside boxes** — a box holds a single label or a single representative
  phrase, not a bulleted list. If a box contains more than one bullet, it has become a
  note card. Split the box into multiple boxes, or drop the bullets to a single label.
  "Notes with borders" is the anti-pattern this skill exists to prevent.

## Properties

The sketch should:

- Fit in one screen (all screens of the journey visible together)
- Take under 2 minutes to produce
- Be disposable — it's a conversation tool, not a deliverable
- Show the **full journey** across screens/steps, not a single screen in detail
- Include representative content and explicit actions
- Omit edge cases, error states, and configuration options
