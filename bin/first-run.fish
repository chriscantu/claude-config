#!/usr/bin/env fish
# first-run.fish — guided first-run personalization for claude-config.
#
# Drops time-to-first-value after `bash install.sh` from "hours of fish +
# symlink + hook troubleshooting" to "<10min interactive walkthrough" by:
#   1. Detecting whether the user has already customized global/CLAUDE.md
#   2. Prompting for shell flavor, primary language, TDD discipline,
#      sycophancy intensity, and caveman opt-in
#   3. Atomically writing a managed block into global/CLAUDE.md
#   4. Registering the two repo hooks in ~/.claude/settings.json
#      (block-dangerous-git.sh, scope-tier-memory-check.sh)
#   5. Verifying the install via link-config.fish --check + validate.fish
#   6. Printing three next-action suggestions
#
# Issue #378. Safe to re-run: idempotent via the managed-block marker pair
# (<!-- managed:first-run --> ... <!-- /managed:first-run -->). User edits
# outside the managed block are preserved.
#
# Usage:
#   fish bin/first-run.fish            # interactive walkthrough
#   fish bin/first-run.fish --help     # this help
#
# Test hooks (undocumented, used by tests/first-run.test.ts only):
#   FIRST_RUN_ANSWERS=<csv>            # pre-fill answers in order:
#                                        shell,language,tdd,sycophancy,caveman,hooks,probe
#                                        e.g. "fish,TypeScript,pragmatic,default,N,Y,N"
#   FIRST_RUN_SETTINGS_PATH=<path>     # override ~/.claude/settings.json target
#   FIRST_RUN_CLAUDE_MD_PATH=<path>    # override global/CLAUDE.md target
#   FIRST_RUN_SKIP_VERIFY=1            # skip link-config/validate gates
#                                        (tests run them separately)

set -l repo (cd (dirname (status --current-filename))/..; and pwd)
if test -z "$repo" -o ! -d "$repo/global"
    echo "ERROR: cannot resolve repo root (got: '$repo')." >&2
    echo "       Expected to find <repo>/global/ alongside bin/first-run.fish." >&2
    exit 2
end

# --- preflight: detect pre-install state (#396) -------------------------
# bin/first-run.fish is the POST-install walkthrough. If a user runs it
# before `bash install.sh`, the verify phase eventually dumps a 42-line
# "MISSING link:" wall — functional, but a hostile failure for the VPs /
# Sr Directors that issue #378 names as audience. Catch the common case
# early with a one-paragraph "run install.sh first" message.
#
# Probe on ~/.claude/rules/ because link-config.fish --install owns that
# directory exclusively. Its absence is a strong signal install hasn't
# run. Partial-install detection is intentionally out of scope per #396.
if not test -d "$HOME/.claude/rules"
    echo "ERROR: ~/.claude/rules/ not found." >&2
    echo "       bin/first-run.fish is the post-install walkthrough." >&2
    echo "       Run 'bash install.sh' from the repo root first, then re-run this script." >&2
    exit 2
end

# --- args ---------------------------------------------------------------

if test (count $argv) -gt 0
    switch $argv[1]
        case --help -h
            echo "Usage: fish bin/first-run.fish"
            echo ""
            echo "Interactive personalization walkthrough. Run once after install.sh."
            echo "Safe to re-run — managed block is replaced, user edits preserved."
            exit 0
        case '*'
            echo "ERROR: unknown argument: $argv[1]" >&2
            echo "Usage: fish bin/first-run.fish [--help]" >&2
            exit 2
    end
end

# --- paths --------------------------------------------------------------

set -l claude_md $repo/global/CLAUDE.md
if set -q FIRST_RUN_CLAUDE_MD_PATH
    set claude_md $FIRST_RUN_CLAUDE_MD_PATH
end

set -l settings $HOME/.claude/settings.json
if set -q FIRST_RUN_SETTINGS_PATH
    set settings $FIRST_RUN_SETTINGS_PATH
end

set -l marker_open  "<!-- managed:first-run -->"
set -l marker_close "<!-- /managed:first-run -->"

set -l hook_dangerous "$repo/hooks/block-dangerous-git.sh"
set -l hook_scopetier "$repo/hooks/scope-tier-memory-check.sh"

# --- preflight: validate hook exec bits before any mutation -------------
# Even if the user declines hook registration later, we fail fast here so
# a broken checkout never produces a half-applied install (patched
# CLAUDE.md + skipped hooks).

if not test -x $hook_dangerous
    echo "ERROR: hook not executable: $hook_dangerous" >&2
    exit 2
end
if not test -x $hook_scopetier
    echo "ERROR: hook not executable: $hook_scopetier" >&2
    exit 2
