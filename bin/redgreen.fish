#!/usr/bin/env fish
# bin/redgreen.fish — live RED/GREEN discrimination harness (ADR #0005 §4).
#
# Why this exists:
#   ADR #0005 §4 requires a behavioral rule's discrimination to be *demonstrated,
#   not asserted*: its eval suite must pass with the rule present (GREEN) and fail
#   with the rule removed (RED). The first such proof (execution-mode) was assembled
#   by hand — stripping the ~/.claude/rules/<rule>.md symlink, running the suite,
#   restoring. This script automates that loop so every remaining gate is turnkey.
#   See rules-evals/REDGREEN-RUNBOOK.md for the protocol and the backlog.
#
# Method (mirrors rules-evals/execution-mode/REDGREEN.md):
#   - The ONLY variable is the ~/.claude/rules/<rule>.md symlink target (the harness
#     globs ~/.claude/rules/*.md; there is no @-import in CLAUDE.md). The suite JSON
#     is discovered from this repo and is never the variable.
#   - GREEN: symlink intact, run the suite N times (default 3).
#   - RED-strip: symlink repointed to an emptied copy, run N times (default 2).
#   - The original target is CAPTURED via readlink and restored via trap + explicit
#     end-of-run restore. The repo file is NEVER rm'd; only the symlink is repointed.
#
# Usage:
#   ./bin/redgreen.fish <rule-name> [--green N] [--red N] [--dry-run]
#     <rule-name>   suite under rules-evals/<rule-name>/evals/evals.json
#     --green N     GREEN runs (default 3)
#     --red N       RED-strip runs (default 2)
#     --dry-run     exercise the strip→restore cycle and run the suite with the
#                   runner's --dry-run (no claude sessions, no window spend)
#
# Exit codes:
#   0  ran to completion and the symlink was verified restored
#   1  a run phase could not execute (bun/claude/suite missing)
#   2  usage / setup error (bad args, target is not a symlink, restore failed)
#
# Caveats:
#   - Live runs spawn real Claude Code sessions on your subscription and consume
#     your Max usage window. Do not run concurrent interactive sessions during a
#     live proof — the rule is briefly stripped from ~/.claude for ALL sessions.
#   - Uses env -u ANTHROPIC_API_KEY + EVAL_SKIP_AUTH_PROBE=1, matching the
#     execution-mode proof (subscription path, probe skipped for speed).

set -l repo (cd (dirname (status --current-filename))/..; and pwd)

# ---- arg parse --------------------------------------------------------------
set -l green_runs 3
set -l red_runs 2
set -l dry_run 0
set -l rule_name ""

set -l i 1
while test $i -le (count $argv)
    set -l a $argv[$i]
    switch $a
        case --green
            set i (math $i + 1)
            set green_runs $argv[$i]
        case '--green=*'
            set green_runs (string replace -- '--green=' '' $a)
        case --red
            set i (math $i + 1)
            set red_runs $argv[$i]
        case '--red=*'
            set red_runs (string replace -- '--red=' '' $a)
        case --dry-run
            set dry_run 1
        case '-*'
            echo "ERROR: unknown flag '$a'" >&2
            exit 2
        case '*'
            if test -z "$rule_name"
                set rule_name $a
            else
                echo "ERROR: unexpected extra argument '$a'" >&2
                exit 2
            end
    end
    set i (math $i + 1)
end

if test -z "$rule_name"
    echo "Usage: ./bin/redgreen.fish <rule-name> [--green N] [--red N] [--dry-run]" >&2
    exit 2
end

if not string match -qr '^[0-9]+$' -- $green_runs; or not string match -qr '^[0-9]+$' -- $red_runs
    echo "ERROR: --green/--red must be non-negative integers" >&2
    exit 2
end

# ---- preconditions ----------------------------------------------------------
set -l suite $repo/rules-evals/$rule_name/evals/evals.json
if not test -f $suite
    echo "ERROR: no eval suite at rules-evals/$rule_name/evals/evals.json" >&2
    exit 2
end

if not type -q bun
    echo "ERROR: 'bun' not found on PATH" >&2
    exit 1
end
if test $dry_run -eq 0; and not type -q claude
    echo "ERROR: 'claude' CLI not found on PATH (needed for live runs)" >&2
    exit 1
end

set -g __rg_live_link $HOME/.claude/rules/$rule_name.md
if not test -L $__rg_live_link
    echo "ERROR: $__rg_live_link is not a symlink." >&2
    echo "       The harness only manipulates the live ~/.claude/rules symlink;" >&2
    echo "       run bin/link-config.fish --install first, or check the rule name." >&2
    exit 2
