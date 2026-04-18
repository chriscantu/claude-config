# /stakeholder-map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the `/stakeholder-map` skill with two modes (leader-onboarding, coverage-review) that extend the memory-graph schema shared with `/1on1-prep`, render excalidraw chart + heatmap outputs, and integrate with Calendar MCP for opt-in seeding.

**Architecture:** A markdown-only skill under `skills/stakeholder-map/` following the same progressive-disclosure pattern as `skills/1on1-prep/`: a thin `SKILL.md` entry point that delegates to focused reference files (`graph-schema.md`, `bootstrap.md`, `chart-render.md`, `heatmap-render.md`, `coverage-queries.md`). Persistent state lives in the existing memory MCP — no new data store. Visual outputs render via the excalidraw MCP over Preview. Composition with `/1on1-prep` happens through shared graph conventions documented in one place.

**Tech Stack:** Markdown (SKILL.md format with YAML frontmatter). Memory MCP (`mcp__memory__*`). Excalidraw MCP (`mcp__excalidraw__*`). Calendar MCP (`mcp__5726bf10-...__list_events`). Preview MCP (`mcp__Claude_Preview__preview_start`).

**Spec:** [`docs/superpowers/specs/2026-04-18-stakeholder-map-design.md`](../specs/2026-04-18-stakeholder-map-design.md)

---

## File Structure

```
skills/stakeholder-map/
├── SKILL.md                    # Entry point: invocation, prerequisites, mode dispatch
├── graph-schema.md             # Canonical schema: tags, relations, conventions
├── bootstrap.md                # Manual form + calendar-seed flow (Mode A intake)
├── chart-render.md             # Excalidraw rendering spec for Mode A chart
├── heatmap-render.md           # Excalidraw rendering spec for Mode B heatmap
├── coverage-queries.md         # Five dimension queries + echo-chamber + structural-gap
└── pending-sync/               # Fallback write destination; mirrors 1on1-prep
    └── .gitkeep

skills/1on1-prep/
├── SKILL.md                    # MODIFY — add cross-link to stakeholder-map graph-schema
└── graph-schema.md             # MODIFY — add "Extended by stakeholder-map" pointer

README.md                       # MODIFY — list the new skill under "Skills"
```

Each file has one clear responsibility. The skill's SKILL.md stays short (~90 lines, matching 1on1-prep); all mechanics live in reference files loaded on demand.

**Verification model:** since this is a markdown skill (not code), each task's "test" is a scenario walkthrough you run by reading the files you just wrote against the spec's acceptance criteria. No unit test harness. Final verification (Task 9) is an end-to-end scenario run invoking the skill.

---

### Task 1: Scaffold directory + graph-schema.md

**Files:**
- Create: `skills/stakeholder-map/graph-schema.md`
- Create: `skills/stakeholder-map/pending-sync/.gitkeep`

- [ ] **Step 1: Create the pending-sync directory with a .gitkeep**

```bash
mkdir -p skills/stakeholder-map/pending-sync
touch skills/stakeholder-map/pending-sync/.gitkeep
```

- [ ] **Step 2: Write graph-schema.md**

Contents of `skills/stakeholder-map/graph-schema.md`:

````markdown
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
````

- [ ] **Step 3: Verify the file reads coherently**

Read `skills/stakeholder-map/graph-schema.md` end-to-end. Confirm:
- Replaceable vs append-only distinction is unambiguous
- Every spec-mentioned tag is listed with the right value space
- Cross-link to 1on1-prep points to the right relative path
- Privacy note appears before any tag content

- [ ] **Step 4: Commit**

```bash
git add skills/stakeholder-map/graph-schema.md skills/stakeholder-map/pending-sync/.gitkeep
git commit -m "Scaffold stakeholder-map skill with graph schema"
```

---

### Task 2: Write SKILL.md entry point

**Files:**
- Create: `skills/stakeholder-map/SKILL.md`

- [ ] **Step 1: Write SKILL.md**

Contents of `skills/stakeholder-map/SKILL.md`:

````markdown
---
name: stakeholder-map
description: Use when the user says /stakeholder-map, asks to build a stakeholder/political-topology map for a new leadership role, wants to review coverage of their relationship-building, or asks for meet-in-what-order guidance during onboarding.
---

# Stakeholder Map

Two modes sharing one memory-graph backbone:

