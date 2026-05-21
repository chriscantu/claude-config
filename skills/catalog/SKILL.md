---
name: catalog
description: Use when the user says /catalog, "what skills are available", "show me the toolkit", "list my skills/agents/rules", or wants an in-session inventory of claude-config rules, skills, agents, and templates without leaving the session to grep docs.
disable-model-invocation: true
---

# Catalog

Renders the in-repo claude-config inventory (rules, skills, agents, templates) from `docs/catalog.md`, grouped by purpose. Purely informational — no side effects.

The model does not auto-invoke this skill. It runs only when the user explicitly types `/catalog` (or one of its argument forms).

## Arguments

- (no args) — Render all groups: rules, pipeline skills, leader toolkit, ops skills, agents, templates, ecosystem.
- `skills` — Skills only (pipeline + leader + ops).
- `agents` — Agents only.
- `rules` — Rules only.
- `leader` — Senior eng leader toolkit only (`/onboard`, `/strategy-doc`, `/swot`, `/stakeholder-map`, `/1on1-prep`, `/present`).
- `--mine` — List skills present under `~/.claude/skills/` that are NOT documented in the canonical `docs/catalog.md`. Useful for finding plugin skills (caveman, superpowers, harness) and user-added skills outside the claude-config repo.

Arguments are mutually exclusive except `--mine`, which combines with any group filter.

## Workflow

### Step 1: Locate the catalog source

Resolve the canonical catalog path in this order:

1. `<repo-root>/docs/catalog.md` — if the current working directory is inside the claude-config repo.
2. `~/repos/claude-config/docs/catalog.md` — the user's canonical clone.
3. If neither resolves, ask the user for the path.

The catalog file is the single source of truth. Do not re-derive tables from disk scans — render what's documented.

### Step 2: Parse sections

`docs/catalog.md` uses H2/H3 headers and GitHub-flavored markdown tables. Map argument → section:

| Argument | Section header(s) to render |
|---|---|
| (no args) | All H2/H3 sections in order |
| `rules` | `## Rules (always active)` |
| `skills` | `### Pipeline + design-thinking`, `### Senior eng leader toolkit`, `### Other operational skills` |
| `agents` | `## Agents (specialized reviewers)` |
| `leader` | `### Senior eng leader toolkit` |

Render the matching tables verbatim. Do not paraphrase rows — the catalog file owns the descriptions.

### Step 3: --mine flag handling

When `--mine` is present:

1. List directories under `~/.claude/skills/` via `ls` or `Glob`.
2. Extract documented skill names from `docs/catalog.md` (scan rows in the skills tables; strip leading `/` from slash-command names).
3. Report the set difference: `~/.claude/skills/*` MINUS catalog-documented skills.
4. Group output by likely source: plugin name prefix (e.g., `superpowers:*`, `caveman:*`, `harness:*`) vs. unprefixed entries (likely user-added).

`--mine` is a diff, not a full inventory. Output explicitly labels what's NOT in the canonical catalog.

### Step 4: Render

- Preserve the markdown table format from `docs/catalog.md`.
- Include the workflow mermaid diagram only when no args (rendering everything).
- For `leader` arg, prepend a one-line context: "Senior eng leader toolkit — 90-day ramp orchestration."
- For `--mine` with no extras found: "No skills found outside the canonical catalog."

## Out of scope

- Interactive TUI / picker — output is markdown, not a menu.
- Real-time skill usage stats — no telemetry.
- Plugin discovery beyond `~/.claude/skills/` listing — does not query MCP servers or plugin marketplaces.
- Editing the catalog — read-only against `docs/catalog.md`.

## Examples

```
/catalog
```
→ Full inventory (workflow diagram + rules + all skills + agents + templates + ecosystem).

```
/catalog leader
```
→ Senior eng leader toolkit table only.

```
/catalog skills --mine
```
→ Skills directories present under `~/.claude/skills/` but absent from `docs/catalog.md`, grouped by plugin prefix.

## Related

- `docs/catalog.md` — canonical inventory this skill renders.
- `rules/README.md` — rule install contract; rules listed in the catalog are the HARD-GATE set.
- `bin/link-config.fish` — installs the symlinks that make catalog entries available at runtime.
