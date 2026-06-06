#!/bin/bash
# Smoke tests for hooks/usage-log.sh.
# Run from repo root: bash tests/hooks/usage-log.test.sh
set -u

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOOK="$REPO_ROOT/hooks/usage-log.sh"
PASS=0
FAIL=0
FAILED_TESTS=()

run_case() {
  local name="$1"
  local stdin_input="$2"
  local expected_log_match="$3"   # substring to match in log file; empty = log unchanged
  local expect_no_log="$4"        # "1" if we expect NO log entry appended
  local expected_exit="$5"
  local setup_cmd="${6:-true}"
  local cleanup_cmd="${7:-true}"

  eval "$setup_cmd"
  local actual_exit
  echo "$stdin_input" | bash "$HOOK" 2>/dev/null
  actual_exit=$?
  eval "$cleanup_cmd"

  local ok=1
  if [[ "$actual_exit" -ne "$expected_exit" ]]; then ok=0; fi

  if [[ $ok -eq 1 ]]; then
    PASS=$((PASS+1))
    echo "  PASS: $name (exit=$actual_exit)"
  else
    FAIL=$((FAIL+1))
    FAILED_TESTS+=("$name (exit=$actual_exit, expected=$expected_exit)")
    echo "  FAIL: $name"
  fi
}

run_case_with_log() {
  local name="$1"
  local stdin_input="$2"
  local expected_log_match="$3"
  local expect_no_new_entry="$4"   # "1" = expect log NOT to have new entry
  local expected_exit="$5"
  local setup_cmd="${6:-true}"
  local cleanup_cmd="${7:-true}"

  eval "$setup_cmd"
  local actual_exit
  local log_before=""
  if [[ -f "$USAGE_LOG" ]]; then
    log_before=$(cat "$USAGE_LOG")
  fi

  echo "$stdin_input" | bash "$HOOK" 2>/dev/null
  actual_exit=$?

  local log_after=""
  if [[ -f "$USAGE_LOG" ]]; then
    log_after=$(cat "$USAGE_LOG")
  fi
  eval "$cleanup_cmd"

  local ok=1
  if [[ "$actual_exit" -ne "$expected_exit" ]]; then ok=0; fi

  if [[ "$expect_no_new_entry" == "1" ]]; then
    if [[ "$log_after" != "$log_before" ]]; then
      ok=0
    fi
  else
    if [[ -n "$expected_log_match" ]] && ! echo "$log_after" | grep -qF "$expected_log_match"; then
      ok=0
    fi
    if [[ "$log_after" == "$log_before" ]]; then
      ok=0
    fi
  fi

  if [[ $ok -eq 1 ]]; then
    PASS=$((PASS+1))
    echo "  PASS: $name"
  else
    FAIL=$((FAIL+1))
    FAILED_TESTS+=("$name (exit=$actual_exit, log_match='$expected_log_match', log_after='$log_after')")
    echo "  FAIL: $name"
  fi
}

# Use a temp dir for USAGE_LOG so tests are isolated
SCRATCH=$(mktemp -d)
export USAGE_LOG="$SCRATCH/usage.jsonl"

# ── Basic exit behavior ────────────────────────────────────────────────────────

# Test 1: empty stdin exits 0 silently, no log entry
run_case_with_log "empty-stdin-no-log" \
  "" "" "1" 0

# Test 2: non-JSON stdin exits 0, no log entry
run_case_with_log "non-json-stdin-no-log" \
  "not json" "" "1" 0

# Test 3: JSON without prompt field exits 0, no log entry
run_case_with_log "missing-prompt-field-no-log" \
  '{"session_id":"abc123"}' "" "1" 0

# ── Leadership slash detection ─────────────────────────────────────────────────

# Test 4: /onboard slash detected — appends log entry with correct skill
run_case_with_log "onboard-slash-logged" \
  '{"prompt":"/onboard new-role","session_id":"sess-001"}' \
  '"skill":"/onboard"' "0" 0

# Test 5: /strategy-doc slash detected
run_case_with_log "strategy-doc-slash-logged" \
  '{"prompt":"/strategy-doc Q3 plan","session_id":"sess-002"}' \
  '"skill":"/strategy-doc"' "0" 0

# Test 6: /stakeholder-map slash detected
run_case_with_log "stakeholder-map-slash-logged" \
  '{"prompt":"/stakeholder-map","session_id":"sess-003"}' \
  '"skill":"/stakeholder-map"' "0" 0

# Test 7: /swot slash detected
run_case_with_log "swot-slash-logged" \
  '{"prompt":"/swot analysis for platform org","session_id":"sess-004"}' \
  '"skill":"/swot"' "0" 0

# Test 8: /1on1-prep slash detected
run_case_with_log "1on1-prep-slash-logged" \
  '{"prompt":"/1on1-prep for Alice","session_id":"sess-005"}' \
  '"skill":"/1on1-prep"' "0" 0

# Test 9: /present slash detected
run_case_with_log "present-slash-logged" \
  '{"prompt":"/present the roadmap","session_id":"sess-006"}' \
  '"skill":"/present"' "0" 0

# Test 10: /architecture-overview slash detected
run_case_with_log "architecture-overview-slash-logged" \
  '{"prompt":"/architecture-overview for payments","session_id":"sess-007"}' \
  '"skill":"/architecture-overview"' "0" 0

# ── Non-leadership slash — no log entry ───────────────────────────────────────

# Test 11: /define-the-problem is not a leadership skill
run_case_with_log "non-leadership-slash-not-logged" \
  '{"prompt":"/define-the-problem start","session_id":"sess-008"}' \
  "" "1" 0