end

# --- answer source: env CSV (tests) or interactive read -----------------

set -g ANSWER_INDEX 1
set -g ANSWER_LIST
if set -q FIRST_RUN_ANSWERS
    set ANSWER_LIST (string split "," -- $FIRST_RUN_ANSWERS)
end

function ask --argument-names prompt_text default_value
    if set -q FIRST_RUN_ANSWERS
        if test $ANSWER_INDEX -gt (count $ANSWER_LIST)
            echo "ERROR: FIRST_RUN_ANSWERS exhausted at index $ANSWER_INDEX" >&2
            exit 2
        end
        set -l a $ANSWER_LIST[$ANSWER_INDEX]
        set -g ANSWER_INDEX (math $ANSWER_INDEX + 1)
        if test -z "$a"
            echo $default_value
        else
            echo $a
        end
        return 0
    end
    set -l reply
    read -P "$prompt_text " reply
    if test -z "$reply"
        echo $default_value
    else
        echo $reply
    end
end

# --- step 1: detect fresh vs customized ---------------------------------

if not test -f $claude_md
    echo "ERROR: $claude_md not found. Run install.sh first." >&2
    exit 2
end

# If marker present, this is a re-run — safe to proceed (we'll replace
# only the managed block). If marker absent, check whether the user has
# edited the file vs the repo HEAD. If they have, abort cleanly.
set -l marker_present 0
if grep -qF "$marker_open" $claude_md
    set marker_present 1
end

if test $marker_present -eq 0
    # No marker yet — this is either a true fresh install OR a user who
    # has stripped/rewritten global/CLAUDE.md. Discriminate on a stable
    # upstream sentinel: the H1 heading shipped from main. If it's absent,
    # the user has customized the file and we refuse to touch it.
    if not grep -qF "# Global Claude Code Configuration" $claude_md
        echo "ERROR: $claude_md has local edits and no managed block." >&2
        echo "       Refusing to overwrite. To re-init: restore the upstream" >&2
        echo "       global/CLAUDE.md, or manually add the marker pair:" >&2
        echo "         $marker_open" >&2
        echo "         $marker_close" >&2
        exit 1
    end
end

# --- step 2: prompt for personalization ---------------------------------

echo "claude-config first-run personalization"
echo "---------------------------------------"

# Per-option rationale (#395): the audience #378 names (VPs / Sr Directors)
# can't make informed choices without one-line glosses on the project's
# vocabulary. Defaults remain selectable by Enter.

echo ""
echo "Shell flavor:"
echo "  fish  — recommended; commits + scripts assume fish syntax"
echo "  bash  — POSIX-portable; some helpers degrade gracefully"
echo "  zsh   — macOS default; mostly compatible with bash path"
set -l shell_choice (ask "Choose [fish]:" fish)

echo ""
echo "Primary language:"
echo "  TypeScript — required for new server-side code per global CLAUDE.md"
echo "  Python | Go | other — annotation only; doesn't change tooling"
set -l lang_choice  (ask "Choose [TypeScript]:" TypeScript)

echo ""
echo "TDD discipline:"
echo "  strict     — tests written before code, always"
echo "  pragmatic  — tests written before code for non-trivial logic"
echo "  off        — no test-first enforcement"
set -l tdd_choice   (ask "Choose [pragmatic]:" pragmatic)

echo ""
echo "Sycophancy intensity (how often Claude pushes back vs agrees):"
echo "  default    — anti-sycophancy baseline; challenges assumptions"
echo "  tone-down  — softer pushback; more conversational"
echo "  tone-up    — stronger pushback; more adversarial review"
set -l syco_choice  (ask "Choose [default]:" default)

echo ""
echo "Caveman terseness mode (compresses Claude's output ~75%):"
echo "  drops articles, filler, pleasantries; technical accuracy preserved"
echo "  off by default; toggle anytime via /caveman"
set -l caveman_yn   (ask "Enable? (y/N) [N]:" N)

# Validate enum-shaped answers; fall back to default on garbage. Keeps the
# managed block sane even if a user fat-fingers an option.
if not contains -- $shell_choice fish bash zsh
    set shell_choice fish
end
if not contains -- $tdd_choice strict pragmatic off
    set tdd_choice pragmatic
end
if not contains -- $syco_choice default tone-down tone-up
    set syco_choice default
end
set -l caveman_enabled "no"
if string match -qi 'y*' -- $caveman_yn
    set caveman_enabled "yes"
end

# --- step 3: patch global/CLAUDE.md atomically --------------------------

