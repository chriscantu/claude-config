# /swot — Strategic Landscape Analysis

**Date**: 2026-04-15
**Issue**: #43
**Status**: Design approved

## Problem Statement

**User**: Engineering leader (Sr. Director / VP of Engineering) starting a new role

**Problem**: During onboarding (weeks 1-4), you need a structured read on the
organization's landscape — strengths, weaknesses, opportunities, threats, technical
maturity, cultural signals. Today this synthesis happens informally from scattered
sources (repos, ADRs, 1:1 notes, incident history), with no repeatable structure and
no way to challenge your own blind spots.

**Impact**: Without a structured landscape read, onboarding decisions are based on
incomplete mental models. Downstream artifacts (strategy docs, 90-day plans, OKRs)
inherit those gaps.

**Evidence**: Personal experience — this is the Tier S / rank 1 foundation of the
onboarding toolkit. Everything downstream depends on a clean landscape read.

## Scope

**In scope**: Onboarding-intake mode only. Accumulative SWOT analysis from internal
artifacts and conversational input across multiple sessions.

**Out of scope**: Interview-prep mode (separate project handles job search tooling).

## Approach

Single knowledge graph entity per organization with tagged observations (Approach A).
Simple, proven pattern from `/1on1-prep`. Tags carry the structure; the entity stays
flat. If it outgrows this schema, migration to entity-per-dimension is straightforward
since the tags already carry the information needed to split.

## Invocation

```
/swot <org-name> [--mode=add|review|challenge] [--read <path-or-url>] [--sync]
```

### Flag handling

| Flag | Behavior |
|------|----------|
| `--mode=add\|review\|challenge` | Override default mode (default: `add`) |
| `--read <path-or-url>` | Artifact-pointed capture — read file/URL and extract signals |
| `--sync` | Drain pending-sync files — retry all failed writes |

If the entity has zero observations and mode is `review` or `challenge`, warn and
redirect to `add`.

## Org Lookup & Bootstrap

Follows the same pattern as `/1on1-prep` person lookup:

1. `search_nodes({ query: "<org-name>" })` — look for existing SWOT entity
2. Exact match on entity name → use it
3. Substring match, single result → use it
4. Ambiguous (multiple matches) → ask user to pick
5. Not found → bootstrap
6. Lookup failed (tool error) → warn and exit, do not bootstrap

### Bootstrap (new org)

Requires memory MCP to be available (entity creation is not deferrable).

```
create_entities({
  entities: [{
    name: "<Org Name> SWOT",
    entityType: "SWOT",
    observations: []
  }]
})
```

Name collision check before creating — if entity already exists, warn and
force disambiguation.

No multi-prompt form needed — the org name is sufficient to start. Context
accumulates through usage.

## Graph Schema

### Entity

```
name: "<Org Name> SWOT"
entityType: "SWOT"
```

One entity per organization.

### Observation format

```
[YYYY-MM-DD][<swot-tag>][<landscape-tag>] <observation text> (<provenance>)
```

**SWOT tags** (mutually exclusive):
- `[strength]` — internal positive
- `[weakness]` — internal negative
- `[opportunity]` — external positive
- `[threat]` — external negative
- Omitted for `[context]` observations

**Landscape tags** (one per observation, optional):
- `[technical]` — architecture, infrastructure, tooling, code quality
- `[cultural]` — team dynamics, values, practices, morale
- `[market]` — competitive position, industry trends, customer landscape
- `[org]` — structure, headcount, processes, reporting lines

**Provenance** in parens at end — not formal citations, just source tracking:
`(repo README)`, `(1:1 with Sarah)`, `(incident postmortem #47)`.

### Examples

```
[2026-05-01][strength][technical] CI/CD deploys in 15 min, zero-downtime rolling updates (repo README)
[2026-05-01][weakness][org] No dedicated SRE team — devs carry pager, oncall burden uneven (1:1 with Sarah)
[2026-05-01][opportunity][market] Competitor X dropped enterprise support — their customers are shopping (sales team)
[2026-05-01][threat][market] Series C competitor raised $80M, hiring aggressively in our space (public filing)
[2026-05-01][context] Company went through reorg 6 months ago — some teams still settling (1:1 with Mike)
```

## Add Mode (Capture)

Default mode. Two input paths — the skill detects which based on invocation.

### Conversational capture

Present a structured form with internal/external framing:

