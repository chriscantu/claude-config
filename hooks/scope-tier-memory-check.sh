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

exit 0  # subsequent tasks add MEMORY.md scan + criteria
