# HTML Fallback Rendering

Fall back to HTML only when `mcp__excalidraw__*` tools are absent. When using HTML:

- Start from `assets/sketch-template.html`
- Include Google Font: `<link href="https://fonts.googleapis.com/css2?family=Permanent+Marker&display=swap" rel="stylesheet">`
- The root element MUST set `background: #fff; color: #000; font-family: 'Permanent Marker', cursive; font-size: 20px;`
- Use `border: 4px solid #000` for screen frames and `border: 3px solid #000` for regions
- Use uneven `border-radius` values (e.g., `2px 5px 4px 3px`) on every box — vary the
  values so no two boxes have the same radius
- Do NOT inherit the host page's theme

Never output the sketch as plain prose or an unstyled text list. If it doesn't have
visible boxes/borders around screens and regions, it's not a sketch — it's notes.

See `assets/example-ui-sketch.html` for a reference of the target structure (HTML fallback).
