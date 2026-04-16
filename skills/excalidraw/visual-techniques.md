# Excalidraw — 10 Visual Techniques

Building blocks for every diagram. Combine them to create professional visuals.

## 1. Layered Glow Effect

Stack 2-3 rectangles at decreasing opacity behind a shape for depth:

```json
{"id": "glow-outer", "type": "rectangle", "x": 95, "y": 95, "width": 210, "height": 70,
 "backgroundColor": "#a5d8ff", "opacity": 20, "strokeColor": "transparent"},
{"id": "glow-inner", "type": "rectangle", "x": 98, "y": 98, "width": 204, "height": 64,
 "backgroundColor": "#a5d8ff", "opacity": 40, "strokeColor": "transparent"},
{"id": "main-box", "type": "rectangle", "x": 100, "y": 100, "width": 200, "height": 60,
 "text": "Core Service", "backgroundColor": "#a5d8ff", "strokeColor": "#1971c2"}
```

## 2. Color-Coded Zones

Low-opacity background rectangles group related elements. Use free-standing text label
at top corner (never `text` on the zone rectangle — it centers and overlaps children):

```json
{"id": "zone-bg", "type": "rectangle", "x": 50, "y": 50, "width": 500, "height": 300,
 "backgroundColor": "#e9ecef", "opacity": 30, "strokeColor": "#868e96"},
{"id": "zone-label", "type": "text", "x": 70, "y": 60, "width": 200, "height": 30,
 "text": "Backend Services", "fontSize": 18, "fontFamily": "helvetica"}
```

## 3. Bound Arrows with Labels

Arrows snap to shapes using element IDs:

```json
{"id": "svc-a", "type": "rectangle", "x": 100, "y": 100, "width": 160, "height": 60,
 "backgroundColor": "transparent", "strokeColor": "#3b82f6", "roughness": 0, "text": "API Gateway"},
{"id": "svc-b", "type": "rectangle", "x": 400, "y": 100, "width": 160, "height": 60,
 "backgroundColor": "transparent", "strokeColor": "#22c55e", "roughness": 0, "text": "Database"},
{"type": "arrow", "x": 0, "y": 0, "startElementId": "svc-a", "endElementId": "svc-b", "text": "SQL"}
```

## 4. Line Styles as Meaning

- **Solid** = synchronous / primary flow
- **Dashed** (`strokeStyle: "dashed"`) = asynchronous / secondary
- **Dotted** (`strokeStyle: "dotted"`) = optional / planned

## 5. Diamond Decision Nodes

Classic flowchart branching:

```json
{"id": "decision", "type": "diamond", "x": 300, "y": 200, "width": 140, "height": 100,
 "backgroundColor": "transparent", "strokeColor": "#f59e0b", "roughness": 0, "text": "Auth OK?"},
{"id": "yes-path", "type": "rectangle", "x": 150, "y": 380, "width": 140, "height": 60,
 "backgroundColor": "transparent", "strokeColor": "#22c55e", "roughness": 0, "text": "Proceed"},
{"type": "arrow", "x": 0, "y": 0, "startElementId": "decision", "endElementId": "yes-path",
 "strokeColor": "#22c55e", "text": "Yes"}
```

## 6. Mixed Shape Types

Encode meaning through shape:
- **Ellipse** = actors, users, external systems
- **Rectangle** = services, processes, components
- **Diamond** = decisions, conditions

## 7. Numbered Badge Circles

Solid-filled circles with white numbers for step sequences:

```json
{"id": "badge-1", "type": "ellipse", "x": 100, "y": 100, "width": 50, "height": 50,
 "backgroundColor": "#1971c2", "strokeColor": "#1971c2", "roughness": 0,
 "text": "1", "fontSize": 24, "textAlign": "center"}
```

## 8. Emoji Icons in Labels

Emojis render well at any size:

```json
{"type": "rectangle", "x": 100, "y": 100, "width": 200, "height": 60,
 "backgroundColor": "transparent", "strokeColor": "#3b82f6", "roughness": 0,
 "text": "🧠 Claude thinks"}
```

## 9. Mermaid Conversion

Convert existing Mermaid diagrams to editable Excalidraw elements:

```
create_from_mermaid("graph TD\n  A[Start] --> B{Decision}\n  B -->|Yes| C[Do Thing]")
```

After conversion, `set_viewport({ scrollToContent: true })` to auto-fit.

## 10. Screenshot-Iterate Loop

The most important technique. After every batch:

```
batch_create_elements -> get_canvas_screenshot -> evaluate -> fix -> re-screenshot
```

Never skip the screenshot step. Always verify before moving on.
