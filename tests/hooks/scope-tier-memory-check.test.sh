#!/bin/bash
# Smoke tests for scope-tier-memory-check.sh.
# Run from repo root: bash tests/hooks/scope-tier-memory-check.test.sh
set -u

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOOK="$REPO_ROOT/hooks/scope-tier-memory-check.sh"
PASS=0
FAIL=0
FAILED_TESTS=()

VALID_PROMPT='{"prompt":"implement a small feature for me"}'

setup_memory_fixture_positive() {
  local dir="$1"
  mkdir -p "$dir/.claude/projects/-Users-cantu-repos-claude-config/memory"
  cat > "$dir/.claude/projects/-Users-cantu-repos-claude-config/memory/MEMORY.md" <<'EOF'
# Memory Index

- [feedback_right_size_ceremony](feedback_right_size_ceremony.md) — Right-size pipeline ceremony to feature size: small/mechanical changes should skip DTP/SA/brainstorm/FMS
EOF
}

setup_memory_fixture_negative() {
  local dir="$1"
  mkdir -p "$dir/.claude/projects/-Users-cantu-repos-claude-config/memory"
  cat > "$dir/.claude/projects/-Users-cantu-repos-claude-config/memory/MEMORY.md" <<'EOF'
# Memory Index

- [Other memory](other.md) — Some unrelated thing
EOF
}

run_case() {
  local name="$1"
  local stdin_input="$2"
  local expected_stdout="$3"      # substring match; empty = no output expected
  local expected_exit="$4"
  local setup_cmd="${5:-true}"
  local cleanup_cmd="${6:-true}"

  eval "$setup_cmd"
  local actual_stdout actual_exit
  actual_stdout=$(echo "$stdin_input" | bash "$HOOK" 2>&1)
  actual_exit=$?
  eval "$cleanup_cmd"

  local ok=1
  if [[ -n "$expected_stdout" ]] && [[ "$actual_stdout" != *"$expected_stdout"* ]]; then ok=0; fi
  if [[ -z "$expected_stdout" ]] && [[ -n "$actual_stdout" ]]; then ok=0; fi
  if [[ "$actual_exit" -ne "$expected_exit" ]]; then ok=0; fi

  if [[ $ok -eq 1 ]]; then
    PASS=$((PASS+1))
    echo "  PASS: $name"
  else
    FAIL=$((FAIL+1))
    FAILED_TESTS+=("$name (stdout='$actual_stdout', exit=$actual_exit)")
    echo "  FAIL: $name"
  fi
}

# Test 1: project-local sentinel suppresses
SCRATCH_DIR=$(mktemp -d)
run_case "sentinel-project-local-suppresses" \
  "$VALID_PROMPT" \
  "" \
  0 \
  "mkdir -p '$SCRATCH_DIR/.claude' && touch '$SCRATCH_DIR/.claude/DISABLE_PRESSURE_FLOOR' && cd '$SCRATCH_DIR'" \
  "cd - > /dev/null; rm -rf '$SCRATCH_DIR'"

# Test 2: global sentinel suppresses (snapshot/restore the real file if present)
USER_SENTINEL="${HOME}/.claude/DISABLE_PRESSURE_FLOOR"
USER_SENTINEL_SNAP="/tmp/scope-tier-test-sentinel-snap-$$"
SENTINEL_EXISTED=0
if [[ -f "$USER_SENTINEL" ]]; then
  SENTINEL_EXISTED=1
  cp "$USER_SENTINEL" "$USER_SENTINEL_SNAP"
fi

run_case "sentinel-global-suppresses" \
  "$VALID_PROMPT" \
  "" \
  0 \
  "touch '$USER_SENTINEL'" \
  "if [[ $SENTINEL_EXISTED -eq 1 ]]; then mv '$USER_SENTINEL_SNAP' '$USER_SENTINEL'; else rm -f '$USER_SENTINEL'; fi"

# Test 3: empty stdin exits gracefully
run_case "empty-stdin-graceful-exit" \
  "" \
  "" \
  0

# Test 4: non-JSON stdin exits gracefully
run_case "non-json-stdin-graceful-exit" \
  "not json at all" \
  "" \
  0

# Test 5: missing prompt field exits gracefully
run_case "missing-prompt-field-graceful-exit" \
  '{"other":"field"}' \
  "" \
  0

# Test 6: no MEMORY.md exits silently (cd to empty tmp dir)
EMPTY_DIR=$(mktemp -d)
run_case "no-memory-md-exits-silently" \
  "$VALID_PROMPT" \
  "" \
  0 \
  "cd '$EMPTY_DIR'" \
  "cd - > /dev/null; rm -rf '$EMPTY_DIR'"

# Test 7: MEMORY.md with scope-tier entry — hook reads without crashing, exits 0
TMPDIR_MEM=$(mktemp -d)
run_case "memory-md-readable-no-crash" \
  '{"prompt":"prune lib/foo.ts"}' \
  "" \
  0 \
  "setup_memory_fixture_positive '$TMPDIR_MEM' && export CLAUDE_PROJECT_DIR='$TMPDIR_MEM'" \
  "unset CLAUDE_PROJECT_DIR; rm -rf '$TMPDIR_MEM'"

# Test 8: MEMORY.md without scope-tier keyword — exits silently
TMPDIR_MEM2=$(mktemp -d)
run_case "memory-md-no-scope-tier-keyword-exits-silently" \
  '{"prompt":"prune lib/foo.ts"}' \
  "" \
  0 \
  "setup_memory_fixture_negative '$TMPDIR_MEM2' && export CLAUDE_PROJECT_DIR='$TMPDIR_MEM2'" \
  "unset CLAUDE_PROJECT_DIR; rm -rf '$TMPDIR_MEM2'"

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