- **leader-onboarding** — bootstrap the stakeholder map (manual form + optional
  calendar seed), tag people with power/category/function, render a stakeholder chart.
- **coverage-review** — periodic audit over the populated graph that surfaces gaps,
  echo-chamber signals from advice content, and a recommended-next-interviews list.

**Announce:** "I'm using the stakeholder-map skill to [build your stakeholder map /
review your coverage]."

**Flow:** Prerequisites → Invocation → Mode Detection → Mode Dispatch.

**Reference files** (read on demand, not upfront):
- [graph-schema.md](graph-schema.md) — tags, relations, write protocols
- [bootstrap.md](bootstrap.md) — manual form + calendar-seed flow (Mode A intake)
- [chart-render.md](chart-render.md) — Mode A chart rendering
- [heatmap-render.md](heatmap-render.md) — Mode B heatmap rendering
- [coverage-queries.md](coverage-queries.md) — five dimension queries, echo-chamber, structural-gap

## Privacy

Person entities contain sensitive assessments. Storage is local memory MCP only —
never export to repo or share the raw graph.

## Prerequisites

Verify memory MCP: `mcp__memory__read_graph`. If unavailable, warn and set a
session-wide flag so ALL writes route to `pending-sync/` for the remainder (not just
the current write). The file format mirrors 1on1-prep — see
[`../1on1-prep/pending-sync.md`](../1on1-prep/pending-sync.md). Check for existing
pending-sync files on entry.

Rendering requires the excalidraw canvas to be reachable via Preview. Check at
render time (not skill invocation) using `mcp__Claude_Preview__preview_list` and
`mcp__excalidraw__describe_scene`. On failure, fall back to text output and print:

> Excalidraw canvas not reachable. To enable visual output, run
> `preview_start("excalidraw-canvas")` and re-render with `/stakeholder-map --render`.

## Invocation

```
/stakeholder-map --mode=leader-onboarding [--seed-from-calendar [--days=30]]
/stakeholder-map --mode=coverage-review
/stakeholder-map --render                     # re-render last output
/stakeholder-map --sync                       # drain pending-sync
```

`--sync` drains pending-sync files using the same format and rules as 1on1-prep.

## Mode Detection

If no `--mode` flag:
1. `mcp__memory__read_graph` — count entities with any stakeholder-map tag
   (`[category:*]`, `[power:*]`, `[function:*]`).
2. If count is 0 → default to leader-onboarding and confirm with user.
3. If count < 10 → default to leader-onboarding (resume mode) and confirm.
4. If count ≥ 10 → default to coverage-review and confirm.

Always confirm the auto-detected mode before running. The user can override.

## Mode Dispatch

### leader-onboarding

Load [`bootstrap.md`](bootstrap.md) and run the flow. On completion (or every 5
stakeholders added), load [`chart-render.md`](chart-render.md) and render.

### coverage-review

**Preconditions:**
- Graph has ≥10 entities tagged with any stakeholder-map tag.
- If below threshold: "Graph is sparse ({count}). Coverage review works best with
  ≥10. Continue anyway or run leader-onboarding first?"
- If empty: exit with "Graph is empty. Run leader-onboarding first."

Load [`coverage-queries.md`](coverage-queries.md) and run the queries. Load
[`heatmap-render.md`](heatmap-render.md) and render.

## Compatibility With 1on1-prep

Both skills write to the same memory graph using the same observation format.
Stakeholder-map's tag schema is documented in [graph-schema.md](graph-schema.md) and
is cross-referenced from 1on1-prep's schema. Running either skill first is valid;
stakeholder-map's bootstrap offers an upgrade path for entities created by
1on1-prep.
````

- [ ] **Step 2: Verify against the spec**

Read the file and check:
- Frontmatter `description` triggers on the phrases the spec names
- Prerequisites cover MCP-unavailable flow AND excalidraw-unreachable flow
- Mode detection covers empty / sparse / populated with correct default
- Reference files section lists all five, correctly cross-linked

- [ ] **Step 3: Commit**

```bash
git add skills/stakeholder-map/SKILL.md
git commit -m "Add stakeholder-map SKILL.md entry point"
```

---

### Task 3: Write bootstrap.md

**Files:**
- Create: `skills/stakeholder-map/bootstrap.md`

- [ ] **Step 1: Write bootstrap.md**

