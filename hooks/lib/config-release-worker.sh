#!/bin/bash
# config-release-worker.sh RELEASE_DIR LOG_FILE — the update itself, run detached
# by hooks/config-release-update.sh. Appends one "update" record to LOG_FILE.
#
# Only ever fast-forwards the release copy. It never resets, stashes or deletes
# anything there: a dirty or diverged copy is left alone and logged.
# Test seam: CONFIG_RELEASE_LINK_CMD=<cmd> replaces the link-config call.
# Always exits 0.
set -u

HOOK_LIB="$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")"
# shellcheck source=/dev/null
source "$HOOK_LIB/hook-runtime.sh"

REL="${1:-}"
LOG="${2:-}"
FETCH_TIMEOUT=30
STALE_LOCK_MINUTES=10
# Paths whose added/deleted/renamed files change what link-config would link.
LINKED_PATHS=(rules agents commands skills .claude/skills hooks global)
# The link layout itself; any change to it can change what gets linked.
LAYOUT_FILE=bin/lib/symlinks.fish

[[ -n "$REL" && -n "$LOG" && -d "$REL" ]] || exit 0
require_cmd jq || exit 0

FROM=$(git -C "$REL" rev-parse HEAD 2>/dev/null || true)
TO="$FROM"

# log_update RESULT → append the update record and exit.
log_update() {
  local line
  line=$(jq -n -c --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" --arg f "$FROM" --arg t "$TO" --arg r "$1" \
    '{ts:$ts,event:"update",from:$f,to:$t,result:$r}' 2>/dev/null) || exit 0
  hook_log_jsonl "$LOG" "$line"
  exit 0
}

# fetch_origin → git fetch that gives up after FETCH_TIMEOUT seconds. macOS has no
# timeout(1), so a watchdog kills a hung fetch; the low-speed and ssh options make
# a stalled connection fail on its own first.
fetch_origin() {
  local pid watchdog rc
  GIT_TERMINAL_PROMPT=0 GIT_SSH_COMMAND="ssh -o BatchMode=yes -o ConnectTimeout=20" \
    git -C "$REL" -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=20 \
    fetch -q origin main >/dev/null 2>&1 &
  pid=$!
  ( sleep "$FETCH_TIMEOUT"; kill "$pid" 2>/dev/null ) >/dev/null 2>&1 &
  watchdog=$!
  wait "$pid"
  rc=$?
  kill "$watchdog" 2>/dev/null
  wait "$watchdog" 2>/dev/null
  return "$rc"
}

# relink_needed → 0 when files were added, deleted or renamed under a linked
# path, or when LAYOUT_FILE changed at all (it defines what gets linked).
relink_needed() {
  if [[ -n "$(git -C "$REL" diff --name-only --diff-filter=ADR "$FROM" "$TO" -- "${LINKED_PATHS[@]}" 2>/dev/null)" ]]; then
    return 0
  fi
  [[ -n "$(git -C "$REL" diff --name-only "$FROM" "$TO" -- "$LAYOUT_FILE" 2>/dev/null)" ]]
}

# run_relink → run link-config; print its combined output. Returns its exit code.
run_relink() {
  if [[ -n "${CONFIG_RELEASE_LINK_CMD:-}" ]]; then
    bash -c "$CONFIG_RELEASE_LINK_CMD" 2>&1
  else
    fish "$REL/bin/link-config.fish" 2>&1
  fi
}

GIT_DIR_ABS=$(git -C "$REL" rev-parse --absolute-git-dir 2>/dev/null) || log_update skipped:broken-git
LOCK="$GIT_DIR_ABS/config-release-update.lock"

# A crashed worker leaves its lock behind; after STALE_LOCK_MINUTES it is stale.
if [[ -n "$(find "$LOCK" -maxdepth 0 -mmin "+$STALE_LOCK_MINUTES" 2>/dev/null)" ]]; then
  rmdir "$LOCK" 2>/dev/null || true
fi
mkdir "$LOCK" 2>/dev/null || log_update skipped:locked
trap 'rmdir "$LOCK" 2>/dev/null' EXIT

[[ -z "$(git -C "$REL" status --porcelain 2>/dev/null)" ]] || log_update skipped:dirty
fetch_origin || log_update fetch-failed

TARGET=$(git -C "$REL" rev-parse origin/main 2>/dev/null) || log_update fetch-failed
[[ "$TARGET" != "$FROM" ]] || log_update unchanged
git -C "$REL" merge-base --is-ancestor HEAD origin/main 2>/dev/null || log_update skipped:not-fast-forward
git -C "$REL" checkout -q --detach "$TARGET" 2>/dev/null || log_update checkout-failed
TO="$TARGET"

relink_needed || log_update updated

# Scan the output before judging the exit code: a failed link-config can still
# have printed the registration warning, and that must not be lost.
RESULT=updated+relinked
LINK_OUT=$(run_relink) || RESULT=relink-failed
if [[ "$LINK_OUT" == *"hooks/rules-shadow.sh is not registered"* ]]; then
  RESULT+="+needs-registration"
fi
log_update "$RESULT"