```
## SWOT Capture: <Org Name>

Share what you've observed. Answer what applies, skip what doesn't.

**Internal (what the org controls)**
1. **Strengths** — What internal capabilities, assets, or advantages does the org have?
2. **Weaknesses** — What internal gaps, inefficiencies, or liabilities exist?

**External (what the org responds to)**
3. **Opportunities** — What market shifts, industry trends, or external conditions could the org exploit?
4. **Threats** — What external risks, competitive pressures, or environmental changes could hurt the org?

5. **Landscape context** — Anything that doesn't fit the quadrants but matters?
```

Tag mapping (deterministic by prompt bucket):

| Prompt # | SWOT tag |
|----------|----------|
| 1 | `[strength]` |
| 2 | `[weakness]` |
| 3 | `[opportunity]` |
| 4 | `[threat]` |
| 5 | `[context]` |

**Landscape tags**: Added by the skill based on content keywords from the closed set
(`[technical]`, `[cultural]`, `[market]`, `[org]`). If content doesn't clearly map,
no landscape tag is added. User can override in the confirm step.

**Parsing rules**: Same as `/1on1-prep` — match by number prefix or sequential
paragraph order. Unparseable input is presented back with the form re-shown. Each
non-empty response becomes exactly one observation with verbatim user text.

### Artifact-pointed capture

Invoked with `--read <path-or-url>`. The skill reads the artifact, extracts signals
relevant to SWOT dimensions, and presents them as **draft observations** for the user
to confirm, edit, or discard.

Same tagging and confirm flow as conversational. The skill proposes tags; user validates.

**Key constraint**: The skill never writes observations the user hasn't confirmed.
Artifact reading produces drafts, not facts.

### Confirm & write

Same pattern as `/1on1-prep`:

1. Show tagged observations preview
2. User confirms, edits, or cancels
3. Write one observation at a time (best-effort)
4. Report write results
5. Failed writes go to pending-sync fallback

## Challenge Mode

Invoked with `--mode=challenge`. Runs four checks against all observations (or a
user-specified subset).

### Check 1: Specific?

Rejects vague entries.

- "Strong engineering culture" — **fails**. What specifically? Measured how?
- "CI/CD deploys in 15 minutes with zero-downtime rolling updates" — **passes**

### Check 2: Evidence-backed?

Each observation should have provenance.

- `(repo README)` / `(1:1 with Sarah)` / `(incident postmortem #47)` — **passes**
- No provenance — **flagged**. Skill asks: "How do you know this?"

### Check 3: Actionable?

Could a strategy or decision be informed by this entry?

- "Platform team has no SRE — devs carry pager" — **actionable**
- "The office has nice furniture" — **not actionable**, flag for removal

### Check 4: Correctly categorized?

Internal vs. external alignment:

- A "strength" describing an external condition → suggest recategorizing as opportunity
- A "threat" describing an internal gap → suggest recategorizing as weakness

### Output

```
## Challenge Results: <Org Name>

3 of 12 entries flagged:

1. [strength][cultural] "Strong engineering culture"
   -> NOT SPECIFIC. What behaviors or practices demonstrate this?
   [Edit] [Remove] [Keep anyway]

2. [opportunity][market] "AI is big right now"
   -> NOT ACTIONABLE. How specifically could this org exploit it?
   [Edit] [Remove] [Keep anyway]

3. [threat][org] "No dedicated SRE team"
   -> MISCATEGORIZED. This is internal, not external. Suggest: [weakness][org]
   [Recategorize] [Keep as-is]
```

User acts on each flag. Edits and recategorizations are written back to the graph
(delete old observation + add new one, since the memory MCP doesn't support in-place
edits).

## Review Mode

Invoked with `--mode=review`. Reads all observations and renders a structured report.

### Report structure

```
## SWOT Landscape: <Org Name>
Generated: YYYY-MM-DD | Observations: N | Last updated: YYYY-MM-DD

### Internal

**Strengths** (N)
- [technical] CI/CD deploys in 15 min, zero-downtime rolling updates (repo README)
- [cultural] Blameless postmortem practice — 3 reviewed, all thorough (incident history)
...

**Weaknesses** (N)
- [org] No dedicated SRE — devs carry pager, oncall burden uneven (1:1 with Sarah)
- [technical] Monolith still serves 60% of traffic, migration stalled Q1 (architecture review)
...

### External

**Opportunities** (N)
- [market] Competitor X dropped enterprise support — their customers are shopping (sales team)
...

**Threats** (N)
- [market] Series C competitor raised $80M, hiring aggressively in our space (public filing)
...

### Landscape Context (N)
- [cultural] Company went through reorg 6 months ago (1:1 with Mike)
...

### Coverage Gaps
Dimensions with fewer than 2 entries:
- [market] threats: 1 entry — consider investigating competitive landscape
- [cultural] strengths: 0 entries — no cultural strengths recorded yet
```

