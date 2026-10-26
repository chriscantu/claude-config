#!/bin/bash
# Tests that adversarial-trigger spawns the review swarm on a diff above its
# LOC threshold, and that a leftover scope-tier sentinel no longer stops it.
#
# Run from repo root: bash tests/hooks/adversarial-trigger.test.sh
set -u

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PASS=0
FAIL=0
FAILED_TESTS=()

setup_scratch_repo() {
  local dir="$1"
  mkdir -p "$dir"
  cd "$dir" || exit 1
  git init -q
  git config user.email test@example.com
  git config user.name test
  mkdir -p hooks .claude/state
  cp "$REPO_ROOT/hooks/adversarial-config.json" hooks/
  cp "$REPO_ROOT/hooks/adversarial-trigger.sh" hooks/
  # adversarial-trigger.sh sources hooks/lib/ beside itself; the scratch repo
  # must mirror that dependency or the copied hook degrades out.
  cp -r "$REPO_ROOT/hooks/lib" hooks/
  # Stub spawn — record invocation, do not actually spawn agents.
  cat > hooks/adversarial-spawn.sh <<'EOF'
#!/bin/bash
echo "SPAWNED $1 $2" > .claude/state/critiques/spawn-marker
EOF
  chmod +x hooks/adversarial-spawn.sh hooks/adversarial-trigger.sh
  # Commit baseline so HEAD exists.
  echo "base" > seed.txt
  git add -A
  git commit -q -m "baseline"
}

# Generate a staged diff above the adversarial-trigger LOC threshold (100).
make_large_diff() {
  awk 'BEGIN{for(i=0;i<150;i++)print "line " i}' > big.txt
  git add big.txt
}

# Poll for the backgrounded spawn marker. adversarial-trigger.sh backgrounds
# the spawn (`& disown`) and returns before the child writes the marker, so a
# fixed sleep races the child under load.
await_spawn_marker() {
  local i
  for ((i = 0; i < 100; i++)); do
    [[ -f .claude/state/critiques/spawn-marker ]] && return 0
    sleep 0.05
  done
  return 1
}

run_case() {
  local name="$1"
  local expected="$2"   # spawn or no-spawn
  local actual

  rm -f .claude/state/critiques/spawn-marker .claude/state/critiques/.last-hash .claude/state/critiques/.last-ts 2>/dev/null
  mkdir -p .claude/state/critiques
  bash hooks/adversarial-trigger.sh >/dev/null 2>&1
  if [[ "$expected" == "spawn" ]]; then
    if await_spawn_marker; then actual="spawn"; else actual="no-spawn"; fi
  else
    # The trigger exits before backgrounding, so no child will ever write the
    # marker. Settle briefly, then confirm absence.
    sleep 0.5
    if [[ -f .claude/state/critiques/spawn-marker ]]; then actual="spawn"; else actual="no-spawn"; fi
  fi

  if [[ "$actual" == "$expected" ]]; then
    PASS=$((PASS+1))
    echo "  PASS: $name"
  else
    FAIL=$((FAIL+1))
    FAILED_TESTS+=("$name (expected=$expected actual=$actual)")
    echo "  FAIL: $name (expected=$expected actual=$actual)"
  fi
}

echo "Running adversarial-trigger tests..."

SCRATCH=$(mktemp -d)
trap 'cd /; rm -rf "$SCRATCH"' EXIT
setup_scratch_repo "$SCRATCH"

run_case "small-diff-no-spawn" "no-spawn"

make_large_diff
run_case "large-diff-spawns" "spawn"

# A fresh sentinel left by the retired scope-tier hook must not stop the swarm.
echo "{\"ts\":$(date +%s),\"matched\":[\"x\"]}" > .claude/state/scope-tier-current
run_case "leftover-sentinel-does-not-skip" "spawn"

echo
echo "Results: $PASS passed, $FAIL failed"
if [[ $FAIL -gt 0 ]]; then
  echo "Failures:"
  for t in "${FAILED_TESTS[@]}"; do echo "  - $t"; done
  exit 1
fi
exit 0
