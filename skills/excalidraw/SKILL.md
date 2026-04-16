---
name: excalidraw
description: Draw professional diagrams on a live Excalidraw canvas via MCP. Use when asked to create architecture diagrams, flowcharts, system maps, comparison visuals, or any visual explanation. Covers setup, 10 visual techniques, design preferences, layout best practices, and the screenshot-iterate loop.
---

# Excalidraw Diagramming Skill

Turn text descriptions into professional diagrams on a live Excalidraw canvas. The agent
draws, screenshots its own work, and iterates until clean.

**Reference files** (read on demand, not upfront):
- [color-palette.md](color-palette.md) — colors, text colors, font rules
- [sizing-defaults.md](sizing-defaults.md) — element sizing, spacing, layout rules
- [visual-techniques.md](visual-techniques.md) — 10 techniques with code examples

## Prerequisites: MCP Setup

**Install** (one-time): `git clone https://github.com/yctimlin/mcp_excalidraw && cd mcp_excalidraw && npm ci && npm run build`

**Add to Claude Code**: `claude mcp add excalidraw -s user -e EXPRESS_SERVER_URL=http://localhost:3000 -- node /path/to/mcp_excalidraw/dist/index.js`

**Start canvas** (each session): `cd /path/to/mcp_excalidraw && PORT=3000 npm run canvas` — open `localhost:3000`.

## How It Works

```
Describe → plan layout → batch_create_elements → get_canvas_screenshot → fix → repeat → export
```

The agent sees its own canvas via screenshots — a self-correcting loop.

## Workflow (ALWAYS follow)

1. Call `read_diagram_guide` for design reference
2. Plan layout based on content
3. **Create 3 variations** — snapshot and screenshot each
4. User chooses — refine the pick
5. Final screenshot — verify via Quality Checklist
6. Export

Vary across variations: layout direction, shape variety, info density, visual personality.

## Design Principles

**#1: Transparent backgrounds.** Always `"backgroundColor": "transparent"` on shapes.
Exceptions: badges, glow layers, scatter dots. See [color-palette.md](color-palette.md).

**Dark canvas first.** Bright strokes, light gray text. See [color-palette.md](color-palette.md).

**Plain language.** No jargon unless asked.

**Visual elements:** emoji icons in labels, numbered badge circles (40x40, roughness 0),
gold footer tagline, dashed section dividers, colored dot bullets (not `•` chars).

**Build section by section.** Screenshot after each to verify.

## Quality Checklist

After every `batch_create_elements`, screenshot and check: text truncation, text overflow
(20px+ padding), overlap, arrow crossing, spacing (30px+), readability (14px+ body),
zone labels (free-standing), alignment, font consistency.

Fix failures, re-screenshot, then continue.

## Anti-Patterns

Filled backgrounds, text bullets, skipping 3 variations, skipping screenshots, single
font, fonts <14px, entire diagram in one call, uniform stroke colors.

## Workflows

**New**: clear → read guide → plan → 3 variations → pick → refine → checklist → export
**Refine**: `describe_scene` → `update_element` → screenshot
**Snapshots**: `snapshot_scene` → changes → `restore_snapshot` if needed
**Export**: `.excalidraw`, PNG/SVG, shareable URL

## Error Recovery

Off-screen → `set_viewport({ scrollToContent: true })`. Arrow fails → verify IDs.
Bad state → snapshot, clear, rebuild. Locked → `unlock_elements`. Duplicate text →
`query_elements` for extras with `containerId`.
