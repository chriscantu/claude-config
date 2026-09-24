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

# Action matching, unlike speech, must tell an INVOCATION from a MENTION. Bash
# calls name these commands all the time without running them: docs written
# through heredocs, commit messages, grep and sed patterns, this hook's own
# tests. Counting those drowns the sample in false fires.
#
# Two steps do the separating. _gate_strip_mentions first blanks what the shell
# treats as data — single-quoted text, double-quoted text other than $(...) and
# backticks, heredoc bodies, comments. The pattern then matches `gh` only where
# a command can start: a line start or a separator (; & | ( `), then any run of
# words that may precede a command — keywords (then, do, else, if, while,
# until, time; fish's and/or/not), `{`, `!`, VAR=value, command/exec/sudo/env/
# nohup — then an optional path to the gh binary. Keywords count only in that
# run, so `echo if gh pr merge fails` stays a mention.
#
# Known misses, pinned by tests: a command run through something that takes its
# own arguments or options (`xargs gh pr merge`, `timeout 60 gh …`, `sudo -u me
# gh …`), a script passed as a quoted string (`bash -c 'gh pr merge 1'`), and a
# case arm (`a) gh pr merge 1;;`). Each costs one absent log line. Matching them
# would bring the mention class back.
# shellcheck disable=SC2016  # the backticks are regex characters, not an expansion
PR_VALIDATION_CMD_POSITION='(^|[;&|(`])[[:space:]]*((then|do|else|if|while|until|time|and|or|not|\{|!|[A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*|command|exec|sudo|env|nohup)[[:space:]]+)*([^[:space:];&|()`]*/)?'

PR_VALIDATION_ACTION_PATTERN="${PR_VALIDATION_CMD_POSITION}gh[[:space:]]+pr[[:space:]]+(ready|merge)\\b|${PR_VALIDATION_CMD_POSITION}gh[[:space:]]+pr[[:space:]]+edit\\b[^|;&]*--remove-label[[:space:]]+draft"

# _gate_strip_mentions COMMAND → COMMAND with shell data blanked, so only text
# the shell would execute is left to match. Each blanked character becomes a
# space, keeping the output column-aligned with the input: heredoc openers are
# found in the OUTPUT (so a << inside quotes, a comment or $((...)) opens
# nothing) and the delimiter word is then read from the input at that column.
# Quote state carries across lines, so a multi-line commit message stays
# blanked. Approximate by design: it tracks quotes, $'...', $(...) and $((...)),
# backticks, escapes, comments and one heredoc per line — not full shell
# grammar.
_gate_strip_mentions() {
  printf '%s\n' "$1" | awk '
    BEGIN { st = "n"; q = ""; depth = 0; hd = "" }
    {
      line = $0
      if (hd != "") {
        t = line
        if (hd_tabs) sub(/^\t+/, "", t)
        if (t == hd) hd = ""
        print ""
        next
      }
      out = ""
      n = length(line)
      for (i = 1; i <= n; i++) {
        c = substr(line, i, 1)
        nx = substr(line, i + 1, 1)
        if (st == "s") { out = out (c == "\047" ? c : " "); if (c == "\047") st = "n"; continue }
        if (st == "ansi") {
          if (c == "\\") { out = out "  "; i++; continue }
          out = out (c == "\047" ? c : " "); if (c == "\047") st = "n"; continue
        }
        if (st == "ar") {
          out = out " "
          if (c == "(") depth++
          else if (c == ")" && --depth == 0) st = "n"
          continue
        }
        if (st == "d") {
          if (c == "\\") { out = out "  "; i++; continue }
          if (c == "\"") { st = "n"; out = out c; continue }
          if (c == "$" && nx == "(") { st = "sub"; q = ""; depth = 1; out = out "$("; i++; continue }
          if (c == "`") { st = "bt"; out = out c; continue }
          out = out " "; continue
        }
        if (st == "sub") {
          if (q == "s") { out = out (c == "\047" ? c : " "); if (c == "\047") q = ""; continue }
          if (q == "d") {
            if (c == "\\") { out = out "  "; i++; continue }
            out = out (c == "\"" ? c : " "); if (c == "\"") q = ""; continue
          }
          if (c == "\\") { out = out c nx; i++; continue }
          out = out c
          if (c == "\047") q = "s"
          else if (c == "\"") q = "d"
          else if (c == "(") depth++
          else if (c == ")" && --depth == 0) st = "d"
          continue
        }
        if (st == "bt") { out = out c; if (c == "`") st = "d"; continue }
        if (c == "\\") { out = out c nx; i++; continue }
        if (c == "$" && nx == "\047") { st = "ansi"; out = out "$" nx; i++; continue }
        if (c == "$" && nx == "(" && substr(line, i + 2, 1) == "(") { st = "ar"; depth = 2; out = out "   "; i += 2; continue }
        if (c == "\047") { st = "s"; out = out c; continue }
        if (c == "\"") { st = "d"; out = out c; continue }
        if (c == "#" && (i == 1 || substr(line, i - 1, 1) ~ /[ \t;&|(]/)) break
        out = out c
      }
      print out
      if (match(out, /(^|[^<])<<-?[ \t]*[\047"\\]?/)) {
        hd_tabs = (substr(out, RSTART, RLENGTH) ~ /<<-/)
        rest = substr(line, RSTART + RLENGTH)
        if (match(rest, /^[A-Za-z_][A-Za-z0-9_]*/)) hd = substr(rest, 1, RLENGTH)
      }
    }'
}

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
      if _gate_strip_mentions "$payload" | grep -qiE "$PR_VALIDATION_ACTION_PATTERN"; then
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
