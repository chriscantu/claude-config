# claude-config

*Claude Code, configured as your strategic engineering thought partner.*

**The problem:** Claude Code is powerful out of the box, but without guardrails it skips straight to implementation. It doesn't decompose problems, doesn't consider trade-offs, doesn't verify its work, and doesn't think about organizational impact. You end up with code that compiles but misses the point.

**What this gives you:** A set of rules, skills, and agents that enforce a deliberate workflow — from problem definition through design sketching to verified implementation. Claude still does the work; it just thinks before it acts.

## Install

```sh
git clone https://github.com/chriscantu/claude-config.git ~/repos/claude-config
cd ~/repos/claude-config

# bash/zsh
bash install.sh

# fish
fish install.fish
```

Both scripts do the same thing: symlink everything into `~/.claude/`. Existing files are backed up with a `.bak` extension. Re-running is safe — symlinks are replaced, not duplicated.

### Post-Install: Customize `global/CLAUDE.md`

The global config ships with opinionated defaults (shell preferences, language defaults, communication style). **Edit `global/CLAUDE.md` to match your environment** — it's the one file you should personalize.

On your next Claude Code session, ask Claude to build something. You'll see it stop and ask you to define the problem before writing a line of code.

## See it in action

A VP asks Claude to add a new billing tier to the platform. Without this config, Claude starts writing code. With it:

1. **Problem Definition** — Claude asks: *Who is this tier for? What behavior changes? What does success look like?*
2. **Systems Analysis** — Claude maps what's affected: billing service, entitlements, usage reporting, downstream teams
3. **Trade-off presentation** — Claude surfaces 2-3 approaches with organizational implications, not just technical ones
4. **Sketch before design** — Claude produces a structural sketch before writing a single line
5. **Verified implementation** — Tests run before Claude declares the work done

## What's Included

Rules run automatically and shape how Claude approaches every session. Skills are invoked on demand for specific workflows. Agents are specialized reviewers you bring in at key moments.

### Rules (always active)

| Rule | What it enforces |
|------|-----------------|
| **planning** | Enforces the mandatory planning pipeline: problem definition → systems analysis → brainstorming → fat-marker sketch → detailed design. Thin gate rule that delegates to skills for each stage. Announces stage transitions so you always know where you are. |
| **fat-marker-sketch** | After selecting an approach, Claude must produce a crude visual sketch (rendered as HTML with bordered boxes) before detailed design. Forces structural conversation before pixel-level detail. |
| **tdd-pragmatic** | Test-first for non-trivial logic, tests alongside for simple code. Every bug fix starts with a reproducing test. |
| **verification** | Claude must run tests or type-checks before claiming work is complete. No "this should work" — prove it. |

### Skills (on-demand slash commands)

Skills are invoked with `/skill-name` and guide Claude through structured processes.

| Skill | Purpose |
|-------|---------|
| `/define-the-problem` | Front door to the planning pipeline. Ensures every feature starts with a clear user problem — not a solution, not a feature request. Hands off to `/systems-analysis` when complete. |
| `/systems-analysis` | Maps dependencies, second-order effects, failure modes, and organizational impact. Bridge between problem definition and solution design. |
| `/adr` | Create, list, or supersede architectural decision records following system-design-records conventions. |
| `/new-project` | Scaffold a new repo with CLAUDE.md, test config, and git setup for your chosen stack (TypeScript, Python, Swift, docs). |
| `/cross-project` | Analyze how a change in the current repo affects other local repositories. Scans `~/repos/` for dependents. |
| `/tech-radar` | Manage technology adoption entries (Assess → Trial → Adopt → Hold) with structured evaluation criteria. |
| `/tenet-exception` | Create engineering tenet exception requests with proper justification and PR process guidance. |
| `/fat-marker-sketch` | Produce a crude structural sketch — invoked automatically by the planning rule, but can also be called directly. |
| `/present` | Create professional presentations using Slidev + Bun. Takes a brief, draft, or existing slides → live preview → PDF/PPTX export. Source-controllable Markdown. |

### Agents (specialized reviewers)

| Agent | Purpose |
|-------|---------|
| **platform-reviewer** | Reviews code changes for API contract stability, backward compatibility, operational burden, and cross-team impact. |

### Templates

| Template | Purpose |
|----------|---------|
| **PROJECT-CLAUDE-MD.md** | Drop-in template for per-repo CLAUDE.md files. Covers project purpose, architecture, commands, conventions, domain glossary, and non-obvious decisions. |

> **What this is not:** This isn't a replacement for engineering judgment — it's a forcing function. Claude still gets things wrong. The config makes it wrong less often, and in more visible ways.

## The Workflow

These pieces compose into a deliberate design pipeline:

```mermaid
flowchart LR
    A["/define-the-problem"] --> B["/systems-analysis"]
    B --> C["brainstorming"]
    C --> D["/fat-marker-sketch"]
    D --> E["detailed design"]
    E --> F["TDD implementation"]
    F --> G["verification"]

    style A fill:#4a90d9,color:#fff,stroke:none
    style B fill:#4a90d9,color:#fff,stroke:none
    style C fill:#7b68ee,color:#fff,stroke:none
    style D fill:#7b68ee,color:#fff,stroke:none
    style E fill:#5ba85a,color:#fff,stroke:none
    style F fill:#5ba85a,color:#fff,stroke:none
    style G fill:#e67e22,color:#fff,stroke:none
```

You can enter at any point — the rules enforce the upstream steps automatically. Start building a feature and Claude will decompose the problem first. Select an approach and Claude will sketch before designing. Write code and Claude will verify before declaring done.

## References

- [Claude Code docs](https://docs.anthropic.com/en/docs/claude-code) — official documentation
- [awesome-claude-md](https://github.com/josix/awesome-claude-md) — curated CLAUDE.md examples
- [HumanLayer: Writing a Good CLAUDE.md](https://www.humanlayer.dev/blog/writing-a-good-claude-md) — WHY/WHAT/HOW framework
- [Fat Marker Sketches](https://domhabersack.com/blog/fat-marker-sketches) — the concept behind the sketch rule

## Extending

### Add a Rule

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

### Add a Skill

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

### Add an Agent

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