Contents of `skills/stakeholder-map/bootstrap.md`:

````markdown
# Stakeholder-Map — Bootstrap Flow (Mode A: leader-onboarding)

Three entry variants, one shared form.

## Entry Variants

| Variant | Trigger | Behavior |
|---------|---------|----------|
| Full bootstrap | `--mode=leader-onboarding` with empty/sparse graph | Walk the manual form per stakeholder. Loop until user exits. |
| Resume | `--mode=leader-onboarding` with populated graph | Ask: "Add new, update existing, or upgrade a 1on1-prep entry?" Dispatch accordingly. |
| Calendar seed | `--mode=leader-onboarding --seed-from-calendar [--days=N]` | Attendee picklist precedes the manual form. |

## Per-Stakeholder Manual Form

Ask prompts one at a time. Prefer multiple-choice where possible.

1. **Full name** (free text).
   - `search_nodes(<name>)` — exact match → load; substring → ask to disambiguate;
     none → new entity.
   - On new: `create_entities([{ name, entityType: "Person" }])`.

2. **Role** (full job title, free text) →
   `add_observations([{ entityName, contents: ["[YYYY-MM-DD][context] <title>"] }])`.

3. **Role axis** (choice: manager / ic) →
   replaceable write of `[YYYY-MM-DD][role:<axis>]`.

4. **Function** (choice: engineering / product / design / data / security / sre) →
   replaceable write of `[YYYY-MM-DD][function:<name>]`.

5. **Team** (free text) → replaceable write of `[YYYY-MM-DD][team:<name>]`.

6. **Category** (choice: direct_report / skip / peer / skip_up / cross_functional) →
   replaceable write of `[YYYY-MM-DD][category:<type>]`.

7. **Tenure** (choice: long / new) →
   replaceable write of `[YYYY-MM-DD][tenure:<axis>]`.

8. **Formal power** (choice: high / medium / low) →
   replaceable write of `[YYYY-MM-DD][power:formal:<level>]`.

9. **Informal power** (choice: high / medium / low / skip) —
   skippable if unknown on day 1 → replaceable write of
   `[YYYY-MM-DD][power:informal:<level>]` if provided.

10. **Advice captured?** (optional free text) — if provided, append-only write
    `[YYYY-MM-DD][advice] <verbatim text>`.

11. **Relations** (each optional):
    - Reports to? → `create_relations([{ from, to, relationType: "reports_to" }])`
      only if target entity exists.
    - Informal reports to? → `reports_to_informally`.
    - Influences? → `influences`.

After prompt 11: append-only write `[YYYY-MM-DD][coverage:met] <context if any>`.
Every bootstrap counts as a meeting event.

## Replaceable-Tag Write Protocol

See [graph-schema.md](graph-schema.md) for the full sequence. Summary:

1. `search_nodes(entityName)` and filter observations by tag prefix
   (e.g. `[power:formal:`).
2. `delete_observations` on matches.
3. `add_observations` with the new value.

On step-3 failure after step-2 success: surface "Prior tag deleted but new tag
failed to write" and prompt the user to retry.

## Calendar-Seed Variant

When `--seed-from-calendar [--days=N]` (default N=30):

1. `mcp__5726bf10-7325-408d-9c0c-e32eaf106ac5__list_events` with
   `timeMin` = N days ago, `timeMax` = now. If Calendar MCP is unavailable, warn
   and offer to continue with manual bootstrap only.
2. Extract unique attendee email/name pairs, excluding the current user.
3. For each candidate, `search_nodes` against the graph.
   - Match found: skip by default (user can override in step 5).
   - Not found: include in picklist.
4. Present picklist with three options per row: `[add]`, `[skip]`, `[seen-but-skip]`.
5. For each `[add]`: run the manual form above, pre-filled with name from the
   calendar entry.
6. For each `[seen-but-skip]`: create the entity if missing, and append
   `[YYYY-MM-DD][context] seen via calendar, not tracked`. This prevents the name
   from reappearing on the next seed run.

## Upgrade Flow (from 1on1-prep entity)

When the manual form's name-lookup matches an entity that has 1on1-prep tags
(`[1on1]` or `[context]`) but no stakeholder-map tags:

> "{name} exists with 1on1-prep data. Add stakeholder fields? [yes/no/skip]"

If yes: skip prompts 1-2 (name/role stay as recorded) and run prompts 3-11.

