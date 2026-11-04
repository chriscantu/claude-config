# Stakeholder-Map — Chart Rendering (Mode A)

A local HTML page for the leader-onboarding view.

## Where it goes

These rules cover both stakeholder pages: this chart and the heatmap in
[heatmap-render.md](heatmap-render.md).

Copy the page's template to the session scratchpad under its file name,
overwriting any earlier copy. For this chart: `assets/chart-template.html` as
`stakeholder-map-chart.html`. Fill it in and open it with `open <file>`. Never
write it into a repo. The page shows people's names and assessments, so it
follows the Privacy rule in SKILL.md: it stays on this machine.

HTML-escape `&`, `<`, `>` and `"` in every value you insert (names, teams,
bucket names, banner text, rationales), so a value like `Ops <interim>` shows as
text.

If writing the file fails or `open` exits non-zero, print the page's Text
Fallback instead.

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

If no entity is on the map, don't write or open the page: its keys would explain
boxes that aren't there. Print this line instead:
`Nobody is on the map yet. Run /stakeholder-map --mode=leader-onboarding to add people.`

## Layout

One `.col` per category, left to right, in this order:

| Column | Category | Heading | In lists |
|--------|----------|---------|----------|
| 1 | `direct_report` | Direct Reports | direct report |
| 2 | `skip` | Skips | skip |
| 3 | `peer` | Peers | peer |
| 4 | `skip_up` | Skip-Ups | skip-up |
| 5 | `cross_functional` | Cross-Functional | cross-functional |

Within each column, sort nodes by meet-in-what-order score, highest first (see
"Meet-in-What-Order List" below for the formula). Break equal scores with the
**canonical sort-order tie-break** from
[graph-schema.md](graph-schema.md#canonical-sort-order-for-ties). Leave out a
column that has no people.

## Node Encoding

Each person is one `.node`. Its class encodes **formal power** as box size:

| Formal power | Class | Box |
|--------------|-------|-----|
| `high` | `formal-high` | 220px wide, solid |
| `medium` | `formal-medium` | 180px wide, solid |
| `low` | `formal-low` | 140px wide, solid |
| unknown | `formal-unknown` | 140px wide, dashed |

Inside the node:
- `.name`: `{name}`
- `.meta`: `{function} - {team}`. If only one is known, show it alone with no
  ` - `. Leave out the `.meta` line if both are unknown.
- `.met`: `[x]` if at least one `[coverage:met]` observation exists, else `[ ]`

**Informal power badge** — a circle on the node's top-right corner. It is a
`<span>` with class `.badge` plus the class for its level:

| Informal power | Class | Circle |
|----------------|-------|--------|
| `high` | `badge-high` | 24px wide |
| `medium` | `badge-medium` | 16px wide |
| `low` | `badge-low` | 10px wide |

No badge when informal power is unknown.

## Relations

List each relation under **Relations** as one line, using the class for its type:

| Relation | Class | Line |
|----------|-------|------|
| `reports_to` | `rel-reports_to` | solid |
| `reports_to_informally` | `rel-reports_to_informally` | dashed |
| `influences` | `rel-influences` | dotted |

Text: `{source} reports to {target}`, `{source} informally reports to {target}`,
or `{source} influences {target}`. Skip relations whose target is not on the chart.

Order: by relation type in the table order above, then by source name, then by
target name. Compare names in case-sensitive Unicode codepoint order (step 4 of
the [canonical sort order](graph-schema.md#canonical-sort-order-for-ties)).

## Meet-in-What-Order List

Under **Meet in What Order**, an `<ol>` of the top 10 stakeholders by score.

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
10 lines, one `<li>` each:

```
{name} - {in-lists label}, formal power {level}, informal power {level}
```

`{in-lists label}` comes from the Layout table. `{level}` is `high`, `medium`,
`low` or `unknown`. Add `, not met yet` at the end only when the person has no
`[coverage:met]` observation.

Leave both **Key** blocks as the template has them: the main key under the
columns, and the bar key under the Relations heading.

## Text Fallback

The markdown to print when the page can't be shown (see Where it goes):

```markdown
# Stakeholder Map (text)

## By Category

### Direct Reports
- {name} - {function}, {team}, formal power {level}, informal power {level}, {met | not met yet}
...

## Meet in What Order (top 10)
1. {same line as the HTML list}
...
```
