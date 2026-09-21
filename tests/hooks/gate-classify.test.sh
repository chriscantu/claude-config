#!/bin/bash
# Unit tests for the Phase 1 shadow classifier's pure functions.
# Sources hooks/lib/gate-classify.sh directly — no stdin, no log file, no hook
# adapter. Run from repo root: bash tests/hooks/gate-classify.test.sh
set -u

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LIB="$REPO_ROOT/hooks/lib/gate-classify.sh"

# shellcheck source=/dev/null
source "$LIB"

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

# assert_verdict NAME EXPECTED RECORD
assert_verdict() {
  assert_eq "$1" "$2" "$(field "$3" verdict)"
}

echo "── pr-validation: action-bound triggers (PreToolUse:Bash) ──"

assert_verdict "gh pr ready fires" fire \
  "$(gate_pr_validation_verdict bash 'gh pr ready 529')"
assert_verdict "gh pr merge fires" fire \
  "$(gate_pr_validation_verdict bash 'gh pr merge --squash 529')"
assert_verdict "gh pr edit --remove-label draft fires" fire \
  "$(gate_pr_validation_verdict bash 'gh pr edit 529 --remove-label draft')"
assert_verdict "gh pr view does not fire" no_fire \
  "$(gate_pr_validation_verdict bash 'gh pr view 529 --json body')"
assert_verdict "unrelated command does not fire" no_fire \
  "$(gate_pr_validation_verdict bash 'git status --short')"
assert_eq "action trigger is labelled" action \
  "$(field "$(gate_pr_validation_verdict bash 'gh pr merge 529')" trigger)"

echo "── pr-validation: speech-act triggers (Stop) ──"

assert_verdict "ready to merge fires" fire \
  "$(gate_pr_validation_verdict stop 'The branch is ready to merge.')"
assert_verdict "implementation complete fires" fire \
  "$(gate_pr_validation_verdict stop 'Implementation complete — tests pass.')"
assert_verdict "good to go fires" fire \
  "$(gate_pr_validation_verdict stop 'CI is green, good to go.')"
assert_verdict "negated claim does not fire" no_fire \
  "$(gate_pr_validation_verdict stop 'This is not ready to merge yet.')"
contraction_case="I wouldn't call this ready to ship."
assert_verdict "contraction negation does not fire" no_fire \
  "$(gate_pr_validation_verdict stop "$contraction_case")"
assert_verdict "neutral progress report does not fire" no_fire \
  "$(gate_pr_validation_verdict stop 'Ran the tests; two suites still fail.')"
assert_eq "speech trigger is labelled" speech \
  "$(field "$(gate_pr_validation_verdict stop 'ready for review')" trigger)"

echo "── execution-mode: dispatch triggers (PreToolUse:Task/Skill) ──"

assert_verdict "subagent-driven skill fires" fire \
  "$(gate_execution_mode_verdict Skill '{"skill":"superpowers:subagent-driven-development"}')"
assert_verdict "Task dispatch fires" fire \
  "$(gate_execution_mode_verdict Task '{"subagent_type":"general-purpose","prompt":"go"}')"
assert_verdict "unrelated skill does not fire" no_fire \
  "$(gate_execution_mode_verdict Skill '{"skill":"superpowers:brainstorming"}')"
assert_verdict "non-dispatch tool does not fire" no_fire \
  "$(gate_execution_mode_verdict Bash '{"command":"ls"}')"
assert_eq "skill dispatch trigger is labelled" skill_dispatch \
  "$(field "$(gate_execution_mode_verdict Skill '{"skill":"superpowers:subagent-driven-development"}')" trigger)"
assert_eq "task dispatch trigger is labelled" task_dispatch \
  "$(field "$(gate_execution_mode_verdict Task '{"subagent_type":"Explore"}')" trigger)"

echo "── shape guarantees ──"

record="$(gate_pr_validation_verdict bash 'gh pr ready')"
assert_eq "pr-validation record names its gate" pr-validation "$(field "$record" gate)"
record="$(gate_execution_mode_verdict Task '{}')"
assert_eq "execution-mode record names its gate" execution-mode "$(field "$record" gate)"
assert_verdict "empty payload is inert" no_fire \
  "$(gate_pr_validation_verdict bash '')"
assert_verdict "empty stop text is inert" no_fire \
  "$(gate_pr_validation_verdict stop '')"

echo
echo "────────────────────────────────"
echo "Results: $PASS passed, $FAIL failed"
if [[ "$FAIL" -gt 0 ]]; then
  printf '  %s\n' "${FAILED_TESTS[@]}"
  exit 1
fi
exit 0
