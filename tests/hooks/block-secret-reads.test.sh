#!/bin/bash
# Smoke tests for block-secret-reads.sh.
# Run from repo root: bash tests/hooks/block-secret-reads.test.sh
set -u

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOOK="$REPO_ROOT/hooks/block-secret-reads.sh"
PASS=0
FAIL=0
FAILURES=()

# An empty HOME keeps a developer's real ~/.claude off switch from hiding
# failures.
EMPTY_HOME=$(mktemp -d)
trap 'rm -rf "$EMPTY_HOME"' EXIT

# Build the payload with jq so commands with quotes stay valid JSON.
run_hook() {
  jq -n --arg c "$1" '{tool_input:{command:$c}}' | HOME="$EMPTY_HOME" "$HOOK" >/dev/null 2>&1
  echo $?
}

# expect_exit ACTUAL EXPECTED MESSAGE: count a pass, or record MESSAGE as a failure.
expect_exit() {
  if [[ "$1" == "$2" ]]; then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); FAILURES+=("$3"); fi
}

test_block() {
  expect_exit "$(run_hook "$1")" 2 "expected BLOCK, got allow: ${1:0:80}"
}

test_allow() {
  expect_exit "$(run_hook "$1")" 0 "expected ALLOW, got block: ${1:0:80}"
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

# --- Block: forms that slipped past the first version ---
test_block 'cat .env*'
test_block 'cat .en?'
# shellcheck disable=SC2016 # literal backticks: the hook must see them unexpanded
test_block 'cat `echo .env`'
test_block 'cat {.env,x}'
test_block 'grep KEY .env-local'
test_block 'cat .env.production.local'
test_block 'cat .ENV'
test_block 'cat CREDENTIALS/key.json'
test_block 'cat ~/".ssh"/id_rsa'
test_block 'cd ~ && cat .ssh/id_rsa'

# --- Block: names split by quotes or a backslash, which bash joins back ---
test_block "cat '.e'nv"
test_block 'cat ".e""nv"'
test_block 'cat .e\nv'
test_block 'cat .\env'
test_block 'touch ~/.claude/DISABLE_SECRET_GUAR\D'
test_block 'git show HEAD:.env'

# --- Block: env templates are named too; the deny rule blocks them anyway ---
test_block 'cat .env.example'
test_block 'cp .env.example .env'

# --- Block: the model must not be able to switch the guard off ---
test_block 'touch ~/.claude/DISABLE_SECRET_GUARD'
test_block 'touch .claude/DISABLE_SECRET_GUARD'

# --- Allow: more look-alikes ---
test_allow 'direnv allow .envrc'
test_allow 'ls ~/.sshrc-notes'

# --- Long commands: grep -q used to close the pipe early, and pipefail read
# the SIGPIPE as "no match" ---
long_cmd="cat .env"$'\n'"$(head -c 200000 /dev/zero | tr '\0' 'x' | fold -w 100)"
test_block "$long_cmd"

# --- Off switch: only ~/.claude counts ---
# A project-local file must not count, because the model can create one in the
# working folder. HOOK_SENTINEL_DIR, the other hooks' test override, must not
# count either: a session's env settings could point it anywhere.
off_home=$(mktemp -d)
off_proj=$(mktemp -d)
mkdir -p "$off_home/.claude" "$off_proj/.claude"
run_unsandboxed() {
  (cd "$off_proj" && jq -n --arg c "cat .env" '{tool_input:{command:$c}}' \
    | HOOK_SENTINEL_DIR="$off_proj/.claude" HOME="$off_home" CLAUDE_PROJECT_DIR="$off_proj" "$HOOK" >/dev/null 2>&1; echo $?)
}
touch "$off_proj/.claude/DISABLE_SECRET_GUARD"
expect_exit "$(run_unsandboxed)" 2 "project-local or HOOK_SENTINEL_DIR off switch disabled the hook"
touch "$off_home/.claude/DISABLE_SECRET_GUARD"
expect_exit "$(run_unsandboxed)" 0 "home-folder off switch did not disable the hook"
rm -rf "$off_home" "$off_proj"

# --- Input jq can't parse is scanned as raw text, not waved through ---
raw_exit() { printf '%s' "$1" | HOME="$EMPTY_HOME" "$HOOK" >/dev/null 2>&1; echo $?; }
expect_exit "$(raw_exit 'not json')" 0 "non-JSON input with no secret should be allowed"
expect_exit "$(raw_exit 'not json cat .env')" 2 "non-JSON input naming .env should be blocked"
expect_exit "$(raw_exit '{"tool_input":{"command":"cat .env"}')" 2 "truncated JSON naming .env should be blocked"
# A byte that isn't valid UTF-8 must not switch the patterns off in a UTF-8
# locale.
expect_exit "$(printf '{"tool_input":{"command":"echo \xff; cat .env"' | LC_ALL=en_US.UTF-8 HOME="$EMPTY_HOME" "$HOOK" >/dev/null 2>&1; echo $?)" 2 "invalid UTF-8 byte let a raw-scanned .env read through"

# --- Without jq the hook scans the raw payload. JSON escapes quotes as \", so
# the patterns must accept a backslash beside the path ---
nojq_bin=$(mktemp -d)
for tool in bash cat dirname readlink tr; do ln -s "$(command -v "$tool")" "$nojq_bin/$tool"; done
nojq_exit() {
  local payload
  payload=$(jq -n --arg c "$1" '{tool_input:{command:$c}}')
  printf '%s' "$payload" | PATH="$nojq_bin" HOME="$EMPTY_HOME" "$HOOK" >/dev/null 2>&1
  echo $?
}
# JSON writes a tab or newline as \t or \n, so in the raw payload the separator
# before .env is a letter.
for c in 'cat .env' 'cat ".env"' "cat '.env'" $'cat\t.env' $'cd /x\n.env' $'tar\tcredentials/'; do
  expect_exit "$(nojq_exit "$c")" 2 "no-jq scan let through: $c"
done
expect_exit "$(nojq_exit 'ls -la')" 0 "no-jq scan blocked a harmless command"
rm -rf "$nojq_bin"

# --- A runtime with no preflight helpers must fail closed, not fall into the
# raw scan as if jq were missing ---
broken=$(mktemp -d)
cp -R "$REPO_ROOT/hooks/lib" "$broken/lib"
cp "$HOOK" "$broken/"
rm "$broken/lib/preflight.sh"
expect_exit "$(jq -n '{tool_input:{command:"ls"}}' | HOME="$EMPTY_HOME" "$broken/block-secret-reads.sh" >/dev/null 2>&1; echo $?)" 2 "missing preflight.sh did not fail closed"
rm -rf "$broken"

echo "PASS: $PASS  FAIL: $FAIL"
for f in ${FAILURES[@]+"${FAILURES[@]}"}; do echo "  $f"; done
[[ $FAIL -eq 0 ]]
