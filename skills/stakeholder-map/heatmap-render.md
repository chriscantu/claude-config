# Stakeholder-Map — Heatmap Rendering (Mode B)

Excalidraw canvas output for the coverage-review view.

## Preflight

Identical to [chart-render.md](chart-render.md) preflight:
1. `preview_list` → ensure `excalidraw-canvas` running (`preview_start` if not).
2. `describe_scene` → confirm reachable.
3. On failure, emit the text fallback at the bottom of this file.

## Inputs

The output shape from [coverage-queries.md](coverage-queries.md):

```
{ freshness_banner, dimensions, echo_chamber, structural_gaps, next_interviews }
```

## Layout

Canvas sections, top to bottom:

1. **Freshness banner** — single-line `text` element at y=40, `fontSize=16`,
   Excalifont, full-width.
2. **Echo-chamber banner** (only if `echo_chamber` is non-null) — `rectangle`
   outline frame at y=90, height=60, width=1200. Inside:
   - If `status == "possible"`: "Advice has clustered around {themes.join(', ')}.
     Worth checking if you're hearing the full range."
   - If `status == "healthy"`: "Advice spans {themes.length} themes. Healthy
     diversity."
3. **Heatmap grid** — starting at y=180. One row per dimension, one cell per
   bucket. Columns share the widest dimension's cell count (pad shorter
   dimensions with empty cells).
4. **Structural gaps list** — below the grid. Numbered `text` lines.
5. **Next-interviews list** — below structural gaps. Numbered `text` lines.

## Heatmap Grid Cell Encoding

| Cell state | Stroke |
|------------|--------|
| Well-covered (count ≥ 2 and not in `gap_buckets`) | solid, `strokeWidth: 4` |
| Undercovered (count = 1, or in `gap_buckets` with count < 2) | solid, `strokeWidth: 1` |
| Empty gap (count = 0, in `gap_buckets`) | solid, `strokeWidth: 1` |
| Unknown (no data for this bucket) | dashed, `strokeWidth: 1` |

Cells are outline-only (`backgroundColor: transparent`). Inside each cell, two
stacked `text` elements:
- Bucket name (fontSize=13)
- Count (fontSize=13)

Row labels (dimension names) to the left of each row at x=40, `fontSize=16`.

## Staged Drawing

1. **Pass 1 — banners**: one batch (freshness + echo-chamber if present).
2. **Pass 2 — grid skeleton**: row labels + empty cell rectangles, one batch.
3. **Pass 3 — cell content**: bucket-name and count text elements, one batch.
4. **Pass 4 — lists**: structural gaps + next-interviews text elements, one batch.

## Text Fallback

If preflight fails, print markdown:

```markdown
# Coverage Review (text fallback)

_Excalidraw unavailable — run `preview_start("excalidraw-canvas")` and re-render._

{freshness_banner}

{if echo_chamber: "> Advice has clustered around ..."}

## Coverage

### {dimension_name}
- {bucket}: {count} {if in gap_buckets: "(gap)"}
...

## Names That Came Up
1. {name} — mentioned in {count} observations
...

## Recommended Next Interviews
1. {name} — {rationale}
...
```
