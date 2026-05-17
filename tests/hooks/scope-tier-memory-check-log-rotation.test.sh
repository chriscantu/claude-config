#!/bin/bash
# Rotation test for scope-tier-memory-check.sh log infrastructure.
# Run from repo root: bash tests/hooks/scope-tier-memory-check-log-rotation.test.sh
set -u

HOOK="$(cd "$(dirname "$0")/../.." && pwd)/hooks/scope-tier-memory-check.sh"
TMP_LOG_DIR=$(mktemp -d)
export SCOPE_TIER_LOG_DIR="$TMP_LOG_DIR"
LOG_FILE="$TMP_LOG_DIR/scope-tier-hook.log"
ROTATED="$TMP_LOG_DIR/scope-tier-hook.log.1"

# Positive memory fixture so MATCHED_MEMORIES is populated.
setup_memory() {
  local dir="$1"
  mkdir -p "$dir/.claude/projects/-Users-cantu-repos-claude-config/memory"
  cat > "$dir/.claude/projects/-Users-cantu-repos-claude-config/memory/MEMORY.md" <<'EOF'
# Memory Index

- [feedback_right_size_ceremony](feedback_right_size_ceremony.md) — Right-size pipeline ceremony to feature size: small/mechanical changes should skip DTP/SA/brainstorm/FMS
EOF
}

# shellcheck disable=SC2329  # cleanup is invoked via trap, not directly
cleanup() { rm -rf "$TMP_LOG_DIR"; }
trap cleanup EXIT

# ── Test 1: first run creates the log file ──────────────────────────────────

MEM_DIR=$(mktemp -d)
setup_memory "$MEM_DIR"
export CLAUDE_PROJECT_DIR="$MEM_DIR"
echo '{"prompt":"prune lib/foo.ts"}' | bash "$HOOK" >/dev/null 2>&1
unset CLAUDE_PROJECT_DIR
rm -rf "$MEM_DIR"

if [[ ! -f "$LOG_FILE" ]]; then
  echo "FAIL: log file not created at $LOG_FILE"
  exit 1
fi
echo "  PASS: log file created on first run"

# ── Test 2: rotation triggers above 10 MB threshold ────────────────────────

# Fabricate an 11 MB log file to trigger rotation.
dd if=/dev/zero of="$LOG_FILE" bs=1M count=11 2>/dev/null

MEM_DIR2=$(mktemp -d)
setup_memory "$MEM_DIR2"
export CLAUDE_PROJECT_DIR="$MEM_DIR2"
echo '{"prompt":"prune lib/foo.ts"}' | bash "$HOOK" >/dev/null 2>&1
unset CLAUDE_PROJECT_DIR
rm -rf "$MEM_DIR2"

if [[ ! -f "$ROTATED" ]]; then
  echo "FAIL: log not rotated to $ROTATED after 11 MB file"
  exit 1
fi
echo "  PASS: rotated file $ROTATED exists"

new_size=$(stat -f%z "$LOG_FILE" 2>/dev/null || stat -c%s "$LOG_FILE" 2>/dev/null || echo 99999999)
if [[ "$new_size" -gt 5242880 ]]; then
  echo "FAIL: live log $new_size bytes after rotation; expected ≤ 5 MB (5242880 bytes)"
  exit 1
fi
echo "  PASS: live log $new_size bytes ≤ 5 MB after rotation"

echo ""
echo "PASS: log rotation triggers above 10 MB threshold"
exit 0