# Test 12: /adr is not a leadership skill
run_case_with_log "adr-slash-not-logged" \
  '{"prompt":"/adr create new decision","session_id":"sess-009"}' \
  "" "1" 0

# Test 13: plain text prompt (no slash) — no log entry
run_case_with_log "plain-text-not-logged" \
  '{"prompt":"help me write a strategy","session_id":"sess-010"}' \
  "" "1" 0

# ── JSONL schema correctness ───────────────────────────────────────────────────

# Test 14: logged line is valid JSON with required fields ts, event, skill, session
SCRATCH2=$(mktemp -d)
export USAGE_LOG="$SCRATCH2/usage.jsonl"
echo '{"prompt":"/onboard context","session_id":"sess-schema-test"}' | bash "$HOOK" 2>/dev/null
LINE=$(tail -1 "$SCRATCH2/usage.jsonl" 2>/dev/null || true)
SCHEMA_OK=1
if ! echo "$LINE" | jq -e '.ts' >/dev/null 2>&1; then SCHEMA_OK=0; fi
if ! echo "$LINE" | jq -e '.event == "skill_invoked"' >/dev/null 2>&1; then SCHEMA_OK=0; fi
if ! echo "$LINE" | jq -e '.skill == "/onboard"' >/dev/null 2>&1; then SCHEMA_OK=0; fi
if ! echo "$LINE" | jq -e '.session' >/dev/null 2>&1; then SCHEMA_OK=0; fi
# Confirm ISO-8601 timestamp shape
if ! echo "$LINE" | jq -r '.ts' 2>/dev/null | grep -qE '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'; then SCHEMA_OK=0; fi
rm -rf "$SCRATCH2"
if [[ $SCHEMA_OK -eq 1 ]]; then
  PASS=$((PASS+1))
  echo "  PASS: jsonl-schema-correct"
else
  FAIL=$((FAIL+1))
  FAILED_TESTS+=("jsonl-schema-correct (line='$LINE')")
  echo "  FAIL: jsonl-schema-correct"
fi
export USAGE_LOG="$SCRATCH/usage.jsonl"

# ── PII / skill-argument content not leaked ───────────────────────────────────

# Test 15: skill argument text must NOT appear in log
SCRATCH3=$(mktemp -d)
export USAGE_LOG="$SCRATCH3/usage.jsonl"
SENSITIVE="secret-project-codename-phoenix"
echo "{\"prompt\":\"/onboard $SENSITIVE\",\"session_id\":\"sess-pii\"}" | bash "$HOOK" 2>/dev/null
LOG_CONTENTS=$(cat "$SCRATCH3/usage.jsonl" 2>/dev/null || true)
rm -rf "$SCRATCH3"
if echo "$LOG_CONTENTS" | grep -qF "$SENSITIVE"; then
  FAIL=$((FAIL+1))
  FAILED_TESTS+=("no-pii-in-log (sensitive text found in log!)")
  echo "  FAIL: no-pii-in-log"
else
  PASS=$((PASS+1))
  echo "  PASS: no-pii-in-log"
fi
export USAGE_LOG="$SCRATCH/usage.jsonl"

# Test 16: session_id appears in log (needed for LE7/RU30 computation)
# but only the session ID field, not the full prompt
SCRATCH4=$(mktemp -d)
export USAGE_LOG="$SCRATCH4/usage.jsonl"
echo '{"prompt":"/onboard","session_id":"my-session-xyz"}' | bash "$HOOK" 2>/dev/null
LOG_CONTENTS=$(cat "$SCRATCH4/usage.jsonl" 2>/dev/null || true)
rm -rf "$SCRATCH4"
if echo "$LOG_CONTENTS" | jq -r '.session' 2>/dev/null | grep -qF "my-session-xyz"; then
  PASS=$((PASS+1))
  echo "  PASS: session-id-preserved"
else
  FAIL=$((FAIL+1))
  FAILED_TESTS+=("session-id-preserved")
  echo "  FAIL: session-id-preserved"
fi
export USAGE_LOG="$SCRATCH/usage.jsonl"

# ── Adversarial: mutate production code would flip these tests ─────────────────
# (Run after all prior tests so SCRATCH is still available as a scratch dir)

# Test 17: multiple invocations append multiple lines (append-only, no overwrite)
SCRATCH5=$(mktemp -d)
export USAGE_LOG="$SCRATCH5/usage.jsonl"
echo '{"prompt":"/onboard","session_id":"s1"}' | bash "$HOOK" 2>/dev/null
echo '{"prompt":"/swot","session_id":"s2"}' | bash "$HOOK" 2>/dev/null
LINE_COUNT=$(wc -l < "$SCRATCH5/usage.jsonl" | tr -d ' ')
rm -rf "$SCRATCH5"
if [[ "$LINE_COUNT" -eq 2 ]]; then
  PASS=$((PASS+1))
  echo "  PASS: append-only-multi-invocation"
else
  FAIL=$((FAIL+1))
  FAILED_TESTS+=("append-only-multi-invocation (line_count=$LINE_COUNT)")
  echo "  FAIL: append-only-multi-invocation"
fi
export USAGE_LOG="$SCRATCH/usage.jsonl"

# ── Cleanup ────────────────────────────────────────────────────────────────────
rm -rf "$SCRATCH"

echo ""
echo "Pass: $PASS, Fail: $FAIL"
if [[ $FAIL -gt 0 ]]; then
  echo "Failed tests:"
  for t in "${FAILED_TESTS[@]}"; do
    echo "  - $t"
  done
  exit 1
fi
exit 0
