# Stakeholder-Map — Heatmap Rendering (Mode B)

A local HTML page for the coverage-review view.

## Where it goes

Follow [chart-render.md](chart-render.md#where-it-goes), with the template
`assets/heatmap-template.html` and the file name `stakeholder-map-heatmap.html`.

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
   Pad each row with `.cell-empty-slot` cells up to the longest row's cell
   count, so the columns line up.
4. **Structural Gaps** — numbered list from `structural_gaps`, one line each:
   `{name} - mentioned in {mention_count} observations, not on the map`
   (write `1 observation` when the count is 1).
5. **Recommended Next Interviews** — numbered list from `next_interviews`, one
   line each: `{name} - {rationale}`.

Keep both list headings even when a list is empty; the list is then one
`<li>None found</li>`.

## Heatmap Grid Cell Encoding

Classify each cell by applying these rules in order; the first match wins:

1. **Unknown** — the bucket is the `unknown` bucket for its dimension: people
   whose field isn't recorded. Class: `cell-unknown`.
2. **Nobody yet** — `count == 0`. Class: `cell-gap`.
3. **Only one** — `count == 1`. Class: `cell-under`.
4. **Out of balance** — the bucket is in `gap_buckets` (so `count >= 2`): its
   portion of the total is too small or too large, per the dimension's gap rule in
   [coverage-queries.md](coverage-queries.md). Class: `cell-unbalanced`.
5. **Well covered** — everything else (`count >= 2`, not in `gap_buckets`).
   Class: `cell-well`.

Every cell matches exactly one rule. The table names each class and its look;
the tests check the look against the template CSS.

| Cell state | Class | Look |
|------------|-------|------|
| Well covered | `cell-well` | solid, thick (4px) |
| Only one | `cell-under` | solid, thin (1px) |
| Nobody yet | `cell-gap` | solid, thin (1px), hatched |
| Out of balance | `cell-unbalanced` | double (4px), labelled |
| Unknown | `cell-unknown` | dashed, thin (1px) |

`cell-gap` is hatched with a bold label, so an empty bucket stands out at a
glance. `cell-unbalanced` adds an "out of balance" line under the count by
itself (from the CSS), so don't type that text. Inside each cell: the bucket
name, a `<br>`, then the count. Put the dimension name in the row's
`.row-label`, capitalized (`Function`, `Role`). Leave the **Key** under the grid
as the template has it.

## Text Fallback

The markdown to print when the page can't be shown (see Where it goes):

```markdown
# Coverage Review (text)

{freshness_banner}

{if echo_chamber: "> Advice has clustered around ..."}

## Coverage

### {dimension_name}
- {bucket}: {count} {"(nobody yet)" | "(only one)" | "(out of balance)" per the cell rules, else nothing}
...

## Structural Gaps
1. {name} - mentioned in {mention_count} observations, not on the map
...

## Recommended Next Interviews
1. {name} - {rationale}
...
```
