# Operations

Runtime controls for the safety rails this config installs. For the catalog of what those rails are, see [catalog.md](catalog.md).

## Runtime Bypass Flags

The `planning` rule enforces a **pressure-framing floor**: when Claude detects deadline pressure, authority invocations, or fatigue framings (*"ship by Friday"*, *"my VP approved this"*, *"I'm tired — just give me code"*), it routes to `/define-the-problem` rather than honoring a skip request. These are exactly the moments the planning pipeline is most valuable.

If the floor misfires for your workflow — for example, you're running a demo, or the rule is catching a framing it shouldn't — you can disable it at runtime with a sentinel file.

> **Bug vs. bypass.** If the misfire is reproducible and not specific to your local workflow (same prompt routes to DTP across fresh sessions), that's a bug — file an issue with a reproduction rather than leaving the bypass on. The bypass is a runtime rollback, not a silent alternative to fixing the rule.

### Disabling the pressure-framing floor

Create an empty file at either location (project-scoped is checked first):

```sh
# Project-scoped
touch .claude/DISABLE_PRESSURE_FLOOR

# Or global
touch ~/.claude/DISABLE_PRESSURE_FLOOR
```

File existence alone triggers the bypass — content is ignored.

On the first pressure-framed prompt after the bypass takes effect, Claude prints a visible banner identifying the bypass and the restore command. The banner is intentional — the bypass is never silent. Exact banner wording is defined in [`rules/planning.md`](../rules/planning.md) under the emergency-bypass block; if you need to match on it programmatically, read the rule file rather than copy-pasting from here.

**Restoring the floor:**

```sh
rm ~/.claude/DISABLE_PRESSURE_FLOOR      # or .claude/DISABLE_PRESSURE_FLOOR
```

**Verifying current state:**

```sh
ls ~/.claude/DISABLE_PRESSURE_FLOOR .claude/DISABLE_PRESSURE_FLOOR 2>/dev/null
```

No output means no sentinel file exists and the floor is active. One or two path lines means the bypass is on.

### What the bypass does NOT affect

- **Named-cost skips** still work exactly as before. Phrasings like *"skip DTP, I accept the risk of building on an unstated problem"* continue to honor the skip regardless of bypass state.
- **Non-pressure-framed prompts** are unaffected. The floor only fires on pressure framings; routine work routes normally.
- **Other planning stages** (systems-analysis, sketch, brainstorming) are unchanged.

### Caveat

Leaving the flag on permanently defeats the floor entirely — you lose the guardrail against Claude honoring a premature skip under pressure. Prefer fixing the underlying regression (open an issue with a reproduction) over making the bypass permanent.

## Git Guardrails Hook (opt-in)

A `PreToolUse` hook at [`hooks/block-dangerous-git.sh`](../hooks/block-dangerous-git.sh) blocks destructive git operations at the harness layer — not by asking Claude nicely, but by exiting with code 2 before the command runs. Adapted from [mattpocock/skills `git-guardrails-claude-code`](https://github.com/mattpocock/skills/tree/main/git-guardrails-claude-code) with a narrower blocklist that targets actually-destructive operations and `CLAUDE.md`-forbidden flags, leaving normal `git push` / `git commit` alone.

### What gets blocked

| Pattern | Why |
|---|---|
| `git push --force` / `-f` / `--force-with-lease` to `main`/`master` | Force-pushing the trunk overwrites shared history. |
| `git commit --no-verify`, `git rebase --no-verify`, `git push --no-verify` | Skipping pre-commit / pre-push hooks bypasses safety checks. |
| `--no-gpg-sign` | Bypasses commit signing where required. |
| `git reset --hard` | Discards uncommitted work irreversibly. |
| `git clean -f` / `git clean -fd` | Deletes untracked files. |
| `git branch -D` | Force-deletes a branch (vs `-d` which only deletes if merged). |
| `git checkout .` / `git restore .` | Wipes uncommitted changes wholesale. |

Force-pushing to a feature branch is **allowed**. Routine `git push` and `git commit` are **allowed**.

### Install

The hook script is symlinked into `~/.claude/hooks/block-dangerous-git.sh` automatically by `bin/link-config.fish`. Wire it into the harness by adding this to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "~/.claude/hooks/block-dangerous-git.sh" }
        ]
      }
    ]
  }
}
```

If `hooks.PreToolUse` already exists, **merge** into the existing array rather than replacing.

### Verify

```sh
bash hooks/test-block-dangerous-git.sh   # smoke tests against the script
echo '{"tool_input":{"command":"git push --force origin main"}}' \
  | ~/.claude/hooks/block-dangerous-git.sh   # should exit 2 with BLOCKED message
```

### Disable

Create an empty sentinel file (mirrors the `DISABLE_PRESSURE_FLOOR` pattern):

```sh
touch ~/.claude/DISABLE_GIT_GUARDRAILS    # global
touch .claude/DISABLE_GIT_GUARDRAILS      # project-scoped (checked first)
```

Delete the file to restore. Existence alone disables; content ignored.

### Customizing the blocklist

Edit `hooks/block-dangerous-git.sh` and adjust `DANGEROUS_PATTERNS`. Patterns are extended-regex (`grep -E`). Re-run `bash hooks/test-block-dangerous-git.sh` after editing to confirm fixtures still pass.

## Scope-Tier Memory Check Hook (opt-in)

A `UserPromptSubmit` hook at [`hooks/scope-tier-memory-check.sh`](../hooks/scope-tier-memory-check.sh) injects scope-tier context into the session before each prompt is processed. It detects verb signals (e.g. "add row to", "update entry in"), minimizers (e.g. "small change"), scope-expanders (e.g. "cross-cutting change", "refactor across"), and blast-radius words (e.g. "public API", "breaking change") to help the planning pipeline calibrate tier selection correctly.

The hook is disabled when `~/.claude/DISABLE_PRESSURE_FLOOR` or `.claude/DISABLE_PRESSURE_FLOOR` is present — same sentinel file as the pressure-framing floor.

Full spec: [`docs/superpowers/specs/2026-05-17-scope-tier-memory-check-design.md`](superpowers/specs/2026-05-17-scope-tier-memory-check-design.md).

### Install

```sh
fish bin/install-scope-tier-hook.fish
```

This adds a `UserPromptSubmit` entry to `~/.claude/settings.json` pointing at the hook. It is idempotent — safe to re-run.

### Verify

```sh
fish bin/install-scope-tier-hook.fish --check
bash tests/hooks/scope-tier-memory-check.test.sh
```

### Remove

```sh
fish bin/install-scope-tier-hook.fish --remove
```
