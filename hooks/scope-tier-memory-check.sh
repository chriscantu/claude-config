#!/bin/bash
# scope-tier-memory-check.sh — UserPromptSubmit hook
# Disable: ~/.claude/DISABLE_PRESSURE_FLOOR or .claude/DISABLE_PRESSURE_FLOOR
# Spec: docs/superpowers/specs/2026-05-17-scope-tier-memory-check-design.md
#
# Structure: the routing decision is two PURE functions —
#   scope_tier_prompt_verdict PROMPT           (prompt criteria 1-5, six boolean signals)
#   scope_tier_diffstat_rejects DIFFSTAT_TEXT  (criterion 6: git working-tree blast check)
# — both taking their input as an argument with no I/O side effects, so the
# module's own tests can cross that internal seam directly (see
# tests/hooks/scope-tier-classify.test.sh). main() is the adapter: it does all
# the I/O (stdin, MEMORY.md scan, running git, sentinel write, logging, emission)
# and feeds the pure functions their inputs. The sourcing guard at the bottom
# runs main() only on direct execution, so a test can `source` this file to reach
# the functions without triggering the hook.
set -u

# Shared dependency-preflight helpers (require_cmd / warn_degraded). Sourced,
# not executed — resolves beside this hook regardless of install location
# (plugin root or repo checkout). Sourcing defines two functions only; it does
# no I/O, so the classifier tests that source this file stay inert.
# shellcheck source=/dev/null
source "$(dirname "${BASH_SOURCE[0]}")/lib/preflight.sh"

# ── Logging infrastructure ────────────────────────────────────────────────────
LOG_DIR="${SCOPE_TIER_LOG_DIR:-${HOME}/.claude/logs}"
LOG_FILE="$LOG_DIR/scope-tier-hook.log"
LOG_ROTATED="$LOG_FILE.1"
LOG_THRESHOLD=$((10*1024*1024))
LOG_KEEP_TAIL=$((5*1024*1024))

rotate_log_if_needed() {
  [[ ! -f "$LOG_FILE" ]] && return 0
  local size
  size=$(stat -f%z "$LOG_FILE" 2>/dev/null || stat -c%s "$LOG_FILE" 2>/dev/null || echo 0)
  if [[ "$size" -gt "$LOG_THRESHOLD" ]]; then
    tail -c "$LOG_KEEP_TAIL" "$LOG_FILE" > "$LOG_ROTATED" 2>/dev/null || true
    : > "$LOG_FILE"
  fi
}

SENTINEL_PATH="${SCOPE_TIER_SENTINEL_PATH:-.claude/state/scope-tier-current}"

write_sentinel() {
  local matched_json="$1"
  local sentinel_dir
  sentinel_dir=$(dirname "$SENTINEL_PATH")
  if ! mkdir -p "$sentinel_dir" 2>/dev/null; then
    return 0
  fi
  local now_ts
  now_ts=$(date +%s)
  jq -n -c --argjson ts "$now_ts" --argjson matched "$matched_json" \
    '{ts:$ts,matched:$matched}' > "$SENTINEL_PATH" 2>/dev/null
  return 0
}