### Coverage gaps

Cross-references SWOT quadrants against landscape dimensions. A 4x4 matrix (4 SWOT
tags x 4 landscape tags) = 16 cells. Any cell with fewer than 2 entries is surfaced
as a gap. Nudges toward a complete landscape read over time.

## Export Formats

After review, the skill offers multiple export options:

```
Export this SWOT? Choose a format:
1. [Markdown] — standalone doc to docs/swot/
2. [Excalidraw] — 2x2 SWOT grid on the canvas
3. [Presentation] — Slidev deck via /present
4. [All] — generate all three
```

### Markdown export

Point-in-time snapshot to `docs/swot/YYYY-MM-DD-<org-name>.md`. Same structure as
the review report. Good for personal reference, sharing in docs, or feeding
downstream skills.

### Excalidraw export

Renders a classic 2x2 SWOT grid on the excalidraw canvas:

```
+-------------------+-------------------+
|    Strengths      |   Weaknesses      |
|  (internal +)     |  (internal -)     |
|                   |                   |
|  - entry 1        |  - entry 2        |
+-------------------+-------------------+
|  Opportunities    |    Threats        |
|  (external +)     |  (external -)     |
|                   |                   |
|  - entry 1        |  - entry 2        |
+-------------------+-------------------+
```

Each quadrant is a rectangle with entries grouped by landscape tag. Exportable as
PNG/SVG from excalidraw. Good for board-level or exec presentations.

### Presentation export

Invokes `/present` with a generated brief. Slide structure:

1. Title: "Landscape Assessment: <Org Name>"
2. Internal: Strengths (with evidence)
3. Internal: Weaknesses (with evidence)
4. External: Opportunities (with evidence)
5. External: Threats (with evidence)
6. Coverage gaps & recommended next steps

Good for leadership presentations, onboarding readouts, or strategy reviews.

### Format selection

User picks one or more. Generated sequentially. Each format is independent — export
markdown now and come back for the presentation later.

## Pending-Sync Fallback

Same pattern as `/1on1-prep`. Failed writes go to:

```
skills/swot/pending-sync/YYYY-MM-DD-<org-name-lowercase>.md
```

Format:

```markdown
# Pending Observations: <Org Name> SWOT
# Failed: YYYY-MM-DD HH:MM
# Retry: /swot <org-name> --sync

- [2026-05-01][weakness][org] No SRE team, devs carry pager (1:1 with Sarah)
```

`/swot <org-name> --sync` drains pending-sync files. Same error handling as
`/1on1-prep --sync`: per-file error reporting, zero-observation files preserved
for manual inspection, summary of files/observations/writes attempted/succeeded.

Last-resort fallback: if pending-sync write itself fails, display observation text
in chat for manual copy.

## Integration Points (Stubbed)

Future flags for consuming other skills' graph data:

- `--from=architecture-overview` — pull signals from `/architecture-overview` entity
- `--from=stakeholder-map` — pull signals from `/stakeholder-map` entity

Both return a message directing the user to manual capture until those skills exist:

> "The /architecture-overview skill isn't built yet. You can manually add insights
> from your architecture review using the conversational capture."

## Downstream Consumers

- `/strategy-doc` (#42) — reads SWOT entity to ground strategy recommendations
- `/okr` (#36) — reads opportunities and threats to inform objective-setting

These skills will use `search_nodes({ query: "<Org Name> SWOT" })` and filter
observations by tag.

## Composition

- **Reads from**: `/1on1-prep` observations (manual — user transfers insights via
  conversational capture), `/architecture-overview` and `/stakeholder-map` (future,
  via `--from` flag)
- **Writes to**: Knowledge graph (`SWOT` entity), markdown exports, excalidraw canvas,
  Slidev presentations
- **Feeds**: `/strategy-doc`, `/okr`
