# Stakeholder-Map — Graph Schema

This schema extends the 1on1-prep memory graph conventions (see
[`../1on1-prep/graph-schema.md`](../1on1-prep/graph-schema.md) for the base entity,
observation format, and structural tags). New tags and relations below are additive —
they coexist with 1on1-prep's `[1on1]`, `[context]`, `[followup]`, and `reports_to`.

## Privacy

Entities may contain sensitive assessments of individuals. Storage is local memory
MCP only — never export to repo or share the raw graph.

## Observation Format (inherited)

```
[YYYY-MM-DD][<tag1>][<tag2>]... <observation text>
```

The leading `[YYYY-MM-DD]` is the canonical timestamp. Event-style tags (e.g.
`[coverage:met]`) do not repeat the date inside the tag — read it from the prefix.

## New Observation Tags

### Replaceable tags (one value per entity at a time)

Writing a replaceable tag deletes prior observations whose tag prefix matches, then
writes the new one. This keeps assessments current without accumulating stale reads.

| Tag | Values | Example |
|-----|--------|---------|
| `[power:formal:<level>]` | `high`, `medium`, `low` | `[2026-04-18][power:formal:high]` |
| `[power:informal:<level>]` | `high`, `medium`, `low` | `[2026-04-18][power:informal:medium]` |
| `[category:<type>]` | `direct_report`, `skip`, `peer`, `skip_up`, `cross_functional` | `[2026-04-18][category:peer]` |
| `[function:<name>]` | `engineering`, `product`, `design`, `data`, `security`, `sre` | `[2026-04-18][function:product]` |
| `[team:<name>]` | free text | `[2026-04-18][team:platform]` |
| `[tenure:<axis>]` | `long`, `new` | `[2026-04-18][tenure:long]` |
| `[role:<axis>]` | `manager`, `ic`, `exec`, `staff` | `[2026-04-18][role:manager]` |

**Adding values:** Writers may introduce new values for the enum-style tags (`category`, `function`, `role`, `tenure`) but must update this table in the same commit so consumers know what to expect.

**Replaceable-tag write protocol:**
1. `search_nodes` on the entity name.
2. Scan `observations` for entries whose tag portion starts with the tag prefix
   being written (e.g. `[power:formal:`).
3. `delete_observations` on each match.
4. `add_observations` with the new value.

If step 3 succeeds and step 4 fails, surface a warning and prompt the user to re-tag.

### Append-only tags (accumulate as events)

| Tag | Purpose | Example |
|-----|---------|---------|
| `[advice]` | Concrete advice/caution/suggestion offered; content is the user's verbatim text | `[2026-04-18][advice] focus on payments rewrite before re-platforming` |
| `[coverage:met]` | Meeting event marker; the leading date IS the met-date | `[2026-04-18][coverage:met] intro lunch` |

Never delete append-only observations. Patterns (echo-chamber, freshness) are derived
by counting and sorting, not by replacement.

## New Relations

| Relation | Meaning |
|----------|---------|
| `reports_to` | Formal reporting line (inherited from 1on1-prep) |
| `reports_to_informally` | Informal power line — "everyone runs ideas past this person first" |
| `influences` | Broader influence: mentor, back-channel collaborator, longtime partner |

Relations are created via `create_relations` and cleaned up with `delete_relations`.
Do not create a relation unless both entities exist in the graph.

## Shared Computation Rules

These rules are canonical. Any file in this skill that mentions membership,
"latest" tag values, date windows, sort order, or tag matching MUST defer to this
section rather than restating its own rule.

### Stakeholder-map membership predicate

An entity is **on the stakeholder map** if and only if it has at least one
observation whose tag portion matches one of these prefixes:

- `[category:`
- `[power:formal:`
- `[power:informal:`
- `[function:`
- `[role:`
- `[tenure:`
- `[team:`

`[context]`, `[coverage:met]`, `[advice]`, `[1on1]`, and `[followup]` observations
do NOT confer membership on their own. An entity with only `[context]` observations
(e.g., from a calendar `seen-but-skip` or a 1on1-prep upgrade candidate) is NOT on
the map.