## Progressive Rendering

After every 5 successful per-stakeholder completions, offer to re-render:

> "Added 5 stakeholders. Render chart now? [yes/no]"

Explicit `/stakeholder-map --render` command triggers a render on demand.

## Idempotence

Running Mode A a second time on the same graph adds or updates without wiping:
- Replaceable tags overwrite via the protocol above.
- Append-only observations (`[advice]`, `[coverage:met]`) accumulate.
- Relations are only created if missing; duplicates are not re-created.

## MCP-Unavailable Fallback

If memory MCP check from SKILL.md failed, every add/update write in this file
routes to `pending-sync/YYYY-MM-DD-<person-lowercase>.md` instead, using the
1on1-prep file format (one observation per line, prefixed with `- `).
````

- [ ] **Step 2: Verify against the spec**

Read bootstrap.md and confirm:
- All 11 form prompts are present in the correct order
- Replaceable-tag protocol matches graph-schema.md
- Calendar-seed uses the actual Calendar MCP tool name (`mcp__5726bf10-...__list_events`)
- Upgrade flow skips exactly the right prompts (1-2)
- Progressive render trigger is N=5

- [ ] **Step 3: Commit**

```bash
git add skills/stakeholder-map/bootstrap.md
git commit -m "Add Mode A bootstrap flow (manual form + calendar seed + upgrade)"
```

---

### Task 4: Write chart-render.md

**Files:**
- Create: `skills/stakeholder-map/chart-render.md`

- [ ] **Step 1: Write chart-render.md**

Contents of `skills/stakeholder-map/chart-render.md`:

````markdown
# Stakeholder-Map — Chart Rendering (Mode A)

Excalidraw canvas output for the leader-onboarding view.

## Preflight

1. `mcp__Claude_Preview__preview_list` → confirm `excalidraw-canvas` server present.
   If absent: `preview_start("excalidraw-canvas")` (creates or reuses).
2. `mcp__excalidraw__describe_scene` — confirm canvas reachable.
3. If either fails, fall back to the text summary (see bottom of this file) and
   print the hint from SKILL.md.

## Inputs

Query the memory graph for all entities that carry any stakeholder-map tag. For
each entity, read:
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

Column headers at y=60, `fontSize=16`, Excalifont. Nodes start at y=120 and stack
downward with 20px vertical padding.

## Node Encoding

Each person renders as a `rectangle` whose size encodes **formal power**:

| Formal power | Width × Height |
|--------------|----------------|
| `high` | 220 × 80 |
| `medium` | 180 × 64 |
| `low` | 140 × 50 |
| unknown | 140 × 50 (dashed stroke) |

Inside the rectangle, a `text` label with `fontSize=13`, Excalifont:
- Line 1: `{name}`
- Line 2: `{function} · {team}` (omit any field that is unknown)

**Informal power badge** — an `ellipse` anchored to the top-right corner of the
node rectangle. Stroke-only, no fill.

