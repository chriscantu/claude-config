# Anthropic KG Memory MCP — Installation & Setup Runbook

**Date:** 2026-04-15
**Status:** Draft — to be executed after ADR #0003 is accepted
**ADR:** [#0003](../../../adrs/0003-adopt-anthropic-kg-memory-mcp-for-onboarding-storage.md)
**Owner:** Cantu

## Goal

Install the Anthropic Knowledge Graph Memory MCP as a local storage layer for the
onboarding toolkit, configured to persist memories in a stable, backed-up location, and
verified working end-to-end in Claude Code before any onboarding skills are built on top.

## Scope

- Install the MCP server
- Configure the storage path and Claude Code integration
- Establish a backup strategy
- Define the initial entity and relation taxonomy
- Verify end-to-end with a smoke test

Out of scope:

- Building capture skills (`/capture-1on1`, etc.) — separate work, depends on this
- Migrating existing markdown memories — deferred until the system is proven in use
- Skills that consume the graph (`/1on1-prep`, `/stakeholder-map`) — separate work

## Prerequisites

- `node` and `npx` installed (for the npx install path)
- Claude Code with MCP support
- A decision on where the JSONL memory file should live (see Step 2)
- Optionally: Docker (if preferring containerized install)

## Step 1 — Choose the install method

Two supported paths:

**Path A: NPX (recommended for personal use)**

```fish
# No install step needed up front — npx fetches on first run
# The Claude Code MCP config will invoke it via: npx -y @modelcontextprotocol/server-memory
```

**Path B: Docker**

```fish
# Pull the prebuilt image
docker pull mcp/memory

# Note: Docker users must delete any prior index.js files in mounted volumes
# before upgrading containers, per the project's documented gotcha.
```

**Recommendation:** Path A. Lower moving parts, simpler upgrades, no container lifecycle
to manage. Path B is worth it only if the host environment can't run Node reliably.

## Step 2 — Decide the storage path

The `MEMORY_FILE_PATH` environment variable controls where the JSONL memory file lives.
The default is `memory.jsonl` inside the server directory, which is wrong for personal
use because it couples to the install location.

**Recommended path:** `~/.claude/memory/graph.jsonl`

Rationale:
- Outside the claude-config repo, so it never gets committed by accident
- Under `~/.claude/` so it's colocated with other Claude Code state
- Single file, easy to back up, easy to grep, easy to reason about
- Stable across npx reinstalls and version upgrades

**Create the directory up front:**

```fish
mkdir -p ~/.claude/memory
```

Do **not** pre-create the `graph.jsonl` file — let the MCP server create it on first
write. An empty file can confuse the server on startup.

## Step 3 — Configure Claude Code MCP

Add the server to the Claude Code MCP configuration. The config file location depends on
Claude Code setup; typical locations are `~/.claude.json` or a project-level `.mcp.json`.

**Recommended placement:** user-level (`~/.claude.json`) since this memory should span
all projects, not be scoped to one repo.

**Configuration block:**

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"],
      "env": {
        "MEMORY_FILE_PATH": "/Users/cantu/.claude/memory/graph.jsonl"
      }
    }
  }
}
```

Note: use the absolute path, not `~` — MCP env var expansion is inconsistent across
environments. Hardcode the home directory.

After adding the config, restart Claude Code so the new MCP server is picked up.

## Step 4 — Verify the install

Start a fresh Claude Code session and check that the nine memory tools are available:

- `create_entities`
- `create_relations`
- `add_observations`
- `delete_entities`
- `delete_observations`
- `delete_relations`
- `read_graph`
- `search_nodes`
- `open_nodes`

**Smoke test (run manually from a Claude Code session):**

1. Ask Claude to create a test entity: "Create a test entity named 'RunbookSmokeTest' of
   type 'test' with the observation 'installed on 2026-04-15'."
2. Confirm the JSONL file exists: `ls -la ~/.claude/memory/graph.jsonl`
3. Inspect the contents: `cat ~/.claude/memory/graph.jsonl` — should show one line with
   the entity.
4. Ask Claude to search for it: "Search memory for 'smoke'." Should return the entity.
5. Ask Claude to delete it: "Delete the entity 'RunbookSmokeTest'."
6. Confirm the JSONL file reflects the deletion.

If any step fails, the install is not complete. Do not proceed to taxonomy or capture
skill work until the smoke test passes.

## Step 5 — Establish the backup strategy

The memory file is small (JSONL, ~40-500 entities expected), which makes backup cheap.

**Recommended approach:** git repo dedicated to memory snapshots.

```fish
# One-time setup
cd ~/.claude/memory
git init
git add graph.jsonl
git commit -m "Initial memory graph"
```

**Daily snapshot** via a simple cron or a Claude Code hook that runs on session end:

```fish
# Fish function for manual use
function memory-snapshot
    cd ~/.claude/memory
    if test -n (git status --porcelain)
        git add graph.jsonl
        git commit -m "Snapshot (date '+%Y-%m-%d %H:%M')"
    end