# Build the managed block content.
set -l block_tmp (mktemp)
echo "$marker_open" > $block_tmp
echo "" >> $block_tmp
echo "## First-Run Personalization" >> $block_tmp
echo "" >> $block_tmp
echo "Generated by `bin/first-run.fish`. Re-run that script to update." >> $block_tmp
echo "" >> $block_tmp
echo "- Shell flavor: `$shell_choice`" >> $block_tmp
echo "- Primary language: `$lang_choice`" >> $block_tmp
echo "- TDD discipline: `$tdd_choice`" >> $block_tmp
echo "- Sycophancy intensity: `$syco_choice`" >> $block_tmp
echo "- Caveman terseness: `$caveman_enabled`" >> $block_tmp
echo "" >> $block_tmp
echo "$marker_close" >> $block_tmp

# Write the file: preserve everything outside the marker pair; replace
# everything inside (or append at end if no marker present).
set -l out_tmp (mktemp)
if test $marker_present -eq 1
    # Replace existing block. awk handles multi-line marker replacement
    # without sed portability headaches.
    #
    # IDEMPOTENCY CONTRACT: $block_tmp ALREADY contains its own open + close
    # marker pair (built above). This awk drops the EXISTING markers + their
    # contents from $claude_md and splices in the entire $block_tmp verbatim
    # — markers included. If you ever change the block builder to omit the
    # markers, this branch will silently strip them on re-run and the next
    # invocation will append a new block instead of replacing. Test
    # `idempotent re-run` asserts opens.length === 1 across N runs; keep it.
    awk -v marker_open_s="$marker_open" -v marker_close_s="$marker_close" -v blockfile="$block_tmp" '
        BEGIN { in_block = 0 }
        index($0, marker_open_s) == 1 && !in_block {
            in_block = 1
            while ((getline line < blockfile) > 0) print line
            close(blockfile)
            next
        }
        in_block && index($0, marker_close_s) == 1 { in_block = 0; next }
        !in_block { print }
    ' $claude_md > $out_tmp
else
    # Append: copy existing file, then a blank line, then the block.
    cat $claude_md > $out_tmp
    # Ensure trailing newline before the block.
    if test (tail -c 1 $out_tmp | wc -l | string trim) = "0"
        echo "" >> $out_tmp
    end
    echo "" >> $out_tmp
    cat $block_tmp >> $out_tmp
end

if not mv $out_tmp $claude_md
    echo "ERROR: failed to write $claude_md" >&2
    rm -f $block_tmp $out_tmp
    exit 2
end
rm -f $block_tmp

echo "Patched: $claude_md"

# --- step 4: enable hooks (optional) ------------------------------------

set -l hooks_yn (ask "Register repo hooks (block-dangerous-git, scope-tier-memory-check) in $settings? (Y/n) [Y]:" Y)
set -l hooks_enabled 0
if string match -qi 'y*' -- $hooks_yn
    set hooks_enabled 1
end

