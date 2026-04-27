#!/bin/bash
# Smoke tests for block-dangerous-git.sh.
# Run from repo root: bash hooks/test-block-dangerous-git.sh
set -u

HOOK="$(dirname "$0")/block-dangerous-git.sh"
PASS=0
FAIL=0
FAILURES=()

test_block() {
  local cmd="$1"
  local out
  out=$(echo "{\"tool_input\":{\"command\":\"$cmd\"}}" | "$HOOK" 2>&1; echo "EXIT=$?")
  if echo "$out" | grep -q "EXIT=2"; then
    PASS=$((PASS+1))
  else
    FAIL=$((FAIL+1))
    FAILURES+=("expected BLOCK, got allow: $cmd")
  fi
}

test_allow() {
  local cmd="$1"
  local out
  out=$(echo "{\"tool_input\":{\"command\":\"$cmd\"}}" | "$HOOK" 2>&1; echo "EXIT=$?")
  if echo "$out" | grep -q "EXIT=0"; then
    PASS=$((PASS+1))
  else
    FAIL=$((FAIL+1))
    FAILURES+=("expected ALLOW, got block: $cmd")
  fi
}

# --- Block cases ---
test_block "git push --force origin main"
test_block "git push -f origin master"
test_block "git push --force-with-lease origin main"
test_block "git commit --no-verify -m x"
test_block "git rebase --no-verify origin/main"
test_block "git push --no-verify origin feature/x"
test_block "git commit --no-gpg-sign -m x"
test_block "git reset --hard HEAD~3"
test_block "git clean -fd"
test_block "git clean -f"
test_block "git branch -D feature/x"
test_block "git checkout ."
test_block "git restore ."

# --- Allow cases ---
test_allow "git push origin feature/foo"
test_allow "git push --force origin feature/foo"
test_allow "git commit -m x"
test_allow "git rebase origin/main"
test_allow "git status"
test_allow "git reset HEAD~1"
test_allow "git checkout main"
test_allow "git branch -d feature/x"
test_allow "ls -la"

echo "PASS=$PASS FAIL=$FAIL"
if [[ $FAIL -gt 0 ]]; then
  printf '  - %s\n' "${FAILURES[@]}"
  exit 1
fi
