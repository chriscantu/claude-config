#!/bin/bash
# Unit tests for the scope-tier classifier's internal seam.
# Sources scope-tier-memory-check.sh (the sourcing guard suppresses main) and
# exercises the two PURE functions directly — no stdin, no git repo, no MEMORY.md.
# Run from repo root: bash tests/hooks/scope-tier-classify.test.sh
set -u

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOOK="$REPO_ROOT/hooks/scope-tier-memory-check.sh"

# Redirect the source-time log mkdir to a throwaway dir so sourcing is inert.
SCOPE_TIER_LOG_DIR="$(mktemp -d)"
export SCOPE_TIER_LOG_DIR
trap 'rm -rf "$SCOPE_TIER_LOG_DIR"' EXIT

# shellcheck source=/dev/null
source "$HOOK"

PASS=0
FAIL=0
FAILED_TESTS=()

# field RECORD KEY → value of KEY= in a "k=v k=v ..." record.
field() { echo "$1" | tr ' ' '\n' | grep "^$2=" | cut -d= -f2; }

# assert_eq NAME EXPECTED ACTUAL
assert_eq() {
  local name="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    PASS=$((PASS+1)); echo "  PASS: $name"
  else
    FAIL=$((FAIL+1)); FAILED_TESTS+=("$name (expected='$expected' actual='$actual')")
    echo "  FAIL: $name (expected='$expected' actual='$actual')"
  fi
}

# assert_rejects NAME DIFFSTAT  — expect scope_tier_diffstat_rejects → reject.
assert_rejects() {
  local name="$1" stat="$2"
  if scope_tier_diffstat_rejects "$stat"; then
    PASS=$((PASS+1)); echo "  PASS: $name"
  else
    FAIL=$((FAIL+1)); FAILED_TESTS+=("$name (expected reject, got ok)")
    echo "  FAIL: $name (expected reject, got ok)"
  fi
}

# assert_ok NAME DIFFSTAT — expect scope_tier_diffstat_rejects → ok (no reject).
assert_ok() {
  local name="$1" stat="$2"
  if scope_tier_diffstat_rejects "$stat"; then
    FAIL=$((FAIL+1)); FAILED_TESTS+=("$name (expected ok, got reject)")
    echo "  FAIL: $name (expected ok, got reject)"
  else
    PASS=$((PASS+1)); echo "  PASS: $name"
  fi
}

echo "── scope_tier_prompt_verdict ──────────────────────────────────────────────"

# verb + concrete target, nothing disqualifying → mechanical.
REC=$(scope_tier_prompt_verdict "prune lib/foo.ts")
assert_eq "verb+target → verdict"        "mechanical" "$(field "$REC" verdict)"
assert_eq "verb+target → verb field"     "true"       "$(field "$REC" verb)"
assert_eq "verb+target → target field"   "true"       "$(field "$REC" target)"
assert_eq "verb+target → minimizer field" "false"     "$(field "$REC" minimizer)"

# No mechanical verb → rejected (target still present).
REC=$(scope_tier_prompt_verdict "think about lib/foo.ts")
assert_eq "no verb → verdict"  "rejected" "$(field "$REC" verdict)"
assert_eq "no verb → verb field" "false"  "$(field "$REC" verb)"

# No concrete target → rejected.
REC=$(scope_tier_prompt_verdict "prune things")
assert_eq "no target → verdict"    "rejected" "$(field "$REC" verdict)"
assert_eq "no target → target field" "false"  "$(field "$REC" target)"

# Minimizer present → rejected.
REC=$(scope_tier_prompt_verdict "just prune lib/foo.ts, small change")
assert_eq "minimizer → verdict"        "rejected" "$(field "$REC" verdict)"
assert_eq "minimizer → minimizer field" "true"    "$(field "$REC" minimizer)"

# Scope-expander present → rejected (verb+target otherwise satisfied).
REC=$(scope_tier_prompt_verdict "rename lib/foo.ts, then rewrite it")
assert_eq "expander → verdict"              "rejected" "$(field "$REC" verdict)"
assert_eq "expander → scope_expander field" "true"     "$(field "$REC" scope_expander)"

# Blast-radius path present → rejected.
REC=$(scope_tier_prompt_verdict "rename api/foo.ts")
assert_eq "blast path → verdict"          "rejected" "$(field "$REC" verdict)"
assert_eq "blast path → blast_path field" "true"     "$(field "$REC" blast_path)"

# Blast-radius word present → rejected.
REC=$(scope_tier_prompt_verdict "rename lib/foo.ts as a public API change")
assert_eq "blast word → verdict"          "rejected" "$(field "$REC" verdict)"
assert_eq "blast word → blast_word field" "true"     "$(field "$REC" blast_word)"

echo "── scope_tier_diffstat_rejects ────────────────────────────────────────────"

assert_rejects "migrations path in stat" \
  " migrations/0001_add_users.sql | 12 ++++++++
 1 file changed, 12 insertions(+)"

