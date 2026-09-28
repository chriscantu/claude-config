#!/bin/bash
# hook-runtime.sh — the shared hook prelude (sourced, never executed).
#
# Every hook needs the same four things before it does its own job: find its
# libraries, honor its kill switch, read the event JSON on stdin, and append to
# a size-capped JSONL log. Each hook used to carry its own copy, and the copies
# drifted: only one honored CLAUDE_PROJECT_DIR, and two could not find lib/ at
# all when run through the ~/.claude/hooks/ symlink. One copy here keeps them
# in step.
#
# Usage (source, do not exec). The hook resolves its OWN real directory first:
# link-config installs hooks/*.sh as symlinks in ~/.claude/hooks/ with no lib/
# beside them, so a path built from the unresolved BASH_SOURCE points nowhere.
#   HOOK_DIR="$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")"
#   # shellcheck source=/dev/null
#   source "$HOOK_DIR/lib/hook-runtime.sh"
#
# No `set -u`/`set -o pipefail` here: a sourced file must not mutate the
# caller's shell options. Each hook owns its own strict-mode.

# Sourcing pulls in require_cmd / warn_degraded, so a hook needs one line only.
# The hook already sourced this file by its real path, so plain dirname is safe.
# shellcheck source=/dev/null
source "$(dirname "${BASH_SOURCE[0]}")/preflight.sh"

# hook_disabled SWITCH → 0 when a sentinel file named SWITCH exists, else 1.
# File existence alone disables; content is ignored. Looked for in:
#   1. $HOOK_SENTINEL_DIR/SWITCH — when set, the ONLY place checked, so tests
#      stay hermetic even if the machine has a real ~/.claude sentinel.
#   2. $CLAUDE_PROJECT_DIR/.claude/SWITCH — the project the CLI opened, which
#      can differ from the hook's working directory.
#   3. $PWD/.claude/SWITCH — the project-local location hooks honored first.
#   4. $HOME/.claude/SWITCH — the global off-switch.
hook_disabled() {
  local name="$1" base
  if [[ -n "${HOOK_SENTINEL_DIR:-}" ]]; then
    [[ -f "$HOOK_SENTINEL_DIR/$name" ]]
    return
  fi
  for base in "${CLAUDE_PROJECT_DIR:-}" "$PWD" "$HOME"; do
    if [[ -n "$base" && -f "$base/.claude/$name" ]]; then
      return 0
    fi
  done
  return 1
}

# hook_read_input → capture the whole event payload from stdin into HOOK_INPUT.
# Returns 1 when stdin is empty. Stdin can only be read once, so every field
# lookup goes through the captured copy. Call it in the hook's own shell, not
# in $(...), or HOOK_INPUT is lost with the subshell.
hook_read_input() {
  HOOK_INPUT=$(cat 2>/dev/null || true)
  [[ -n "$HOOK_INPUT" ]]
}

# hook_input_field FILTER → jq FILTER over HOOK_INPUT. Strings print raw,
# objects print as compact JSON, and a missing field or a payload that is not
# JSON prints nothing. A hook must never crash on a malformed event, so a jq
# error is swallowed here and the caller just sees "". Requires jq.
hook_input_field() {
  printf '%s' "${HOOK_INPUT:-}" | jq -rc "($1) // empty" 2>/dev/null || true
}

# The live log is capped at 10 MB. On overflow its newest 5 MB move to FILE.1
# and the live log restarts, so disk use stays bounded near 15 MB per log.
HOOK_LOG_MAX_BYTES=$((10*1024*1024))
HOOK_LOG_KEEP_BYTES=$((5*1024*1024))

# hook_log_jsonl FILE LINE → append LINE to FILE, rotating first if FILE is
# over the cap. Creates the log dir on first write, so a disabled or sourced
# hook touches nothing. Logging is best-effort: a write failure never fails
# the hook.
hook_log_jsonl() {
  local file="$1" line="$2" size
  mkdir -p "$(dirname "$file")" 2>/dev/null || return 0
  if [[ -f "$file" ]]; then
    # wc -c, not stat: stat's size flag differs between BSD (-f%z) and GNU (-c%s).
    size=$(wc -c < "$file" 2>/dev/null | tr -d ' ')
    if [[ "${size:-0}" -gt "$HOOK_LOG_MAX_BYTES" ]]; then
      tail -c "$HOOK_LOG_KEEP_BYTES" "$file" > "$file.1" 2>/dev/null || true
      : > "$file"
    fi
  fi
  printf '%s\n' "$line" >> "$file" 2>/dev/null || true
}
