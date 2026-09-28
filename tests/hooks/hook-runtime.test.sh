#!/bin/bash
# Tests for hooks/lib/hook-runtime.sh — the shared hook prelude — plus the one
# behaviour every hook gets from it: running through the ~/.claude/hooks symlink.
# Prelude cases source the lib directly; hook cases run the real hook scripts.
# Run from repo root: bash tests/hooks/hook-runtime.test.sh
set -u

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LIB="$REPO_ROOT/hooks/lib/hook-runtime.sh"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

PASS=0
FAIL=0
FAILED_TESTS=()

pass() { PASS=$((PASS+1)); echo "  PASS: $1"; }
fail() { FAIL=$((FAIL+1)); FAILED_TESTS+=("$1"); echo "  FAIL: $1"; }

assert_eq() {
  local name="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    pass "$name"
  else
    fail "$name (expected='$expected' actual='$actual')"
  fi
}

# disabled_rc HOME PWD [VAR=VALUE...] → hook_disabled's exit code for
# DISABLE_TEST_SWITCH, run in a clean env so the machine's real ~/.claude
# sentinels and any inherited CLAUDE_PROJECT_DIR cannot leak into the result.
disabled_rc() {
  local home="$1" cwd="$2"
  shift 2
  # shellcheck disable=SC2016  # $1/$2 expand in the child shell, not here
  env -i HOME="$home" PATH="$PATH" "$@" bash -c '
    cd "$1" || exit 99
    source "$2"
    hook_disabled DISABLE_TEST_SWITCH
  ' _ "$cwd" "$LIB"
  echo $?
}

echo "── hook_disabled: where a kill switch is looked for ──"

H="$TMP/home"; P="$TMP/project"; C="$TMP/cwd"; O="$TMP/override"
mkdir -p "$H/.claude" "$P/.claude" "$C/.claude" "$O"

assert_eq "no sentinel anywhere → enabled" 1 "$(disabled_rc "$H" "$C")"

touch "$H/.claude/DISABLE_TEST_SWITCH"
assert_eq "global ~/.claude sentinel disables" 0 "$(disabled_rc "$H" "$C")"
rm "$H/.claude/DISABLE_TEST_SWITCH"

touch "$C/.claude/DISABLE_TEST_SWITCH"
assert_eq "cwd .claude sentinel disables" 0 "$(disabled_rc "$H" "$C")"
rm "$C/.claude/DISABLE_TEST_SWITCH"

touch "$P/.claude/DISABLE_TEST_SWITCH"
assert_eq "CLAUDE_PROJECT_DIR sentinel disables from another cwd" 0 \
  "$(disabled_rc "$H" "$C" CLAUDE_PROJECT_DIR="$P")"
rm "$P/.claude/DISABLE_TEST_SWITCH"

touch "$H/.claude/DISABLE_OTHER_SWITCH"
assert_eq "another hook's switch does not disable this one" 1 "$(disabled_rc "$H" "$C")"
rm "$H/.claude/DISABLE_OTHER_SWITCH"

# The override dir replaces every default location. That is what makes it a
# test seam: a real ~/.claude sentinel on the dev machine cannot flip a test.
touch "$O/DISABLE_TEST_SWITCH"
assert_eq "HOOK_SENTINEL_DIR sentinel disables" 0 \
  "$(disabled_rc "$H" "$C" HOOK_SENTINEL_DIR="$O")"
rm "$O/DISABLE_TEST_SWITCH"
touch "$H/.claude/DISABLE_TEST_SWITCH" "$C/.claude/DISABLE_TEST_SWITCH"
assert_eq "HOOK_SENTINEL_DIR set → default locations are ignored" 1 \
  "$(disabled_rc "$H" "$C" HOOK_SENTINEL_DIR="$O")"
rm "$H/.claude/DISABLE_TEST_SWITCH" "$C/.claude/DISABLE_TEST_SWITCH"

echo "── hook_read_input / hook_input_field ──"

# field STDIN FILTER → hook_input_field FILTER over STDIN, in a fresh shell.
field() {
  printf '%s' "$1" | bash -c 'source "$1"; hook_read_input; hook_input_field "$2"' _ "$LIB" "$2"
}

assert_eq "top-level string field" "hello" "$(field '{"prompt":"hello"}' '.prompt')"
assert_eq "nested string field" "git status" \
  "$(field '{"tool_input":{"command":"git status"}}' '.tool_input.command')"
assert_eq "missing field → empty" "" "$(field '{"other":1}' '.prompt')"
assert_eq "object field → compact JSON" '{"a":1}' "$(field '{"tool_input":{"a":1}}' '.tool_input')"
assert_eq "caller default applies" '{}' "$(field '{"x":1}' '.tool_input // {}')"
assert_eq "non-JSON stdin → empty, no error" "" "$(field 'not json at all' '.prompt' 2>&1)"
assert_eq "empty stdin → hook_read_input returns 1" 1 \
  "$(bash -c 'source "$1"; hook_read_input; echo $?' _ "$LIB" </dev/null)"

