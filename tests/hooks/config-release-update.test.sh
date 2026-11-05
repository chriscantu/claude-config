#!/bin/bash
# Tests for hooks/config-release-update.sh and hooks/lib/config-release-worker.sh —
# the SessionStart hook that fast-forwards the release copy in the background.
# Every case builds its own fixture (bare origin + release clone) under a temp
# dir and a temp HOME; nothing touches the real ~/.claude or this repo's git state.
# Run from repo root: bash tests/hooks/config-release-update.test.sh
set -u

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOOK="$REPO_ROOT/hooks/config-release-update.sh"

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

export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@example.com GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@example.com

# new_case NAME → builds $CASE/{origin.git,work,rel,home,sent}, sets the env vars
# run_hook uses. Origin has one commit on main with rules/a.md.
new_case() {
  CASE="$TMP/$1"
  mkdir -p "$CASE/home" "$CASE/sent"
  ORIGIN="$CASE/origin.git"; WORK="$CASE/work"; REL="$CASE/rel"
  LOG="$CASE/log.jsonl"; LINKS="$CASE/links"; : > "$LINKS"
  git init -q --bare -b main "$ORIGIN"
  git clone -q "$ORIGIN" "$WORK" 2>/dev/null
  git -C "$WORK" checkout -q -b main
  mkdir -p "$WORK/rules"
  echo one > "$WORK/rules/a.md"
  git -C "$WORK" add -A
  git -C "$WORK" commit -q -m init
  git -C "$WORK" push -q origin main 2>/dev/null
  git clone -q "$ORIGIN" "$REL" 2>/dev/null
  git -C "$REL" checkout -q --detach origin/main
  LINK_CMD="echo ran >> $LINKS"
}

# push_change CMD... → run CMD in the work clone, commit everything, push.
push_change() {
  ( cd "$WORK" && "$@" ) >/dev/null 2>&1
  git -C "$WORK" add -A
  git -C "$WORK" commit -q -m change
  git -C "$WORK" push -q origin main 2>/dev/null
}

# run_hook [VAR=VALUE...] → runs the hook in SYNC mode; sets RC, OUT, and the
# time taken in ELAPSED seconds.
run_hook() {
  local start=$SECONDS
  OUT=$(env HOME="$CASE/home" HOOK_SENTINEL_DIR="$CASE/sent" \
    CLAUDE_CONFIG_RELEASE_DIR="$REL" CONFIG_RELEASE_LOG="$LOG" \
    CONFIG_RELEASE_SYNC=1 CONFIG_RELEASE_LINK_CMD="$LINK_CMD" "$@" \
    bash "$HOOK" <<< '{"session_id":"sess-1","hook_event_name":"SessionStart"}')
  RC=$?
  ELAPSED=$((SECONDS - start))
}

# field EVENT KEY → KEY from the last log record whose event is EVENT.
field() { jq -r --arg e "$1" --arg k "$2" 'select(.event==$e) | .[$k]' "$LOG" 2>/dev/null | tail -1; }
head_sha() { git -C "$REL" rev-parse HEAD; }
link_count() { wc -l < "$LINKS" | tr -d ' '; }

echo "── logs loaded commit ──"
new_case loaded
before=$(head_sha)
run_hook
assert_eq "exit 0" 0 "$RC"
assert_eq "stdout empty" "" "$OUT"
assert_eq "session.loaded is release HEAD" "$before" "$(field session loaded)"
assert_eq "session.result" started "$(field session result)"
assert_eq "session.session_id" sess-1 "$(field session session_id)"
assert_eq "update unchanged" unchanged "$(field update result)"

echo "── fast-forwards on content-only change ──"
new_case ff
before=$(head_sha)
push_change sh -c 'echo two > rules/a.md'
new=$(git -C "$WORK" rev-parse HEAD)
run_hook
assert_eq "stdout empty" "" "$OUT"
assert_eq "HEAD is origin SHA" "$new" "$(head_sha)"
assert_eq "result updated" updated "$(field update result)"
assert_eq "update.from" "$before" "$(field update from)"
assert_eq "update.to" "$new" "$(field update to)"
assert_eq "link not run" 0 "$(link_count)"

