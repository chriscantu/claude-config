# claude-config

Personal Claude Code configuration — global settings, rules, and templates.

## Structure

```
global/CLAUDE.md              # Global config → symlinked to ~/.claude/CLAUDE.md
rules/
  planning.md                 # Strategic planning mode (first principles, systems thinking)
  verification.md             # Enforce test/typecheck before claiming done
  tdd-pragmatic.md            # Pragmatic TDD for TypeScript
  fat-marker-sketch.md        # Require fat marker sketch before detailed design
skills/
  adr/SKILL.md                # /adr — Create and manage architectural decision records
  new-project/SKILL.md        # /new-project — Scaffold repos with CLAUDE.md and test setup
  cross-project/SKILL.md      # /cross-project — Analyze cross-repo impact of changes
  tech-radar/SKILL.md         # /tech-radar — Manage technology radar entries (assess/trial/adopt/hold)
  tenet-exception/SKILL.md    # /tenet-exception — Create engineering tenet exception requests
  define-the-problem/SKILL.md # define-the-problem — Ensure features start with a clear user problem
agents/
  platform-reviewer.md        # Platform engineering code reviewer (API stability, ops impact)
templates/
  PROJECT-CLAUDE-MD.md        # Drop-in template for per-repo CLAUDE.md files
```

## Install

```fish
git clone <this-repo> ~/repos/claude-config
cd ~/repos/claude-config
fish install.fish
```

The install script symlinks config files into `~/.claude/`. Existing files are backed up with `.bak` extension. Re-running is safe.

## How It Works

- **`global/CLAUDE.md`** loads in every Claude Code session — personal preferences, shell environment, git conventions, communication style.
- **`rules/*.md`** are loaded as global user rules in every Claude Code session. Rules can optionally include frontmatter with `globs:` patterns to restrict when they activate.
- **`skills/`** are custom skills (`/adr`, `/new-project`, `/cross-project`, `/tech-radar`, `/tenet-exception`, `define-the-problem`) symlinked into `~/.claude/skills/`.
- **`agents/`** are specialized reviewers (e.g., platform engineering review) symlinked into `~/.claude/agents/`.
- **`templates/`** are not symlinked — copy them into repos as needed.

## Adding New Rules

Create a new `.md` file in `rules/` with frontmatter:

```yaml
---
description: When this rule should activate
globs:
  - "**/*.pattern"
---
```

Then re-run `fish install.fish` to symlink it.

## References

- [awesome-claude-md](https://github.com/josix/awesome-claude-md) — curated CLAUDE.md examples
- [HumanLayer: Writing a Good CLAUDE.md](https://www.humanlayer.dev/blog/writing-a-good-claude-md) — WHY/WHAT/HOW framework
- [SFEIR Institute: Optimization Guide](https://institute.sfeir.com/en/claude-code/claude-code-memory-system-claude-md/optimization/)
