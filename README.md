# claude-config

*Claude Code, configured as your strategic engineering thought partner.*

**The problem:** Claude Code is powerful out of the box, but without guardrails it skips straight to implementation. It doesn't decompose problems, doesn't consider trade-offs, doesn't verify its work, and doesn't think about organizational impact. You end up with code that compiles but misses the point.

**What this gives you:** A set of rules, skills, and agents that enforce a deliberate workflow — from problem definition through design sketching to verified implementation. Claude still does the work; it just thinks before it acts.

## Install

**Requires [fish shell](https://fishshell.com/)** (`brew install fish` on macOS, `apt install fish` on Debian). The bash entrypoint bootstraps fish for you.

```sh
git clone https://github.com/chriscantu/claude-config.git ~/repos/claude-config
cd ~/repos/claude-config

# bash/zsh
bash install.sh

# fish
fish install.fish
```

Both entrypoints delegate to `bin/link-config.fish --install`, the single source of truth for symlink behavior. Existing real files are backed up with a `.bak` extension. Re-running is safe — symlinks are replaced, not duplicated.

To re-sync after adding/removing rules, skills, agents, commands, or hooks **without** backing up real files (refuses on conflict instead): run `fish bin/link-config.fish`. CI uses `fish bin/link-config.fish --check` for read-only verification.

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

> **What this is not:** This isn't a replacement for engineering judgment — it's a forcing function. Claude still gets things wrong. The config makes it wrong less often, and in more visible ways.

## Documentation

- **[docs/catalog.md](docs/catalog.md)** — full inventory of rules, skills, agents, templates, and the workflow diagram
- **[docs/operations.md](docs/operations.md)** — runtime bypass flags and the git-guardrails hook
- **[docs/contributing.md](docs/contributing.md)** — add your own rules, skills, or agents

## References

- [Claude Code docs](https://docs.anthropic.com/en/docs/claude-code) — official documentation
- [awesome-claude-md](https://github.com/josix/awesome-claude-md) — curated CLAUDE.md examples
- [HumanLayer: Writing a Good CLAUDE.md](https://www.humanlayer.dev/blog/writing-a-good-claude-md) — WHY/WHAT/HOW framework
- [Fat Marker Sketches](https://domhabersack.com/blog/fat-marker-sketches) — the concept behind the sketch rule
