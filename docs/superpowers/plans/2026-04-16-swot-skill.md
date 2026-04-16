# /swot Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `/swot` skill for accumulative SWOT landscape analysis during onboarding, using the knowledge graph for storage and supporting conversational capture, artifact-pointed capture, challenge mode, review mode, and multi-format export.

**Architecture:** Single SKILL.md file following the `/1on1-prep` pattern. Knowledge graph stores one `SWOT` entity per organization with tagged observations. Three modes (add, review, challenge) route to distinct flows. Export delegates to existing tools (markdown file, excalidraw MCP, `/present` skill).

**Tech Stack:** Claude Code skill (markdown), knowledge graph MCP (`mcp__memory__*`), excalidraw MCP (`mcp__excalidraw__*`), `/present` skill (Slidev).

---

## File Structure

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `skills/swot/SKILL.md` | Skill definition — all modes, flows, graph schema |
| Create | `skills/swot/pending-sync/` | Directory for failed write fallback files |
| Create | `skills/swot/test/scenarios.md` | Manual end-to-end test scenarios |

---

### Task 1: Scaffold skill directory and frontmatter

**Files:**
- Create: `skills/swot/SKILL.md`
- Create: `skills/swot/pending-sync/.gitkeep`

- [ ] **Step 1: Create the skill directory structure**

```fish
mkdir -p skills/swot/pending-sync skills/swot/test
touch skills/swot/pending-sync/.gitkeep
```

- [ ] **Step 2: Write the skill frontmatter and header**

Write to `skills/swot/SKILL.md`:

```markdown
---
name: swot
description: >
  Strategic landscape analysis using SWOT framework with knowledge graph storage.
  Accumulates observations across sessions during onboarding. Use when the user says
  /swot, "landscape analysis", "SWOT analysis", "strengths and weaknesses", or wants
  to capture, review, or challenge organizational observations.
---

# SWOT Landscape Analysis

Structured SWOT analysis for onboarding. Accumulates observations across sessions
using the knowledge graph. Supports conversational capture, artifact-pointed capture,
challenge mode, review mode, and multi-format export.

**Announce at start:** "I'm using the swot skill to help you build your landscape
analysis."
```

- [ ] **Step 3: Commit scaffold**

```fish
git add skills/swot/
git commit -m "Scaffold /swot skill directory structure (#43)"
```

---

### Task 2: Prerequisites and invocation

**Files:**
- Modify: `skills/swot/SKILL.md`

- [ ] **Step 1: Add prerequisites section**

Append to `skills/swot/SKILL.md`:

