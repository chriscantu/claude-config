# Stakeholder-Map — Chart Rendering (Mode A)

Excalidraw canvas output for the leader-onboarding view.

## Preflight

1. `mcp__Claude_Preview__preview_list` → confirm `excalidraw-canvas` server present.
   If absent: `preview_start("excalidraw-canvas")` (creates or reuses).
2. `mcp__excalidraw__describe_scene` — confirm canvas reachable.
3. If either fails, fall back to the text summary (see bottom of this file) and
   print the hint from SKILL.md.

## Inputs

Query the memory graph for all entities that satisfy the **stakeholder-map
membership predicate** defined in
[graph-schema.md](graph-schema.md#stakeholder-map-membership-predicate). "Latest"
below refers to the **Latest-tag selection** rule in the same file. For each
entity, read:

- Name
- Latest `[role:*]`, `[function:*]`, `[team:*]`, `[category:*]`, `[tenure:*]`
- Latest `[power:formal:*]` and `[power:informal:*]`
- All `[coverage:met]` observations (to compute last-met and met-or-not-yet)
- Relations: `reports_to`, `reports_to_informally`, `influences`

## Layout

Five columns, left to right, in this order (each is a category bucket):

| Column | Category | X origin |
|--------|----------|----------|
| 1 | `direct_report` | 80 |
| 2 | `skip` | 340 |
| 3 | `peer` | 600 |
| 4 | `skip_up` | 860 |
| 5 | `cross_functional` | 1120 |

Column headers at y=60, `fontSize=16`, Excalifont. Within each column, nodes are
sorted by meet-in-what-order score descending (see "Meet-in-What-Order List"
below for the formula), with the **canonical sort-order tie-break** from
[graph-schema.md](graph-schema.md#canonical-sort-order-for-ties) applied to
equal scores. The top-scoring node starts at y=120. Each subsequent node is
placed 20px below the previous node's bottom edge (the 20px is between-node
padding; the first node has no extra top padding beyond y=120).

## Node Encoding

Each person renders as a `rectangle` whose size encodes **formal power**:

| Formal power | Width × Height | Stroke |
|--------------|----------------|--------|
| `high` | 220 × 80 | solid |
| `medium` | 180 × 64 | solid |
| `low` | 140 × 50 | solid |
| unknown | 140 × 50 | dashed (`strokeStyle: "dashed"`) |

Inside the rectangle, a `text` label with `fontSize=13`, Excalifont:
- Line 1: `{name}`
- Line 2: `{function} · {team}` (omit any field that is unknown)

**Informal power badge** — an `ellipse` anchored to the top-right corner of the
node rectangle. Stroke-only, no fill.

| Informal power | Diameter |
|----------------|----------|
| `high` | 24 |
| `medium` | 16 |
| `low` | 10 |
| unknown | no badge |

**Met-or-not-yet marker** — a small `[ ]` (unmet) or `[x]` (met) text anchor at
the bottom-left of the node, `fontSize=13`. "Met" = at least one `[coverage:met]`
observation exists.

## Relations

Draw arrows between bound node IDs. Use `batch_create_elements` with
`startElementId`/`endElementId`:

| Relation | Arrow style |
|----------|-------------|
| `reports_to` | solid, `strokeWidth: 2` |
| `reports_to_informally` | dashed, `strokeWidth: 2` |
| `influences` | dotted, `strokeWidth: 2` |

Skip relations whose target entity is not on the chart.

## Meet-in-What-Order List

Below the chart, starting at y equals `(max column height) + 80`, render a
numbered list of the top 10 stakeholders by score.

Score formula:

```
score = (formal_power_numeric × 2)
      + (informal_power_numeric × 3)
      + category_weight
      + unmet_bonus

formal_power_numeric, informal_power_numeric: high=3, medium=2, low=1, unknown=0
category_weight: direct_report=5, skip=4, peer=3, skip_up=2, cross_functional=1
unmet_bonus: +10 if no [coverage:met] observation exists, else 0
```

Sort descending by score. Break ties using the **canonical sort order** in
[graph-schema.md](graph-schema.md#canonical-sort-order-for-ties). Truncation at
10 is applied after the full sort so the boundary is deterministic. Emit up to
10 lines as `text` elements:

```
1. {name} — {category}, formal={level}, informal={level} [unmet]
```

`fontSize=13`, Excalifont, left-aligned at x=80.

## Staged Drawing

Follow the fat-marker-sketch Pass conventions:

1. **Pass 1 — column frames**: one `batch_create_elements` call per column
   (rectangle bounding the column).
2. **Pass 2 — column titles and node rectangles**: one batch.
3. **Pass 3 — node text, badges, met markers**: one batch.
4. **Pass 4 — relation arrows and meet-in-order list**: one batch.

## Text Fallback

If preflight fails, print this markdown to stdout instead:

```markdown
# Stakeholder Map (text fallback)

_Excalidraw unavailable — run `preview_start("excalidraw-canvas")` and re-render._

## By Category

### Direct Reports
- {name} — {function} · {team} · formal={level}, informal={level} [met|unmet]
...

## Meet in What Order (top 10)
1. {name} — {rationale}
...
```
