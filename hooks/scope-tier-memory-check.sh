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

# Arrays used via indirect expansion ("${!arr_name}") — shellcheck can't trace that.
# shellcheck disable=SC2034
VERB_SIGNALS=("prune" "rename" "delete" "trim" "swap" "move" "typo" "comment-only" "format-only" "add row to" "update entry in" "remove from")
# shellcheck disable=SC2034
MINIMIZERS=("just" "quick" "tiny" "trivial" "small change" "simple")
# shellcheck disable=SC2034
SCOPE_EXPANDERS=("redesign" "restructure" "rearchitect" "refactor across" "migrate to" "rewrite" "introduce new" "cross-cutting change")
# shellcheck disable=SC2034
BLAST_RADIUS_PATHS=("migrations/" "schema." ".sql" ".proto" "api/" "routes/" "controllers/" ".d.ts" "index.ts")
# shellcheck disable=SC2034
BLAST_RADIUS_WORDS=("public API" "exported" "breaking change" "version bump" "release" "deploy")

PROMPT_LOWER=$(echo "$PROMPT" | tr '[:upper:]' '[:lower:]')

prompt_contains_any() {
  local arr_name="$1[@]"
  local prompt_lower="$PROMPT_LOWER"
  for needle in "${!arr_name}"; do
    local needle_lower
    needle_lower=$(echo "$needle" | tr '[:upper:]' '[:lower:]')
    [[ "$prompt_lower" == *"$needle_lower"* ]] && return 0
  done
  return 1
}

prompt_has_concrete_target() {
  echo "$PROMPT" | grep -qE '[A-Za-z0-9_./-]+\.(md|ts|js|sh|fish|json|toml|yaml|yml|py|go|rs|java|kt|swift)\b' && return 0
  # shellcheck disable=SC2016  # backtick pattern intentional — not a variable expansion
  echo "$PROMPT" | grep -qE '`[^`]+`' && return 0
  echo "$PROMPT" | grep -qiE '\bline [0-9]+\b' && return 0
  return 1
}

HAS_VERB=false; HAS_TARGET=false; HAS_MINIMIZER=false
HAS_SCOPE_EXPANDER=false; HAS_BLAST_PATH=false; HAS_BLAST_WORD=false
prompt_contains_any VERB_SIGNALS && HAS_VERB=true
prompt_has_concrete_target && HAS_TARGET=true
prompt_contains_any MINIMIZERS && HAS_MINIMIZER=true
prompt_contains_any SCOPE_EXPANDERS && HAS_SCOPE_EXPANDER=true
prompt_contains_any BLAST_RADIUS_PATHS && HAS_BLAST_PATH=true
prompt_contains_any BLAST_RADIUS_WORDS && HAS_BLAST_WORD=true

if [[ "$HAS_VERB" != "true" ]] || [[ "$HAS_TARGET" != "true" ]] \
  || [[ "$HAS_MINIMIZER" == "true" ]] || [[ "$HAS_SCOPE_EXPANDER" == "true" ]] \
  || [[ "$HAS_BLAST_PATH" == "true" ]] || [[ "$HAS_BLAST_WORD" == "true" ]]; then
  exit 0
fi

# Task 6 inserts git pre-check here.

memory_list=$(IFS=, ; echo "${MATCHED_MEMORIES[*]}")
jq -n --arg mems "$memory_list" '{
  additionalContext: ("SCOPE-TIER MATCH: " + $mems +
    ". Per stored feedback, this prompt qualifies as small/mechanical/known-approach. " +
    "Route to direct implementation: skip DTP, Systems Analysis, brainstorming, " +
    "Fat Marker Sketch, and subagent-driven-development. execution-mode.md " +
    "single-implementer mode, goal-driven.md per-step verify checks, and " +
    "verification.md end-of-work gate STILL apply. If this match is wrong, " +
    "the user can re-prompt with explicit pipeline-invocation language.")
}'