end

# Capture the ORIGINAL target at runtime — it points into whichever clone the
# live config was linked from (e.g. ~/claude-config, not necessarily this repo).
set -g __rg_orig_target (readlink $__rg_live_link)
echo "Live symlink: $__rg_live_link"
echo "  → original target: $__rg_orig_target"

# ---- restore machinery (trap + explicit) ------------------------------------
# Idempotent: ln -sf is safe to call more than once. Never rm the repo file.
# The RED phase repoints the LIVE ~/.claude symlink for ALL sessions, so restore
# MUST cover every exit path — normal return, error abort, and interrupt — not
# just Ctrl-C. A missed restore leaves the HARD-GATE globally stripped with no
# recovery. fish_exit fires on any non-signal exit; the signal handler covers
# INT/TERM/HUP (terminal close). Both funnel through __rg_restore (idempotent).
function __rg_restore --on-event fish_exit
    if test -n "$__rg_orig_target"
        ln -sf $__rg_orig_target $__rg_live_link
    end
end
function __rg_on_signal --on-signal INT --on-signal TERM --on-signal HUP
    echo "" >&2
    echo "⚠️  interrupted — restoring symlink" >&2
    __rg_restore
    if test (readlink $__rg_live_link) = "$__rg_orig_target"
        echo "   symlink restored to $__rg_orig_target" >&2
    else
        echo "   RESTORE FAILED — manually run: ln -sf $__rg_orig_target $__rg_live_link" >&2
    end
    exit 130
end

set -l logdir /tmp/redgreen-$rule_name-logs
mkdir -p $logdir
set -l summaries

# ---- run one suite invocation, capture summary ------------------------------
function __rg_run --argument-names phase idx repo rule logdir dry
    set -l log $logdir/$phase-run$idx.log
    set -l extra
    if test "$dry" = 1
        set extra --dry-run
    end
    # Progress → stderr (prints live); the single matrix line → stdout (captured).
    echo "  [$phase run $idx] → "(string replace $HOME '~' $log) >&2
    env -u ANTHROPIC_API_KEY EVAL_SKIP_AUTH_PROBE=1 \
        bun run $repo/tests/eval-runner-v2.ts $rule --concurrency 1 $extra >$log 2>&1
    set -l rc $status
    set -l summary (grep -E '[0-9]+/[0-9]+ evals passed' $log | tail -1 | string replace -ra '\x1b\[[0-9;]*m' '')
    test -z "$summary"; and set summary "(no summary — see log; rc=$rc)"
    echo "    rc=$rc  $summary" >&2
    echo "$phase run$idx | rc=$rc | $summary"
end

# ---- GREEN phase ------------------------------------------------------------
echo ""
echo "═══ GREEN phase (rule present) ×$green_runs ═══"
for n in (seq 1 $green_runs)
    set -l line (__rg_run GREEN $n $repo $rule_name $logdir $dry_run)
    set summaries $summaries $line
end

# ---- RED-strip phase --------------------------------------------------------
echo ""
echo "═══ RED-strip phase (rule emptied) ×$red_runs ═══"
set -l stripped $logdir/$rule_name.stripped.md
printf '# %s stripped for RED phase by bin/redgreen.fish — do not edit\n' $rule_name >$stripped
ln -sf $stripped $__rg_live_link
echo "  symlink repointed → "(string replace $HOME '~' $stripped)
for n in (seq 1 $red_runs)
    set -l line (__rg_run RED-strip $n $repo $rule_name $logdir $dry_run)
    set summaries $summaries $line
end

# ---- restore + verify -------------------------------------------------------
__rg_restore
echo ""
if test (readlink $__rg_live_link) = "$__rg_orig_target"
    echo "✓ symlink restored → $__rg_orig_target"
else
    echo "✗ RESTORE FAILED — manually run: ln -sf $__rg_orig_target $__rg_live_link" >&2
    exit 2
end

# ---- matrix summary ---------------------------------------------------------
echo ""
echo "═══ Result matrix (paste into rules-evals/$rule_name/REDGREEN.md) ═══"
for s in $summaries
    echo "  $s"
end
echo ""
echo "Per-eval ✓/✗ and Failures blocks are in: "(string replace $HOME '~' $logdir)"/"
if test $dry_run -eq 1
    echo "(--dry-run: no claude sessions ran; this validated strip→restore plumbing only)"
end
exit 0
