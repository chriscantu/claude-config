# claude-config

A portable, version-controlled configuration for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) that installs structured engineering workflows — first-principles thinking, UX-driven design, verification gates, and reusable process skills.

**The problem:** Claude Code is powerful out of the box, but without guardrails it skips straight to implementation. It doesn't decompose problems, doesn't consider trade-offs, doesn't verify its work, and doesn't think about organizational impact. You end up with code that compiles but misses the point.

**What this gives you:** A set of rules, skills, and agents that enforce a deliberate workflow — from problem definition through design sketching to verified implementation. Claude still does the work; it just thinks before it acts.

## What's Included

### Rules (always active)

Rules load automatically in every Claude Code session and shape how Claude approaches work.

| Rule | What it enforces |
|------|-----------------|
| **planning** | First-principles decomposition before any solution — ground truth, core problem, constraints, systems thinking, and org impact. Announces stage transitions so you always know where you are in the process. |
| **fat-marker-sketch** | After selecting an approach, Claude must produce a crude visual sketch (rendered as HTML with bordered boxes) before detailed design. Forces structural conversation before pixel-level detail. |
| **tdd-pragmatic** | Test-first for non-trivial logic, tests alongside for simple code. Every bug fix starts with a reproducing test. |
| **verification** | Claude must run tests or type-checks before claiming work is complete. No "this should work" — prove it. |

### Skills (on-demand slash commands)

Skills are invoked with `/skill-name` and guide Claude through structured processes.

| Skill | Purpose |
|-------|---------|
| `/define-the-problem` | Front door to solution design. Ensures every feature starts with a clear user problem — not a solution, not a feature request. Hands off to brainstorming when complete. |
| `/adr` | Create, list, or supersede architectural decision records following system-design-records conventions. |
| `/new-project` | Scaffold a new repo with CLAUDE.md, test config, and git setup for your chosen stack (TypeScript, Python, Swift, docs). |
| `/cross-project` | Analyze how a change in the current repo affects other local repositories. Scans `~/repos/` for dependents. |
| `/tech-radar` | Manage technology adoption entries (Assess → Trial → Adopt → Hold) with structured evaluation criteria. |
| `/tenet-exception` | Create engineering tenet exception requests with proper justification and PR process guidance. |
| `/fat-marker-sketch` | Produce a crude structural sketch — invoked automatically by the planning rule, but can also be called directly. |

### Agents (specialized reviewers)

| Agent | Purpose |
|-------|---------|
| **platform-reviewer** | Reviews code changes for API contract stability, backward compatibility, operational burden, and cross-team impact. |

### Templates

| Template | Purpose |
|----------|---------|
| **PROJECT-CLAUDE-MD.md** | Drop-in template for per-repo CLAUDE.md files. Covers project purpose, architecture, commands, conventions, domain glossary, and non-obvious decisions. |

## The Workflow

These pieces compose into a deliberate design pipeline:

```
/define-the-problem → first-principles decomposition → fat-marker sketch → detailed design → TDD implementation → verification
```

You can enter at any point — the rules enforce the upstream steps automatically. Start building a feature and Claude will decompose the problem first. Select an approach and Claude will sketch before designing. Write code and Claude will verify before declaring done.

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

## Structure

```
global/CLAUDE.md                # Global config → ~/.claude/CLAUDE.md
rules/                          # Always-on behavioral rules
  planning.md
  fat-marker-sketch.md
  tdd-pragmatic.md
  verification.md
skills/                         # On-demand slash commands
  adr/SKILL.md
  cross-project/SKILL.md
  define-the-problem/SKILL.md
  fat-marker-sketch/SKILL.md
  new-project/SKILL.md
  tech-radar/SKILL.md
  tenet-exception/SKILL.md
agents/                         # Specialized reviewers
  platform-reviewer.md
templates/                      # Copy into repos as needed
  PROJECT-CLAUDE-MD.md
install.sh                      # Symlink installer (bash/zsh)
install.fish                    # Symlink installer (fish)
```

## References

- [Claude Code docs](https://docs.anthropic.com/en/docs/claude-code) — official documentation
- [awesome-claude-md](https://github.com/josix/awesome-claude-md) — curated CLAUDE.md examples
- [HumanLayer: Writing a Good CLAUDE.md](https://www.humanlayer.dev/blog/writing-a-good-claude-md) — WHY/WHAT/HOW framework
- [Fat Marker Sketches](https://domhabersack.com/blog/fat-marker-sketches) — the concept behind the sketch rule