echo "── hook_log_jsonl: append + rotation ──"

LOG="$TMP/logs/nested/test.log"
bash -c 'source "$1"; hook_log_jsonl "$2" "{\"n\":1}"' _ "$LIB" "$LOG"
assert_eq "first write creates the dir and the file" '{"n":1}' "$(cat "$LOG" 2>/dev/null)"
bash -c 'source "$1"; hook_log_jsonl "$2" "{\"n\":2}"' _ "$LIB" "$LOG"
assert_eq "second write appends one line" 2 "$(wc -l < "$LOG" | tr -d ' ')"

# 11 MB is just over the 10 MB threshold: the next write must move the tail
# (5 MB) to .1 and restart the live log with only the new line.
dd if=/dev/zero of="$LOG" bs=1048576 count=11 2>/dev/null
bash -c 'source "$1"; hook_log_jsonl "$2" "{\"n\":3}"' _ "$LIB" "$LOG"
assert_eq "over-threshold log rotates to .1 keeping a 5 MB tail" 5242880 \
  "$(wc -c < "$LOG.1" 2>/dev/null | tr -d ' ')"
assert_eq "live log restarts with only the new line" '{"n":3}' "$(cat "$LOG")"

echo "── hooks run through a symlink (the link-config install layout) ──"
# link-config links hooks/*.sh into ~/.claude/hooks/ but not hooks/lib/, so a
# hook that looks for lib/ beside its own path finds nothing there.

INSTALLED="$TMP/installed"
EMPTY_SENTINELS="$TMP/no-sentinels"
mkdir -p "$INSTALLED" "$EMPTY_SENTINELS"
for hook in scope-tier-memory-check block-dangerous-git rules-shadow adversarial-trigger; do
  ln -s "$REPO_ROOT/hooks/$hook.sh" "$INSTALLED/$hook.sh"
  # Sourced (as a test would) and executed (as the CLI does): neither may fail
  # to find its libraries. Run from $TMP (not a git repo) so adversarial-trigger
  # stops right after its prelude.
  err=$( cd "$TMP" && HOOK_SENTINEL_DIR="$EMPTY_SENTINELS" RULES_SHADOW_LOG_DIR="$TMP/rs-logs" \
    bash -c 'source "$1" </dev/null' _ "$INSTALLED/$hook.sh" 2>&1 >/dev/null )
  if [[ "$err" == *"No such file"* || "$err" == *"command not found"* ]]; then
    fail "$hook sourced via symlink finds its libs (stderr: $err)"
  else
    pass "$hook sourced via symlink finds its libs"
  fi
  err=$( cd "$TMP" && HOOK_SENTINEL_DIR="$EMPTY_SENTINELS" RULES_SHADOW_LOG_DIR="$TMP/rs-logs" \
    bash "$INSTALLED/$hook.sh" </dev/null 2>&1 >/dev/null )
  if [[ "$err" == *"No such file"* || "$err" == *"command not found"* ]]; then
    fail "$hook executed via symlink finds its libs (stderr: $err)"
  else
    pass "$hook executed via symlink finds its libs"
  fi
done

# Not failing is not the same as working: the security hook must still block.
echo '{"tool_input":{"command":"git reset --hard HEAD~1"}}' \
  | HOOK_SENTINEL_DIR="$EMPTY_SENTINELS" bash "$INSTALLED/block-dangerous-git.sh" >/dev/null 2>&1
assert_eq "symlinked block-dangerous-git still blocks (exit 2)" 2 "$?"

echo "── each hook honors its own kill switch ──"

SENTINELS="$TMP/sentinels"
mkdir -p "$SENTINELS"

touch "$SENTINELS/DISABLE_GIT_GUARDRAILS"
echo '{"tool_input":{"command":"git reset --hard HEAD~1"}}' \
  | HOOK_SENTINEL_DIR="$SENTINELS" bash "$REPO_ROOT/hooks/block-dangerous-git.sh" >/dev/null 2>&1
assert_eq "DISABLE_GIT_GUARDRAILS lets a blocked command through" 0 "$?"

touch "$SENTINELS/DISABLE_RULES_SHADOW"
printf '%s' '{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"gh pr merge 1"}}' \
  | HOOK_SENTINEL_DIR="$SENTINELS" RULES_SHADOW_LOG_DIR="$TMP/rs-off" bash "$REPO_ROOT/hooks/rules-shadow.sh" >/dev/null 2>&1
if [[ -e "$TMP/rs-off/rules-shadow.log" ]]; then
  fail "DISABLE_RULES_SHADOW suppresses logging"
else
  pass "DISABLE_RULES_SHADOW suppresses logging"
fi

echo
echo "────────────────────────────────"
echo "Results: $PASS passed, $FAIL failed"
if [[ "$FAIL" -gt 0 ]]; then
  printf '  %s\n' "${FAILED_TESTS[@]}"
  exit 1
fi
exit 0