end
```

Git gives free history, free rollback, and free diff inspection. No external backup
system needed. If the graph file corrupts, `git log graph.jsonl` shows the history and
`git checkout <sha> graph.jsonl` restores.

Optional: push to a private remote repo for off-machine backup. Not required for the
initial pilot but worth revisiting if the graph becomes load-bearing.

## Step 6 — Define the initial entity and relation taxonomy

Before any real data is captured, establish the vocabulary the graph will use. Doing this
up front prevents the graph from becoming inconsistent (Person vs. person vs. People,
reports_to vs. reportsTo vs. has_manager, etc.).

**Initial entity types:**

- `Person` — individual humans (colleagues, stakeholders, interviewees, candidates)
- `Team` — named teams or organizational units
- `System` — named software systems, services, or products
- `Commitment` — something explicitly promised by or to a Person
- `Risk` — a flagged concern about a Person, Team, System, or initiative
- `Decision` — an architectural or organizational decision, dated and attributable
- `Meeting` — a specific meeting, linked to participants and topics
- `Project` — a bounded initiative with owner and timeline

**Initial relation vocabulary** (always in active voice, as the Anthropic MCP requires):

- `reports_to` — Person → Person
- `manages` — Person → Person (inverse of reports_to)
- `member_of` — Person → Team
- `leads` — Person → Team
- `owns` — Team → System, Person → Project
- `sponsors` — Person → Project
- `depends_on` — System → System, Project → Project
- `raised_by` — Risk → Person (who flagged it)
- `about` — Risk → System / Team / Project
- `committed_by` — Commitment → Person
- `committed_to` — Commitment → Person
- `attended` — Person → Meeting
- `discussed` — Meeting → Project / System / Risk
- `decided_in` — Decision → Meeting
- `decided_by` — Decision → Person

This vocabulary is the **pilot version**. Expect to revise it after the first few weeks
of actual capture. Any revision should be atomic — add new relations in an empty graph
window or write a migration script; do not mix old and new vocabulary.

**Record the taxonomy as a Decision entity in the graph itself** as the first real
capture:

1. Create entity `TaxonomyV1` of type `Decision` with observations listing the entity
   types and relation vocabulary above.
2. This gives the graph a self-documenting bootstrap record and demonstrates the loop
   works end-to-end.

## Step 7 — Capture discipline (bridge to onboarding skills)

The Anthropic MCP has no autonomous extraction. The graph stays empty unless something
populates it. Until the dedicated capture skills exist, follow a manual discipline:

**After every meaningful interaction** (1:1, intake conversation, stakeholder touchpoint):

1. Open Claude Code
2. Ask: "Capture the following conversation into memory using the onboarding taxonomy:
   [paste or describe]"
3. Claude reads the taxonomy from `TaxonomyV1` and decides which entities, relations,
   and observations to create.
4. Verify the created entries look right by asking Claude to read them back.

This is the **interim manual protocol**. It will be replaced by purpose-built capture
skills (tracked separately in the onboarding toolkit plan). The goal of the manual phase
is to pressure-test the taxonomy with real data before investing in skill automation.

## Step 8 — Health check schedule

The ADR commits to a 6-month MemPalace maturity check but does **not** commit to
re-evaluating this decision at any specific checkpoint. However, the pilot should have
minimal internal health checks to catch silent failures:

- **Weekly:** `git log --oneline graph.jsonl` — confirm snapshots are happening
- **Monthly:** `wc -l ~/.claude/memory/graph.jsonl` — confirm growth matches expected
  capture rate; sanity-check for sudden drops (silent corruption)
- **On significant corruption or loss of trust:** revert via git and investigate

These checks are lightweight (seconds) and are not a reassessment of the storage decision
— they are operational hygiene.

## Rollback plan

If the Anthropic MCP fails catastrophically during the pilot:

1. **Immediate:** restore the last good `graph.jsonl` from git (`git checkout HEAD~1 --
   graph.jsonl` or similar).
2. **Short-term:** fall back to the markdown auto-memory system (which has been running in
   parallel throughout the pilot).
3. **Medium-term:** reassess options — at that point MemPalace may be mature enough, or
   self-hosted Mem0 may look manageable with the lessons learned.

The rollback is cheap because the markdown safety net is still live and the JSONL format
is trivially recoverable via git history.

## Definition of done

- [ ] NPX install path configured in Claude Code MCP config
- [ ] `~/.claude/memory/` directory created
- [ ] `MEMORY_FILE_PATH` pointed at `~/.claude/memory/graph.jsonl`
- [ ] Smoke test passes end-to-end (create, search, delete)
- [ ] Git repo initialized in `~/.claude/memory/` with first commit
- [ ] `TaxonomyV1` Decision entity captured in the graph
- [ ] Manual capture protocol exercised at least once with real data
- [ ] Weekly/monthly health check cadence set as a reminder
- [ ] This runbook marked `Completed` in the status line above
