# Rules — Install Contract

Files in this directory are loaded into Claude Code's session context as
"user's private global instructions for all projects" — but **only if a
symlink for them exists at `~/.claude/rules/<name>.md`**. The harness does
NOT auto-scan this directory; it walks `~/.claude/rules/`.

This is the same pattern used for `agents/` (loaded from `~/.claude/agents/`)
and `commands/` (loaded from `~/.claude/commands/`).

## Adding a new rule

1. Create `rules/<your-rule>.md` in this repo with the required frontmatter
   (see existing rules for the pattern: `description:`, optionally `globs:`).
2. Run the install script:

   ```
   ./bin/link-config.fish
   ```

   It is idempotent and safe to re-run. It will only create new symlinks;
   it will never overwrite a real file at the destination.
3. **Open a fresh Claude Code session** to load the new rule. Existing
   sessions will not pick it up — rules load at session start.
4. Verify the rule loaded by asking the new session:

   > List every rule file currently in your loaded system instructions.
   > Quote the first sentence of each. Do not Read from disk.

   Your new file should appear in the list.

## Verifying the install (CI-friendly)

```
./bin/link-config.fish --check
```

Exits non-zero if any file in `rules/`, `agents/`, or `commands/` is missing
its symlink, or if a stale symlink points to the wrong target. Use this in
pre-push hooks or CI to catch the silent-failure mode that motivated this
contract.

## Why the silent-failure mode matters

A HARD-GATE rule that isn't loaded is worse than no rule at all — it
provides false confidence that the discipline is in place when it isn't.
PR #121 discovered this live: two new HARD-GATE rules shipped without
symlinks and were silently no-op'd in fresh sessions until the symlinks
were added manually. The script and this README close the gap.

## What lives here

| File | Type | Purpose |
|---|---|---|
| `planning.md` | HARD-GATE | DTP / Systems Analysis / Solution Design pipeline; pressure-framing floor; named-cost skip emission contract |
| `fat-marker-sketch.md` | HARD-GATE | Mandatory shape sketch after approach selection, before detailed design |
| `think-before-coding.md` | HARD-GATE | Three-part preamble (Assumptions / Interpretations / Simpler-Path) at Solution Design |
| `goal-driven.md` | HARD-GATE | Per-step verify checks defined before code, loop-until-verified semantics |
| `tdd-pragmatic.md` | Soft | Test-first for non-trivial logic; bug-repro test before fix |
| `verification.md` | Soft | End-of-work gate: tests run, type-check runs, no "should work" |
| `execution-mode.md` | HARD-GATE | Sizing guard for subagent-driven-development; controller announces mode before first dispatch |

The `bin/link-config.fish` script will skip `README.md` files automatically.
