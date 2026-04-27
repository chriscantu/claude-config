---
name: 1on1-prep
description: Use when the user says /1on1-prep, "prep for my 1:1", "1:1 with", "capture my 1:1", or wants to prepare for or record notes from a one-on-one meeting.
disable-model-invocation: true
---

# 1:1 Prep & Capture

Prep reads the knowledge graph to surface context, commitments, and signal.
Capture writes verbatim observations with deterministic tags.

**Announce:** "I'm using the 1on1-prep skill to help you prepare for your 1:1."

**Flow:** Prerequisites → Invocation → Person Lookup → Bootstrap → Phase Detection →
Mode Detection → Prep or Capture.

**Reference files** (read on demand, not upfront):
- [graph-schema.md](graph-schema.md) — observation format, tags, relations, examples
- [pending-sync.md](pending-sync.md) — file format, parsing, error handling
- [capture-form.md](capture-form.md) — 6-prompt form, parsing rules, resolution flow
- [questions.md](questions.md) — question bank
- [stakeholder-map graph-schema](../stakeholder-map/graph-schema.md) — extended schema (power, category, coverage, advice) shared when stakeholder-map is in use

## Prerequisites

Verify memory MCP: `mcp__memory__read_graph`. If unavailable, warn and set a
session-wide flag so ALL writes route to pending-sync for the remainder (not just the
current write). Check for existing pending-sync files.

## Invocation

```
/1on1-prep <person-name> [--mode=intake|coaching] [--phase=prep|capture] [--context "..."] [--sync]
```

`--context` writes a `[context]` observation and exits. `--sync` drains pending-sync
files (see [pending-sync.md](pending-sync.md)).

## Person Lookup

`mcp__memory__search_nodes({ query: "<person-name>" })` — exact match → use it,
one substring → use it, multiple → ask user, not found → Bootstrap,
tool error → stop (prevents duplicate creation).

## Bootstrap (New Person)

Requires memory MCP. Four-prompt form: 1) Full name 2) Role/team 3) Background
4) Reports to (optional). Answer #1 = entity name. Others → `[context]` observations.
Check name collision. Only create `reports_to` if manager exists.

## Phase Detection

If no `--phase`, query calendar (-4h to +24h). Upcoming → Prep. Ended ≤4h → Capture.
Multiple → ask. None/unavailable → ask.

## Mode Detection

Priority: `--mode` flag → explicit `[mode:*]` marker in graph → auto-detect.
**Intake** if <3 `[1on1]` observations, no `[context]`, no `reports_to`. Else **Coaching**.
Note: `open_nodes` doesn't return relations — use `search_nodes` to check `reports_to`.
Offer graduation nudge if heuristic says coaching but no marker exists.

## Prep Phase (Read-Only)

Read Person's full node. Render in order, omit empty sections:

1. **Header** — `## <Name> [MODE] 1:1 #N` with meeting time
2. **Context** — `[context]` observations as bullets
3. **Open Commitments** — unresolved `[commitment]`, oldest first, cap 10
4. **Open Follow-ups** — unresolved `[followup]`, cap 10
5. **Recent Signal** — last 2-3 sessions by strategic tag
6. **What Others Said** — cross-entity `search_nodes` (cap 5, never `read_graph`)
7. **Suggested Questions** — 3-4 from [questions.md](questions.md), 2+ categories

## Capture Phase

**Before showing the form**, check if user indicates no meeting occurred (e.g.,
"nothing happened", "we didn't meet", "they cancelled"). If so, skip to noshow:
write `[YYYY-MM-DD][1on1][<mode>][noshow] No capture recorded`. Failed → pending-sync.

Otherwise, read [capture-form.md](capture-form.md) for form, parsing, and resolution
flow. Tags assigned deterministically by prompt bucket. Write one-at-a-time, failed
writes → pending-sync.

## Common Mistakes

- **Summarizing capture observations instead of recording verbatim** — the graph is only useful if entries preserve what was said; paraphrasing loses signal and invents details.
- **Auto-resolving open commitments or follow-ups without asking** — always confirm with the user before marking prior items resolved; Prep shows them, it doesn't close them.
- **Assigning tags by LLM judgment instead of prompt bucket** — capture tags are deterministic by form prompt; don't re-tag based on content interpretation.
- **Skipping the cancelled/no-show path** — if the user indicates no meeting occurred, write the `[noshow]` entry instead of showing the capture form.
- **Reading the full graph when person lookup suffices** — use `search_nodes` for cross-entity lookups; avoid `read_graph` which pulls the entire corpus into context.