This predicate is the single definition used by:
- Mode auto-detection ([SKILL.md](SKILL.md))
- Chart-render entity selection ([chart-render.md](chart-render.md))
- Coverage-query scoping ([coverage-queries.md](coverage-queries.md))

### Replaceable-tag prefix matching

When the write protocol says "tag prefix being written", the match is a literal
string prefix against the bracketed tag portion — not a regex. Examples:

- Writing `[power:formal:high]` matches any prior `[power:formal:*]` observation
  (prefix `[power:formal:`).
- Writing `[category:peer]` matches any prior `[category:*]` observation
  (prefix `[category:`).
- Writing `[team:platform]` matches any prior `[team:*]` observation
  (prefix `[team:`), including free-text team names.

The prefix always ends with the trailing `:` (or `]` for tags with no value
subspace). This prevents `[power:formal:high]` from accidentally matching
`[power:formal-review]` if such a tag were ever introduced.

### Latest-tag selection

When a consumer reads a replaceable tag value (e.g., "latest `[role:*]`"):

1. Filter the entity's observations to those matching the tag prefix.
2. Select the observation with the greatest `[YYYY-MM-DD]` date.
3. On same-date ties: pick the observation with the highest index in the
   `observations` array (last-written wins).
4. If no matching observation exists, the value is `unknown`.

### Date arithmetic

- **"Today"** means the current UTC date (`YYYY-MM-DD`).
- **"Last N days"** means observations whose `[YYYY-MM-DD]` prefix falls in the
  half-open interval `[today - N calendar days, today]`. Always calendar days,
  never 24-hour windows.
- **"Stale by N days"** means `today - last_date > N` calendar days.
- Two agents running on the same graph on the same UTC date MUST produce the
  same freshness and echo-chamber windows.

### Canonical sort order for ties

Any ranked list (next-interviews, meet-in-what-order, structural gaps) that
produces equal primary-score ties MUST break ties in this fixed order:

1. Higher `category_weight` first (direct_report=5, skip=4, peer=3, skip_up=2,
   cross_functional=1; unknown category sorts last with weight=0).
2. Unmet before met (no `[coverage:met]` observation sorts first).
3. More recent latest-`[YYYY-MM-DD]` observation first.
4. Entity name ascending, case-sensitive Unicode codepoint order.

Truncation (e.g., top 10, top 5) is applied AFTER this sort, so ties at the
truncation boundary resolve deterministically.

### Bucket ordering for dimension outputs

When emitting dimension buckets (coverage queries, heatmap grid, fallback text),
order buckets as:

| Dimension | Canonical bucket order |
|-----------|------------------------|
| hierarchy | `direct_report`, `skip`, `peer`, `skip_up`, `cross_functional`, `unknown` |
| function | `engineering`, `product`, `design`, `data`, `security`, `sre`, then any extensions alphabetically, then `unknown` |
| role | `manager`, `ic`, `exec`, `staff`, then any extensions alphabetically, then `unknown` |
| tenure | `long`, `new`, `unknown` |
| team | ascending by `[team:*]` value (case-insensitive), then `unknown` |

### Role-tag extensibility at runtime

The "Adding values" policy on the replaceable tag table assumes a human author
editing this file in a repo. At skill runtime, the agent MUST NOT mint new
values for `category`, `function`, `role`, or `tenure` — only the canonical values
in this file are writable. If the user insists on a value outside the enum,
surface: "This value isn't in the schema. Record it in `[team:*]` or `[context]`
instead, or edit graph-schema.md and re-run."

## Compatibility With 1on1-prep

- A person entity may exist with only 1on1-prep tags (`[1on1]`, `[context]`, `reports_to`).
  Stakeholder-map reads such entities as partial records and offers an upgrade flow
  (see [`bootstrap.md`](bootstrap.md)).
- Sparse entities (name only, no tags) are valid. Queries in
  [`coverage-queries.md`](coverage-queries.md) report missing tags as `unknown`.
- The observation-date prefix is the single source of truth for timestamps across
  both skills.
