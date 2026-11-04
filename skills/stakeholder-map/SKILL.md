---
name: stakeholder-map
description: Use when the user says /stakeholder-map, asks to build a stakeholder/political-topology map for a new leadership role, wants to review coverage of their relationship-building, or asks for meet-in-what-order guidance during onboarding.
disable-model-invocation: true
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
- [graph-schema.md](graph-schema.md) — tags, relations, write protocols, shared computation rules
- [bootstrap.md](bootstrap.md) — manual form + calendar-seed flow (Mode A intake)
- [chart-render.md](chart-render.md) — Mode A chart rendering
- [heatmap-render.md](heatmap-render.md) — Mode B heatmap rendering
- [coverage-queries.md](coverage-queries.md) — five dimension queries, echo-chamber, structural-gap
- [sync.md](sync.md) — `--sync` drain line format and partial-replay semantics

## Privacy

Person entities contain sensitive assessments. Storage is local memory MCP only —
never export to repo or share the raw graph.

The rendered chart and heatmap carry the same data, so they stay on this machine
as local HTML files. Never publish them with the Artifact tool or upload them
anywhere, even if asked. If the user wants to share a view, print the text
fallback from the render file so they can choose what to copy.

## Prerequisites

Verify memory MCP: `mcp__memory__read_graph`. If unavailable, warn and set a
session-wide flag so ALL writes route to `pending-sync/` for the remainder (not just
the current write). The file format mirrors 1on1-prep — see
[`../1on1-prep/pending-sync.md`](../1on1-prep/pending-sync.md). Check for existing
pending-sync files on entry.

Rendering writes a local HTML page and opens it in the browser. Where the page
goes, and when to print a text fallback instead, is in
[chart-render.md](chart-render.md#where-it-goes). The page stays on this machine
(see Privacy above).

## Invocation

```
/stakeholder-map --mode=leader-onboarding [--seed-from-calendar [--days=30]]
/stakeholder-map --mode=coverage-review
/stakeholder-map --render                     # rebuild a page from the current graph (see below)
/stakeholder-map --sync                       # drain pending-sync
```

`--render` rebuilds the page for the mode run last in this session. In a new
session, ask which view to build: the chart (leader-onboarding) or the heatmap
(coverage-review).

`--sync` drains pending-sync files in `skills/stakeholder-map/pending-sync/`
into the memory graph. Line format, partial-replay semantics, and
authoring rules are specified in [sync.md](sync.md).

## Mode Detection

If no `--mode` flag:
1. `mcp__memory__read_graph` — count entities that satisfy the **stakeholder-map
   membership predicate** defined in [graph-schema.md](graph-schema.md#stakeholder-map-membership-predicate).
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

## Common Mistakes

- **Minting enum values at runtime.** Only the canonical values in
  [graph-schema.md](graph-schema.md) are writable. If the user says "he's a
  distinguished engineer", don't invent `[role:distinguished]` — record the title
  in a `[context]` observation and tag `[role:staff]` (closest canonical).
- **Skipping the replaceable-tag write protocol.** Writing a new `[power:formal:*]`
  without first deleting the prior one leaves two values on the entity and breaks
  latest-tag selection.
- **Creating a relation before both entities exist.** `create_relations` requires
  both ends to resolve. In bootstrap, create the target entity first, or skip the
  relation.
- **Using stakeholder-map-tagged entities as a general contact database.**
  `[context]`-only entities (from `seen-but-skip` or 1on1-prep upgrades) are NOT
  on the map per the membership predicate. Don't let them leak into charts or
  coverage counts.
- **Sending the render off this machine.** The chart and heatmap pages follow the
  Privacy rule above, with no exceptions.
- **Skipping the render silently.** When the page can't be shown, print the text
  fallback instead.

## Compatibility With 1on1-prep

Both skills write to the same memory graph using the same observation format.
Stakeholder-map's tag schema is documented in [graph-schema.md](graph-schema.md) and
is cross-referenced from 1on1-prep's schema. Running either skill first is valid;
stakeholder-map's bootstrap offers an upgrade path for entities created by
1on1-prep.

## Where this skill persists state

Per [ADR #0020](../../adrs/0020-memory-layer-primary-and-delegations.md), per-leaf data class assignment against the six-leaf decision tree:

**memory MCP knowledge graph** (`mcp__memory__*` from `@modelcontextprotocol/server-memory`):

- Stakeholder graph: person/team entities, observations, relations, power / category / function tags. Confidentiality contract per the Privacy section above: never export raw graph contents to repo or share verbatim — honors the local-only-sensitive contract ADR #0020 names for this destination.

**Not used by this skill:** auto-memory MD, ruflo MCP, user working repo (no committed exports — Privacy forbids them), scheduled-tasks MCP, plugin-internal memory (`decisions.md` / `patterns.md`).

Out-of-scope local files (not memory layers): `pending-sync/` (transient buffer when MCP unavailable, drained by `--sync`), local HTML render files in the scratchpad (rendering sink, not state).
