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

## Prerequisites

Verify the memory MCP is available:

````
mcp__memory__read_graph
````

If this fails, warn the user:
> "The memory MCP server isn't available. I can still help you think through your
> SWOT analysis conversationally, but I won't be able to save observations to the
> graph. Run `/swot <org-name> --sync` when the server is back to retry any failed
> writes."

Set a flag to route all writes to pending-sync for the remainder of this session.

Check for pending-sync files:

````fish
ls skills/swot/pending-sync/*.md 2>&1
````

If any exist, warn:
> "You have pending observations that failed to write previously. Run
> `/swot <org-name> --sync` to retry writing them to the graph."

## Invocation

````
/swot <org-name> [--mode=add|review|challenge] [--read <path-or-url>] [--sync]
````

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