clear_sentinel() {
  if [[ -f "$SENTINEL_PATH" ]]; then
    rm -f "$SENTINEL_PATH" 2>/dev/null
  fi
  return 0
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

SCOPE_TIER_MEMORY_KEYWORDS=(
  "right-size" "small/mechanical" "skip DTP" "skip SA" "ceremony" "scope tier"
)

# _scope_tier_slug PATH → PATH with '/' → '-' (Claude Code's project-dir slug
# convention: an absolute path becomes the directory name under
# ~/.claude/projects/). Pure; the seam the self-resolution below is built on.
_scope_tier_slug() {
  printf '%s' "$1" | sed 's:/:-:g'
}

# discover_memory_md → echo the first readable scope-tier MEMORY.md, else 1.
#
# The scope-tier feedback memories live in claude-config's own project memory
# (~/.claude/projects/<slug>/memory/MEMORY.md, where <slug> is the project
# dir's path slugified). The original hook hardcoded the maintainer's slug,
# which silently disabled the fast-lane for every other installer whose repo
# lives at a different path. Resolution order now self-heals with zero config:
#
#   1. SCOPE_TIER_MEMORY_PATH — explicit override for non-standard layouts.
#   2. Self-resolved — this hook's own repo root (the dir above hooks/),
#      slugified. Correct whenever the user opens the same checkout the hook
#      ships in as their claude-config project. `pwd -P` resolves symlinks so
#      a symlinked checkout still maps to the real path.
#   3. Hardcoded fallback — the maintainer's original path, kept last so this
#      machine keeps working even if self-resolution ever fails.
discover_memory_md() {
  local candidates=()

  [[ -n "${SCOPE_TIER_MEMORY_PATH:-}" ]] && candidates+=("$SCOPE_TIER_MEMORY_PATH")

  local repo_root slug
  repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." 2>/dev/null && pwd -P)
  if [[ -n "$repo_root" ]]; then
    slug=$(_scope_tier_slug "$repo_root")
    candidates+=("${HOME}/.claude/projects/${slug}/memory/MEMORY.md")
  fi

  candidates+=(
    "${CLAUDE_PROJECT_DIR:-$PWD}/.claude/projects/-Users-cantu-repos-claude-config/memory/MEMORY.md"
    "${HOME}/.claude/projects/-Users-cantu-repos-claude-config/memory/MEMORY.md"
  )

  for c in "${candidates[@]}"; do
    [[ -r "$c" ]] && { echo "$c"; return 0; }
  done
  return 1
}

# ── Classifier signal vocabulary (module-private, read on source) ─────────────
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

# ── Pure classifier functions (the internal seam — no I/O side effects) ───────

# _scope_tier_contains_any LOWERCASED_PROMPT ARRAY_NAME → 0 if any needle matches.
_scope_tier_contains_any() {
  local prompt_lower="$1"
  local arr_name="$2[@]"
  local needle needle_lower
  for needle in "${!arr_name}"; do
    needle_lower=$(echo "$needle" | tr '[:upper:]' '[:lower:]')
    [[ "$prompt_lower" == *"$needle_lower"* ]] && return 0
  done
  return 1
}

# _scope_tier_has_concrete_target PROMPT → 0 if a file path, `code span`, or line ref.
_scope_tier_has_concrete_target() {
  local prompt="$1"
  echo "$prompt" | grep -qE '[A-Za-z0-9_./-]+\.(md|ts|js|sh|fish|json|toml|yaml|yml|py|go|rs|java|kt|swift)\b' && return 0
  # shellcheck disable=SC2016  # backtick pattern intentional — not a variable expansion
  echo "$prompt" | grep -qE '`[^`]+`' && return 0
  echo "$prompt" | grep -qiE '\bline [0-9]+\b' && return 0
  return 1
}

# scope_tier_prompt_verdict PROMPT
#   Pure. Emits one jq-free line:
#     verb=<t/f> target=<t/f> minimizer=<t/f> scope_expander=<t/f> \
#     blast_path=<t/f> blast_word=<t/f> verdict=<mechanical|rejected>
#   verdict=mechanical IFF verb && target && !minimizer && !scope_expander
#     && !blast_path && !blast_word.
scope_tier_prompt_verdict() {
  local prompt="$1"
  local prompt_lower
  prompt_lower=$(echo "$prompt" | tr '[:upper:]' '[:lower:]')

  local verb=false target=false minimizer=false
  local scope_expander=false blast_path=false blast_word=false
  _scope_tier_contains_any "$prompt_lower" VERB_SIGNALS && verb=true
  _scope_tier_has_concrete_target "$prompt" && target=true
  _scope_tier_contains_any "$prompt_lower" MINIMIZERS && minimizer=true
  _scope_tier_contains_any "$prompt_lower" SCOPE_EXPANDERS && scope_expander=true
  _scope_tier_contains_any "$prompt_lower" BLAST_RADIUS_PATHS && blast_path=true
  _scope_tier_contains_any "$prompt_lower" BLAST_RADIUS_WORDS && blast_word=true

  local verdict=rejected
  if [[ "$verb" == "true" ]] && [[ "$target" == "true" ]] \
    && [[ "$minimizer" == "false" ]] && [[ "$scope_expander" == "false" ]] \
    && [[ "$blast_path" == "false" ]] && [[ "$blast_word" == "false" ]]; then
    verdict=mechanical
  fi

  printf 'verb=%s target=%s minimizer=%s scope_expander=%s blast_path=%s blast_word=%s verdict=%s\n' \
    "$verb" "$target" "$minimizer" "$scope_expander" "$blast_path" "$blast_word" "$verdict"
}

# scope_tier_diffstat_rejects DIFFSTAT_TEXT
#   Pure. Input is combined `git diff --stat` text (does NOT call git itself).
#   Exit 0 = reject (blast-radius path OR >5 files OR >200 LOC changed), 1 = ok.
scope_tier_diffstat_rejects() {
  local combined="$1"
  echo "$combined" | grep -qE '(^| |\t|/)(migrations|schema|db|api)/' && return 0
  local file_count loc_total
  file_count=$(echo "$combined" | grep -cE '\| +[0-9]+ ' || true)
  [[ "$file_count" -gt 5 ]] && return 0
  loc_total=$(echo "$combined" | grep -E '[0-9]+ insertion|[0-9]+ deletion' \
    | awk '{for(i=1;i<=NF;i++)if($i~/insertion|deletion/)sum+=$(i-1)} END{print sum+0}')
  [[ "$loc_total" -gt 200 ]] && return 0
  return 1
}

# ── Adapter: all I/O lives here ───────────────────────────────────────────────
main() {
  # pipefail is scoped to main() (not module scope) so that sourcing this file
  # for the classifier tests never mutates the test harness's shell options.
  set -o pipefail

  if [[ -f "${HOME}/.claude/DISABLE_PRESSURE_FLOOR" ]] \
    || [[ -f ".claude/DISABLE_PRESSURE_FLOOR" ]]; then return 0; fi

  # jq is a hard dependency here (prompt extraction, sentinel, logging, emission).
  # This is an ADVISORY hook, so degrade gracefully but LOUDLY — warn on stderr
  # and return 0 rather than the old silent no-op that hid a broken guardrail.
  if ! require_cmd jq; then
    warn_degraded scope-tier-memory-check "jq not on PATH — scope-tier fast-lane disabled this prompt"
    return 0
  fi

  # Logging is main()-only, so the dir is created here (after the disable check)
  # rather than at module scope — a disabled or sourced hook touches nothing.
  mkdir -p "$LOG_DIR" 2>/dev/null || true

  INPUT=$(cat 2>/dev/null || true)
  [[ -z "$INPUT" ]] && return 0

  PROMPT=$(echo "$INPUT" | jq -r '.prompt // empty' 2>/dev/null || true)
  [[ -z "$PROMPT" ]] && return 0

  MEMORY_PATH=$(discover_memory_md) || return 0

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
    clear_sentinel
    log_decision "no_scope_tier_memory"
    return 0
  fi

  # Classify the prompt through the internal seam, then unpack the record into
  # the HAS_* globals log_decision reports.
  local record verdict kv
  record=$(scope_tier_prompt_verdict "$PROMPT")
  verdict=rejected
  for kv in $record; do
    case "$kv" in
      verb=*)           HAS_VERB="${kv#verb=}" ;;
      target=*)         HAS_TARGET="${kv#target=}" ;;
      minimizer=*)      HAS_MINIMIZER="${kv#minimizer=}" ;;
      scope_expander=*) HAS_SCOPE_EXPANDER="${kv#scope_expander=}" ;;
      blast_path=*)     HAS_BLAST_PATH="${kv#blast_path=}" ;;
      blast_word=*)     HAS_BLAST_WORD="${kv#blast_word=}" ;;
      verdict=*)        verdict="${kv#verdict=}" ;;
    esac
  done

  if [[ "$verdict" != "mechanical" ]]; then
    clear_sentinel
    log_decision "no_match"
    return 0
  fi

  # Criterion 6: git working-tree pre-check. I/O gathers the diff stat; the pure
  # scope_tier_diffstat_rejects analyzes it. macOS may lack `timeout`/`gtimeout`
  # — graceful degradation: run git without a timeout. No git repo → no rejection.
  local timeout_cmd=""
  if command -v timeout >/dev/null 2>&1; then
    timeout_cmd="timeout 2s"
  elif command -v gtimeout >/dev/null 2>&1; then
    timeout_cmd="gtimeout 2s"
  fi
  if command -v git >/dev/null 2>&1 \
    && $timeout_cmd git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    local cached unstaged combined
    cached=$($timeout_cmd git diff --cached --stat 2>/dev/null || true)
    unstaged=$($timeout_cmd git diff --stat 2>/dev/null || true)
    combined=$(printf '%s\n%s' "$cached" "$unstaged")
    if scope_tier_diffstat_rejects "$combined"; then
      clear_sentinel
      log_decision "no_match_git"
      return 0
    fi
  fi

  local matched_json_for_sentinel memory_list
  matched_json_for_sentinel=$(printf '%s\n' "${MATCHED_MEMORIES[@]}" | jq -R . | jq -s -c .)
  write_sentinel "$matched_json_for_sentinel"
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
}

# Run only on direct execution (or via symlink, where $0 == BASH_SOURCE[0]).
# When sourced by a test, the guard is false and the pure functions above are
# callable without triggering the hook.
[[ "${BASH_SOURCE[0]}" == "${0}" ]] && main "$@"
