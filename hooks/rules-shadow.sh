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

# session_key → a filename-safe id for this session from HOOK_INPUT: the
# session_id, else the transcript path. Empty when the payload has neither.
session_key() {
  local id
  id=$(hook_input_field '.session_id')
  [[ -z "$id" ]] && id=$(hook_input_field '.transcript_path')
  printf '%s' "$id" | tr -c 'A-Za-z0-9_-' '_'
}

# mark_once NAME → 0 the first time NAME is marked in GATE_STATE_DIR, 1 when it
# already was. 2 when the marker can't be written: the caller must fail open,
# since without a marker a block would repeat on every retry.
mark_once() {
  local marker="$GATE_STATE_DIR/$1"
  [[ -e "$marker" ]] && return 1
  { mkdir -p "$GATE_STATE_DIR" && touch "$marker"; } 2>/dev/null || return 2
  return 0
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
  # Without a session to key on, inject every time rather than never.
  if [[ -n "$session" ]]; then
    mark_once "$session-execution-mode" || [[ $? -eq 2 ]] || return 0
  fi
  note="A hook added this rule because an implementer subagent just started. If you have not announced your execution mode yet, announce it now, before the next dispatch."
  jq -n -c --arg note "$note" --rawfile rule "$EXECUTION_MODE_RULE" \
    '{hookSpecificOutput:{hookEventName:"PreToolUse",additionalContext:($note + "\n\n" + $rule)}}'
}

# pr_targets COMMAND → one line per PR that a merge, ready or draft-label
# removal in COMMAND acts on: "<repo>#<number>", "branch:<name>", or "current"
# when no PR is named. Reads only what _gate_strip_mentions leaves, so quoted
# flag values never pass for a PR. Calls that undo or only print help
# (--undo, --help, --disable-auto) are not readiness actions and are skipped.
pr_targets() {
  _gate_strip_mentions "$1" | awk '
    {
      pieces = split($0, piece, /[;&|()]/)
      for (p = 1; p <= pieces; p++) {
        n = split(piece[p], t, /[ \t]+/)
        for (i = 1; i <= n; i++) {
          if (t[i] !~ /(^|\/)gh$/ || t[i+1] != "pr") continue
          verb = t[i+2]
          if (verb != "merge" && verb != "ready" && !(verb == "edit" && piece[p] ~ /--remove-label[ \t=]+draft/)) continue
          repo = ""; target = ""; skip = 0
          for (j = i + 3; j <= n; j++) {
            tok = t[j]
            if (tok == "" || tok ~ /^["\047]+$/) continue
            if (tok ~ /^(--undo|--help|-h|--disable-auto)$/) { skip = 1; break }
            if (tok ~ /^(-R|--repo)$/) { repo = t[++j]; continue }
            if (tok ~ /^--repo=/) { repo = substr(tok, 8); continue }
            if (tok ~ /^(-t|--subject|-b|--body|-F|--body-file|-A|--author-email|--match-head-commit|--title|-B|--base|-m|--milestone|--add-label|--remove-label|--add-reviewer|--remove-reviewer|--add-assignee|--remove-assignee)$/) { j++; continue }
            if (tok ~ /^-/) continue
            if (target == "") target = tok
          }
          if (skip) continue
          if (target ~ /\/pull\/[0-9]+/) { sub(/.*\/pull\//, "", target); sub(/[^0-9].*/, "", target) }
          sub(/^#/, "", target)
          if (target == "") print "current"
          else if (target ~ /^[0-9]+$/) print repo "#" target
          else print "branch:" target
        }
      }
    }' | sort -u
}

# describe_target TARGET → the gh pr view arguments that open TARGET's PR.
describe_target() {
  case "$1" in
    current) echo "" ;;
    branch:*) echo " ${1#branch:}" ;;
    \#*) echo " ${1#\#}" ;;
    *) echo " ${1#*#} -R ${1%%#*}" ;;
  esac
}

# block_first_merge SESSION COMMAND → print a deny for the first merge or ready
# of each PR in a session, with the test-plan procedure as the reason. A retry
# goes through: the block puts the procedure in front of Claude once, it does
# not stand between the user and a merge.
block_first_merge() {
  local session="$1" target new_targets=() views="" status reason
  hook_disabled DISABLE_PR_VALIDATION_HOOK && return 0
  if [[ -z "$session" ]]; then
    warn_degraded rules-shadow "no session id in the payload; merge not gated"
    return 0
  fi
  while IFS= read -r target; do
    [[ -z "$target" ]] && continue
    mark_once "$session-$(printf '%s' "$target" | tr -c 'A-Za-z0-9_-' '_')"
    status=$?
    if [[ $status -eq 2 ]]; then
      warn_degraded rules-shadow "cannot write $GATE_STATE_DIR; merge not gated"
      return 0
    fi
    [[ $status -eq 0 ]] && new_targets+=("$target")
  done < <(pr_targets "$2")
  [[ ${#new_targets[@]} -eq 0 ]] && return 0

  for target in "${new_targets[@]}"; do
    views+="   gh pr view$(describe_target "$target") --json body"$'\n'
  done
  reason="PR validation gate: this command was blocked once, so the test plan runs first. Before merging or marking ready:
1. Read the test plan (the '## Test Plan' task list):
${views}2. Run every unchecked item. Check off only items you verified, with gh pr edit --body.
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
      session=$(session_key)
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