assert_rejects "api path in stat" \
  " api/v1/checkout.ts | 3 +--
 1 file changed, 1 insertion(+), 2 deletions(-)"

assert_rejects "more than 5 files" \
  " a.ts | 1 +
 b.ts | 1 +
 c.ts | 1 +
 d.ts | 1 +
 e.ts | 1 +
 f.ts | 1 +
 6 files changed, 6 insertions(+)"

assert_rejects "over 200 LOC changed" \
  " big.ts | 260 +++++++++++++++++++++++++
 1 file changed, 250 insertions(+), 10 deletions(-)"

assert_ok "small clean diff" \
  " src/util.ts | 5 +++--
 src/main.ts | 2 +-
 2 files changed, 5 insertions(+), 2 deletions(-)"

assert_ok "empty diff (clean tree)" ""

echo "── R1: memory-path resolution (_scope_tier_slug / discover_memory_md) ──────"

# _scope_tier_slug is pure: every '/' becomes '-' (Claude Code's project slug).
assert_eq "_scope_tier_slug slugifies an absolute path" \
  "-Users-cantu-repos-claude-config" "$(_scope_tier_slug "/Users/cantu/repos/claude-config")"
assert_eq "_scope_tier_slug slugifies a short path" \
  "-a-b" "$(_scope_tier_slug "/a/b")"

# copy_hook_into REPO — place a runnable copy of the hook + its preflight lib
# under REPO/hooks, so the copied hook's BASH_SOURCE self-resolves REPO as its
# own repo root (distinguishing self-resolution from the hardcoded fallback,
# which are the same path on the maintainer machine).
copy_hook_into() {
  local repo="$1"
  mkdir -p "$repo/hooks/lib"
  cp "$HOOK" "$repo/hooks/scope-tier-memory-check.sh"
  cp "$REPO_ROOT/hooks/lib/preflight.sh" "$repo/hooks/lib/preflight.sh"
}

# discover_with HOME_DIR REPO_DIR — run the copied hook's discover_memory_md in a
# clean env (no inherited CLAUDE_PROJECT_DIR / SCOPE_TIER_MEMORY_PATH), cwd=REPO.
discover_with() {
  local home="$1" repo="$2"
  env -i HOME="$home" PATH="$PATH" bash -c '
    cd "$1" || exit 1
    source "$1/hooks/scope-tier-memory-check.sh"
    discover_memory_md
  ' _ "$repo"
}

# (a) SCOPE_TIER_MEMORY_PATH override wins over self-resolved + hardcoded.
OVERRIDE_FILE="$(mktemp)"
ACTUAL="$(SCOPE_TIER_MEMORY_PATH="$OVERRIDE_FILE" discover_memory_md)"
assert_eq "env override wins" "$OVERRIDE_FILE" "$ACTUAL"
rm -f "$OVERRIDE_FILE"

# (b) Self-resolution: with the override unset, the hook derives its slug from
# its OWN repo root and finds the memory under a fabricated temp HOME — proving
# a downstream installer at any path resolves with zero config.
TMPREPO="$(mktemp -d)"; REPO_REAL="$(cd "$TMPREPO" && pwd -P)"; SLUG="$(_scope_tier_slug "$REPO_REAL")"
TMPHOME="$(mktemp -d)"
mkdir -p "$TMPHOME/.claude/projects/$SLUG/memory"; : > "$TMPHOME/.claude/projects/$SLUG/memory/MEMORY.md"
copy_hook_into "$TMPREPO"
assert_eq "self-resolve finds memory under a fabricated HOME" \
  "$TMPHOME/.claude/projects/$SLUG/memory/MEMORY.md" "$(discover_with "$TMPHOME" "$TMPREPO")"
rm -rf "$TMPREPO" "$TMPHOME"

# (c) Hardcoded fallback: when self-resolution misses (temp repo slug has no
# memory), the maintainer's original slug still resolves under HOME — the
# last-resort candidate that keeps this machine working.
TMPREPO2="$(mktemp -d)"; TMPHOME2="$(mktemp -d)"
HARDCODED="$TMPHOME2/.claude/projects/-Users-cantu-repos-claude-config/memory/MEMORY.md"
mkdir -p "$(dirname "$HARDCODED")"; : > "$HARDCODED"
copy_hook_into "$TMPREPO2"
assert_eq "hardcoded HOME fallback resolves when self-resolve misses" \
  "$HARDCODED" "$(discover_with "$TMPHOME2" "$TMPREPO2")"
rm -rf "$TMPREPO2" "$TMPHOME2"

echo ""
echo "Pass: $PASS, Fail: $FAIL"
if [[ $FAIL -gt 0 ]]; then
  echo "Failed tests:"
  for t in "${FAILED_TESTS[@]}"; do echo "  - $t"; done
  exit 1
fi
exit 0
