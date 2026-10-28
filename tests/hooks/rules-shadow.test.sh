#!/bin/bash
# Integration tests for the Phase 1 shadow hook adapter.
# Feeds synthetic hook payloads on stdin and asserts what lands in the log.
# Run from repo root: bash tests/hooks/rules-shadow.test.sh
set -u

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOOK="$REPO_ROOT/hooks/rules-shadow.sh"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
export RULES_SHADOW_LOG_DIR="$TMP/logs"
LOG="$RULES_SHADOW_LOG_DIR/rules-shadow.log"
# Keep the real ~/.claude kill switches and the real gate state out of every test.
export HOOK_SENTINEL_DIR="$TMP/sentinels"
export RULES_GATE_STATE_DIR="$TMP/gate-state"
mkdir -p "$HOOK_SENTINEL_DIR"

PASS=0
FAIL=0
FAILED_TESTS=()

assert_eq() {
  local name="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    PASS=$((PASS+1)); echo "  PASS: $name"
  else
    FAIL=$((FAIL+1)); FAILED_TESTS+=("$name (expected='$expected' actual='$actual')")
    echo "  FAIL: $name (expected='$expected' actual='$actual')"
  fi
}

# run_hook JSON → feed JSON on stdin, echo the hook's exit code.
run_hook() {
  printf '%s' "$1" | bash "$HOOK" >/dev/null 2>&1
  echo $?
}

# last_field KEY → value of KEY in the most recent log line.
last_field() { tail -1 "$LOG" 2>/dev/null | jq -r ".$1"; }

reset_log() { rm -f "$LOG"; }

echo "── PreToolUse: Bash → pr-validation ──"

reset_log
assert_eq "exits 0 on a firing command" 0 \
  "$(run_hook '{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"gh pr merge 529 --squash"}}')"
assert_eq "logs the gate" pr-validation "$(last_field gate)"
assert_eq "logs the verdict" fire "$(last_field verdict)"
assert_eq "logs the surface" pretooluse_bash "$(last_field surface)"
assert_eq "logs the trigger" action "$(last_field trigger)"

reset_log
run_hook '{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"git status"}}' >/dev/null
assert_eq "non-firing command still logs a verdict" no_fire "$(last_field verdict)"

echo "── PreToolUse: Task/Skill → execution-mode ──"

reset_log
run_hook '{"hook_event_name":"PreToolUse","tool_name":"Task","tool_input":{"subagent_type":"general-purpose","description":"Implement Task 1"}}' >/dev/null
assert_eq "task dispatch logs execution-mode" execution-mode "$(last_field gate)"
assert_eq "implementer dispatch fires" fire "$(last_field verdict)"
assert_eq "task dispatch surface" pretooluse_task "$(last_field surface)"

reset_log
run_hook '{"hook_event_name":"PreToolUse","tool_name":"Agent","tool_input":{"subagent_type":"pr-review-toolkit:code-reviewer","description":"Code review PR 532"}}' >/dev/null
assert_eq "reviewer dispatch still logs a verdict" no_fire "$(last_field verdict)"

echo "── Stop → pr-validation speech acts ──"

TRANSCRIPT="$TMP/transcript.jsonl"
cat > "$TRANSCRIPT" <<'JSONL'
{"type":"user","message":{"content":[{"type":"text","text":"do the thing"}]}}
{"type":"assistant","message":{"content":[{"type":"text","text":"Partway there; two tests still fail."}]}}
{"type":"assistant","message":{"content":[{"type":"text","text":"All green now. This is ready to merge."}]}}
JSONL

reset_log
# Assigned, not inlined: bash brace-expands a literal {"a":"b","c":"d"} on the
# comma and hands the hook two fragments instead of one JSON object.
stop_payload="{\"hook_event_name\":\"Stop\",\"transcript_path\":\"$TRANSCRIPT\"}"
assert_eq "exits 0 on Stop" 0 "$(run_hook "$stop_payload")"
assert_eq "reads the LAST assistant message" fire "$(last_field verdict)"
assert_eq "stop surface is labelled" stop "$(last_field surface)"

