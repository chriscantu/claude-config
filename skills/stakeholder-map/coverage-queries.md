# Stakeholder-Map — Coverage Queries (Mode B)

Five dimension queries plus echo-chamber and structural-gap detection.

## Preconditions

See SKILL.md:
- Graph empty → exit with "Graph is empty. Run leader-onboarding first."
- Graph sparse (<10 tagged entities) → warn and prompt to continue.

## Inputs

`mcp__memory__read_graph` once per run. Build an in-context lookup from entity
name → `{ observations, relations }`. Restrict the lookup to entities satisfying
the **stakeholder-map membership predicate** in
[graph-schema.md](graph-schema.md#stakeholder-map-membership-predicate). All
queries operate on this restricted lookup.

"Latest tag" reads in this file use the **Latest-tag selection** rule in
graph-schema.md. Date windows use the **Date arithmetic** rule. Bucket
ordering uses the **Bucket ordering** rule. Tie-breaks use the **Canonical
sort order**. No query in this file invents its own variant of those rules.

## Dimension Queries

For each dimension, produce `{ buckets: { bucket_name: count }, gap_buckets: [list] }`.

### 1. Hierarchy

- Buckets: `direct_report`, `skip`, `peer`, `skip_up`, `cross_functional`.
- Gap: any bucket with count 0, OR any bucket whose count is <20% of the total
  (lopsided).

### 2. Team

- Buckets: distinct latest `[team:*]` values across all member entities, ordered
  per the Bucket ordering rule.
- Known-but-not-met: team names that appear in `[context]` observation bodies.
  Extract candidates with the case-insensitive regex
  `\b(?:the\s+)?([A-Za-z][A-Za-z0-9-]+)\s+team\b` applied to each `[context]`
  observation's free-text body (the portion after the final `]`). Lowercase the
  capture group, dedupe. A candidate is "known-but-not-met" when it does NOT
  appear as a lowercased `[team:*]` value on any member entity. Surface these as
  "team mentioned but nobody met" candidates.
- Gap: any known team with zero entities directly tagged.

### 3. Function

- Buckets: the canonical enum
  (`engineering`, `product`, `design`, `data`, `security`, `sre`).
- Gap: any canonical function with count 0.

### 4. Role Diversity

- Buckets: `manager`, `ic`, `exec`, `staff` (plus any canonical extensions
  listed in [graph-schema.md](graph-schema.md)). Ordered per the Bucket ordering
  rule.
- Gap: any single bucket holding ≥90% of the total (unknown-tagged entities
  excluded from the percentage base).

### 5. Tenure Diversity

- Buckets: `long`, `new`.
- Gap: any single bucket holding ≥90% of the total (unknown-tagged entities
  excluded from the percentage base).

For each dimension, entities missing the relevant tag count as `unknown` (reported
separately, not as a gap). An entity counts in at most one bucket per dimension
(the latest tag value for that dimension).

## Echo-Chamber Heuristic

Operates on `[advice]` observations from the **last 30 calendar days** (per the
Date arithmetic rule in graph-schema.md).

1. Collect every observation whose tag list includes `[advice]` and whose
   `[YYYY-MM-DD]` prefix is within the last 30 calendar days. Dedupe by
   `(entityName, observationIndex)` — the same underlying observation is never
   counted twice.
2. If count < 3 → skip the check entirely. Do not flag, do not cluster.
3. Cluster by theme using a **constrained LLM pass**:
   - **System message (fixed text):** "Group the advice entries below into at
     most 5 themes. Each advice entry belongs to exactly one theme. A theme has
     a short lowercase slug (1-3 words, hyphens allowed) and a one-sentence
     summary. Return JSON matching the schema; no other text."
   - **User message:** numbered list of advice entries (`N. {verbatim text}`).
   - **Generation parameters:** temperature 0, top_p 1.
   - **Response JSON schema (strict):**
     ```json
     {
       "type": "object",
       "required": ["themes"],
       "additionalProperties": false,
       "properties": {
         "themes": {
           "type": "array",
           "minItems": 1,
           "maxItems": 5,
           "items": {
             "type": "object",
             "required": ["slug", "summary", "advice_indices"],
             "additionalProperties": false,
             "properties": {
               "slug": {"type": "string", "pattern": "^[a-z0-9][a-z0-9-]{0,30}$"},
               "summary": {"type": "string", "maxLength": 160},
               "advice_indices": {
                 "type": "array",
                 "minItems": 1,
                 "items": {"type": "integer", "minimum": 1}
               }
             }
           }
         }
       }
     }
     ```
   - **Validation:** every advice index must appear in exactly one theme; union
     of indices must equal the input set. On validation failure, retry once with
     the same inputs. On second failure, emit no echo-chamber flag and include
     `"clustering_failed": true` in the coverage-review audit log.
   - No keyword matching or hand-rolled NLP — the schema-constrained LLM pass is
     the only theming mechanism.
4. Compute:
   - `total` = count of advice entries in step 1.
   - `theme_counts[slug]` = length of `advice_indices` for each theme, sorted
     descending by count; ties broken by `slug` ascending.
   - `top_two_share` = `(theme_counts[0] + theme_counts[1]) / total` (if only
     one theme exists, use `theme_counts[0] / total`).
   - `distinct_themes` = number of themes with count ≥ 1.
   - `dominant_share` = `theme_counts[0] / total`.
5. Classification (evaluated in order; first match wins):
   - `top_two_share ≥ 0.70` → `echo-chamber: possible`. Include the top-2 theme
     slugs and summaries.
   - `distinct_themes ≥ 3` AND `dominant_share ≤ 0.50` → `echo-chamber:
     healthy diversity`. Include `distinct_themes` count only (no summaries).
   - Otherwise → no flag (insufficient signal).
6. Tone: "Advice has clustered around {slug_1} and {slug_2}. Worth checking if
   you're hearing the full range." Never "WARNING" framing. Exactly the top-2
   slugs, comma-separated, lowercased, in the order produced by step 4.

## Freshness Prompt

On every Mode B run (all date arithmetic per graph-schema.md):

1. For each member entity with any `[coverage:met]` observation, compute
   `last_met` = the greatest `[YYYY-MM-DD]` prefix among its `[coverage:met]`
   observations.
2. Count member entities where `today - last_met > 30` calendar days. Entities
   with zero `[coverage:met]` observations are NOT counted as stale (they are
   counted separately as "never met" when rendering next-interviews).
   Call the count `stale_count`.
3. Emit a one-line banner at the top of Mode B output:

> "Map last updated {most_recent_any_write_date}. {stale_count} stakeholders
> haven't had a fresh interaction in >30 days."

`most_recent_any_write_date` = the greatest `[YYYY-MM-DD]` across any
observation on any member entity. If no observations exist (empty map),
emit "Map empty — run /stakeholder-map --mode=leader-onboarding first."

## Structural-Gap Detection

Names mentioned in observation text but not tracked as entities.

1. Scan every member entity's observation free-text body (the portion after the
   final `]`).
