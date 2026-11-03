# Stakeholder-Map — Heatmap Rendering (Mode B)

A local HTML page for the coverage-review view.

## Where it goes

Same rules as [chart-render.md](chart-render.md#where-it-goes): copy
`assets/heatmap-template.html` to the session scratchpad as
`stakeholder-map-heatmap.html`, overwriting any earlier copy. Fill it in and open
it with `open <file>`. Never write it into a repo. It follows the Privacy rule in
SKILL.md: it stays on this machine.

HTML-escape `&`, `<`, `>` and `"` in every value you insert (bucket names,
banner text, names, rationales).

If writing the file fails or `open` exits non-zero, print the text summary at the
bottom of this file instead.

## Inputs

The output shape from [coverage-queries.md](coverage-queries.md):

```
{ freshness_banner, dimensions, echo_chamber, structural_gaps, next_interviews }
```

## Layout

Page sections, top to bottom:

1. **Freshness banner** — the `.freshness` line.
2. **Echo-chamber banner** (only if `echo_chamber` is non-null) — the `.echo` box.
   The `themes` field for `possible` carries exactly the top-2 theme slugs (or 1 if only one theme
   exists) in sort order from coverage-queries.md step 4. The banner text for
   `"possible"` is authored in coverage-queries.md step 6 — this file emits it
   verbatim, it does not re-format the join.
   - If `status == "possible"`: emit the step-6 banner string.
   - If `status == "healthy"`: "Advice spans {distinct_themes} themes. Healthy
     diversity." (uses the count, not theme names, to avoid crowding the banner).
3. **Heatmap grid** — one `.row` per dimension, one `.cell` per bucket. Bucket
   order within each row follows the **Bucket ordering** rule in
   [graph-schema.md](graph-schema.md#bucket-ordering-for-dimension-outputs).
   Pad shorter rows with `.cell-empty-slot` cells so the columns line up.
4. **Structural Gaps** — numbered list.
5. **Recommended Next Interviews** — numbered list.

## Heatmap Grid Cell Encoding

Classify each cell by applying these rules in order; the first match wins:

1. **Unknown** — the bucket is the `unknown` bucket for its dimension (no data
   vs. a real bucket with count 0). Class: `cell-unknown`.
2. **Empty gap** — `count == 0`. Class: `cell-gap`.
3. **Undercovered** — `count == 1` OR the bucket is in `gap_buckets` with
   `count < 2`. Class: `cell-under`.
4. **Well-covered** — `count >= 2` AND bucket is NOT in `gap_buckets`. Class:
   `cell-well`.

| Cell state | Class | Border |
|------------|-------|--------|
| Well-covered | `cell-well` | solid, thick (4px) |
| Undercovered | `cell-under` | solid, thin (1px) |
| Empty gap | `cell-gap` | solid, thin (1px) |
| Unknown | `cell-unknown` | dashed, thin (1px) |

The rule order above is authoritative; the table only names the classes. Cells
have no fill. Inside each cell: the bucket name, a `<br>`, then the count. Put
the dimension name in the row's `.row-label`. Keep the **Key** line under the grid.

## Text Fallback

If writing the HTML file fails or `open` exits non-zero, print markdown:

```markdown
# Coverage Review (text)

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