echo "── added file triggers relink ──"
new_case add
push_change sh -c 'echo b > rules/b.md'
run_hook
assert_eq "result" updated+relinked "$(field update result)"
assert_eq "link ran once" 1 "$(link_count)"

echo "── rename triggers relink ──"
new_case rename
push_change git mv rules/a.md rules/c.md
run_hook
assert_eq "result" updated+relinked "$(field update result)"

echo "── needs-registration is surfaced ──"
new_case reg
push_change sh -c 'echo b > rules/b.md'
LINK_CMD="echo 'WARNING: hooks/rules-shadow.sh is not registered in settings.json' >&2"
run_hook
assert_eq "result" updated+relinked+needs-registration "$(field update result)"

echo "── failing link command → relink-failed ──"
new_case relinkfail
push_change sh -c 'echo b > rules/b.md'
LINK_CMD="exit 3"
run_hook
assert_eq "result" relink-failed "$(field update result)"

echo "── dirty release is left alone ──"
new_case dirty
push_change sh -c 'echo two > rules/a.md'
echo local > "$REL/rules/a.md"
before=$(head_sha)
run_hook
assert_eq "result" skipped:dirty "$(field update result)"
assert_eq "HEAD unchanged" "$before" "$(head_sha)"
assert_eq "file unchanged" local "$(cat "$REL/rules/a.md")"

echo "── diverged release is left alone ──"
new_case diverged
git -C "$REL" commit -q --allow-empty -m local
before=$(head_sha)
push_change sh -c 'echo two > rules/a.md'
run_hook
assert_eq "result" skipped:not-fast-forward "$(field update result)"
assert_eq "HEAD unchanged" "$before" "$(head_sha)"

echo "── fetch failure changes nothing ──"
new_case fetchfail
before=$(head_sha)
git -C "$REL" remote set-url origin "$CASE/missing.git"
run_hook
assert_eq "result" fetch-failed "$(field update result)"
assert_eq "HEAD unchanged" "$before" "$(head_sha)"

echo "── lock held ──"
new_case locked
push_change sh -c 'echo two > rules/a.md'
before=$(head_sha)
mkdir "$REL/.git/config-release-update.lock"
run_hook
assert_eq "result" skipped:locked "$(field update result)"
assert_eq "HEAD unchanged" "$before" "$(head_sha)"

echo "── stale lock is cleared ──"
new_case stale
push_change sh -c 'echo two > rules/a.md'
mkdir "$REL/.git/config-release-update.lock"
touch -t 202001010000 "$REL/.git/config-release-update.lock"
run_hook
assert_eq "result" updated "$(field update result)"
assert_eq "lock removed after run" no "$([[ -e $REL/.git/config-release-update.lock ]] && echo yes || echo no)"

echo "── no release copy ──"
new_case norelease
REL="$CASE/missing"
run_hook
assert_eq "exit 0" 0 "$RC"
assert_eq "stdout empty" "" "$OUT"
assert_eq "session.result" skipped:no-release "$(field session result)"
assert_eq "session.loaded null" null "$(field session loaded)"
assert_eq "no update record" "" "$(field update result)"

echo "── kill switch ──"
new_case kill
touch "$CASE/sent/DISABLE_CONFIG_RELEASE_UPDATE"
run_hook
assert_eq "exit 0" 0 "$RC"
assert_eq "stdout empty" "" "$OUT"
assert_eq "nothing logged" no "$([[ -e $LOG ]] && echo yes || echo no)"

echo "── hook returns fast while worker hangs ──"
new_case hang
run_hook CONFIG_RELEASE_SYNC= CONFIG_RELEASE_WORKER="sleep 10"
assert_eq "exit 0" 0 "$RC"
assert_eq "stdout empty" "" "$OUT"
[[ $ELAPSED -lt 2 ]] && pass "returned in ${ELAPSED}s" || fail "slow hook: ${ELAPSED}s"
assert_eq "session logged started" started "$(field session result)"

echo
echo "Passed: $PASS  Failed: $FAIL"
if [[ $FAIL -gt 0 ]]; then
  printf '  - %s\n' "${FAILED_TESTS[@]}"
  exit 1
fi
