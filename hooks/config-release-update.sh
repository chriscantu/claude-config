#!/bin/bash
# config-release-update.sh — SessionStart hook that keeps the release copy current.
#
# ~/.claude links into a release copy of claude-config (a detached checkout of
# origin/main at $CLAUDE_CONFIG_RELEASE_DIR, default ~/.claude-config-release).
# This hook fast-forwards that copy. Claude Code reads rules BEFORE SessionStart
# hooks run, so an update only helps the NEXT session; that is why the worker is
# detached and the hook never waits on the network.
#
# Writes one "session" record to the log, starts the worker, prints nothing
# (stdout would be added to the session context), and always exits 0.
#
# Kill switch: a file named DISABLE_CONFIG_RELEASE_UPDATE under ~/.claude/ or
# <project>/.claude/.
# Test seams (env): CONFIG_RELEASE_SYNC=1 runs the worker in the foreground;
# CONFIG_RELEASE_WORKER=<cmd> replaces the worker; CONFIG_RELEASE_LOG=<file>
# replaces the log path.
set -u

# Resolve the symlink: the worker lives in lib/ next to the real file only.
HOOK_DIR="$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")"

# shellcheck source=/dev/null
source "$HOOK_DIR/lib/hook-runtime.sh"

LOG_FILE="${CONFIG_RELEASE_LOG:-${HOME}/.claude/logs/config-release.jsonl}"

# release_dir → the release copy path; mirrors release_source_root in bin/lib/symlinks.fish.
release_dir() {
  printf '%s' "${CLAUDE_CONFIG_RELEASE_DIR:-$HOME/.claude-config-release}"
}

# log_session SESSION LOADED RESULT → append the session record.
log_session() {
  local line
  line=$(jq -n -c --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" --arg s "$1" --arg l "$2" --arg r "$3" \
    '{ts:$ts,event:"session",session_id:$s,loaded:(if $l == "" then null else $l end),result:$r}' \
    2>/dev/null) || return 0
  hook_log_jsonl "$LOG_FILE" "$line"
}

# start_worker RELEASE → run the update detached, or in the foreground for tests.
start_worker() {
  local release="$1" cmd
  if [[ -n "${CONFIG_RELEASE_WORKER:-}" ]]; then
    cmd=(bash -c "$CONFIG_RELEASE_WORKER" worker "$release" "$LOG_FILE")
  else
    cmd=(bash "$HOOK_DIR/lib/config-release-worker.sh" "$release" "$LOG_FILE")
  fi
  if [[ "${CONFIG_RELEASE_SYNC:-}" == 1 ]]; then
    "${cmd[@]}"
    return 0
  fi
  # nohup + closed fds + & so the hook exits without waiting on git.
  nohup "${cmd[@]}" >/dev/null 2>&1 </dev/null &
}

main() {
  hook_disabled DISABLE_CONFIG_RELEASE_UPDATE && exit 0
  require_cmd jq || exit 0

  local release session loaded=""
  hook_read_input
  session=$(hook_input_field '.session_id')
  release=$(release_dir)

  if [[ ! -e "$release/.git" ]]; then
    log_session "$session" "" "skipped:no-release"
    exit 0
  fi

  loaded=$(git -C "$release" rev-parse HEAD 2>/dev/null || true)
  log_session "$session" "$loaded" "started"
  start_worker "$release"
  exit 0
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main
fi
