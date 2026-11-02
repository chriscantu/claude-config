#!/bin/bash
# Tests that adversarial-spawn.sh runs reviewers in a throwaway copy of the
# repo, so a reviewer's git commands cannot change the checkout under review
# (#578). A stub `claude` on PATH stands in for each reviewer: it records what
# it saw, then runs `git stash -u`, `git branch -D` and `git push --delete`.
#
# Run from repo root: bash tests/hooks/adversarial-spawn.test.sh
set -u

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SPAWN="$REPO_ROOT/hooks/adversarial-spawn.sh"
PASS=0
FAIL=0
FAILED_TESTS=()

SCRATCH="$(mktemp -d)"
trap 'rm -rf "$SCRATCH"' EXIT
REPO="$SCRATCH/repo"
STUB_BIN="$SCRATCH/bin"
PROBE_DIR="$SCRATCH/probe"
mkdir -p "$REPO" "$STUB_BIN" "$PROBE_DIR"

check() {
  local name="$1" ok="$2"
  if [[ "$ok" == "1" ]]; then
    PASS=$((PASS+1))
  else
    FAIL=$((FAIL+1))
    FAILED_TESTS+=("$name")
  fi
}

# Stub reviewer. The arbiter only has to emit a summary; workers record their
# view of the repo, then misbehave the way an unsandboxed reviewer might.
cat > "$STUB_BIN/claude" <<'EOF'
#!/bin/bash
agent=""
while [[ $# -gt 0 ]]; do
  [[ "$1" == "--agent" ]] && agent="$2"
  shift
done
if [[ "$agent" == "arbiter" ]]; then
  echo "### 1. stub summary"
  exit 0
fi
cat > /dev/null
{
  echo "cwd=$(pwd -P)"
  echo "diff=$(git diff HEAD --name-status | tr '\t\n' ': ')"
  echo "untracked=$(git ls-files --others --exclude-standard | tr '\n' ' ')"
} > "$PROBE_DIR/$agent.seen"
git stash -u -q
git branch -D -q side
git push -q origin --delete side 2>/dev/null
echo "critique from $agent"
EOF
chmod +x "$STUB_BIN/claude"

# Scratch repo: one committed baseline plus every kind of uncommitted change.
cd "$REPO" || exit 1
git init -q
git config user.email test@example.com
git config user.name test
mkdir -p hooks
cat > hooks/adversarial-config.json <<'EOF'
{ "workers": ["test-gap"], "worker_timeout_seconds": 30, "arbiter_timeout_seconds": 30, "max_budget_usd_per_agent": 0.01 }
EOF
printf 'a\n' > a.txt
printf 'b\n' > b.txt
printf 'c\n' > c.txt
printf '.claude/\n' > .gitignore
git add -A
git commit -q -m baseline
git branch side
printf 'a changed\n' > a.txt
printf 'b staged\n' > b.txt
git add b.txt
rm c.txt
printf 'new\n' > new.txt

snapshot_state() {
  git status --porcelain=v1
  git diff HEAD
  echo "stash: $(git stash list)"
  echo "branches: $(git branch --format='%(refname:short)' | tr '\n' ' ')"
}
BEFORE="$(snapshot_state)"

PATH="$STUB_BIN:$PATH" PROBE_DIR="$PROBE_DIR" bash "$SPAWN" deadbeefcafe0001 test >/dev/null 2>&1

AFTER="$(snapshot_state)"
SEEN="$PROBE_DIR/test-gap-adversary.seen"
SEEN_CWD="$(sed -n 's/^cwd=//p' "$SEEN" 2>/dev/null)"

# 1. The checkout under review is untouched: files, index, stash and branches.
check "live checkout unchanged by reviewer git commands" "$([[ "$BEFORE" == "$AFTER" ]] && echo 1)"
# 2. The reviewer ran somewhere other than the live checkout.
check "reviewer ran outside the live checkout" "$([[ -n "$SEEN_CWD" && "$SEEN_CWD" != "$(pwd -P)" ]] && echo 1)"
# 3. The reviewer still saw the same uncommitted changes as the user.
check "reviewer saw modified file" "$(grep -q 'M:a.txt' "$SEEN" 2>/dev/null && echo 1)"
check "reviewer saw staged file" "$(grep -q 'M:b.txt' "$SEEN" 2>/dev/null && echo 1)"
check "reviewer saw deleted file" "$(grep -q 'D:c.txt' "$SEEN" 2>/dev/null && echo 1)"
check "reviewer saw untracked file" "$(grep -q 'untracked=.*new.txt' "$SEEN" 2>/dev/null && echo 1)"
# 4. Critiques and the summary still land in the live repo's state dir.
check "worker critique written to live repo" "$(grep -qs 'critique from test-gap' .claude/state/critiques/*/test-gap.md && echo 1)"
check "arbiter summary written to live repo" "$(grep -qs 'stub summary' .claude/state/critiques/*/SUMMARY.md && echo 1)"
# 5. The throwaway copy is removed afterwards.
check "review copy removed after run" "$([[ -n "$SEEN_CWD" && ! -e "$SEEN_CWD" ]] && echo 1)"

echo "PASS=$PASS FAIL=$FAIL"
if [[ $FAIL -gt 0 ]]; then
  printf '  - %s\n' "${FAILED_TESTS[@]}"
  exit 1
fi
