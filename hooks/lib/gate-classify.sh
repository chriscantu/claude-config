#!/bin/bash
# gate-classify.sh — Phase 1 shadow classifier (sourced, never executed).
#
# Answers one question per gate: given an event the agent just produced, SHOULD
# the gate fire? Phase 1 only logs the answer — both rules stay loaded and
# nothing here changes behavior. Phase 2 reuses these same functions to inject
# the guidance once the rule text is unlinked, so the verdicts measured in
# Phase 1 are the verdicts Phase 2 ships. Forking the two would measure one
# classifier and deploy a different one.
#
# Every function is PURE: input as arguments, one record on stdout, no I/O.
# That is the seam tests/hooks/gate-classify.test.sh crosses directly.
#
# Record shape (space-separated, jq-free so the adapter can parse it with grep):
#   gate=<name> trigger=<label> verdict=<fire|no_fire>
#
# No `set -u` here: a sourced file must not mutate the caller's shell options.

# ── pr-validation ────────────────────────────────────────────────────────────
# Two trigger classes, per rules/pr-validation.md:
#   action — a draft-promoting tool call (`gh pr ready`, `gh pr merge`, …)
#   speech — the agent's own claim of readiness in its final text
#
# Speech matching is recall-biased on purpose: over-firing is visible in the
# log and correctable, while a missed claim is the failure the rule exists to
# catch. The negation guard keeps "not ready to merge" from counting as a
# readiness claim — without it the sample fills with inverted verdicts.

# Anchored to a command position — start of a line, or straight after a shell
# separator — so the pattern matches an INVOCATION, not a mention. Unanchored,
# the first real shadow verdict was a false positive: a heredoc writing the docs
# table that lists these very commands. Docs, commit messages, grep patterns and
# this hook's own tests all name them.
#
# The cost is that an indirect invocation (`xargs gh pr merge`) reads as a
# mention and is missed. That trade is deliberate: a missed exotic form shows up
# as one absent log line, while the mention class fires on routine work and
# would drown the sample.
PR_VALIDATION_CMD_POSITION='(^|[;&|(])[[:space:]]*'

PR_VALIDATION_ACTION_PATTERN="${PR_VALIDATION_CMD_POSITION}gh[[:space:]]+pr[[:space:]]+(ready|merge)\\b|${PR_VALIDATION_CMD_POSITION}gh[[:space:]]+pr[[:space:]]+edit\\b[^|;]*--remove-label[[:space:]]+draft"

PR_VALIDATION_SPEECH_PATTERN='ready (to|for) (merge|ship|review)|ready to go\b|pr is done\b|implementation complete\b|feature complete\b|looks good to merge\b|good to go\b|shipping this\b'

PR_VALIDATION_NEGATOR='(not|never|no|cannot|can.t|won.t|wouldn.t|isn.t|aren.t|wasn.t|don.t|doesn.t|didn.t)'

# _gate_speech_is_negated TEXT → 0 when every readiness phrase in TEXT sits
# within ~20 characters of a preceding negator. Sentence punctuation bounds the
# window so a negation in the previous sentence does not suppress this one.
_gate_speech_is_negated() {
  local text="$1"
  echo "$text" | grep -qiE "${PR_VALIDATION_NEGATOR}[^.!?]{0,20}(${PR_VALIDATION_SPEECH_PATTERN})"
}

# gate_pr_validation_verdict SURFACE PAYLOAD
#   SURFACE  bash | stop
#   PAYLOAD  the Bash command string, or the agent's final text
gate_pr_validation_verdict() {
  local surface="$1" payload="${2:-}"
  local trigger=none verdict=no_fire

  case "$surface" in
    bash)
      if echo "$payload" | grep -qiE "$PR_VALIDATION_ACTION_PATTERN"; then
        trigger=action
        verdict=fire
      fi
      ;;
    stop)
      if echo "$payload" | grep -qiE "$PR_VALIDATION_SPEECH_PATTERN"; then
        trigger=speech
        if ! _gate_speech_is_negated "$payload"; then
          verdict=fire
        fi
      fi
      ;;
  esac

  printf 'gate=pr-validation trigger=%s verdict=%s\n' "$trigger" "$verdict"
}

# ── execution-mode ───────────────────────────────────────────────────────────
# The rule requires a mode announcement BEFORE the first implementer dispatch.
# A tool call is the only observable that a dispatch is starting; the hook
# cannot size the plan (task count, LOC, file spread) from it, so the verdict
# is "an announcement was owed here", not "which mode was right". Phase 2
# injects the sizing criteria at this same moment and lets the model size it.

# gate_execution_mode_verdict TOOL_NAME TOOL_INPUT_JSON
gate_execution_mode_verdict() {
  local tool="$1" input="${2:-}"
  local trigger=none verdict=no_fire

  case "$tool" in
    Skill)
      if echo "$input" | grep -qi 'subagent-driven-development'; then
        trigger=skill_dispatch
        verdict=fire
      fi
      ;;
    Task|Agent)
      trigger=task_dispatch
      verdict=fire
      ;;
  esac

  printf 'gate=execution-mode trigger=%s verdict=%s\n' "$trigger" "$verdict"
}
