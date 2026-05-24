#!/bin/bash
# adversarial-status.sh — emit pending-critique count for status line
# Usage: append to your status line script, e.g.
#   echo "...other status... $(bash $REPO/hooks/adversarial-status.sh)"
set -u

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
[[ -z "$REPO_ROOT" ]] && exit 0

DIR="$REPO_ROOT/.claude/state/critiques"
[[ ! -d "$DIR" ]] && exit 0

COUNT=$(find "$DIR" -maxdepth 1 -name '*.md' -not -name '.*' -type f 2>/dev/null | wc -l | tr -d ' ')
[[ "$COUNT" -eq 0 ]] && exit 0

echo "[${COUNT} critique$([[ $COUNT -ne 1 ]] && echo s) pending]"
