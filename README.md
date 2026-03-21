# claude-config

Personal Claude Code configuration — global settings, rules, and templates.

## Structure

```
global/CLAUDE.md          # Global config → symlinked to ~/.claude/CLAUDE.md
rules/planning.md         # Strategic planning mode (first principles, systems thinking)
rules/verification.md     # Enforce test/typecheck before claiming done
rules/tdd-pragmatic.md    # Pragmatic TDD for TypeScript
templates/
  PROJECT-CLAUDE-MD.md    # Drop-in template for per-repo CLAUDE.md files
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
- **`rules/*.md`** load conditionally based on file glob patterns. For example, `planning.md` activates when editing `PLAN.md` or `ARCHITECTURE.md` files.
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
