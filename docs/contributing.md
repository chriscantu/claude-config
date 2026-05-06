# Contributing

How to extend `claude-config` with new rules, skills, or agents. For the install contract these symlink into, see [`rules/README.md`](../rules/README.md).

## Add a Rule

Create a `.md` file in `rules/`. It loads in every session automatically.

```yaml
---
description: When this rule should activate
globs:                        # optional — omit to load always
  - "**/*.pattern"
---

Your rule content here.
```

Re-run the install script (or create the symlink manually) to activate.

## Add a Skill

Create a directory in `skills/` with a `SKILL.md` file:

```
skills/
  my-skill/
    SKILL.md
```

The `SKILL.md` needs frontmatter with `name` and `description`:

```yaml
---
name: my-skill
description: >
  One-line description of when this skill should activate.
  Include trigger phrases users might say.
---

# Skill Title

Your skill instructions here.
```

Re-run the install script to symlink it. Invoke with `/my-skill` in Claude Code.

### Slash-only skills

For skills with side effects where timing matters (writes to memory graph, scaffolds files, creates formal records), add `disable-model-invocation: true` to the frontmatter. The skill remains invocable via `/skill-name` but Claude will never auto-trigger it. This prevents false-positive activations on workflow skills the user must consciously initiate.

```yaml
---
name: my-skill
description: ...
disable-model-invocation: true
---
```

Skip this on pipeline-mandatory skills (`define-the-problem`, `systems-analysis`, `fat-marker-sketch`) and on skills where auto-trigger value outweighs false-positive cost (`adr`, `sdr`, `tech-radar`).

### Cross-bundle references

Anthropic skill anatomy expects each skill to be self-contained in its bundle directory (`skills/<name>/`). Skills SHOULD keep their references inside `skills/<name>/references/`.

**One exception is recorded in this repo:** [`references/architecture-language.md`](../references/architecture-language.md) at the repo root is shared by `/architecture-overview` and `/improve-codebase-architecture` via `../../references/architecture-language.md` deep-links. The shared file IS the integration contract between the two skills — duplication would invent a drift surface that corrupts both skills' outputs.

This layout is **monorepo-only** and **hostile to Anthropic `.skill` packaging**. See [ADR #0013](../adrs/0013-shared-vocab-monorepo-only.md) for the trade-off accepted, the deferred packaging strategy, and the constraint that any future packager MUST be TypeScript/Bun (no Python in this repo).

Do NOT add new cross-bundle deep-links without an ADR documenting the trade-off.

## Add an Agent

Create a `.md` file in `agents/` with frontmatter:

```yaml
---
name: agent-name
description: What this agent reviews or does
tools: [Read, Grep, Glob, Bash]   # tools the agent can use
---

Your agent instructions here.
```

Re-run the install script to symlink it.
