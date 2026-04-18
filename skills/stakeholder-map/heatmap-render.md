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
   outline frame at y=90, height=60, width=1200. The `themes` field for
   `possible` carries exactly the top-2 theme slugs (or 1 if only one theme
   exists) in sort order from coverage-queries.md step 4. The banner text for
   `"possible"` is authored in coverage-queries.md step 6 — this file emits it
   verbatim, it does not re-format the join.
   - If `status == "possible"`: emit the step-6 banner string.
   - If `status == "healthy"`: "Advice spans {distinct_themes} themes. Healthy
     diversity." (uses the count, not theme names, to avoid crowding the banner).
3. **Heatmap grid** — starting at y=180. One row per dimension, one cell per
   bucket. Bucket order within each row follows the **Bucket ordering** rule in
   [graph-schema.md](graph-schema.md#bucket-ordering-for-dimension-outputs).
   Columns share the widest dimension's cell count; shorter dimensions are
   right-padded with empty-slot cells (no text, no stroke) to keep column
   alignment.
4. **Structural gaps list** — below the grid. Numbered `text` lines.
5. **Next-interviews list** — below structural gaps. Numbered `text` lines.

## Heatmap Grid Cell Encoding

Classify each cell by applying these rules in order; the first match wins:

1. **Unknown** — the bucket is the `unknown` bucket for its dimension (no data
   vs. a real bucket with count 0). Stroke: dashed, `strokeWidth: 1`.
2. **Empty gap** — `count == 0`. Stroke: solid, `strokeWidth: 1`.
3. **Undercovered** — `count == 1` OR the bucket is in `gap_buckets` with
   `count < 2`. Stroke: solid, `strokeWidth: 1`.
4. **Well-covered** — `count >= 2` AND bucket is NOT in `gap_buckets`. Stroke:
   solid, `strokeWidth: 4`.

Summary table (informational — the rule order above is authoritative):

| Cell state | Stroke |
|------------|--------|
| Well-covered | solid, `strokeWidth: 4` |
| Undercovered | solid, `strokeWidth: 1` |
| Empty gap | solid, `strokeWidth: 1` |
| Unknown | dashed, `strokeWidth: 1` |

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
