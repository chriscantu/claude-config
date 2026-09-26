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

echo "── pr-validation: the command must actually be invoked ──"
# A command that merely MENTIONS the trigger text is not a draft promotion.

assert_verdict "mention inside a quoted string does not fire" no_fire \
  "$(gate_pr_validation_verdict bash 'echo "see gh pr merge in the docs"')"
# shellcheck disable=SC2016  # literal doc-table text, not an expansion
assert_verdict "doc table row written through a heredoc does not fire" no_fire \
  "$(gate_pr_validation_verdict bash 'cat >> docs/x.md <<'"'"'EOF'"'"'
| `PreToolUse` | `gh pr ready`, `gh pr merge` | pr-validation |
EOF')"
assert_verdict "grep for the pattern does not fire" no_fire \
  "$(gate_pr_validation_verdict bash 'grep -rn "gh pr merge" docs/')"
assert_verdict "commit message mentioning it does not fire" no_fire \
  "$(gate_pr_validation_verdict bash 'git commit -m "document gh pr merge behaviour"')"

assert_verdict "invocation after && fires" fire \
  "$(gate_pr_validation_verdict bash 'git fetch && gh pr ready 531')"
assert_verdict "invocation after ; fires" fire \
  "$(gate_pr_validation_verdict bash 'cd repo; gh pr merge 1 --squash')"
assert_verdict "invocation after a pipe fires" fire \
  "$(gate_pr_validation_verdict bash 'echo 531 | gh pr merge --squash')"
# shellcheck disable=SC2016  # the literal $(...) IS the case under test
assert_verdict "invocation in a subshell fires" fire \
  "$(gate_pr_validation_verdict bash 'n=$(gh pr merge 531)')"
assert_verdict "leading whitespace still fires" fire \
  "$(gate_pr_validation_verdict bash '   gh pr merge 531')"
assert_verdict "invocation on a later line fires" fire \
  "$(gate_pr_validation_verdict bash 'set -e
gh pr merge 531 --squash')"

echo "── pr-validation: mentions that start a line or follow a separator ──"
# Quoted text, heredoc bodies and comments are data, not commands — even when a
# line inside them begins with the trigger text or a separator precedes it.

assert_verdict "heredoc body line starting with the command does not fire" no_fire \
  "$(gate_pr_validation_verdict bash 'cat > docs/x.md <<EOF
gh pr merge is gated
EOF')"
# shellcheck disable=SC2016  # the literal $(cat <<...) IS the case under test
assert_verdict "commit body written via \$(cat <<'EOF') does not fire" no_fire \
  "$(gate_pr_validation_verdict bash 'git commit -m "$(cat <<'"'"'EOF'"'"'
Subject

gh pr merge now waits for the test plan.
EOF
)"')"
assert_verdict "multi-line commit message does not fire" no_fire \
  "$(gate_pr_validation_verdict bash 'git commit -m "Fix detection
gh pr merge follows"')"
assert_verdict "separator inside double quotes does not fire" no_fire \
  "$(gate_pr_validation_verdict bash 'git commit -m "fix; gh pr merge later"')"
assert_verdict "paren inside double quotes does not fire" no_fire \
  "$(gate_pr_validation_verdict bash 'echo "(gh pr merge)"')"
assert_verdict "grep alternation does not fire" no_fire \
  "$(gate_pr_validation_verdict bash 'grep -E "x|gh pr merge" f')"
assert_verdict "sed script in single quotes does not fire" no_fire \
  "$(gate_pr_validation_verdict bash "sed -i 's/;gh pr merge/x/' f")"
assert_verdict "shell comment does not fire" no_fire \
  "$(gate_pr_validation_verdict bash '# then gh pr merge 1
git status')"
assert_verdict "edit mention in quotes does not fire" no_fire \
  "$(gate_pr_validation_verdict bash 'echo "use gh pr edit 5 --remove-label draft"')"
assert_verdict "backslash-quoted heredoc body does not fire" no_fire \
  "$(gate_pr_validation_verdict bash 'cat <<\EOF