| Informal power | Diameter |
|----------------|----------|
| `high` | 24 |
| `medium | 16 |
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

Sort descending. Emit up to 10 lines as `text` elements:

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
````

- [ ] **Step 2: Verify against the spec**

- Scoring formula matches spec Section 3 exactly (numeric values for power levels,
  category weights, unmet bonus of +10)
- Staged-drawing passes follow fat-marker-sketch conventions
- Text fallback provides the same information set as the chart

- [ ] **Step 3: Commit**

```bash
git add skills/stakeholder-map/chart-render.md
git commit -m "Add Mode A chart rendering spec"
```

---

### Task 5: Write coverage-queries.md

**Files:**
- Create: `skills/stakeholder-map/coverage-queries.md`

- [ ] **Step 1: Write coverage-queries.md**

Contents of `skills/stakeholder-map/coverage-queries.md`:

````markdown
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
````

- [ ] **Step 2: Verify against the spec**

- All five dimensions defined with explicit bucket lists and gap rules
- Echo-chamber thresholds match spec revisions (≥3 trigger, 70% flag, ≥3 themes
  with ≤50% dominant for healthy)
- Structural-gap regex requires multi-word capitalized tokens
- Output shape is consumable by heatmap-render.md

- [ ] **Step 3: Commit**

```bash
git add skills/stakeholder-map/coverage-queries.md
git commit -m "Add Mode B dimension queries and echo-chamber heuristic"
```

---

### Task 6: Write heatmap-render.md

**Files:**
- Create: `skills/stakeholder-map/heatmap-render.md`

- [ ] **Step 1: Write heatmap-render.md**

Contents of `skills/stakeholder-map/heatmap-render.md`:

````markdown
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
````

- [ ] **Step 2: Verify against the spec**

- Cell stroke widths produce the visual gradient (gap vs. covered) the spec
  calls for
- Staged-drawing passes respect fat-marker-sketch conventions
- Text fallback preserves all sections from the canvas output

- [ ] **Step 3: Commit**

```bash
git add skills/stakeholder-map/heatmap-render.md
git commit -m "Add Mode B heatmap rendering spec"
```

---

### Task 7: Cross-link from 1on1-prep

**Files:**
- Modify: `skills/1on1-prep/SKILL.md`
- Modify: `skills/1on1-prep/graph-schema.md`

- [ ] **Step 1: Add reference line to 1on1-prep SKILL.md**

Edit `skills/1on1-prep/SKILL.md`. Locate the "Reference files" bulleted list
(around line 16-19). Append one bullet at the end:

```markdown
- [stakeholder-map graph-schema](../stakeholder-map/graph-schema.md) — extended schema (power, category, coverage, advice) shared when stakeholder-map is in use
```

- [ ] **Step 2: Add cross-reference note in 1on1-prep graph-schema.md**

Edit `skills/1on1-prep/graph-schema.md`. At the very bottom of the file, append:

```markdown

## Schema Extensions (stakeholder-map)

When the user runs `/stakeholder-map`, additional tags (`[power:*]`, `[category:*]`,
`[function:*]`, `[team:*]`, `[tenure:*]`, `[role:*]`, `[coverage:met]`, `[advice]`)
and relations (`reports_to_informally`, `influences`) are written to the same
graph. See [stakeholder-map/graph-schema.md](../stakeholder-map/graph-schema.md)
for full definitions. 1on1-prep's prep phase may read these tags to surface
richer context — no code change required; the observation-format contract is
unchanged.
```

- [ ] **Step 3: Verify both files read coherently**

- 1on1-prep SKILL.md reference list points to the correct relative path
- graph-schema cross-reference does not duplicate definitions (links only)
- No circular references introduced

- [ ] **Step 4: Commit**

```bash
git add skills/1on1-prep/SKILL.md skills/1on1-prep/graph-schema.md
git commit -m "Cross-link 1on1-prep to stakeholder-map schema extensions"
```

---

### Task 8: README update

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Inspect current README**

```bash
grep -n "1on1-prep\|skills" README.md | head -20
```

Identify the section that lists existing skills (likely under a "Skills" header).

- [ ] **Step 2: Add a stakeholder-map entry in the skills list**

Follow the existing format for 1on1-prep exactly. Under the same skills section,
add:

```markdown
- **`/stakeholder-map`** — Build a stakeholder/political-topology map for a new
  leadership role (Mode A: leader-onboarding) and audit coverage gaps + echo-chamber
  signals (Mode B: coverage-review). Extends the memory graph shared with 1on1-prep.
```

If the README groups skills by tier (Tier S, Tier A, etc., per the onboarding
toolkit notes), place stakeholder-map under Tier S alongside 1on1-prep.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "Document stakeholder-map skill in README"
```

---

### Task 9: End-to-end scenario verification

No code test suite exists for this skill type. Verification is a manual
scenario walkthrough that exercises the acceptance criteria from the spec.

**Files:** none — this is invocation-based verification.

- [ ] **Step 1: Reset the memory graph scratch state (optional)**

If you want a clean walk-through, use a fresh Memory MCP or note the current
state so you can reason about added entities separately. Do not delete production
graph data.

- [ ] **Step 2: Acceptance 1 — Mode A end-to-end**

Invoke `/stakeholder-map --mode=leader-onboarding`. Walk the manual form for
one synthetic stakeholder (e.g., name "Alice Bootstrap Test", role "Director of
Product", function=product, team=platform, category=peer, tenure=long,
formal=medium, informal=high, advice="prioritize data contracts").

Verify:
- Entity created in graph (`search_nodes("Alice Bootstrap Test")`)
- Observations include the six replaceable tags plus `[advice]` and `[coverage:met]`
- Chart rendered to the excalidraw canvas with one node in the `peer` column,
  medium node size, large informal-power badge, `[x]` met marker

