# Excalidraw — Sizing Defaults & Layout Rules

## Element Sizing

| Element | Width | Height |
|---------|-------|--------|
| Step card (vertical) | 340-460px | 40-55px |
| Step card (horizontal) | 110-220px | 38-55px |
| Badge circle | 40px | 40px |
| Bullet dot | 10-12px | 10-12px |
| Hub node (ellipse) | 140px | 65px |
| Satellite node | 100-130px | 38-45px |
| Code block | 240-700px | 50px |
| Layer row | 460-600px | 45px |
| Inner service box | 90-100px | 28-32px |

## Spacing Rules

- **Between shapes**: 30-40px gap between connected cards/zones
- **Vertical tiers**: 80-120px between rows (room for arrow labels)
- **Shape width**: `max(600, labelCharCount * 9)` for heading + description; `max(160, labelCharCount * 9)` for simple labels
- **Shape height**: 60px single-line, 80px two-line, 110px for step cards with descriptions
- **Zone padding**: 50px on all sides around contained elements

## Alignment

- Same-role elements share the same x or y coordinate
- Center titles and footers relative to card stack width
- Badges aligned at same x offset within cards

## Text Handling (Critical — prevent overflow)

- **Always pre-wrap** with manual `\n` line breaks — never rely on auto-wrap
- **Max ~40 chars/line** for description text at 14px
- **Max ~35 chars/line** for heading text at 22px
- **20px+ padding** between text and box edges on all sides
- Simple label-only boxes: width = `max(100, labelCharCount * 9)`

## Multi-Diagram Layouts

- **2 diagrams**: side by side, ~530px apart
- **3 diagrams**: row of 3, ~530px column spacing
- **6 diagrams (3x2)**: columns at x=50, 560, 1080; rows at y=20, 460; cells ~480x420px

Namespace element IDs by diagram number (e.g., `d1-title`, `d2-hub`).

## Arrow Rules

- Always use `startElementId`/`endElementId` for binding
- Labels under 12 characters
- Route around unrelated shapes with waypoints

**Curved**: `"points": [[0,0],[50,-40],[200,0]], "roundness": {"type": 2}`
**Elbowed**: `"points": [[0,0],[0,-50],[200,-50],[200,0]], "elbowed": true`

## Zone Labels (Critical)

Never put `text` on a large background rectangle (centers and overlaps children).
Create a separate text element at the top corner instead.

## Custom Element IDs

Always assign custom `id` values so arrows can reference them and elements can be
updated later.
