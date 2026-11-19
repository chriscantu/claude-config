#!/bin/bash
# block-secret-reads.sh
#
# PreToolUse hook for the Bash tool. Blocks shell commands that name a secret
# file: .env files, ~/.ssh, and credentials/ directories. Exits 2, which
# Claude Code reports back to the model as a refusal.
#
# Why a hook: a Read(./.env) deny rule only covers Claude's built-in file
# tools. With the sandbox off, `cat .env` in Bash would still work. With the
# sandbox on, the deny rules also block the read at the OS level, so this hook
# is the layer that still holds when the sandbox is off or unavailable.
#
# Best effort only: it matches the command text, so a path built at runtime
# (for example "$(echo .e)nv") slips past. The sandbox is the strong layer.
#
# Disable: create DISABLE_SECRET_GUARD in ~/.claude/, in
# $CLAUDE_PROJECT_DIR/.claude/, or in .claude/ under the working directory
# (see hook_disabled in lib/hook-runtime.sh). Delete the file to restore.
#
# Dependencies: bash, jq, grep.

set -u
set -o pipefail

# link-config installs this file as a symlink with no lib/ beside it, so
# resolve the link to find the shared runtime.
HOOK_DIR="$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")"
# Fail safe: exit 1 would read as "allow", so block if the runtime is gone.
# shellcheck source=/dev/null
if ! source "$HOOK_DIR/lib/hook-runtime.sh"; then
  echo "BLOCKED: hook runtime missing at $HOOK_DIR/lib; refusing all commands until it is restored (fail-safe)." >&2
  exit 2
fi

if hook_disabled DISABLE_SECRET_GUARD; then
  exit 0
fi

hook_read_input

# Without jq, scan the raw payload: the command is a substring of it, so the
# patterns still match. Skipping the scan would let every read through.
if require_cmd jq; then
  COMMAND=$(hook_input_field '.tool_input.command')
else
  warn_degraded block-secret-reads "jq not on PATH — scanning raw payload (degraded, fail-safe)"
  COMMAND="$HOOK_INPUT"
fi

if [[ -z "$COMMAND" ]]; then
  exit 0
fi

# A path segment starts after a space, quote, slash, =, <, or the line start.
START="(^|[[:space:]'\"/=<])"
SECRET_PATTERNS=(
  # .env, .env.local, .env.production, ...
  "${START}\\.env(\\.[A-Za-z0-9_-]+)?([[:space:]'\";|&>)]|$)"
  # ~/.ssh, $HOME/.ssh, ${HOME}/.ssh, /Users/me/.ssh
  "(~|HOME\\}?|/)/?\\.ssh(/|[[:space:]'\";|&>)]|$)"
  # credentials/ directory at any depth
  "${START}credentials/"
)

for pattern in "${SECRET_PATTERNS[@]}"; do
  if echo "$COMMAND" | grep -qE -- "$pattern"; then
    echo "BLOCKED: '$COMMAND' reads a secret file (.env, ~/.ssh, or credentials/)." >&2
    echo "Secrets stay out of the session. If you need a value from one, ask the user to provide it." >&2
    echo "To turn this guard off, the user can create ~/.claude/DISABLE_SECRET_GUARD." >&2
    exit 2
  fi
done

exit 0
