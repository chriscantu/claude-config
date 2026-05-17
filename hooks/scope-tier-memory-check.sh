#!/bin/bash
# scope-tier-memory-check.sh — UserPromptSubmit hook
# Disable: ~/.claude/DISABLE_PRESSURE_FLOOR or .claude/DISABLE_PRESSURE_FLOOR
# Spec: docs/superpowers/specs/2026-05-17-scope-tier-memory-check-design.md
set -u

if [[ -f "${HOME}/.claude/DISABLE_PRESSURE_FLOOR" ]] \
  || [[ -f ".claude/DISABLE_PRESSURE_FLOOR" ]]; then exit 0; fi

INPUT=$(cat 2>/dev/null || true)
[[ -z "$INPUT" ]] && exit 0

PROMPT=$(echo "$INPUT" | jq -r '.prompt // empty' 2>/dev/null || true)
[[ -z "$PROMPT" ]] && exit 0

SCOPE_TIER_MEMORY_KEYWORDS=(
  "right-size" "small/mechanical" "skip DTP" "skip SA" "ceremony" "scope tier"
)

discover_memory_md() {
  local candidates=(
    "${CLAUDE_PROJECT_DIR:-$PWD}/.claude/projects/-Users-cantu-repos-claude-config/memory/MEMORY.md"
    "${HOME}/.claude/projects/-Users-cantu-repos-claude-config/memory/MEMORY.md"
  )
  for c in "${candidates[@]}"; do
    [[ -r "$c" ]] && { echo "$c"; return 0; }
  done
  return 1
}

MEMORY_PATH=$(discover_memory_md) || exit 0

MATCHED_MEMORIES=()
while IFS= read -r line; do
  for kw in "${SCOPE_TIER_MEMORY_KEYWORDS[@]}"; do
    if [[ "$line" == *"$kw"* ]]; then
      memory_name=$(echo "$line" | sed -nE 's/.*\[([^]]+)\].*/\1/p')
      [[ -z "$memory_name" ]] && memory_name=$(echo "$line" | sed -nE 's/.*\(([^)]+)\.md\).*/\1/p')
      [[ -n "$memory_name" ]] && MATCHED_MEMORIES+=("$memory_name")
      break
    fi
  done
done < "$MEMORY_PATH"

[[ ${#MATCHED_MEMORIES[@]} -eq 0 ]] && exit 0

exit 0  # Task 5: criteria evaluation + emission
