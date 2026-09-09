#!/bin/bash
# Unit tests for hooks/lib/preflight.sh — the shared dependency preflight.
# Sources the helper and exercises require_cmd / warn_degraded directly.
# Run from repo root: bash tests/hooks/preflight.test.sh
set -u

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HELPER="$REPO_ROOT/hooks/lib/preflight.sh"

# shellcheck source=/dev/null
source "$HELPER"

PASS=0
FAIL=0
FAILURES=()

pass() { PASS=$((PASS+1)); echo "  PASS: $1"; }
fail() { FAIL=$((FAIL+1)); FAILURES+=("$1"); echo "  FAIL: $1"; }

# require_cmd on a present command → 0, no stderr.
if err=$(require_cmd jq 2>&1) && [[ -z "$err" ]]; then
  pass "require_cmd jq → 0, silent"
else
  fail "require_cmd jq should return 0 with no stderr (rc=$?, err='$err')"
fi

# require_cmd on an absent command → 1, loud stderr.
err=$(require_cmd definitely-not-a-real-command-xyz 2>&1); rc=$?
if [[ $rc -eq 1 ]] && echo "$err" | grep -q "missing required command"; then
  pass "require_cmd <absent> → 1 + stderr warning"
else
  fail "require_cmd <absent> should return 1 with a warning (rc=$rc, err='$err')"
fi

# warn_degraded → loud stderr line naming the hook.
err=$(warn_degraded my-hook "jq not on PATH" 2>&1)
if echo "$err" | grep -q "\[hook-degraded\] my-hook: jq not on PATH"; then
  pass "warn_degraded → named stderr line"
else
  fail "warn_degraded should emit a named stderr line (err='$err')"
fi

echo ""
echo "Pass: $PASS, Fail: $FAIL"
if [[ $FAIL -gt 0 ]]; then
  echo "Failed tests:"
  for t in "${FAILURES[@]}"; do echo "  - $t"; done
  exit 1
fi
exit 0
