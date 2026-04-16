---
name: swot
description: >
  Use when the user says /swot, "landscape analysis", "SWOT analysis", "strengths
  and weaknesses", or wants to capture, review, or challenge organizational
  observations.
---

# SWOT Landscape Analysis

Structured SWOT for onboarding. Accumulates observations across sessions via the
knowledge graph. Supports conversational capture, artifact-pointed capture, challenge,
review, and multi-format export.

**Announce:** "I'm using the swot skill to help you build your landscape analysis."

**Reference files** (read on demand, not upfront):
- [graph-schema.md](graph-schema.md) — entity format, tags, provenance, examples
- [pending-sync.md](pending-sync.md) — file format, sync flow, error handling
- [challenge-checks.md](challenge-checks.md) — 4 quality checks with examples
- [export-formats.md](export-formats.md) — markdown, excalidraw, presentation export

## Prerequisites

Verify memory MCP: `mcp__memory__read_graph`. If unavailable, warn and route writes
to pending-sync. Check for existing pending-sync files.

## Invocation

```
/swot <org-name> [--mode=add|review|challenge] [--read <path-or-url>] [--sync]
```

`--sync` drains pending-sync files (see [pending-sync.md](pending-sync.md)).
`--read` triggers artifact-pointed capture.

## Org Lookup

`mcp__memory__search_nodes({ query: "<org-name>" })` — exact match (with " SWOT"
suffix) → use it, one substring → use it, multiple → ask, not found → Bootstrap,
tool error → stop.

## Bootstrap (New Org)

Requires memory MCP. Confirm name. Check collision. Create entity:
`name: "<Org Name> SWOT"`, `entityType: "SWOT"`.

## Mode Routing

Default `add`. Empty entity with `review`/`challenge` → redirect to `add`.

## Add Mode (Capture)

**Conversational** (default): present 5-prompt form:
1. Strengths → `[strength]` 2. Weaknesses → `[weakness]` 3. Opportunities → `[opportunity]`
4. Threats → `[threat]` 5. Context → `[context]`

Parse by number prefix or sequential paragraphs. Unparseable → re-present form.
Skip empties. One response = one verbatim observation. Add landscape tags
(`[technical]`/`[cultural]`/`[market]`/`[org]`) by LLM judgment. Ask for provenance.
Confirm → write one-at-a-time. Failed writes → pending-sync. After write, offer
challenge pass.

**Artifact-pointed** (`--read`): read file/URL, extract signals as draft observations,
present in same confirm flow. Never writes unconfirmed observations.

## Review Mode

Read entity. Render sections (omit empty): Header, Internal (strengths/weaknesses
by landscape tag), External (opportunities/threats by landscape tag), Context, Coverage
Gaps (4x4 SWOT × landscape matrix, flag cells <2 entries). Then offer export
(see [export-formats.md](export-formats.md)).

## Challenge Mode

Read entity, run 4 checks (see [challenge-checks.md](challenge-checks.md)). Present
flagged items with Edit/Remove/Keep/Recategorize actions.

## Composition

- **Reads**: `/1on1-prep` (manual), `/architecture-overview`, `/stakeholder-map` (future `--from`)
- **Writes**: knowledge graph, `docs/swot/`, excalidraw canvas, Slidev
- **Feeds**: `/strategy-doc` (#42), `/okr` (#36)
