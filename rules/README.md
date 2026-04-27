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
fish validate.fish
```

`link-config.fish --check` exits non-zero if any file in `rules/`,
`agents/`, or `commands/` is missing its symlink, or if a stale symlink
points to the wrong target.

`validate.fish` (top-level) is the consolidated structural + concept
validator. Phases relevant to rules:

- **1f. Rules anchor labels** — fails if `rules/planning.md` loses one
  of the labeled blocks that other rules delegate to (Skip contract,
  Pressure-framing floor, Emission contract, Architectural invariant,
  Emergency bypass — sentinel file check), or if a dependent rule
  (`fat-marker-sketch.md`, `goal-driven.md`, `think-before-coding.md`,
  `execution-mode.md`) loses its reference to `planning.md`. Catches
  silent breakage when the anchor file is renamed or its sections
  restructured (issue #135).
- **1g. Canonical-string drift** — fails if a canonical rule string
  (e.g. the [Trivial/Mechanical tier criteria](planning.md#trivial-tier-criteria),
  defined in `planning.md`) is restated outside its canonical home.
  "Do not restate" markers in non-canonical files are editor hints;
  this phase is the enforcement.
- **1j. Stable anchor presence** — fails if `planning.md` loses an
  explicit `<a id="…">` anchor that dependent rules deep-link to.
  Currently guards `#trivial-tier-criteria`, `#skip-contract`,
  `#emission-contract`, `#pressure-framing-floor`,
  `#architectural-invariant`, and `#emergency-bypass-sentinel`; add
  to the registry when promoting another rule construct to a citable
  anchor.

Use these in pre-push hooks or CI to catch the silent-failure modes
(rule not loaded; rule restated and drifted; anchor structurally broken;
stable deep-link target removed).

## Stable anchor pattern

When a rule construct (criteria block, decision table, definition list)
is referenced from other rules, promote it to a citable anchor:

1. Place an explicit `<a id="kebab-name"></a>` line directly above the
   heading. Auto-generated GitHub heading IDs are fragile — punctuation,
   em dashes, and renames silently break links.
2. Dependent rules deep-link via
   `[Display Text](planning.md#kebab-name)`.
3. Add the anchor ID to `validate.fish` Phase 1j's registry so future
   removal fails CI.

The anchor is the contract; the heading is presentation. Treat the
anchor ID as load-bearing — never rename without updating every
dependent.

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
