#!/bin/bash
# Tests for the scope-tier → adversarial-trigger gate.
# Verifies that scope-tier-memory-check writes/clears a sentinel and that
# adversarial-trigger skips the swarm when the sentinel is fresh.
#
# Run from repo root: bash tests/hooks/scope-tier-adversarial-gate.test.sh
set -u

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCOPE_HOOK="$REPO_ROOT/hooks/scope-tier-memory-check.sh"
ADV_HOOK="$REPO_ROOT/hooks/adversarial-trigger.sh"
PASS=0
FAIL=0
FAILED_TESTS=()

VALID_PROMPT='{"prompt":"prune dead code from helper.ts"}'
NEGATIVE_PROMPT='{"prompt":"rearchitect the auth subsystem across services"}'

setup_scratch_repo() {
  local dir="$1"
  mkdir -p "$dir"
  cd "$dir"
  git init -q
  git config user.email test@example.com
  git config user.name test
  mkdir -p hooks .claude/state
  cp "$REPO_ROOT/hooks/adversarial-config.json" hooks/
  cp "$REPO_ROOT/hooks/adversarial-trigger.sh" hooks/
  cp "$REPO_ROOT/hooks/scope-tier-memory-check.sh" hooks/
  # Stub spawn — record invocation, do not actually spawn agents.
  cat > hooks/adversarial-spawn.sh <<'EOF'
#!/bin/bash
echo "SPAWNED $1 $2" > .claude/state/critiques/spawn-marker
EOF
  chmod +x hooks/adversarial-spawn.sh
  chmod +x hooks/adversarial-trigger.sh
  chmod +x hooks/scope-tier-memory-check.sh
  # Seed memory fixture that satisfies scope-tier-memory-check.
  mkdir -p ".claude/projects/-Users-cantu-repos-claude-config/memory"
  cat > ".claude/projects/-Users-cantu-repos-claude-config/memory/MEMORY.md" <<'EOF'
# Memory Index

- [feedback_right_size_ceremony](feedback_right_size_ceremony.md) — Right-size pipeline ceremony to feature size: small/mechanical changes should skip DTP/SA/brainstorm/FMS
EOF
  # Commit baseline so HEAD exists.
  echo "base" > seed.txt
  git add -A
  git commit -q -m "baseline"
}

# Generate a staged diff above adversarial-trigger LOC threshold (100) but
# below scope-tier-memory-check's git_check_rejects ceiling (200) so the
# scope-tier hook can still classify the prompt.
make_large_diff() {
  awk 'BEGIN{for(i=0;i<150;i++)print "line " i}' > big.txt
  git add big.txt
}

run_case() {
  local name="$1"
  local expected="$2"   # one of: spawn / no-spawn / sentinel-exists / sentinel-absent
  local actual="unknown"

  case "$expected" in
    spawn|no-spawn)
      rm -f .claude/state/critiques/spawn-marker .claude/state/critiques/.last-hash 2>/dev/null
      mkdir -p .claude/state/critiques
      bash hooks/adversarial-trigger.sh >/dev/null 2>&1
      # spawn is backgrounded — give it a moment.
      sleep 0.5
      if [[ -f .claude/state/critiques/spawn-marker ]]; then actual="spawn"; else actual="no-spawn"; fi
      ;;
    sentinel-exists|sentinel-absent)
      if [[ -f .claude/state/scope-tier-current ]]; then actual="sentinel-exists"; else actual="sentinel-absent"; fi
      ;;
  esac

  if [[ "$actual" == "$expected" ]]; then
    PASS=$((PASS+1))
    echo "  PASS: $name"
  else
    FAIL=$((FAIL+1))
    FAILED_TESTS+=("$name (expected=$expected actual=$actual)")
    echo "  FAIL: $name (expected=$expected actual=$actual)"
  fi
}

echo "Running scope-tier-adversarial-gate tests..."

SCRATCH=$(mktemp -d)
trap 'cd /; rm -rf "$SCRATCH"' EXIT
setup_scratch_repo "$SCRATCH"
make_large_diff

# Baseline: no sentinel → swarm fires on large diff.
rm -f .claude/state/scope-tier-current
run_case "baseline-no-sentinel-spawns" "spawn"

# Scope-tier MATCH writes sentinel.
rm -f .claude/state/critiques/.last-hash .claude/state/critiques/.last-ts
echo "$VALID_PROMPT" | bash hooks/scope-tier-memory-check.sh >/dev/null 2>&1
run_case "match-writes-sentinel" "sentinel-exists"

# With sentinel fresh, adversarial-trigger skips even with large diff.
rm -f .claude/state/critiques/.last-hash .claude/state/critiques/.last-ts
run_case "fresh-sentinel-skips-swarm" "no-spawn"

# Stale sentinel (ts far in the past) → swarm fires again.
echo '{"ts":1,"matched":["x"]}' > .claude/state/scope-tier-current
rm -f .claude/state/critiques/.last-hash .claude/state/critiques/.last-ts
run_case "stale-sentinel-allows-swarm" "spawn"

# Scope-tier NO_MATCH (scope-expander prompt) clears stale sentinel.
echo '{"ts":1,"matched":["x"]}' > .claude/state/scope-tier-current
echo "$NEGATIVE_PROMPT" | bash hooks/scope-tier-memory-check.sh >/dev/null 2>&1
run_case "no-match-clears-sentinel" "sentinel-absent"

echo
echo "Results: $PASS passed, $FAIL failed"
if [[ $FAIL -gt 0 ]]; then
  echo "Failures:"
  for t in "${FAILED_TESTS[@]}"; do echo "  - $t"; done
  exit 1
fi
exit 0
