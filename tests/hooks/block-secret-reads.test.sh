#!/bin/bash
# Smoke tests for block-secret-reads.sh.
# Run from repo root: bash tests/hooks/block-secret-reads.test.sh
set -u

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOOK="$REPO_ROOT/hooks/block-secret-reads.sh"
PASS=0
FAIL=0
FAILURES=()

# Build the payload with jq so commands with quotes stay valid JSON.
run_hook() {
  jq -n --arg c "$1" '{tool_input:{command:$c}}' | HOOK_SENTINEL_DIR="${2:-/nonexistent}" "$HOOK" >/dev/null 2>&1
  echo $?
}

test_block() {
  if [[ "$(run_hook "$1")" == 2 ]]; then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); FAILURES+=("expected BLOCK, got allow: $1"); fi
}

test_allow() {
  if [[ "$(run_hook "$1")" == 0 ]]; then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); FAILURES+=("expected ALLOW, got block: $1"); fi
}

# --- Block: .env files ---
test_block "cat .env"
test_block "cat ./.env"
test_block "head -5 .env.local"
test_block "grep KEY apps/web/.env"
test_block "source .env && echo \$KEY"
test_block "cp .env /tmp/x"
test_block "less '.env.production'"

# --- Block: SSH keys ---
test_block "cat ~/.ssh/id_ed25519"
test_block "ls \$HOME/.ssh"
test_block "tar czf k.tgz /Users/me/.ssh/"
test_block "cat \${HOME}/.ssh/config"

# --- Block: credentials/ directories ---
test_block "cat credentials/gmail-client-secret.json"
test_block "ls ./credentials/"
test_block "base64 config/credentials/key.json"

# --- Allow: look-alikes that are not secrets ---
test_allow "ls -la"
test_allow "cat README.md"
test_allow "bun run env-check"
test_allow "cat src/environment.ts"
test_allow "echo \$PATH"
test_allow "ssh-keygen -l -f key.pub"
test_allow "git status"
test_allow "cat docs/credentials.md"

# --- Kill switch: sentinel file disables the hook ---
sentinel_dir=$(mktemp -d)
touch "$sentinel_dir/DISABLE_SECRET_GUARD"
if [[ "$(run_hook "cat .env" "$sentinel_dir")" == 0 ]]; then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); FAILURES+=("kill switch did not disable the hook"); fi
rm -rf "$sentinel_dir"

# --- Malformed input never crashes into an allow-by-error ---
if [[ "$(echo 'not json' | HOOK_SENTINEL_DIR=/nonexistent "$HOOK" >/dev/null 2>&1; echo $?)" == 0 ]]; then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); FAILURES+=("non-JSON input should exit 0 (nothing to scan)"); fi

echo "PASS: $PASS  FAIL: $FAIL"
for f in ${FAILURES[@]+"${FAILURES[@]}"}; do echo "  $f"; done
[[ $FAIL -eq 0 ]]
