# Excalidraw — Color Palette & Font Rules

## Design for Dark Canvas

Use bright stroke colors against the dark canvas. Shapes use transparent backgrounds
with colored strokes — only badges, glow layers, and scatter dots get solid fills.

## Stroke & Fill Colors

| Color | Hex | Fill use (badges/dots only) |
|-------|-----|-----------------------------|
| Blue | `#3b82f6` | Same |
| Purple | `#8b5cf6` | Same |
| Green | `#22c55e` | Same |
| Orange/Amber | `#f59e0b` | Same |
| Red | `#ef4444` | Same |
| Cyan | `#06b6d4` | Same |
| Pink | `#ec4899` | Same |
| Lime | `#a3e635` | Same |
| Gray (structure) | `#475569` | — |
| Gray (subtle) | `#334155` | — |

## Text Colors

| Role | Hex |
|------|-----|
| Title / heading | `#e2e8f0` |
| Body text | `#cbd5e1` |
| Subtitle / secondary | `#64748b` or `#94a3b8` |
| Footer tagline | `#fbbf24` |
| Code / monospace | `#22c55e` (prompt) or `#94a3b8` (body) |

## Font Rules

| Font | Use for |
|------|---------|
| **Helvetica** (`"helvetica"`) | Titles, headings, labels |
| **Excalifont** (`"excalifont"`) | Descriptions, bullets, secondary text |
| **Monospace** (`3`) | Code snippets, terminal prompts, file names |

Do NOT use Lilita One or Comic Shanns.

| Element | Font | Size |
|---------|------|------|
| Diagram title | Helvetica | 24-44px |
| Section heading | Helvetica | 20-28px |
| Element label | Helvetica | 14-16px |
| Description / bullets | Excalifont | 13-16px |
| Subtitle | Excalifont | 13-15px |
| Footer tagline | Excalifont | 12-13px |
| Code text | Monospace | 11-14px |

## Colored Dot Bullets

Instead of text bullets (`•`), use small filled ellipses (10-12px) next to text.
Use a different color per bullet for variety:

```json
{"type": "ellipse", "x": 105, "y": 345, "width": 12, "height": 12,
 "backgroundColor": "#3b82f6", "strokeColor": "#3b82f6", "roughness": 0},
{"type": "text", "x": 128, "y": 340, "width": 300, "height": 22,
 "text": "Think through problems", "fontSize": 16, "fontFamily": "excalifont", "strokeColor": "#cbd5e1"}
```
