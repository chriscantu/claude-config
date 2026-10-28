#!/bin/bash
# rules-shadow.sh — gate hook for the rules-reduction program.
# Plan: docs/rules-reduction-rollback-triggers.md (Phases 1 and 2)
#
# Phase 1: logs what the pr-validation and execution-mode gates SHOULD do on
# each event the agent produces. The log stores hashes, never text.
#
# Phase 2: execution-mode.md is no longer loaded on every prompt and
# pr-validation.md is cut to its core, so the hook now acts on a fire:
#   - implementer dispatch, or the subagent-driven-development skill → hands
#     Claude the execution-mode rule once per session; the dispatch goes ahead
#   - `gh pr merge`, `gh pr ready` or a draft-label removal → each distinct
#     command is blocked once per session, with the test-plan procedure as the
#     reason; running the identical command again goes through
# Readiness claims in Claude's own text (Stop) stay log-only: the core text left
# in pr-validation.md covers them, and the 2026-10-28 read caught only 8 of 12.
#
# Kill switches, each a file under ~/.claude/ or <project>/.claude/:
#   DISABLE_RULES_SHADOW         turns the whole hook off: no classifier, no log, no action
#   DISABLE_EXECUTION_MODE_HOOK  stops the execution-mode guidance
#   DISABLE_PR_VALIDATION_HOOK   stops the merge/ready block
# The RULES_SHADOW_SENTINEL env var names a file that stops logging only. The
# eval runner sets it so eval events stay out of the log while enforcement runs.
#
# The verdict logic lives in pure functions in lib/gate-classify.sh. This file
# is the adapter that does all the I/O: stdin, transcript read, hashing, the log,
# the per-session state markers, and the JSON it prints for Claude Code.
#
# Registered on three surfaces, because neither rule triggers on a user prompt:
#   PreToolUse:Bash             → pr-validation action-bound triggers
#   PreToolUse:Task|Agent|Skill → execution-mode dispatch trigger
#   Stop                        → pr-validation speech-act triggers (log only)
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

