#!/bin/bash
# rules-shadow.sh — gate hook for the rules-reduction program.
# Plan: docs/rules-reduction-rollback-triggers.md (Phases 1 and 2)
#
# Phase 1: logs what the pr-validation and execution-mode gates SHOULD do on
# each event the agent produces. The log stores hashes, never text.
#
# Phase 2: execution-mode.md is no longer loaded on every prompt and
# pr-validation.md is cut to its core, so the hook now acts on a fire:
#   - implementer dispatch → hands Claude the execution-mode rule (dispatch goes ahead)
#   - first `gh pr merge` / `gh pr ready` per PR per session → blocked once,
#     with the test-plan procedure as the reason; a retry goes through
# Readiness claims in Claude's own text (Stop) stay log-only: the core text left
# in pr-validation.md covers them, and the 2026-10-28 read caught only 8 of 12.
#
# Kill switches, each a file under ~/.claude/ or <project>/.claude/:
#   DISABLE_RULES_SHADOW         stops logging only
#   DISABLE_EXECUTION_MODE_HOOK  stops the execution-mode guidance
#   DISABLE_PR_VALIDATION_HOOK   stops the merge/ready block
#
# The verdict logic lives in
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
  sentinel_present && return 0
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
PR_VALIDATION_PROCEDURE="$(cd "$HOOK_DIR/.." && pwd)/rules/references/pr-validation-procedure.md"
GATE_STATE_DIR="${RULES_GATE_STATE_DIR:-${TMPDIR:-/tmp}/claude-rules-gate}"

verdict_fires() { [[ "$1" == *"verdict=fire"* ]]; }

# inject_execution_mode_rule → print the PreToolUse output that hands Claude
# the execution-mode rule at the one moment it applies. The dispatch goes ahead.
inject_execution_mode_rule() {
  hook_disabled DISABLE_EXECUTION_MODE_HOOK && return 0
  if [[ ! -r "$EXECUTION_MODE_RULE" ]]; then
    warn_degraded rules-shadow "execution-mode rule not found; no guidance injected"
    return 0
  fi
  jq -n -c --rawfile rule "$EXECUTION_MODE_RULE" \
    '{hookSpecificOutput:{hookEventName:"PreToolUse",additionalContext:$rule}}'
}

# pr_target COMMAND → the PR number a merge or ready names, or "branch" when
# the command acts on the current branch's PR.
pr_target() {
  local number
  number=$(_gate_strip_mentions "$1" \
    | grep -oiE 'gh[[:space:]]+pr[[:space:]]+(ready|merge|edit)[[:space:]]+#?[0-9]+' \
    | grep -oE '[0-9]+$' | head -1)
  echo "${number:-branch}"
}

# block_first_merge SESSION_ID COMMAND → print a deny for the first merge or
# ready of each PR in a session, with the test-plan procedure as the reason.
# A retry goes through: the block puts the procedure in front of Claude once,
# it does not stand between the user and a merge.
block_first_merge() {
  hook_disabled DISABLE_PR_VALIDATION_HOOK && return 0
  local session pr marker reason
  session=$(printf '%s' "${1:-unknown}" | tr -c 'A-Za-z0-9_-' '_')
  pr=$(pr_target "$2")
  marker="$GATE_STATE_DIR/$session-$pr"
  [[ -e "$marker" ]] && return 0
  # Without a marker every retry would be blocked too, so fail open instead.
  if ! { mkdir -p "$GATE_STATE_DIR" && touch "$marker"; } 2>/dev/null; then
    warn_degraded rules-shadow "cannot write $GATE_STATE_DIR; merge not gated"
    return 0
  fi

  reason="PR validation gate: blocked once for PR $pr in this session. Before merging or marking it ready:
1. Read its test plan: gh pr view $pr --json body (the '## Test Plan' task list).
2. Run every unchecked item. Check off only items you verified, with gh pr edit --body.
3. Flag any item you can't verify on this machine, with the reason, in the PR.
Then run the same command again; it will go through. A skip counts only if the user named the cost (rules/skip-contract.md).
Full procedure: $PR_VALIDATION_PROCEDURE"
  jq -n -c --arg reason "$reason" \
    '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$reason}}'
}

main() {
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
      session=$(hook_input_field '.session_id')
      case "$tool" in
        Bash)
          payload=$(hook_input_field '.tool_input.command')
          record=$(gate_pr_validation_verdict bash "$payload")
          log_verdict pretooluse_bash "$record" "$payload"
          verdict_fires "$record" && block_first_merge "$session" "$payload"
          ;;
        Task|Agent|Skill)
          payload=$(hook_input_field '.tool_input // {}')
          record=$(gate_execution_mode_verdict "$tool" "$payload")
          log_verdict "pretooluse_$(echo "$tool" | tr '[:upper:]' '[:lower:]')" "$record" "$payload"
          verdict_fires "$record" && inject_execution_mode_rule
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
