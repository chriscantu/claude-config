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

echo
echo "────────────────────────────────"
echo "Results: $PASS passed, $FAIL failed"
if [[ "$FAIL" -gt 0 ]]; then
  printf '  %s\n' "${FAILED_TESTS[@]}"
  exit 1
fi
exit 0
