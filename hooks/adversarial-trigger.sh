#!/bin/bash
# adversarial-trigger.sh — PostToolUse hook
# Fires on Write/Edit/MultiEdit. Threshold-gates an adversarial critique spawn.
# Disable: ~/.claude/DISABLE_ADVERSARIAL or .claude/DISABLE_ADVERSARIAL
set -u

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
[[ -z "$REPO_ROOT" ]] && exit 0
cd "$REPO_ROOT" || exit 0

# ── Sentinel bypass ──────────────────────────────────────────────────────────
if [[ -f "${HOME}/.claude/DISABLE_ADVERSARIAL" ]] \
  || [[ -f ".claude/DISABLE_ADVERSARIAL" ]]; then exit 0; fi

CONFIG="hooks/adversarial-config.json"
[[ ! -f "$CONFIG" ]] && exit 0

# ── Load thresholds ──────────────────────────────────────────────────────────
LOC_THRESHOLD=$(jq -r '.loc_threshold' "$CONFIG")
FILE_THRESHOLD=$(jq -r '.file_threshold' "$CONFIG")
DEBOUNCE=$(jq -r '.debounce_seconds' "$CONFIG")
HARD_GATE_PATTERN=$(jq -r '.hard_gate_paths | join("|")' "$CONFIG")

# ── Compute diff stats ───────────────────────────────────────────────────────
LOC_DELTA=$(git diff HEAD --numstat 2>/dev/null | awk '{sum += ($1 == "-" ? 0 : $1) + ($2 == "-" ? 0 : $2)} END {print sum+0}')
FILE_COUNT=$(git diff HEAD --name-only 2>/dev/null | wc -l | tr -d ' ')
PATH_HIT=""
if [[ -n "$HARD_GATE_PATTERN" ]]; then
  PATH_HIT=$(git diff HEAD --name-only 2>/dev/null | grep -E "$HARD_GATE_PATTERN" | head -1)
fi

# ── Threshold check ──────────────────────────────────────────────────────────
FIRE=0
REASON=""
if [[ "$LOC_DELTA" -ge "$LOC_THRESHOLD" ]]; then
  FIRE=1; REASON="loc=$LOC_DELTA"
elif [[ "$FILE_COUNT" -ge "$FILE_THRESHOLD" ]]; then
  FIRE=1; REASON="files=$FILE_COUNT"
elif [[ -n "$PATH_HIT" ]]; then
  FIRE=1; REASON="path=$PATH_HIT"
fi

[[ "$FIRE" -eq 0 ]] && exit 0

# ── Debounce by diff hash ────────────────────────────────────────────────────
mkdir -p .claude/state/critiques
DIFF_HASH=$(git diff HEAD 2>/dev/null | shasum -a 256 | awk '{print substr($1,1,16)}')
LAST_HASH_FILE=".claude/state/critiques/.last-hash"
LAST_TS_FILE=".claude/state/critiques/.last-ts"
NOW=$(date +%s)
if [[ -f "$LAST_HASH_FILE" && -f "$LAST_TS_FILE" ]]; then
  LAST_HASH=$(cat "$LAST_HASH_FILE" 2>/dev/null)
  LAST_TS=$(cat "$LAST_TS_FILE" 2>/dev/null)
  if [[ "$DIFF_HASH" == "$LAST_HASH" ]] || (( NOW - LAST_TS < DEBOUNCE )); then
    exit 0
  fi
fi
echo "$DIFF_HASH" > "$LAST_HASH_FILE"
echo "$NOW" > "$LAST_TS_FILE"

# ── Spawn ────────────────────────────────────────────────────────────────────
SPAWN_SCRIPT="hooks/adversarial-spawn.sh"
if [[ -x "$SPAWN_SCRIPT" ]]; then
  "$SPAWN_SCRIPT" "$DIFF_HASH" "$REASON" &
  disown
fi

exit 0