gh pr merge 1
EOF')"
# shellcheck disable=SC2016  # literal $(...) is the case under test
assert_verdict "quoted mention inside \$(...) does not fire" no_fire \
  "$(gate_pr_validation_verdict bash 'n="$(echo '"'"'gh pr merge 1'"'"')"')"
assert_verdict "keyword in unquoted prose does not fire" no_fire \
  "$(gate_pr_validation_verdict bash 'echo if gh pr merge fails then retry')"
assert_verdict "fish keyword in unquoted prose does not fire" no_fire \
  "$(gate_pr_validation_verdict bash 'echo not gh pr ready')"

echo "── pr-validation: invocation forms that must still fire ──"

assert_verdict "invocation after || fires" fire \
  "$(gate_pr_validation_verdict bash 'false || gh pr merge 1')"
assert_verdict "invocation after background & fires" fire \
  "$(gate_pr_validation_verdict bash 'sleep 1 & gh pr merge 1')"
assert_verdict "env-var prefix fires" fire \
  "$(gate_pr_validation_verdict bash 'GH_TOKEN=x gh pr merge 1')"
assert_verdict "env-var prefix after && fires" fire \
  "$(gate_pr_validation_verdict bash 'cd x && GH_REPO=o/r gh pr ready 5')"
assert_verdict "if/then body fires" fire \
  "$(gate_pr_validation_verdict bash 'if true; then gh pr merge 1; fi')"
assert_verdict "if condition fires" fire \
  "$(gate_pr_validation_verdict bash 'if gh pr merge 1; then echo ok; fi')"
# shellcheck disable=SC2016  # literal $n is part of the command under test
assert_verdict "for/do body fires" fire \
  "$(gate_pr_validation_verdict bash 'for n in 1 2; do gh pr merge $n; done')"
assert_verdict "brace group fires" fire \
  "$(gate_pr_validation_verdict bash '{ gh pr merge 1; }')"
assert_verdict "negated command fires" fire \
  "$(gate_pr_validation_verdict bash '! gh pr merge 1')"
assert_verdict "time prefix fires" fire \
  "$(gate_pr_validation_verdict bash 'time gh pr merge 1')"
assert_verdict "command prefix fires" fire \
  "$(gate_pr_validation_verdict bash 'command gh pr merge 1')"
assert_verdict "fish and-chain fires" fire \
  "$(gate_pr_validation_verdict bash 'true; and gh pr merge 1')"
# shellcheck disable=SC2016  # literal backticks are the case under test
assert_verdict "backtick substitution fires" fire \
  "$(gate_pr_validation_verdict bash 'n=`gh pr merge 1`')"
# shellcheck disable=SC2016  # literal $(...) inside double quotes is the case
assert_verdict "command substitution inside double quotes fires" fire \
  "$(gate_pr_validation_verdict bash 'n="$(gh pr merge 1)"')"
assert_verdict "full path to gh fires" fire \
  "$(gate_pr_validation_verdict bash '/opt/homebrew/bin/gh pr merge 1')"
assert_verdict "invocation after a heredoc ends fires" fire \
  "$(gate_pr_validation_verdict bash 'cat > m.txt <<EOF
notes
EOF
gh pr merge 1')"
assert_verdict "here-string does not swallow later lines" fire \
  "$(gate_pr_validation_verdict bash 'cat <<< "x"
gh pr merge 1')"
assert_verdict "edit --remove-label draft after && fires" fire \
  "$(gate_pr_validation_verdict bash 'git push && gh pr edit 5 --remove-label draft')"

echo "── pr-validation: heredoc-looking text must not swallow later lines ──"
# A << that is quoted, commented or arithmetic opens no heredoc, so the real
# invocation on the next line must still be seen.

assert_verdict "<<EOF inside single quotes" fire \
  "$(gate_pr_validation_verdict bash "grep -n '<<EOF' hooks/x.sh