```markdown
## Prerequisites

Verify the memory MCP is available:

```
mcp__memory__read_graph
```

If this fails, warn the user:
> "The memory MCP server isn't available. I can still help you think through your
> SWOT analysis conversationally, but I won't be able to save observations to the
> graph. Run `/swot <org-name> --sync` when the server is back to retry any failed
> writes."

Set a flag to route all writes to pending-sync for the remainder of this session.

Check for pending-sync files:

```fish
ls skills/swot/pending-sync/*.md 2>&1
```

If any exist, warn:
> "You have pending observations that failed to write previously. Run
> `/swot <org-name> --sync` to retry writing them to the graph."
```

- [ ] **Step 2: Add invocation section**

Append to `skills/swot/SKILL.md`:

```markdown
## Invocation

```
/swot <org-name> [--mode=add|review|challenge] [--read <path-or-url>] [--sync]
```

### Flag Handling

| Flag | Behavior |
|------|----------|
| `--mode=add\|review\|challenge` | Override default mode (default: `add`) |
| `--read <path-or-url>` | Artifact-pointed capture — read file/URL and extract signals |
| `--sync` | Drain pending-sync files — retry all failed writes |

**`--sync` flow**: Read all files in `skills/swot/pending-sync/`, attempt to write
each observation to the graph via `mcp__memory__add_observations`. Report results
per-observation. Delete the pending-sync file only if all observations in it succeed.
Exit after sync — no capture flow.

Error handling for `--sync`:
- If a file cannot be read (permissions, missing), report the error per-file and skip it
- If a file is read but yields zero parseable observations, warn the user and do NOT
  delete the file (it may be corrupted — preserve it for manual inspection)
- Report: total files found, observations parsed, writes attempted, writes succeeded

**Parsing pending-sync files**: Extract the Org name from the first line
(`# Pending Observations: <Org Name> SWOT`). Each line starting with `- [` is one
observation to write. The entity name for all observations in the file is
`<Org Name> SWOT` (from the header).
```

- [ ] **Step 3: Commit**

```fish
git add skills/swot/SKILL.md
git commit -m "Add prerequisites and invocation to /swot skill (#43)"
```

---

### Task 3: Org lookup and bootstrap

**Files:**
- Modify: `skills/swot/SKILL.md`

- [ ] **Step 1: Add org lookup section**

Append to `skills/swot/SKILL.md`:

```markdown
## Org Lookup

Search the knowledge graph for the organization:

```
mcp__memory__search_nodes({ query: "<org-name>" })
```

**Resolution rules** (in order):

1. **Exact match** on entity name (with " SWOT" suffix) → use that entity
2. **Substring match** on entity name (case-insensitive) → if exactly one SWOT-type
   result, use it
3. **Ambiguous** (multiple matches) → show matches, ask user to pick:
   > "I found multiple SWOT entities matching '<name>': [list]. Which one?"
4. **Not found** (zero results returned) → proceed to **Bootstrap** (next section)
5. **Lookup failed** (tool call error, not zero results) → do NOT proceed to bootstrap.
   Inform the user: "Org lookup failed due to a server error. Please try again."
   This prevents accidentally creating a duplicate entity.

Never create an entity without going through Bootstrap.
```

- [ ] **Step 2: Add bootstrap section**

Append to `skills/swot/SKILL.md`:

```markdown
## Bootstrap (New Org)

When org lookup returns no results, run the bootstrap flow.

**If the memory MCP is unavailable**, bootstrap cannot proceed — entity creation is not
deferrable to pending-sync. Inform the user and exit:
> "I can't create a new SWOT entity because the memory server is unavailable. Please
> check that the `memory` MCP server is running and try again."

Confirm org name with the user:
> "I'll create a new SWOT analysis for '<org-name>'. Is that the right name?"

### Writing to the Graph

**Name collision check**: Before creating, search for the exact name with " SWOT"
suffix. If an entity with that name already exists, warn and force disambiguation:
> "A SWOT entity named '<name> SWOT' already exists in the graph. Did you mean that
> one, or is this a different organization?"

Create the SWOT entity:

```
mcp__memory__create_entities({
  entities: [{
    name: "<Org Name> SWOT",
    entityType: "SWOT",
    observations: []
  }]
})
```

After bootstrap completes, proceed to **Mode Routing**.
```

- [ ] **Step 3: Commit**

```fish
git add skills/swot/SKILL.md
git commit -m "Add org lookup and bootstrap to /swot skill (#43)"
```

---

### Task 4: Mode routing

**Files:**
- Modify: `skills/swot/SKILL.md`

- [ ] **Step 1: Add mode routing section**

Append to `skills/swot/SKILL.md`:

```markdown
## Mode Routing

If `--mode` flag was provided, use it directly. Otherwise, default to `add`.

| Mode | When to use |
|------|-------------|
| `add` | Default. Capture new observations conversationally or from artifacts. |
| `review` | Render the full SWOT report from graph data. |
| `challenge` | Run quality checks against existing observations. |

**Empty entity guard**: If the entity has zero observations and mode is `review` or
`challenge`, warn and redirect:
> "This SWOT analysis has no observations yet. Let's add some first."

Proceed to `add` mode.
```

- [ ] **Step 2: Commit**

```fish
git add skills/swot/SKILL.md
git commit -m "Add mode routing to /swot skill (#43)"
```

---

### Task 5: Add mode — conversational capture

**Files:**
- Modify: `skills/swot/SKILL.md`

- [ ] **Step 1: Add the graph schema reference section**

Append to `skills/swot/SKILL.md`:

```markdown
## Graph Schema

### Entity

```
name: "<Org Name> SWOT"
entityType: "SWOT"
```

One entity per organization.

### Observation Format

```
[YYYY-MM-DD][<swot-tag>][<landscape-tag>] <observation text> (<provenance>)
```

**SWOT tags** (mutually exclusive — internal vs. external):
- `[strength]` — internal positive (what the org controls and does well)
- `[weakness]` — internal negative (what the org controls but does poorly)
- `[opportunity]` — external positive (what the org could exploit)
- `[threat]` — external negative (what could hurt the org from outside)
- Omitted for `[context]` observations

**Landscape tags** (one per observation, optional):
- `[technical]` — architecture, infrastructure, tooling, code quality
- `[cultural]` — team dynamics, values, practices, morale
- `[market]` — competitive position, industry trends, customer landscape
- `[org]` — structure, headcount, processes, reporting lines

**Provenance** in parentheses at the end — not formal citations, just source tracking:
`(repo README)`, `(1:1 with Sarah)`, `(incident postmortem #47)`.

### Examples

```
[2026-05-01][strength][technical] CI/CD deploys in 15 min, zero-downtime rolling updates (repo README)
[2026-05-01][weakness][org] No dedicated SRE team — devs carry pager, oncall burden uneven (1:1 with Sarah)
[2026-05-01][opportunity][market] Competitor X dropped enterprise support — their customers are shopping (sales team)
[2026-05-01][threat][market] Series C competitor raised $80M, hiring aggressively in our space (public filing)
[2026-05-01][context] Company went through reorg 6 months ago — some teams still settling (1:1 with Mike)
```
```

- [ ] **Step 2: Add conversational capture section**

Append to `skills/swot/SKILL.md`:

```markdown
## Add Mode (Capture)

Default mode. Two input paths — detected based on invocation. If `--read` flag is
present, use artifact-pointed capture. Otherwise, use conversational capture.

### Conversational Capture

Present the structured capture form:

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

The user replies in **one message**. Each numbered response maps to a tag:

| Prompt # | SWOT tag |
|----------|----------|
| 1 | `[strength]` |
| 2 | `[weakness]` |
| 3 | `[opportunity]` |
| 4 | `[threat]` |
| 5 | `[context]` |

### Parsing Rules

- Match user responses to prompts by number prefix (e.g., "1. ..." or "1) ...") or by
  sequential paragraph order if no numbers are provided
- **Unparseable input**: If the response cannot be matched to prompt buckets (single
  paragraph, no numbers, no clear breaks), present it back and ask the user to slot it
  into the numbered prompts: "I couldn't match your notes to the capture categories.
  Could you break them out by number? Here's the form again: [re-present the 5 prompts]."
  Do NOT attempt to interpret content into buckets — that violates deterministic tagging.
- Skip empty responses — if the user leaves a prompt blank or says "nothing", don't
  create an observation for it
- Each non-empty response becomes exactly one observation — if a response is
  multi-sentence, it is still one observation. Do not split within a prompt bucket.
- The observation body is the user's verbatim text (not a summary or interpretation)

### Landscape Tag Assignment

After parsing, add a landscape tag to each observation based on content keywords from
the closed set: `[technical]`, `[cultural]`, `[market]`, `[org]`. This is best-effort
LLM judgment — not deterministic. If the content doesn't clearly map to a single
landscape dimension, omit the landscape tag.

The user can override landscape tags in the confirm step.

### Provenance

After tagging, ask for provenance if not already included in the observation text:
> "Where did each observation come from? (e.g., '1:1 with Sarah', 'repo README',
> 'incident postmortem'). I'll add source tags. Or say 'skip' to leave them off."

If the user provides provenance, append it in parentheses. If they skip, proceed
without provenance — the challenge pass will later flag missing provenance.
```

- [ ] **Step 3: Commit**

```fish
git add skills/swot/SKILL.md
git commit -m "Add graph schema and conversational capture to /swot skill (#43)"
```

---

### Task 6: Add mode — confirm, write, and artifact-pointed capture

**Files:**
- Modify: `skills/swot/SKILL.md`

- [ ] **Step 1: Add confirm and write section**

Append to `skills/swot/SKILL.md`:

```markdown
### Confirm & Tag

After parsing and tagging, show the tagged observations for review:

```
## Tagged Observations Preview

I'll write these observations to <Org Name>'s SWOT record:

1. [2026-05-01][strength][technical] CI/CD deploys in 15 min, zero-downtime (repo README)
2. [2026-05-01][weakness][org] No SRE team — devs carry pager (1:1 with Sarah)
3. [2026-05-01][opportunity][market] Competitor dropped enterprise support (sales team)

Does this look right? You can **confirm**, **edit**, or **cancel**.
```

- **confirm**: proceed to Write
- **edit**: ask which observation to change (text, SWOT tag, landscape tag, or
  provenance), show the edited version, re-confirm
- **cancel**: discard all observations, exit

### Write to Graph

Write observations **one at a time** (best-effort, not atomic). For each confirmed
observation:

```
mcp__memory__add_observations({
  observations: [{
    entityName: "<Org Name> SWOT",
    contents: ["<tagged observation string>"]
  }]
})
```

Track success/failure per observation.

### Write Results

After attempting all writes, report:

```
## Write Results

Written: 3/3 observations
- [OK] [2026-05-01][strength][technical] CI/CD deploys in 15 min, zero-downtime (repo README)
- [OK] [2026-05-01][weakness][org] No SRE team — devs carry pager (1:1 with Sarah)
- [OK] [2026-05-01][opportunity][market] Competitor dropped enterprise support (sales team)
```

### Pending-Sync Fallback

For any failed write, save the observation to a pending-sync file:

**File**: `skills/swot/pending-sync/YYYY-MM-DD-<org-name-lowercase>.md`

**Format** (human-readable):
```markdown
# Pending Observations: <Org Name> SWOT
# Failed: YYYY-MM-DD HH:MM
# Retry: /swot <org-name> --sync

- [2026-05-01][weakness][org] No SRE team — devs carry pager (1:1 with Sarah)
```

If the file already exists (multiple failed writes on the same day), append to it.

Warn the user:
> "One or more observations failed to write. They've been saved locally. Run
> `/swot <org-name> --sync` to retry when the memory server is available."

**Last-resort fallback**: If writing to the pending-sync file itself fails (disk full,
permissions), display the full observation text directly in the chat output so the user
can copy it manually:
> "I could not save this observation to the pending-sync file either. Please copy the
> text below and save it yourself:
> `[2026-05-01][weakness][org] No SRE team — devs carry pager (1:1 with Sarah)`"

This ensures observations are never silently lost even in a double-failure scenario.
```

- [ ] **Step 2: Add artifact-pointed capture section**

Append to `skills/swot/SKILL.md`:

```markdown
### Artifact-Pointed Capture

Invoked with `--read <path-or-url>`. The skill reads the artifact using the Read tool
(for local paths) or WebFetch (for URLs), extracts signals relevant to SWOT dimensions,
and presents them as **draft observations** for the user to confirm, edit, or discard.

**Process:**
1. Read the artifact content
2. Extract signals — identify statements that indicate strengths, weaknesses,
   opportunities, or threats. Look for: architectural decisions, technical debt
   mentions, team structure, performance metrics, incident patterns, competitive
   references.
3. Format each signal as a draft observation with proposed SWOT tag, landscape tag,
   and provenance set to the artifact source
4. Present drafts in the same confirm flow as conversational capture

**Key constraint**: The skill never writes observations the user hasn't confirmed.
Artifact reading produces drafts, not facts.

**Multiple artifacts**: The user can invoke `--read` multiple times across sessions.
Each invocation extracts and confirms independently. The graph accumulates.
```

- [ ] **Step 3: Commit**

```fish
git add skills/swot/SKILL.md
git commit -m "Add confirm/write flow and artifact-pointed capture to /swot skill (#43)"
```

---

### Task 7: Challenge mode

**Files:**
- Modify: `skills/swot/SKILL.md`

- [ ] **Step 1: Add challenge mode section**

Append to `skills/swot/SKILL.md`:

```markdown
## Challenge Mode

Invoked with `--mode=challenge`. Reads all observations from the entity and runs four
quality checks. Can also be triggered automatically after an `add` capture — the skill
offers: "Want me to run a challenge pass on these new entries?"

Read the entity:

```
mcp__memory__open_nodes({ names: ["<Org Name> SWOT"] })
```

### Check 1: Specific?

Rejects vague entries that could apply to any organization.

- "Strong engineering culture" — **fails**. What specifically? Measured how?
- "CI/CD deploys in 15 minutes with zero-downtime rolling updates" — **passes**

### Check 2: Evidence-backed?

Each observation should have provenance (text in parentheses at the end).

- `(repo README)` / `(1:1 with Sarah)` / `(incident postmortem #47)` — **passes**
- No provenance at all — **flagged**. Skill asks: "How do you know this? What did you
  see or hear?"

### Check 3: Actionable?

Could a strategy or decision be informed by this entry?

- "Platform team has no SRE — devs carry pager" — **actionable** (could propose
  hiring, reorg, or process change)
- "The office has nice furniture" — **not actionable**, flag for removal

### Check 4: Correctly Categorized?

Internal vs. external alignment:

- A `[strength]` describing an external condition → suggest recategorizing as
  `[opportunity]`
- A `[threat]` describing an internal gap → suggest recategorizing as `[weakness]`
- A `[weakness]` describing an external pressure → suggest recategorizing as `[threat]`
- An `[opportunity]` describing an internal capability → suggest recategorizing as
  `[strength]`

### Challenge Output

For each flagged observation, present the issue and offer actions:

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

### Acting on Flags

User selects an action per flagged item:

- **Edit**: User provides revised text. Delete old observation, write new one.
- **Remove**: Delete the observation from the graph.
- **Keep anyway**: No change — user overrides the challenge.
- **Recategorize**: Delete old observation, write new one with corrected SWOT tag.

Deleting an observation:

```
mcp__memory__delete_observations({
  deletions: [{
    entityName: "<Org Name> SWOT",
    observations: ["<exact observation string>"]
  }]
})
```

Writing the replacement:

```
mcp__memory__add_observations({
  observations: [{
    entityName: "<Org Name> SWOT",
    contents: ["<corrected observation string>"]
  }]
})
```

If either operation fails, warn the user and save to pending-sync.

If zero entries are flagged:
> "All entries passed the challenge. Your SWOT is looking solid."
```

- [ ] **Step 2: Commit**

```fish
git add skills/swot/SKILL.md
git commit -m "Add challenge mode to /swot skill (#43)"
```

---

### Task 8: Review mode

**Files:**
- Modify: `skills/swot/SKILL.md`

- [ ] **Step 1: Add review mode section**

Append to `skills/swot/SKILL.md`:

```markdown
## Review Mode

Invoked with `--mode=review`. Reads all observations from the entity and renders a
structured report.

Read the entity:

```
mcp__memory__open_nodes({ names: ["<Org Name> SWOT"] })
```

### Report Structure

Render these sections in order. **Omit any section that would be empty.**

#### Header

```
## SWOT Landscape: <Org Name>
Generated: YYYY-MM-DD | Observations: N | Last updated: YYYY-MM-DD
```

Where "Last updated" is the most recent date found across all observations.

#### Internal

Group observations by SWOT tag, sub-grouped by landscape tag within each group.

```
### Internal

**Strengths** (N)
- [technical] CI/CD deploys in 15 min, zero-downtime rolling updates (repo README)
- [cultural] Blameless postmortem practice — 3 reviewed, all thorough (incident history)
- [org] Strong platform team lead, respected cross-functionally (1:1 with CTO)

**Weaknesses** (N)
- [org] No dedicated SRE — devs carry pager, oncall burden uneven (1:1 with Sarah)
- [technical] Monolith still serves 60% of traffic, migration stalled Q1 (architecture review)
```

#### External

```
### External

**Opportunities** (N)
- [market] Competitor X dropped enterprise support — their customers are shopping (sales team)
- [technical] K8s migration unlocks multi-region, which unblocks APAC expansion (architecture review)

**Threats** (N)
- [market] Series C competitor raised $80M, hiring aggressively in our space (public filing)
- [org] Key API partner deprecating v2 endpoint by Q3 (partner comms)
```

#### Landscape Context

```
### Landscape Context (N)
- [cultural] Company went through reorg 6 months ago — some teams still settling (1:1 with Mike)
- [market] Industry moving toward usage-based pricing, current model is seat-based (competitor analysis)
```

#### Coverage Gaps

Cross-reference SWOT quadrants against landscape dimensions. 4 SWOT tags x 4 landscape
tags = 16 cells. Surface any cell with fewer than 2 entries:

```
### Coverage Gaps
Dimensions with fewer than 2 entries:
- [market] threats: 1 entry — consider investigating competitive landscape
- [cultural] strengths: 0 entries — no cultural strengths recorded yet
```

This nudges toward a complete landscape read over time without forcing it.

After rendering the report, proceed to **Export Formats**.
```

- [ ] **Step 2: Commit**

```fish
git add skills/swot/SKILL.md
git commit -m "Add review mode to /swot skill (#43)"
```

---

### Task 9: Export formats

**Files:**
- Modify: `skills/swot/SKILL.md`

- [ ] **Step 1: Add export formats section**

Append to `skills/swot/SKILL.md`:

```markdown
## Export Formats

After rendering the review report, offer export options:

> "Export this SWOT? Choose a format:
> 1. [Markdown] — standalone doc to docs/swot/
> 2. [Excalidraw] — 2x2 SWOT grid on the canvas
> 3. [Presentation] — Slidev deck via /present
> 4. [All] — generate all three
> Or skip to continue without exporting."

### Markdown Export

Write a point-in-time snapshot to `docs/swot/YYYY-MM-DD-<org-name-lowercase>.md`.
Same structure as the review report. This is the artifact that downstream skills
(`/strategy-doc`, `/okr`) can consume.

### Excalidraw Export

Render a classic 2x2 SWOT grid on the excalidraw canvas using the excalidraw MCP.

**Prerequisites**: Check that `mcp__excalidraw__*` tools are available. If not:
> "Excalidraw MCP is not available. Skipping canvas export. You can still use
> Markdown or Presentation export."

**Layout**:

```
+-------------------------+-------------------------+
|       STRENGTHS         |       WEAKNESSES        |
|     (internal +)        |     (internal -)        |
|                         |                         |
|  [technical] entry 1    |  [technical] entry 1    |
|  [cultural] entry 2     |  [org] entry 2          |
+-------------------------+-------------------------+
|     OPPORTUNITIES       |        THREATS          |
|     (external +)        |     (external -)        |
|                         |                         |
|  [market] entry 1       |  [market] entry 1       |
|  [technical] entry 2    |  [org] entry 2          |
+-------------------------+-------------------------+
```

**Drawing steps**:
1. Clear the canvas: `mcp__excalidraw__clear_canvas`
2. Create four quadrant rectangles with `batch_create_elements` — equal-sized, arranged
   in a 2x2 grid. Use outline-only shapes (no fill).
3. Add quadrant title text elements: "STRENGTHS (internal +)", "WEAKNESSES (internal -)",
   "OPPORTUNITIES (external +)", "THREATS (external -)"
4. Add observation text within each quadrant, grouped by landscape tag. Use fontSize 14
   minimum. If too many entries to fit, show the most recent N entries and add
   "... and M more" text.
5. Add a title text element above the grid: "SWOT Landscape: <Org Name>"
6. Set viewport to fit all content: `mcp__excalidraw__set_viewport({ scrollToContent: true })`

After drawing, offer:
> "SWOT grid rendered on the canvas. You can export it as PNG/SVG from excalidraw."

### Presentation Export

Invoke `/present` with a generated brief:

```
Create a presentation titled "Landscape Assessment: <Org Name>"

Slide structure:
1. Title slide: "Landscape Assessment: <Org Name>" with date
2. Internal Strengths — bulleted list with evidence citations
3. Internal Weaknesses — bulleted list with evidence citations
4. External Opportunities — bulleted list with evidence citations
5. External Threats — bulleted list with evidence citations
6. Coverage Gaps & Recommended Next Steps

Use a clean, professional theme. Each bullet should include the landscape tag
and provenance.
```

### Format Selection

User picks one or more. Generate sequentially. Each format is independent — export
markdown now and come back for the presentation later.
```

- [ ] **Step 2: Commit**

```fish
git add skills/swot/SKILL.md
git commit -m "Add export formats to /swot skill (#43)"
```

---

### Task 10: Integration points (stubbed)

**Files:**
- Modify: `skills/swot/SKILL.md`

- [ ] **Step 1: Add integration and composition sections**

Append to `skills/swot/SKILL.md`:

```markdown
## Integration Points (Stubbed)

Future flags for consuming other skills' graph data:

- `--from=architecture-overview` — pull signals from `/architecture-overview` entity
- `--from=stakeholder-map` — pull signals from `/stakeholder-map` entity

Both currently return:
> "The /<skill-name> skill isn't built yet. You can manually add insights from your
> review using the conversational capture."

When these skills exist, the `--from` flag will:
1. Read the source skill's graph entity
2. Extract signals relevant to SWOT dimensions
3. Present them as draft observations in the same confirm flow as artifact-pointed capture

## Composition

- **Reads from**: `/1on1-prep` observations (manual — user transfers insights via
  conversational capture), `/architecture-overview` and `/stakeholder-map` (future,
  via `--from` flag)
- **Writes to**: Knowledge graph (`SWOT` entity), markdown exports (`docs/swot/`),
  excalidraw canvas, Slidev presentations
- **Feeds**: `/strategy-doc` (#42), `/okr` (#36) — these skills will use
  `search_nodes({ query: "<Org Name> SWOT" })` and filter observations by tag
```

- [ ] **Step 2: Commit**

```fish
git add skills/swot/SKILL.md
git commit -m "Add integration stubs and composition docs to /swot skill (#43)"
```

---

### Task 11: Manual test scenarios

**Files:**
- Create: `skills/swot/test/scenarios.md`

- [ ] **Step 1: Write test scenarios**

Write to `skills/swot/test/scenarios.md`:

```markdown
# /swot Manual Test Scenarios

Run these end-to-end scenarios before merging. Each scenario should be executed in a
fresh Claude Code session. Use a test org name (e.g., "Test Corp Alpha") to avoid
polluting real data.

## Setup

Ensure the memory MCP is running and the graph is accessible:
```
mcp__memory__read_graph
```

## Scenario 1: Bootstrap New Org

**Steps:**
1. Run `/swot "Test Corp Alpha"`
2. Verify skill detects org not found and enters bootstrap
3. Confirm org name
4. Verify SWOT entity created with name "Test Corp Alpha SWOT" and entityType "SWOT"
5. Verify mode defaults to `add` and capture form is presented

**Expected:** SWOT entity created, capture form shown.

**Cleanup:** `mcp__memory__delete_entities({ entityNames: ["Test Corp Alpha SWOT"] })`

## Scenario 2: Conversational Capture

**Setup:** Create a SWOT entity:
```
mcp__memory__create_entities({ entities: [{ name: "Test Corp Beta SWOT", entityType: "SWOT", observations: [] }] })
```

**Steps:**
1. Run `/swot "Test Corp Beta"`
2. Provide capture responses:
   - Strengths: "CI/CD deploys in 15 min with zero-downtime"
   - Weaknesses: "No SRE team, devs carry pager"
   - Opportunities: "Competitor dropped enterprise support"
   - Threats: (skip)
   - Context: "Went through reorg 6 months ago"
3. Verify landscape tags are proposed (e.g., `[technical]` for CI/CD)
4. Verify provenance prompt appears
5. Provide provenance: "1 from repo README, 2 from 1:1 with Sarah, 3 from sales team, 5 from 1:1 with Mike"
6. Verify tagged preview shows 4 observations with correct SWOT tags
7. Confirm
8. Verify write results show all observations succeeded

**Expected:** 4 observations written with correct SWOT + landscape tags + provenance.

**Cleanup:** `mcp__memory__delete_entities({ entityNames: ["Test Corp Beta SWOT"] })`

## Scenario 3: Artifact-Pointed Capture

**Setup:** Same as Scenario 2 (fresh entity with no observations).

**Steps:**
1. Run `/swot "Test Corp Beta" --read skills/swot/SKILL.md` (use the skill file itself
   as a test artifact — it won't produce meaningful SWOT entries, but tests the flow)
2. Verify skill reads the file
3. Verify draft observations are presented for confirmation
4. Edit one draft, remove another
5. Confirm remaining
6. Verify write results

**Expected:** Artifact read, drafts presented, user edits respected, confirmed entries written.

**Cleanup:** `mcp__memory__delete_entities({ entityNames: ["Test Corp Beta SWOT"] })`

## Scenario 4: Challenge Mode

**Setup:** Create a SWOT entity with mixed-quality observations:
```
mcp__memory__create_entities({ entities: [{ name: "Test Corp Gamma SWOT", entityType: "SWOT", observations: [] }] })
mcp__memory__add_observations({ observations: [{ entityName: "Test Corp Gamma SWOT", contents: [
  "[2026-05-01][strength][technical] CI/CD deploys in 15 min, zero-downtime (repo README)",
  "[2026-05-01][strength][cultural] Strong engineering culture",
  "[2026-05-01][opportunity][market] AI is big right now",
  "[2026-05-01][threat][org] No SRE team, devs carry pager"
]}] })
```

**Steps:**
1. Run `/swot "Test Corp Gamma" --mode=challenge`
2. Verify "Strong engineering culture" flagged as NOT SPECIFIC
3. Verify "AI is big right now" flagged as NOT ACTIONABLE
4. Verify "No SRE team" flagged as MISCATEGORIZED (threat→weakness, internal not external)
5. Verify "CI/CD deploys in 15 min" passes all checks
6. Edit "Strong engineering culture" to "Blameless postmortem culture — 3 reviewed, all thorough"
7. Recategorize "No SRE team" to [weakness][org]
8. Remove "AI is big right now"
9. Verify graph updates: old observations deleted, new ones written

**Expected:** 3 of 4 entries flagged, user actions applied, graph updated.

**Cleanup:** `mcp__memory__delete_entities({ entityNames: ["Test Corp Gamma SWOT"] })`

## Scenario 5: Review Mode with Coverage Gaps

**Setup:** Create a SWOT entity with uneven coverage:
```
mcp__memory__create_entities({ entities: [{ name: "Test Corp Delta SWOT", entityType: "SWOT", observations: [] }] })
mcp__memory__add_observations({ observations: [{ entityName: "Test Corp Delta SWOT", contents: [
  "[2026-05-01][strength][technical] Excellent test coverage, 90%+ across services (CI dashboard)",
  "[2026-05-01][strength][technical] Fast deploys, 15 min average (monitoring)",
  "[2026-05-01][strength][org] Experienced platform team lead (1:1 with CTO)",
  "[2026-05-01][weakness][org] No SRE function (1:1 with Sarah)",
  "[2026-05-01][opportunity][market] Competitor dropped enterprise (sales team)",
  "[2026-05-01][threat][market] New competitor raised $80M (public filing)"
]}] })
```

**Steps:**
1. Run `/swot "Test Corp Delta" --mode=review`
2. Verify report renders with Internal/External sections
3. Verify observations grouped by SWOT tag, sub-grouped by landscape tag
4. Verify coverage gaps section identifies gaps (e.g., cultural strengths: 0,
   technical weaknesses: 0, cultural threats: 0, etc.)
5. Verify export options are offered after review

**Expected:** Full report rendered with accurate coverage gap analysis.

**Cleanup:** `mcp__memory__delete_entities({ entityNames: ["Test Corp Delta SWOT"] })`

## Scenario 6: Pending-Sync Fallback

**Steps:**
1. Create a SWOT entity "Test Corp Epsilon SWOT"
2. Simulate write failure (stop the memory MCP mid-capture, or test with a
   deliberately malformed observation)
3. Verify failed observation saved to `skills/swot/pending-sync/YYYY-MM-DD-test-corp-epsilon.md`
4. Verify file is human-readable with retry instructions
5. Restart memory MCP
6. Run `/swot "Test Corp Epsilon" --sync`
7. Verify pending observation written to graph
8. Verify pending-sync file deleted

**Expected:** Observation survives MCP outage and syncs on retry.

**Cleanup:** Delete test entities and any remaining pending-sync files.

## Scenario 7: Excalidraw Export

**Setup:** Same as Scenario 5 (entity with observations across quadrants).

**Steps:**
1. Run `/swot "Test Corp Delta" --mode=review`
2. Select Excalidraw export
3. Verify canvas is cleared
4. Verify 2x2 grid drawn with four quadrant rectangles
5. Verify quadrant titles present: "STRENGTHS", "WEAKNESSES", "OPPORTUNITIES", "THREATS"
6. Verify observations rendered as text within correct quadrants
7. Verify title text above grid

**Expected:** 2x2 SWOT grid rendered on excalidraw canvas.

**Cleanup:** `mcp__memory__delete_entities({ entityNames: ["Test Corp Delta SWOT"] })`

## Scenario 8: Existing Org Lookup

**Setup:** Create a SWOT entity:
```
mcp__memory__create_entities({ entities: [{ name: "Test Corp Zeta SWOT", entityType: "SWOT", observations: [] }] })
mcp__memory__add_observations({ observations: [{ entityName: "Test Corp Zeta SWOT", contents: [
  "[2026-05-01][strength][technical] Good API design (code review)"
]}] })
```

**Steps:**
1. Run `/swot "Test Corp Zeta"`
2. Verify skill finds existing entity (no bootstrap)
3. Verify capture form is presented (default add mode)
4. Verify new observations accumulate alongside existing one

**Expected:** Existing entity found, observations accumulate.

**Cleanup:** `mcp__memory__delete_entities({ entityNames: ["Test Corp Zeta SWOT"] })`
```

- [ ] **Step 2: Commit**

```fish
git add skills/swot/test/scenarios.md
git commit -m "Add manual test scenarios for /swot skill (#43)"
```

---

### Task 12: Update README and close issue

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add /swot to the skills table in README**

In `README.md`, add to the skills table after the `/present` row:

```markdown
| `/swot` | Accumulative SWOT landscape analysis for onboarding. Captures observations to the knowledge graph across sessions, with challenge pass for quality and multi-format export (markdown, excalidraw, presentation). |
```

- [ ] **Step 2: Commit**

```fish
git add README.md
git commit -m "Add /swot to README skills table (#43)"
```

- [ ] **Step 3: Verify all test scenarios pass**

Run through Scenarios 1, 2, 4, 5, and 8 at minimum (these don't require simulating
failures or external tool unavailability). Verify observations are written and read
correctly from the knowledge graph.

- [ ] **Step 4: Push and close issue**

```fish
git push origin main
gh issue close 43 --comment "Implemented /swot skill with add, review, challenge modes and multi-format export."
```
