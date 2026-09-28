#!/bin/bash
# block-dangerous-git.sh
#
# PreToolUse hook that intercepts dangerous git commands invoked via the
# Bash tool and exits 2 (tool-use error surfaced back to the model).
#
# Adapted from https://github.com/mattpocock/skills/tree/main/git-guardrails-claude-code
# with a narrower blocklist that targets actually-destructive operations
# and CLAUDE.md-forbidden flags, leaving normal `git push` / `git commit`
# alone to avoid false-positive avalanche.
#
# Disable: create DISABLE_GIT_GUARDRAILS in ~/.claude/, in
# $CLAUDE_PROJECT_DIR/.claude/, or in .claude/ under the working directory
# (see hook_disabled in lib/hook-runtime.sh). File existence alone disables;
# content ignored. Delete the file to restore.
#
# Dependencies: bash, jq, grep.

set -u
set -o pipefail

# Shared hook prelude (kill switch, stdin, preflight). Resolve the symlink:
# link-config installs this file as ~/.claude/hooks/block-dangerous-git.sh
# with no lib/ beside it, so the libraries live next to the real file only.
HOOK_DIR="$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")"
# A security guardrail must fail safe: if the runtime can't be loaded, block
# rather than crash with exit 1, which Claude Code treats as "allow".
# shellcheck source=/dev/null
if ! source "$HOOK_DIR/lib/hook-runtime.sh"; then
  echo "BLOCKED: hook runtime missing at $HOOK_DIR/lib; refusing all commands until it is restored (fail-safe)." >&2
  exit 2
fi

if hook_disabled DISABLE_GIT_GUARDRAILS; then
  exit 0
fi

hook_read_input

# A SECURITY guardrail must fail safe, not silent. With jq we parse the command
# out of the tool_input JSON; without jq we cannot parse, but exiting 0 would
# let every dangerous command through unseen. Instead warn loudly and scan the
# RAW payload — the command string is a substring of it, so the patterns
# below still match (a wider net, acceptable for a degraded security posture).
if require_cmd jq; then
  COMMAND=$(hook_input_field '.tool_input.command')
else
  warn_degraded block-dangerous-git "jq not on PATH — scanning raw payload (degraded, fail-safe)"
  COMMAND="$HOOK_INPUT"
fi

if [[ -z "$COMMAND" ]]; then
  exit 0
fi

# Patterns are extended-regex (grep -E). Order matters only for which
# pattern is reported; first match wins.
DANGEROUS_PATTERNS=(
  # Force-push to main/master (any variant of --force / -f / --force-with-lease)
  "git +push.* (--force|--force-with-lease|-f)( |$).*(main|master)( |$)"
  "git +push.* (main|master)( |$).*(--force|--force-with-lease|-f)( |$)"
  # Skip pre-commit / pre-push hooks
  "git +commit.* --no-verify"
  "git +rebase.* --no-verify"
  "git +push.* --no-verify"
  # Skip GPG signing
  "--no-gpg-sign"
  # Destructive resets
  "git +reset +--hard"
  # Destructive cleans
  "git +clean +-[a-z]*f"
  # Force-delete branch
  "git +branch +-D"
  # Wholesale checkout/restore that nukes uncommitted work
  "git +checkout +\\."
  "git +restore +\\."
)

for pattern in "${DANGEROUS_PATTERNS[@]}"; do
  if echo "$COMMAND" | grep -qE -- "$pattern"; then
    echo "BLOCKED: '$COMMAND' matches dangerous pattern '$pattern'." >&2
    echo "User has prevented you from running this without explicit approval." >&2
    echo "If the user has explicitly authorized this action, ask them to run it themselves or to disable the guardrail by creating ~/.claude/DISABLE_GIT_GUARDRAILS." >&2
    exit 2
  fi
done

exit 0
