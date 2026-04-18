# Stakeholder-Map — Coverage Queries (Mode B)

Five dimension queries plus echo-chamber and structural-gap detection.

## Preconditions

See SKILL.md:
- Graph empty → exit with "Graph is empty. Run leader-onboarding first."
- Graph sparse (<10 tagged entities) → warn and prompt to continue.

## Inputs

`mcp__memory__read_graph` once per run. Build an in-context lookup from entity
name → `{ observations, relations }`. All queries operate on this lookup.

## Dimension Queries

For each dimension, produce `{ buckets: { bucket_name: count }, gap_buckets: [list] }`.

### 1. Hierarchy

- Buckets: `direct_report`, `skip`, `peer`, `skip_up`, `cross_functional`.
- Gap: any bucket with count 0, OR any bucket whose count is <20% of the total
  (lopsided).

### 2. Team

- Buckets: distinct `[team:*]` values.
- Known-but-not-met: traverse `reports_to` chains to extract team names mentioned
  in observations but with no met member.
- Gap: any known team with zero entities directly tagged.

### 3. Function

- Buckets: the canonical enum
  (`engineering`, `product`, `design`, `data`, `security`, `sre`).
- Gap: any canonical function with count 0.

### 4. Role Diversity

- Buckets: `manager`, `ic` (record extensible values as their own buckets).
- Gap: any single bucket holding ≥90% of the total.

### 5. Tenure Diversity

- Buckets: `long`, `new`.
- Gap: any single bucket holding ≥90% of the total.

For each dimension, entities missing the relevant tag count as `unknown` (reported
separately, not as a gap).

## Echo-Chamber Heuristic

Operates on `[advice]` observations from the last 30 days.

1. Collect every observation whose tag list includes `[advice]` and whose
   `[YYYY-MM-DD]` prefix is within the last 30 days.
2. If count < 3 → skip the check entirely. Do not flag.
3. Cluster by theme using an LLM pass: prompt the model in-context with the advice
   list and ask for themed groups with a one-line theme summary each. No keyword
   matching or hand-rolled NLP.
4. Compute:
   - `top_two_share` = (count in top 1 or 2 themes) / total
   - `distinct_themes` = number of non-empty themes
   - `dominant_share` = (count in the single top theme) / total
5. Classification:
   - `top_two_share ≥ 0.70` → flag: `echo-chamber: possible`. Include the theme(s).
   - `distinct_themes ≥ 3` AND `dominant_share ≤ 0.50` → `echo-chamber: healthy diversity`.
   - Otherwise → no flag (insufficient signal).
6. Tone: "Advice has clustered around {theme}. Worth checking if you're hearing
   the full range." Never "WARNING" framing.

## Freshness Prompt

On every Mode B run:

1. For each entity with any `[coverage:met]` observation, compute `last_met` =
   the latest `[YYYY-MM-DD]` prefix among its `[coverage:met]` observations.
2. Count entities where `today - last_met > 30 days`. Call this `stale_count`.
3. Emit a one-line banner at the top of Mode B output:

> "Map last updated {most_recent_any_write_date}. {stale_count} stakeholders
> haven't had a fresh interaction in >30 days."

`most_recent_any_write_date` = the most recent `[YYYY-MM-DD]` across any
observation on any stakeholder-map-tagged entity.

## Structural-Gap Detection

Names mentioned in observation text but not tracked as entities.

1. Scan every observation's free-text body (the portion after the final `]`).
2. Regex for capitalized name-shaped tokens: `\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b`
   (requires at least two capitalized words, to avoid matching single capitalized
   technical terms).
3. For each candidate, `search_nodes` — if no entity exists, add to candidate list
   with a count of how many observations mention them.
4. For each candidate with count ≥ 2: emit
   "Name `{X}` came up in {count} observations but isn't tracked. Meet them?"

## Recommended Next Interviews

1. For each dimension's gap buckets, pick up to 2 entities whose traits partially
   fill the gap if met (e.g., for a function gap, entities in that function who
   have `[coverage:met]` absent or stale).
2. Score each candidate by `gap_severity × category_weight`:
   - `gap_severity`: 1.0 if no entity covers the bucket, 0.5 if undercovered
     (<2 entries), 0.0 if well-covered.
   - `category_weight`: same as Mode A (direct_report=5 through cross_functional=1).
3. Sort descending, take top 5. Each entry includes:
   - Name
   - Rationale string: "fills {dimension}:{bucket} gap" or
     "circle back: last met {N} days ago"

## Output Shape

Pass this structure to [heatmap-render.md](heatmap-render.md):

```
{
  freshness_banner: string,
  dimensions: [
    { name, buckets: { bucket: count }, gap_buckets: [string] },
    ...
  ],
  echo_chamber: null | { status: "possible" | "healthy", themes: [string] },
  structural_gaps: [ { name, mention_count } ],
  next_interviews: [ { name, rationale } ]
}
```