- [ ] **Step 3: Acceptance 2 — calendar seed**

Invoke `/stakeholder-map --mode=leader-onboarding --seed-from-calendar --days=7`.

Verify:
- Calendar attendees from the last 7 days surface in a picklist
- Existing entities are marked as already-tracked
- Choosing `[add]` on a new attendee pre-fills the name in the manual form
- `[seen-but-skip]` writes a `[context] seen via calendar, not tracked`
  observation

- [ ] **Step 4: Acceptance 3 — idempotence**

Re-invoke Mode A on Alice. Update `category` to `skip`. Verify via
`search_nodes("Alice Bootstrap Test")`:
- The old `[category:peer]` observation is deleted
- A new `[category:skip]` observation exists
- The `[advice]` and `[coverage:met]` observations are preserved

- [ ] **Step 5: Acceptance 4 — Mode B coverage review**

After populating the graph with ≥10 stakeholders (use Mode A or the calendar
seed), invoke `/stakeholder-map --mode=coverage-review`. Verify:
- Freshness banner appears at the top
- Heatmap renders with 5 dimension rows
- Gap cells have thin stroke; covered cells have thick stroke
- If ≥3 advice observations exist, echo-chamber classification runs and prints
  one of: `possible`, `healthy diversity`, or no flag (if in-between)
- Recommended-next-interviews list has up to 5 entries with rationales

- [ ] **Step 6: Acceptance 5 — MCP unavailable**

Simulate by invoking Mode A when memory MCP is unreachable (temporarily disable
it or test in an environment without it). Verify:
- The skill does not crash
- Writes route to `skills/stakeholder-map/pending-sync/YYYY-MM-DD-<name>.md`
- `/stakeholder-map --sync` drains the pending files on next run

- [ ] **Step 7: Acceptance 6 — Excalidraw unreachable**

Stop the excalidraw canvas (`preview_stop` or kill the server). Invoke
`/stakeholder-map --render`. Verify:
- Preflight fails gracefully
- Text-fallback markdown prints to stdout with the same section set
- The `preview_start("excalidraw-canvas")` hint is printed

- [ ] **Step 8: Acceptance 7 — 1on1-prep upgrade flow**

Create an entity via `/1on1-prep <new-name>` and walk only the bootstrap
prompts. Then invoke `/stakeholder-map --mode=leader-onboarding` and enter the
same name. Verify:
- Skill detects existing 1on1-prep entity
- Upgrade flow triggers, skipping name and role prompts
- Stakeholder fields (3-11) write successfully

- [ ] **Step 9: Acceptance 8 — graph-schema as single reference**

Open both `skills/1on1-prep/graph-schema.md` and
`skills/stakeholder-map/graph-schema.md`. Confirm:
- Stakeholder-map's schema links back to 1on1-prep's as the base
- 1on1-prep's schema has the new "Schema Extensions" section pointing forward
- No tag or relation is defined in both files

- [ ] **Step 10: Clean up test data**

Remove synthetic entities (e.g., "Alice Bootstrap Test") from the graph.

- [ ] **Step 11: Commit the plan completion note**

If any plan drift was discovered and fixed during verification, capture in a
follow-up commit:

```bash
git commit --allow-empty -m "Complete stakeholder-map v1 scenario verification"
```

---

## Self-Review Checklist (run before handing off)

- [ ] Every acceptance criterion from the spec maps to at least one task
- [ ] No "TBD" / "TODO" / "similar to Task N" patterns anywhere in this plan
- [ ] Tag names and protocols in graph-schema.md, bootstrap.md, chart-render.md,
  heatmap-render.md, coverage-queries.md are all consistent
- [ ] Relative paths between skill files are correct (`../1on1-prep/` vs
  `../stakeholder-map/`)
- [ ] Scoring formulas (Mode A meet-in-what-order, Mode B next-interviews) use
  identical category weights
- [ ] MCP-unavailable and excalidraw-unreachable fallbacks are consistent across
  all files that mention them

---

## Out of Scope for This Plan

- Evals (deferred to a follow-up issue per spec)
- Any modifications to the memory MCP itself
- Slack/Linear/Atlassian integrations
- Automated dissent detection (replaced by advice-content clustering)