2. Regex for capitalized name-shaped tokens:
   `\b[A-Z][a-z'\-]+(?:\s+[A-Z][a-z'\-]+)+\b`
   (requires at least two capitalized words to avoid matching single capitalized
   technical terms; accepts apostrophes and hyphens in surnames such as
   `O'Brien` and `Van-Horn`).
3. **Normalization:** trim whitespace; collapse internal runs of whitespace to a
   single space; preserve original casing. Two mentions are the same candidate
   when their normalized strings are byte-identical (`Jane Smith` ≠ `Jane H.
   Smith` — they surface as two candidates; the user can merge).
4. **Counting:** count distinct observations that contain the candidate (an
   observation with 3 mentions of `Jane Smith` counts as 1). Do not count an
   observation more than once per candidate.
5. For each candidate, `search_nodes` — if no entity exists with that exact name,
   add to the candidate list with the observation count from step 4.
6. Sort candidates by count descending; break ties per the canonical sort order
   (by name ascending, since entity-specific fields don't apply to untracked
   names).
7. For each candidate with count ≥ 2: emit
   "Name `{X}` came up in {count} observations but isn't tracked. Meet them?"

## Recommended Next Interviews

1. For each dimension's gap buckets, pick up to 2 member entities whose traits
   partially fill the gap if met (e.g., for a function gap, entities in that
   function who have `[coverage:met]` absent or stale).
2. Score each candidate by `gap_severity × category_weight`:
   - `gap_severity`: 1.0 if no entity covers the bucket, 0.5 if undercovered
     (<2 entries), 0.0 if well-covered.
   - `category_weight`: same as Mode A (direct_report=5, skip=4, peer=3,
     skip_up=2, cross_functional=1, unknown=0).
3. Sort descending by score. Break ties per the **canonical sort order** in
   [graph-schema.md](graph-schema.md#canonical-sort-order-for-ties). Take top 5
   AFTER the full sort so the truncation boundary is deterministic.
4. Each entry includes:
   - Name
   - Rationale string: `fills {dimension}:{bucket} gap` or
     `circle back: last met {N} days ago` (N computed per Date arithmetic). If
     a candidate qualifies under both, emit the `fills {dimension}:{bucket}
     gap` form (gap-fill takes precedence over circle-back).

## Output Shape

Pass this structure to [heatmap-render.md](heatmap-render.md):

```
{
  freshness_banner: string,
  dimensions: [
    { name, buckets: { bucket: count }, gap_buckets: [string], bucket_order: [string] },
    ...
  ],
  echo_chamber: null | {
    status: "possible" | "healthy",
    themes: [string],            // top-2 slugs for "possible"; empty for "healthy"
    distinct_themes: integer,    // total theme count (both statuses)
    clustering_failed?: boolean  // true only when the LLM pass failed twice
  },
  structural_gaps: [ { name, mention_count } ],
  next_interviews: [ { name, rationale } ]
}
```

`bucket_order` on each dimension is the canonical order from the Bucket ordering
rule — renderers do not re-sort.