cat > "$TRANSCRIPT" <<'JSONL'
{"type":"assistant","message":{"content":[{"type":"text","text":"This is not ready to merge yet."}]}}
JSONL
reset_log
stop_payload="{\"hook_event_name\":\"Stop\",\"transcript_path\":\"$TRANSCRIPT\"}"
run_hook "$stop_payload" >/dev/null
assert_eq "negated readiness claim does not fire" no_fire "$(last_field verdict)"

# The CLI hands Stop the final text as last_assistant_message. The transcript
# can lag it — eval sessions on 2026-09-24 ran this hook and logged nothing —
# so the field wins whenever it is present.
cat > "$TRANSCRIPT" <<'JSONL'
{"type":"assistant","message":{"content":[{"type":"text","text":"Still working on it."}]}}
JSONL
reset_log
stop_payload="{\"hook_event_name\":\"Stop\",\"transcript_path\":\"$TRANSCRIPT\",\"last_assistant_message\":\"All green. This is ready to merge.\"}"
run_hook "$stop_payload" >/dev/null
assert_eq "last_assistant_message wins over a lagging transcript" fire "$(last_field verdict)"

reset_log
stop_payload="{\"hook_event_name\":\"Stop\",\"transcript_path\":\"$TMP/missing.jsonl\",\"last_assistant_message\":\"This is ready to merge.\"}"
run_hook "$stop_payload" >/dev/null
assert_eq "last_assistant_message works with no transcript at all" fire "$(last_field verdict)"

echo "── installed layout: hook run through a symlink ──"
# link-config installs ~/.claude/hooks/rules-shadow.sh as a symlink with no lib/
# beside it. The hook must find its libraries next to the real file.

mkdir -p "$TMP/installed"
ln -s "$HOOK" "$TMP/installed/rules-shadow.sh"
reset_log
printf '%s' '{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"gh pr merge 1"}}' \
  | bash "$TMP/installed/rules-shadow.sh" >/dev/null 2>&1
assert_eq "symlinked hook still logs a verdict" fire "$(last_field verdict)"

echo "── privacy: no payload text reaches the log ──"

reset_log
run_hook '{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"gh pr merge 529 --body SECRETTOKEN"}}' >/dev/null
if grep -q "SECRETTOKEN" "$LOG"; then
  FAIL=$((FAIL+1)); FAILED_TESTS+=("payload text leaked into the log")
  echo "  FAIL: payload text leaked into the log"
else
  PASS=$((PASS+1)); echo "  PASS: payload text never reaches the log"
fi
assert_eq "payload is hashed instead" 16 "$(last_field payload_hash | tr -d '\n' | wc -c | tr -d ' ')"

echo "── degradation and kill-switch ──"

reset_log
assert_eq "malformed stdin exits 0" 0 "$(run_hook 'not json at all')"
assert_eq "missing transcript exits 0" 0 \
  "$(run_hook '{"hook_event_name":"Stop","transcript_path":"/nonexistent/path.jsonl"}')"
assert_eq "unhandled event exits 0" 0 \
  "$(run_hook '{"hook_event_name":"SessionStart"}')"

reset_log
SENTINEL="$TMP/DISABLE_RULES_SHADOW"
touch "$SENTINEL"
RULES_SHADOW_SENTINEL="$SENTINEL" \
  printf '%s' '{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"gh pr merge 1"}}' \
  | RULES_SHADOW_SENTINEL="$SENTINEL" bash "$HOOK" >/dev/null 2>&1
assert_eq "sentinel suppresses logging" "" "$(cat "$LOG" 2>/dev/null)"

echo "── Phase 2: enforcement ──"
# Phase 2 unlinks execution-mode.md and trims pr-validation.md, so the hook now
# acts: guidance on an implementer dispatch, a block on the first merge or ready
# per PR. Each lever has its own kill switch, apart from the logging sentinel.

