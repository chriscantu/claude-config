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

# Resolve the symlink: link-config installs this file as ~/.claude/hooks/rules-shadow.sh
# with no lib/ beside it, so the libraries live next to the real file only.
HOOK_DIR="$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")"

# shellcheck source=/dev/null
source "$HOOK_DIR/lib/hook-runtime.sh"
# shellcheck source=/dev/null
source "$HOOK_DIR/lib/gate-classify.sh"

LOG_DIR="${RULES_SHADOW_LOG_DIR:-${HOME}/.claude/logs}"
LOG_FILE="$LOG_DIR/rules-shadow.log"

# sentinel_present → 0 when this lever is switched off. Checked before any work,
# so a broken classifier can be killed without editing settings or reverting.
# RULES_SHADOW_SENTINEL names one exact file and predates HOOK_SENTINEL_DIR;
# it stays so existing callers keep working.
sentinel_present() {
  if [[ -n "${RULES_SHADOW_SENTINEL:-}" ]]; then
    [[ -f "$RULES_SHADOW_SENTINEL" ]]
    return
  fi
  hook_disabled DISABLE_RULES_SHADOW
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
  local ts gate trigger verdict hash line
  ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  gate=$(echo "$record" | tr ' ' '\n' | grep '^gate=' | cut -d= -f2)
  trigger=$(echo "$record" | tr ' ' '\n' | grep '^trigger=' | cut -d= -f2)
  verdict=$(echo "$record" | tr ' ' '\n' | grep '^verdict=' | cut -d= -f2)
  hash=$(payload_hash "$payload")

  line=$(jq -n -c --arg ts "$ts" --arg surface "$surface" --arg gate "$gate" \
    --arg trigger "$trigger" --arg verdict "$verdict" --arg ph "$hash" \
    '{ts:$ts,surface:$surface,gate:$gate,trigger:$trigger,verdict:$verdict,payload_hash:$ph}' \
    2>/dev/null) || return 0
  hook_log_jsonl "$LOG_FILE" "$line"
}

# last_assistant_text TRANSCRIPT_PATH → the final assistant turn's text, or "".
# Fallback only, for a CLI that sends no last_assistant_message: the transcript
# can lag the Stop event, and a lagging read returns an earlier turn or nothing.
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

  local event tool payload record
  hook_read_input

  event=$(hook_input_field '.hook_event_name')
  if [[ -z "$event" ]]; then
    warn_degraded rules-shadow "unparseable hook payload; no verdict logged"
    exit 0
  fi

  case "$event" in
    PreToolUse)
      tool=$(hook_input_field '.tool_name')
      case "$tool" in
        Bash)
          payload=$(hook_input_field '.tool_input.command')
          record=$(gate_pr_validation_verdict bash "$payload")
          log_verdict pretooluse_bash "$record" "$payload"
          ;;
        Task|Agent|Skill)
          payload=$(hook_input_field '.tool_input // {}')
          record=$(gate_execution_mode_verdict "$tool" "$payload")
          log_verdict "pretooluse_$(echo "$tool" | tr '[:upper:]' '[:lower:]')" "$record" "$payload"
          ;;
      esac
      ;;
    Stop)
      local transcript
      payload=$(hook_input_field '.last_assistant_message')
      if [[ -z "$payload" ]]; then
        transcript=$(hook_input_field '.transcript_path')
        payload=$(last_assistant_text "$transcript")
      fi
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
