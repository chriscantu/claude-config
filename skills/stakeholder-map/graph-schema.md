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
| `[role:<axis>]` | `manager`, `ic` (extensible: `exec`, `staff`) | `[2026-04-18][role:manager]` |

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

## Compatibility With 1on1-prep

- A person entity may exist with only 1on1-prep tags (`[1on1]`, `[context]`, `reports_to`).
  Stakeholder-map reads such entities as partial records and offers an upgrade flow
  (see [`bootstrap.md`](bootstrap.md)).
- Sparse entities (name only, no tags) are valid. Queries in
  [`coverage-queries.md`](coverage-queries.md) report missing tags as `unknown`.
- The observation-date prefix is the single source of truth for timestamps across
  both skills.