gh pr merge 1")"
assert_verdict "<<EOF inside a commit message" fire \
  "$(gate_pr_validation_verdict bash 'git commit -m "Explain <<EOF stripping"
git push && gh pr merge 1 --squash')"
assert_verdict "<<EOF inside a comment" fire \
  "$(gate_pr_validation_verdict bash 'echo x # see <<EOF
gh pr merge 1')"
# shellcheck disable=SC2016  # literal $((...)) is the case under test
assert_verdict "arithmetic shift" fire \
  "$(gate_pr_validation_verdict bash 'echo $((x<<y))
gh pr merge 1')"
assert_verdict "heredoc on a line of its own, then invocation" fire \
  "$(gate_pr_validation_verdict bash '<<EOF
x
EOF
gh pr merge 1')"

echo "── pr-validation: quoting edge cases must not swallow an invocation ──"

# shellcheck disable=SC2016  # literal $(...) is the case under test
assert_verdict "quoted ) inside \"\$(...)\"" fire \
  "$(gate_pr_validation_verdict bash 'x="$(cd d && echo ")")"; gh pr merge 1')"
assert_verdict "ANSI-C quote with escaped apostrophe" fire \
  "$(gate_pr_validation_verdict bash "echo \$'it\\'s'; gh pr merge 1")"

echo "── pr-validation: known misses (deliberate — see gate-classify.sh) ──"
# Pinned so that widening the matcher is a deliberate act, not an accident.

assert_verdict "KNOWN MISS: xargs indirection" no_fire \
  "$(gate_pr_validation_verdict bash 'echo 5 | xargs gh pr merge')"
assert_verdict "KNOWN MISS: bash -c with a quoted script" no_fire \
  "$(gate_pr_validation_verdict bash "bash -c 'gh pr merge 1'")"
assert_verdict "KNOWN MISS: wrapper command with arguments" no_fire \
  "$(gate_pr_validation_verdict bash 'timeout 60 gh pr merge 1')"
assert_verdict "KNOWN MISS: prefix with options" no_fire \
  "$(gate_pr_validation_verdict bash 'sudo -u me gh pr merge 1')"
# shellcheck disable=SC2016  # literal $x is part of the command under test
assert_verdict "KNOWN MISS: case arm" no_fire \
  "$(gate_pr_validation_verdict bash 'case $x in a) gh pr merge 1;; esac')"

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

echo "── pr-validation: speech hedges hold per sentence ──"
# A conditional promise is not a claim. The first case is from a real refusal.

conditional_case="I'll run its test plan, and if everything passes I'll tell you it's ready to merge."
assert_verdict "conditional promise does not fire" no_fire \
  "$(gate_pr_validation_verdict stop "$conditional_case")"
assert_verdict "once-clause promise does not fire" no_fire \
  "$(gate_pr_validation_verdict stop 'Once CI is green, it will be ready for review.')"
assert_verdict "negation in another sentence does not hide a claim" fire \
  "$(gate_pr_validation_verdict stop 'It was not ready to merge before the fix. Tests pass now, so it is ready to merge.')"
assert_verdict "conditional in another sentence does not hide a claim" fire \
  "$(gate_pr_validation_verdict stop 'It is ready to merge. If CI fails, I will fix it.')"
assert_verdict "no inside now is not a negator" fire \
  "$(gate_pr_validation_verdict stop 'Tests pass now, ready to merge.')"
assert_verdict "KNOWN MISS: claim wrapped in a courtesy if" no_fire \
  "$(gate_pr_validation_verdict stop 'If you want, it is ready to merge now.')"

echo "── pr-validation: claims as agents phrase them ──"
# Every case here is a real end-of-turn message from the Phase 1 sample.

assert_verdict "ready for you to merge fires" fire \
  "$(gate_pr_validation_verdict stop '**Ready for you to merge.** Every item in all four test plans is ticked.')"
# shellcheck disable=SC2016  # backticks are markdown code spans, not expansions
clean_and_ready_case='#538 is the last one, and it'"'"'s `CLEAN` and ready for you to merge.'
assert_verdict "clean and ready for you to merge fires" fire \
  "$(gate_pr_validation_verdict stop "$clean_and_ready_case")"
