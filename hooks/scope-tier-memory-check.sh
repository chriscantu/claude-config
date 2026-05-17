#!/bin/bash
# scope-tier-memory-check.sh — UserPromptSubmit hook
# Disable: ~/.claude/DISABLE_PRESSURE_FLOOR or .claude/DISABLE_PRESSURE_FLOOR
# Spec: docs/superpowers/specs/2026-05-17-scope-tier-memory-check-design.md
set -u

if [[ -f "${HOME}/.claude/DISABLE_PRESSURE_FLOOR" ]] \
  || [[ -f ".claude/DISABLE_PRESSURE_FLOOR" ]]; then exit 0; fi

# ── Logging infrastructure ────────────────────────────────────────────────────
LOG_DIR="${SCOPE_TIER_LOG_DIR:-${HOME}/.claude/logs}"
LOG_FILE="$LOG_DIR/scope-tier-hook.log"
LOG_ROTATED="$LOG_FILE.1"
LOG_THRESHOLD=$((10*1024*1024))
LOG_KEEP_TAIL=$((5*1024*1024))
mkdir -p "$LOG_DIR" 2>/dev/null || true

rotate_log_if_needed() {
  [[ ! -f "$LOG_FILE" ]] && return 0
  local size
  size=$(stat -f%z "$LOG_FILE" 2>/dev/null || stat -c%s "$LOG_FILE" 2>/dev/null || echo 0)
  if [[ "$size" -gt "$LOG_THRESHOLD" ]]; then
    tail -c "$LOG_KEEP_TAIL" "$LOG_FILE" > "$LOG_ROTATED" 2>/dev/null || true
    : > "$LOG_FILE"
  fi
}

log_decision() {
  local decision="$1"
  rotate_log_if_needed
  local ts prompt_hash matched_json
  ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  prompt_hash=$(printf '%s' "${PROMPT:-}" | shasum -a 256 2>/dev/null | awk '{print substr($1,1,16)}')
  if [[ ${#MATCHED_MEMORIES[@]:-0} -gt 0 ]]; then
    matched_json=$(printf '%s\n' "${MATCHED_MEMORIES[@]}" | jq -R . | jq -s .)
  else
    matched_json='[]'
  fi
  jq -n -c --arg ts "$ts" --arg decision "$decision" --arg ph "$prompt_hash" \
    --arg v "${HAS_VERB:-na}" --arg t "${HAS_TARGET:-na}" \
    --arg m "${HAS_MINIMIZER:-na}" --arg se "${HAS_SCOPE_EXPANDER:-na}" \
    --arg bp "${HAS_BLAST_PATH:-na}" --arg bw "${HAS_BLAST_WORD:-na}" \
    --argjson mm "$matched_json" \
    '{ts:$ts,decision:$decision,prompt_hash:$ph,criteria:{verb:$v,target:$t,minimizer:$m,scope_expander:$se,blast_path:$bp,blast_word:$bw},matched:$mm}' \
    >> "$LOG_FILE" 2>/dev/null || true
}
# ─────────────────────────────────────────────────────────────────────────────

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

if [[ ${#MATCHED_MEMORIES[@]} -eq 0 ]]; then
  log_decision "no_scope_tier_memory"
  exit 0
fi

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
  log_decision "no_match"
  exit 0
fi

# Criterion 6: git working-tree pre-check.
# macOS may not have `timeout` or `gtimeout` — graceful degradation: no timeout.
TIMEOUT_CMD=""
if command -v timeout >/dev/null 2>&1; then
  TIMEOUT_CMD="timeout 2s"
elif command -v gtimeout >/dev/null 2>&1; then
  TIMEOUT_CMD="gtimeout 2s"
fi
# If neither is available, TIMEOUT_CMD stays empty and git commands run without timeout.

git_check_rejects() {
  command -v git >/dev/null 2>&1 || return 1
  $TIMEOUT_CMD git rev-parse --is-inside-work-tree >/dev/null 2>&1 || return 1
  local cached unstaged combined
  cached=$($TIMEOUT_CMD git diff --cached --stat 2>/dev/null || true)
  unstaged=$($TIMEOUT_CMD git diff --stat 2>/dev/null || true)
  combined=$(printf '%s\n%s' "$cached" "$unstaged")
  echo "$combined" | grep -qE '(^| |\t|/)(migrations|schema|db|api)/' && return 0
  local file_count loc_total
  file_count=$(echo "$combined" | grep -cE '\| +[0-9]+ ' || true)
  [[ "$file_count" -gt 5 ]] && return 0
  loc_total=$(echo "$combined" | grep -E '[0-9]+ insertion|[0-9]+ deletion' \
    | awk '{for(i=1;i<=NF;i++)if($i~/insertion|deletion/)sum+=$(i-1)} END{print sum+0}')
  [[ "$loc_total" -gt 200 ]] && return 0
  return 1
}
if git_check_rejects; then
  log_decision "no_match_git"
  exit 0
fi

log_decision "match"
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
