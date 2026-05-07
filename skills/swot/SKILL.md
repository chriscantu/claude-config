---
name: swot
description: >
  Use when the user says /swot, "landscape analysis", "SWOT analysis", "strengths
  and weaknesses", or wants to capture, review, or challenge organizational
  observations.
disable-model-invocation: true
---

# SWOT Landscape Analysis

Structured SWOT for onboarding. Accumulates observations across sessions via the
knowledge graph. Supports conversational capture, artifact-pointed capture, challenge,
review, and multi-format export.

**Announce:** "I'm using the swot skill to help you build your landscape analysis."

**Reference files** (read on demand, not upfront):
- [graph-schema.md](graph-schema.md) — entity format, tags, provenance, examples
- [pending-sync.md](pending-sync.md) — file format, sync flow, error handling
- [capture-form.md](capture-form.md) — 5-prompt form, parsing rules, provenance, confirm flow
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

## Confidentiality Refusal

When the caller passes `--read <path>` AND the path is local (not a URL), MUST
run the refusal guard before reading the file:

```fish
bun run "$CLAUDE_PROJECT_DIR/skills/onboard/scripts/onboard-guard.ts" refuse-raw <path>
```

The guard is a no-op for URLs and paths outside any /onboard workspace —
exits 0, /swot proceeds normally.

Exit codes, repo-root resolution, and override policy: see
[../onboard/refusal-contract.md](../onboard/refusal-contract.md).

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

Read [capture-form.md](capture-form.md) for the form, parsing rules, and confirm flow.

**Conversational** (default): 5-prompt form mapping to `[strength]`, `[weakness]`,
`[opportunity]`, `[threat]`, `[context]`. Landscape tags by LLM judgment. Provenance
asked after tagging. Confirm → write one-at-a-time. Failed writes → pending-sync.
After write, offer challenge pass.

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

## Integration Points (Stubbed)

`--from=architecture-overview` and `--from=stakeholder-map` are planned but unbuilt.
If a user passes `--from`, return:
> "The /<skill-name> skill isn't built yet. You can manually add insights using
> the conversational capture."

## Common Mistakes

- **Writing observations without provenance** — every observation should carry its source (conversation, artifact, meeting); unattributed entries can't be audited or challenged later.
- **Miscategorizing internal vs. external** — strengths/weaknesses are internal to the org; opportunities/threats are external forces. Slipping a market trend into weaknesses (or vice versa) breaks the framework.
- **Writing observations without user confirmation** — capture is confirm-then-write; never persist draft observations from artifact extraction until the user approves them.
- **Reaching for challenge or review mode on an empty entity** — redirect to `add` when the entity has no observations yet; there's nothing to review.
- **Skipping coverage gaps in review** — the 4x4 SWOT × landscape matrix is where missing analysis becomes visible; always surface cells with fewer than two entries.

## Composition

- **Reads**: `/1on1-prep` (manual), `/architecture-overview`, `/stakeholder-map` (future `--from`)
- **Writes**: knowledge graph, `docs/swot/`, excalidraw canvas, Slidev
- **Feeds**: `/strategy-doc` (#42), `/okr` (#36)