# logging_off → 0 when the eval runner's RULES_SHADOW_SENTINEL file exists.
# It stops logging only: Phase 2 evals must run with enforcement on.
logging_off() {
  [[ -n "${RULES_SHADOW_SENTINEL:-}" && -f "$RULES_SHADOW_SENTINEL" ]]
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
  logging_off && return 0
  if ! require_cmd shasum; then
    warn_degraded rules-shadow "shasum not on PATH; no verdict logged"
    return 0
  fi
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

EXECUTION_MODE_RULE="$HOOK_DIR/../rules/execution-mode.md"
# Absolute, because Claude reads this path in the block reason.
PR_VALIDATION_PROCEDURE="$(cd "$HOOK_DIR/.." && pwd)/rules/references/pr-validation-procedure.md"
# Markers only need to outlive one session, so the OS temp dir is the right home.
GATE_STATE_DIR="${RULES_GATE_STATE_DIR:-${TMPDIR:-/tmp}/claude-rules-gate}"

# mark_once return codes.
MARK_NEW=0
MARK_SEEN=1
MARK_UNWRITABLE=2

verdict_fires() { [[ "$1" == *"verdict=fire"* ]]; }

# safe_name TEXT → TEXT with every character outside [A-Za-z0-9_-] turned into _.
safe_name() { printf '%s' "$1" | tr -c 'A-Za-z0-9_-' '_'; }

# session_key → this session's id from HOOK_INPUT: the session_id, else the
# transcript path. Empty when the payload has neither.
session_key() {
  local id
  id=$(hook_input_field '.session_id')
  [[ -z "$id" ]] && id=$(hook_input_field '.transcript_path')
  printf '%s' "$id"
}

# mark_once NAME → MARK_NEW the first time NAME is recorded, MARK_SEEN after
# that, MARK_UNWRITABLE when the state dir can't be written.
mark_once() {
  local marker
  marker="$GATE_STATE_DIR/$(safe_name "$1")"
  [[ -e "$marker" ]] && return "$MARK_SEEN"
  { mkdir -p "$GATE_STATE_DIR" && touch "$marker"; } 2>/dev/null || return "$MARK_UNWRITABLE"
  return "$MARK_NEW"
}

# inject_execution_mode_rule SESSION → print the PreToolUse output that hands
# Claude the execution-mode rule, once per session. The dispatch goes ahead, so
# the note asks for the announcement before the NEXT dispatch.
inject_execution_mode_rule() {
  local session="$1" note
  hook_disabled DISABLE_EXECUTION_MODE_HOOK && return 0
  if [[ ! -r "$EXECUTION_MODE_RULE" ]]; then
    warn_degraded rules-shadow "execution-mode rule not found; no guidance injected"
    return 0
  fi
  # Without a session, or a place to record it, inject every time rather than never.
  if [[ -n "$session" ]]; then
    mark_once "$session-execution-mode"
    [[ $? -eq $MARK_SEEN ]] && return 0
  fi
  note="A hook added this rule because an implementer subagent just started. If you have not announced your execution mode yet, announce it now, before the next dispatch."
  jq -n -c --arg note "$note" --rawfile rule "$EXECUTION_MODE_RULE" \
    '{hookSpecificOutput:{hookEventName:"PreToolUse",additionalContext:($note + "\n\n" + $rule)}}'
}

# block_first_readiness_action SESSION COMMAND → print a deny the first time
# this session runs COMMAND (a merge, ready or draft-label removal, per the
# classifier), with the test-plan procedure as the reason. Running the identical
# command again goes through: the block puts the procedure in front of Claude
# once, it does not stand between the user and a merge.
#
# Keyed on the command text, not the PR: parsing gh's arguments for a PR number
# was bypassed by -m, $N, line continuations and repo forms (2026-10-28 review).
# Known miss: identical text that acts on another PR, e.g. `gh pr merge $N`
# after N changed, counts as the retry. No session id: not gated, with a warning.
block_first_readiness_action() {
  local session="$1" command="$2" command_hash reason
  hook_disabled DISABLE_PR_VALIDATION_HOOK && return 0
  if [[ -z "$session" ]]; then
    warn_degraded rules-shadow "no session id in the payload; merge/ready not gated"
    return 0
  fi
  command_hash=$(payload_hash "$command")
  if [[ -z "$command_hash" ]]; then
    warn_degraded rules-shadow "shasum not on PATH; merge/ready not gated"
    return 0
  fi
  mark_once "$session-$command_hash"
  case $? in
    "$MARK_SEEN") return 0 ;;
    "$MARK_UNWRITABLE")
      # Without a marker the retry would be blocked too, forever.
      warn_degraded rules-shadow "cannot write $GATE_STATE_DIR; merge/ready not gated"
      return 0 ;;
  esac

  reason="PR validation gate: this command was blocked once, so the test plan runs first. For each PR it merges or marks ready:
1. Read the test plan: gh pr view <PR> --json body (the '## Test Plan' task list).
2. Run every unchecked item. Check off only items you verified, with gh pr edit --body.
3. Flag any item you can't verify on this machine, with the reason, in the PR.
Then run the identical command again; it will go through. A skip counts only if the user named the cost (rules/skip-contract.md).
Full procedure: $PR_VALIDATION_PROCEDURE"
  jq -n -c --arg reason "$reason" \
    '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$reason}}'
}

main() {
  # Checked before any work, so a broken classifier can be killed without
  # editing settings or reverting.
  hook_disabled DISABLE_RULES_SHADOW && exit 0

  if ! require_cmd jq; then
    warn_degraded rules-shadow "jq not on PATH; no verdict logged"
    exit 0
  fi

  local event tool payload record session
  hook_read_input

  event=$(hook_input_field '.hook_event_name')
  if [[ -z "$event" ]]; then
    warn_degraded rules-shadow "unparseable hook payload; no verdict logged"
    exit 0
  fi

  case "$event" in
    PreToolUse)
      tool=$(hook_input_field '.tool_name')
      session=$(session_key)
      case "$tool" in
        Bash)
          payload=$(hook_input_field '.tool_input.command')
          record=$(gate_pr_validation_verdict bash "$payload")
          log_verdict pretooluse_bash "$record" "$payload"
          verdict_fires "$record" && block_first_readiness_action "$session" "$payload"
          ;;
        Task|Agent|Skill)
          payload=$(hook_input_field '.tool_input // {}')
          record=$(gate_execution_mode_verdict "$tool" "$payload")
          log_verdict "pretooluse_$(echo "$tool" | tr '[:upper:]' '[:lower:]')" "$record" "$payload"
          verdict_fires "$record" && inject_execution_mode_rule "$session"
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