# hook_output JSON → the hook's stdout.
hook_output() { printf '%s' "$1" | bash "$HOOK" 2>/dev/null; }
# output_field JSON FILTER → FILTER over the hook's stdout, "" when it printed nothing.
output_field() { hook_output "$1" | jq -r "$2 // empty" 2>/dev/null; }

# dispatch SESSION DESCRIPTION → PreToolUse payload for an Agent dispatch.
dispatch() {
  printf '{"hook_event_name":"PreToolUse","session_id":"%s","tool_name":"Agent","tool_input":{"subagent_type":"general-purpose","description":"%s"}}' "$1" "$2"
}
# bash_call SESSION COMMAND → PreToolUse payload for a Bash call.
bash_call() {
  jq -n -c --arg s "$1" --arg c "$2" '{hook_event_name:"PreToolUse",session_id:$s,tool_name:"Bash",tool_input:{command:$c}}'
}
# decision SESSION COMMAND → "deny" when the hook blocks the command, "" when it lets it run.
decision() { output_field "$(bash_call "$1" "$2")" '.hookSpecificOutput.permissionDecision'; }
# guidance SESSION DESCRIPTION → how many lines of the injected text name the rule (0 when none).
guidance() { output_field "$(dispatch "$1" "$2")" '.hookSpecificOutput.additionalContext' | grep -c 'Execution Mode Selection'; }

echo "  · execution-mode guidance"
assert_eq "implementer dispatch gets the execution-mode rule" 1 "$(guidance e1 'Implement Task 1')"
assert_eq "the rule comes once per session" 0 "$(guidance e1 'Implement Task 2')"
assert_eq "a new session gets it again" 1 "$(guidance e2 'Implement Task 1')"
assert_eq "implementer dispatch is not blocked" "" \
  "$(output_field "$(dispatch e3 'Implement Task 1')" '.hookSpecificOutput.permissionDecision')"
assert_eq "reviewer dispatch gets nothing" "" "$(hook_output "$(dispatch e4 'Review Task 1 (spec + quality)')")"
assert_eq "injected text says to announce before the next dispatch" 1 \
  "$(output_field "$(dispatch e5 'Implement Task 1')" '.hookSpecificOutput.additionalContext' | grep -c 'before the next dispatch')"

echo "  · merge/ready gate"
# The block is keyed on the exact command text: each distinct merge/ready
# command is blocked once per session, and an identical retry goes through.
assert_eq "first merge command is blocked" deny "$(decision m1 'gh pr merge 7 --squash')"
assert_eq "identical retry is allowed" "" "$(decision m1 'gh pr merge 7 --squash')"
assert_eq "a different command is blocked" deny "$(decision m1 'gh pr ready 8')"
assert_eq "the same command in a new session is blocked again" deny "$(decision m2 'gh pr merge 7 --squash')"
assert_eq "a plain command is never blocked" "" "$(decision m1 'git status')"
# Known cost: changing the command, even for the same PR, blocks again.
assert_eq "a changed command for the same PR is blocked again" deny \
  "$(decision m1 'gh pr merge 7 --squash --delete-branch')"

reason=$(output_field "$(bash_call m3 'gh pr merge 7 --squash')" '.hookSpecificOutput.permissionDecisionReason')
assert_eq "block reason gives the test-plan command" 1 "$(grep -c 'gh pr view <PR> --json body' <<<"$reason")"
procedure=$(sed -n 's/^Full procedure: //p' <<<"$reason")
procedure_readable=no
[[ -r "$procedure" ]] && procedure_readable=yes
assert_eq "block reason points at a procedure file that exists" yes "$procedure_readable"