if test $hooks_enabled -eq 1
    # Hook paths + exec-bit validation already ran at preflight (top of file).

    # Ensure parent dir exists and seed an empty settings.json if missing.
    set -l settings_dir (dirname $settings)
    if not test -d $settings_dir
        mkdir -p $settings_dir
    end

    # TOCTOU mutex (#394). The validate → backup → patched-write sequence
    # below is non-atomic across forks; a concurrent first-run.fish (or any
    # other tool that mutates $settings) can race between stages and lose
    # one writer's edits or corrupt the merged result. Guard the whole
    # sequence with a `mkdir` lock — atomic on every POSIX filesystem and
    # portable to Darwin (which has no `flock(1)`).
    set -l lock_dir_path "$settings.lock"

    # Validate the timeout env override. Untrusted input must not flow to
    # `math` unchecked: 0 / negative / non-numeric values break the loop
    # or produce instant-DoS. Clamp to a sane range.
    set -l lock_timeout_secs 30
    if set -q FIRST_RUN_LOCK_TIMEOUT_SECS
        if string match -rq '^[0-9]+$' -- $FIRST_RUN_LOCK_TIMEOUT_SECS
            set lock_timeout_secs $FIRST_RUN_LOCK_TIMEOUT_SECS
            if test $lock_timeout_secs -lt 1
                set lock_timeout_secs 1
            else if test $lock_timeout_secs -gt 3600
                set lock_timeout_secs 3600
            end
        else
            echo "ERROR: FIRST_RUN_LOCK_TIMEOUT_SECS must be a non-negative integer (got: $FIRST_RUN_LOCK_TIMEOUT_SECS)" >&2
            exit 2
        end
    end

    # Pre-arm the release handler with a sentinel that's only flipped AFTER
    # acquisition. Defining the handler BEFORE the wait-loop closes a race
    # where a SIGINT during the loop could leave a sibling lockdir orphan;
    # the sentinel ensures we never rmdir a lock another process holds.
    set -g FIRST_RUN_LOCK_DIR ""
    function __first_run_release_settings_lock --on-event fish_exit
        if set -q FIRST_RUN_LOCK_DIR
            if test -n "$FIRST_RUN_LOCK_DIR"
                rmdir $FIRST_RUN_LOCK_DIR 2>/dev/null
            end
            set -e FIRST_RUN_LOCK_DIR
        end
    end

    set -l lock_deadline_attempts (math "ceil($lock_timeout_secs / 0.5)")
    set -l lock_attempts 0
    while not mkdir $lock_dir_path 2>/dev/null
        set lock_attempts (math $lock_attempts + 1)
        if test $lock_attempts -gt $lock_deadline_attempts
            echo "ERROR: cannot acquire settings lock at $lock_dir_path (held >$lock_timeout_secs"s")." >&2
            echo "       Another first-run.fish or settings-writer is in progress." >&2
            echo "       Known gap: a SIGKILL'd holder leaks the lockdir; remove manually:" >&2
            echo "         rmdir $lock_dir_path" >&2
            exit 2
        end
        sleep 0.5
    end

    # Acquisition confirmed. Verify the lockdir we just created is ours
    # (not a pre-existing symlink an attacker planted at a predictable
    # path) BEFORE committing to it. Refuse if the dir is a symlink or
    # not owned by current user.
    if test -L $lock_dir_path -o ! -O $lock_dir_path
        echo "ERROR: settings lockdir $lock_dir_path is a symlink or not owned by current user; refusing." >&2
        rmdir $lock_dir_path 2>/dev/null
        exit 2
    end

    # Arm the release sentinel only after all acquisition checks pass.
    set FIRST_RUN_LOCK_DIR $lock_dir_path

    if not test -f $settings
        echo "{}" > $settings
    end

    # Validate JSON before touching it — refuse to clobber a malformed file.
    if not jq -e . $settings >/dev/null 2>&1
        echo "ERROR: $settings is not valid JSON. Refusing to modify." >&2
        echo "       Fix the file manually, then re-run." >&2
        exit 1
    end

    # Backup with ISO-8601 timestamp. tests assert the .bak.<timestamp>
    # exists, so the suffix must be predictable.
    set -l ts (date -u +%Y%m%dT%H%M%SZ)
    set -l backup "$settings.bak.$ts"
    if not cp $settings $backup
        echo "ERROR: failed to back up $settings" >&2
        exit 2
    end
    echo "Backed up: $settings -> $backup"

    # Add Bash permission entries for both hook absolute paths. Dedup by
    # exact string match in .permissions.allow.
    set -l tmp (mktemp)
    jq --arg d "Bash($hook_dangerous)" --arg s "Bash($hook_scopetier)" '
        .permissions //= {}
        | .permissions.allow //= []
        | .permissions.allow |= (
            (. + [$d, $s])
            | unique_by(.)
            | sort
        )
    ' $settings > $tmp
    if test $status -ne 0
        echo "ERROR: jq failed on $settings" >&2
        rm -f $tmp
        exit 2
    end
    if not mv $tmp $settings
        echo "ERROR: failed to write $settings" >&2
        rm -f $tmp
        exit 2
    end
    echo "Registered hooks in: $settings"
else
    echo "Skipped hook registration."
end

# --- step 5: verify -----------------------------------------------------

if not set -q FIRST_RUN_SKIP_VERIFY
    echo ""
    echo "Verifying install..."

    if not fish $repo/bin/link-config.fish --check
        echo "ERROR: link-config.fish --check failed. See output above for missing rule(s)." >&2
        exit 1
    end

    if not fish $repo/validate.fish
        echo "ERROR: validate.fish failed. See output above." >&2
        exit 1
    end

    set -l probe_yn (ask "Run live load probe via verify-rule-loaded.fish --all? (uses Claude API quota / subscription auth) (y/N) [N]:" N)
    if string match -qi 'y*' -- $probe_yn
        echo "Running live probe (this incurs API cost)..."
        if not fish $repo/bin/verify-rule-loaded.fish --all
            echo "ERROR: verify-rule-loaded.fish --all reported missing rule(s)." >&2
            exit 1
        end
    else
        echo "Skipped live probe."
    end
end

# --- step 6: next actions -----------------------------------------------

echo ""
echo "Done. Next actions:"
echo "  1. Try /define-the-problem in a fresh 'claude' session"
echo "  2. Browse /catalog for the skill inventory"
echo "  3. Read docs/operations.md for the long-form ops guide"
exit 0