# shellcheck disable=SC2016  # backticks are markdown code spans, not expansions
merge_it_next_case='Its CI passed again and it'"'"'s `CLEAN` now. Merge it next:'
assert_verdict "merge it next fires" fire \
  "$(gate_pr_validation_verdict stop "$merge_it_next_case")"
assert_verdict "negated merge it next does not fire" no_fire \
  "$(gate_pr_validation_verdict stop 'CI is still red, so do not merge it next.')"
quoted_example_case='- "no" matched inside "now", so "Tests pass now, ready to merge" was missed.'
assert_verdict "readiness phrase quoted as an example does not fire" no_fire \
  "$(gate_pr_validation_verdict stop "$quoted_example_case")"

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

echo "── execution-mode: only an IMPLEMENTER dispatch owes an announcement ──"
# Payloads below are the real reviewer dispatches from 2026-09-24 transcripts and
# the three subagent-driven-development templates. SDD sends its reviewers as
# general-purpose, the same type as its implementer, so the description has to
# break the tie.

assert_verdict "reviewer agent type does not fire" no_fire \
  "$(gate_execution_mode_verdict Agent '{"subagent_type":"pr-review-toolkit:code-reviewer","description":"Code review PR 532"}')"
assert_verdict "analyzer agent type does not fire" no_fire \
  "$(gate_execution_mode_verdict Agent '{"subagent_type":"pr-review-toolkit:pr-test-analyzer","description":"Test coverage review PR 532"}')"
assert_verdict "comment-analyzer agent type does not fire" no_fire \
  "$(gate_execution_mode_verdict Agent '{"subagent_type":"pr-review-toolkit:comment-analyzer","description":"Comment accuracy review PR 532"}')"
assert_verdict "adversary agent type does not fire" no_fire \
  "$(gate_execution_mode_verdict Agent '{"subagent_type":"claude-config:scope-adversary","description":"Scope check"}')"
assert_verdict "Explore agent does not fire" no_fire \
  "$(gate_execution_mode_verdict Agent '{"subagent_type":"Explore","description":"Find hook callers"}')"
assert_verdict "Plan agent does not fire" no_fire \
  "$(gate_execution_mode_verdict Agent '{"subagent_type":"Plan","description":"Plan the migration"}')"
assert_verdict "SDD implementer template fires" fire \
  "$(gate_execution_mode_verdict Agent '{"subagent_type":"general-purpose","description":"Implement Task 3: session timeout"}')"
assert_verdict "SDD task-reviewer template does not fire" no_fire \
  "$(gate_execution_mode_verdict Agent '{"subagent_type":"general-purpose","description":"Review Task 3 (spec + quality)"}')"
assert_verdict "SDD re-review template does not fire" no_fire \
  "$(gate_execution_mode_verdict Agent '{"subagent_type":"general-purpose","description":"Re-review Task 3 fix round 2"}')"
assert_verdict "review verb after an adjective does not fire" no_fire \
  "$(gate_execution_mode_verdict Agent '{"subagent_type":"general-purpose","description":"Final review of classifier fix"}')"
assert_verdict "leading implement verb beats a later review noun" fire \
  "$(gate_execution_mode_verdict Agent '{"subagent_type":"general-purpose","description":"Build code review UI"}')"
assert_verdict "ambiguous description fires (recall bias)" fire \
  "$(gate_execution_mode_verdict Agent '{"subagent_type":"general-purpose","description":"Task 4 auth middleware"}')"
assert_verdict "missing description fires (recall bias)" fire \
  "$(gate_execution_mode_verdict Task '{"subagent_type":"general-purpose","prompt":"go"}')"
assert_verdict "review words in the prompt alone do not suppress" fire \
  "$(gate_execution_mode_verdict Agent '{"subagent_type":"general-purpose","description":"Implement Task 1","prompt":"then review your diff"}')"

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