# Forms that broke the per-PR parser this design replaced: each is its own command.
assert_eq "-m merge is blocked" deny "$(decision m4 'gh pr merge -m 12')"
assert_eq "a second -m merge of another PR is blocked" deny "$(decision m4 'gh pr merge -m 13')"
# shellcheck disable=SC2016  # the backticks are the command under test
assert_eq "backtick invocation is blocked" deny "$(decision m4 'x=`gh pr merge 14`')"
assert_eq "uppercase GH is blocked" deny "$(decision m4 'GH pr merge 15')"
assert_eq "line continuation is blocked" deny "$(decision m4 $'gh pr merge \\\n 16')"

# Known miss, by design: identical text that acts on a different PR, such as
# `gh pr merge $N` run again after N changed, counts as a retry.

echo "  · degraded paths"
no_session='{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"gh pr merge 50"}}'
with_transcript='{"hook_event_name":"PreToolUse","transcript_path":"/tmp/t-abc.jsonl","tool_name":"Bash","tool_input":{"command":"gh pr merge 51"}}'
assert_eq "no session id and no transcript: not blocked" "" "$(hook_output "$no_session")"
assert_eq "...and says so on stderr" 1 \
  "$(printf '%s' "$no_session" | bash "$HOOK" 2>&1 >/dev/null | grep -c 'no session id')"
assert_eq "no session id: keys on the transcript path" deny \
  "$(output_field "$with_transcript" '.hookSpecificOutput.permissionDecision')"
assert_eq "unwritable state dir fails open" "" \
  "$(bash_call f1 'gh pr merge 60' | RULES_GATE_STATE_DIR=/dev/null/x bash "$HOOK" 2>/dev/null)"
assert_eq "...and says so on stderr" 1 \
  "$(bash_call f1 'gh pr merge 60' | RULES_GATE_STATE_DIR=/dev/null/x bash "$HOOK" 2>&1 >/dev/null | grep -c 'merge/ready not gated')"

echo "  · kill switches"
touch "$HOOK_SENTINEL_DIR/DISABLE_EXECUTION_MODE_HOOK"
assert_eq "execution-mode kill switch stops the guidance" "" "$(hook_output "$(dispatch k1 'Implement Task 1')")"
assert_eq "execution-mode kill switch leaves the merge gate on" deny "$(decision k1 'gh pr merge 9')"
rm "$HOOK_SENTINEL_DIR/DISABLE_EXECUTION_MODE_HOOK"
assert_eq "switching it back on restores the guidance" 1 "$(guidance k1 'Implement Task 1')"

touch "$HOOK_SENTINEL_DIR/DISABLE_RULES_SHADOW"
assert_eq "whole-hook kill switch stops the merge block" "" "$(decision k0 'gh pr merge 70')"
assert_eq "whole-hook kill switch stops the guidance" "" "$(hook_output "$(dispatch k0 'Implement Task 1')")"
rm "$HOOK_SENTINEL_DIR/DISABLE_RULES_SHADOW"

touch "$HOOK_SENTINEL_DIR/DISABLE_PR_VALIDATION_HOOK"
assert_eq "pr-validation kill switch stops the block" "" "$(decision k2 'gh pr merge 10')"
rm "$HOOK_SENTINEL_DIR/DISABLE_PR_VALIDATION_HOOK"
assert_eq "switching it back on restores the block" deny "$(decision k2 'gh pr merge 10')"

# The eval runner sets RULES_SHADOW_SENTINEL to keep eval events out of the log.
# Phase 2 evals must still run with enforcement on.
reset_log
assert_eq "logging sentinel leaves enforcement on" deny \
  "$(bash_call s5 'gh pr merge 11' | RULES_SHADOW_SENTINEL="$SENTINEL" bash "$HOOK" 2>/dev/null \
     | jq -r '.hookSpecificOutput.permissionDecision')"
assert_eq "logging sentinel still suppresses logging" "" "$(cat "$LOG" 2>/dev/null)"

echo
echo "────────────────────────────────"
echo "Results: $PASS passed, $FAIL failed"
if [[ "$FAIL" -gt 0 ]]; then
  printf '  %s\n' "${FAILED_TESTS[@]}"
  exit 1
fi
exit 0
