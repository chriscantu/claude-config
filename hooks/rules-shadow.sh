#!/bin/bash
# rules-shadow.sh — Phase 1 shadow hook for the rules-reduction program.
# Disable: ~/.claude/DISABLE_RULES_SHADOW or .claude/DISABLE_RULES_SHADOW
# Plan: docs/rules-reduction-rollback-triggers.md (Phase 1)
#
# Logs what the pr-validation and execution-mode gates SHOULD do on each event
# the agent produces. Changes nothing: both rules stay loaded, the hook never
# blocks a tool call and never emits a system-reminder. The log is the whole
# product — Phase 2 drops the two rule symlinks only if these verdicts turn out
# to be trustworthy over 20+ real events.
#
# Structure mirrors hooks/scope-tier-memory-check.sh: the verdict logic lives in
# pure functions in lib/gate-classify.sh, and this file is the adapter that does
# all the I/O (stdin, transcript read, hashing, logging).
#
# Registered on three surfaces, because neither rule triggers on a user prompt:
#   PreToolUse:Bash        → pr-validation action-bound triggers
#   PreToolUse:Task|Skill  → execution-mode dispatch trigger
#   Stop                   → pr-validation speech-act triggers
set -u

HOOK_DIR="$(dirname "${BASH_SOURCE[0]}")"

# shellcheck source=/dev/null
source "$HOOK_DIR/lib/preflight.sh"
# shellcheck source=/dev/null
source "$HOOK_DIR/lib/gate-classify.sh"

LOG_DIR="${RULES_SHADOW_LOG_DIR:-${HOME}/.claude/logs}"
LOG_FILE="$LOG_DIR/rules-shadow.log"
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

# sentinel_present → 0 when this lever is switched off. Checked before any work,
# so a broken classifier can be killed without editing settings or reverting.
sentinel_present() {
  if [[ -n "${RULES_SHADOW_SENTINEL:-}" ]]; then
    [[ -f "$RULES_SHADOW_SENTINEL" ]] && return 0
    return 1
  fi
  [[ -f "${CLAUDE_PROJECT_DIR:-$PWD}/.claude/DISABLE_RULES_SHADOW" ]] && return 0
  [[ -f "${HOME}/.claude/DISABLE_RULES_SHADOW" ]] && return 0
  return 1
}

# payload_hash TEXT → first 16 hex chars of sha256. The log records this instead
# of the payload: commands and final text carry tokens, client names and PII,
# and this log lives on a machine whose config repo is public.
payload_hash() {
  printf '%s' "${1:-}" | shasum -a 256 2>/dev/null | awk '{print substr($1,1,16)}'
}

# log_verdict SURFACE RECORD PAYLOAD → append one JSONL line.
log_verdict() {
  local surface="$1" record="$2" payload="${3:-}"
  local ts gate trigger verdict hash
  ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  gate=$(echo "$record" | tr ' ' '\n' | grep '^gate=' | cut -d= -f2)
  trigger=$(echo "$record" | tr ' ' '\n' | grep '^trigger=' | cut -d= -f2)
  verdict=$(echo "$record" | tr ' ' '\n' | grep '^verdict=' | cut -d= -f2)
  hash=$(payload_hash "$payload")

  mkdir -p "$LOG_DIR" 2>/dev/null || return 0
  rotate_log_if_needed
  jq -n -c --arg ts "$ts" --arg surface "$surface" --arg gate "$gate" \
    --arg trigger "$trigger" --arg verdict "$verdict" --arg ph "$hash" \
    '{ts:$ts,surface:$surface,gate:$gate,trigger:$trigger,verdict:$verdict,payload_hash:$ph}' \
    >> "$LOG_FILE" 2>/dev/null || true
}

# last_assistant_text TRANSCRIPT_PATH → the final assistant turn's text, or "".
# Stop hands over a transcript path, not the text, so the speech-act triggers
# are only reachable by reading the last assistant message back out.
last_assistant_text() {
  local path="$1"
  [[ -r "$path" ]] || return 0
  jq -rs '[.[] | select(.type == "assistant")] | last
          | if . == null then "" else
              (.message.content // [] | map(select(.type == "text") | .text) | join(" "))
            end' "$path" 2>/dev/null
}

main() {
  sentinel_present && exit 0

  if ! require_cmd jq; then
    warn_degraded rules-shadow "jq not on PATH; no verdict logged"
    exit 0
  fi
  if ! require_cmd shasum; then
    warn_degraded rules-shadow "shasum not on PATH; no verdict logged"
    exit 0
  fi

  local input event tool payload record
  input=$(cat)

  event=$(echo "$input" | jq -r '.hook_event_name // empty' 2>/dev/null)
  if [[ -z "$event" ]]; then
    warn_degraded rules-shadow "unparseable hook payload; no verdict logged"
    exit 0
  fi

  case "$event" in
    PreToolUse)
      tool=$(echo "$input" | jq -r '.tool_name // empty' 2>/dev/null)
      case "$tool" in
        Bash)
          payload=$(echo "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)
          record=$(gate_pr_validation_verdict bash "$payload")
          log_verdict pretooluse_bash "$record" "$payload"
          ;;
        Task|Agent|Skill)
          payload=$(echo "$input" | jq -c '.tool_input // {}' 2>/dev/null)
          record=$(gate_execution_mode_verdict "$tool" "$payload")
          log_verdict "pretooluse_$(echo "$tool" | tr '[:upper:]' '[:lower:]')" "$record" "$payload"
          ;;
      esac
      ;;
    Stop)
      local transcript
      transcript=$(echo "$input" | jq -r '.transcript_path // empty' 2>/dev/null)
      payload=$(last_assistant_text "$transcript")
      if [[ -n "$payload" ]]; then
        record=$(gate_pr_validation_verdict stop "$payload")
        log_verdict stop "$record" "$payload"
      fi
      ;;
  esac

  exit 0
}

# Sourcing guard: tests source this file to reach helpers without firing main.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main
fi
