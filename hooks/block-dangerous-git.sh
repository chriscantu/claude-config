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
# Disable: create ~/.claude/DISABLE_GIT_GUARDRAILS or
# .claude/DISABLE_GIT_GUARDRAILS in the project root. File existence
# alone disables; content ignored. Delete the file to restore.
#
# Dependencies: bash, jq, grep.

set -u
set -o pipefail

# Shared dependency-preflight helpers. Sourced, not executed — resolves beside
# this hook regardless of install location (plugin root or repo checkout).
# shellcheck source=/dev/null
source "$(dirname "${BASH_SOURCE[0]}")/lib/preflight.sh"

if [[ -f "${HOME}/.claude/DISABLE_GIT_GUARDRAILS" ]] \
  || [[ -f ".claude/DISABLE_GIT_GUARDRAILS" ]]; then
  exit 0
fi

INPUT=$(cat)

# A SECURITY guardrail must fail safe, not silent. With jq we parse the command
# out of the tool_input JSON; without jq we cannot parse, but exiting 0 would
# let every dangerous command through unseen. Instead warn loudly and scan the
# RAW payload — the command string is a substring of INPUT, so the patterns
# below still match (a wider net, acceptable for a degraded security posture).
if require_cmd jq; then
  COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
else
  warn_degraded block-dangerous-git "jq not on PATH — scanning raw payload (degraded, fail-safe)"
  COMMAND="$INPUT"
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
