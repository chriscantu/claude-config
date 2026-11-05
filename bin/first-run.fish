#!/usr/bin/env fish
# first-run.fish — guided first-run personalization for claude-config.
#
# Drops time-to-first-value after `bash install.sh` from "hours of fish +
# symlink + hook troubleshooting" to "<10min interactive walkthrough" by:
#   1. Prompting for shell flavor, primary language, TDD discipline,
#      sycophancy intensity, and caveman opt-in
#   2. Atomically writing the answers to
#      ~/.claude/rules/first-run-personalization.md
#   3. Registering the guard hook in ~/.claude/settings.json
#      (~/.claude/hooks/block-dangerous-git.sh)
#   4. Verifying the install via link-config.fish --check + validate.fish
#   5. Printing three next-action suggestions
#
# Issue #378. Safe to re-run: the script owns the whole prefs file and
# replaces it. Answers go to a per-user rule, not the tracked, shared
# global/CLAUDE.md, so one user's answers never ship to every clone.
# Claude Code loads regular files in ~/.claude/rules/ as user-level rules.
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
            echo "Safe to re-run — your saved answers are replaced."
            exit 0
        case '*'
            echo "ERROR: unknown argument: $argv[1]" >&2
            echo "Usage: fish bin/first-run.fish [--help]" >&2
            exit 2
    end
end

# --- paths --------------------------------------------------------------

set -l prefs $HOME/.claude/rules/first-run-personalization.md

set -l settings $HOME/.claude/settings.json
if set -q FIRST_RUN_SETTINGS_PATH
    set settings $FIRST_RUN_SETTINGS_PATH
end

# Register the ~/.claude/hooks link, not this checkout's file: the link
# follows whatever ~/.claude links to (the release copy), so a branch
# checkout never ends up guarding every session.
set -l hook_dangerous "$HOME/.claude/hooks/block-dangerous-git.sh"

# --- preflight: validate hook exec bits before any mutation -------------
# Even if the user declines hook registration later, we fail fast here so
# a broken checkout never produces a half-applied install (written
# prefs file + skipped hooks).

if not test -x $hook_dangerous
    echo "ERROR: hook not executable: $hook_dangerous" >&2
    echo "       Run 'fish install.fish' from the repo root first, then re-run this script." >&2
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

# --- step 1: prompt for personalization ---------------------------------

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
# prefs file sane even if a user fat-fingers an option.
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

# --- step 2: write the prefs rule atomically ----------------------------

# Write beside the target, then rename: a same-directory mv is atomic, so
# Claude Code never loads a half-written file.
set -l prefs_tmp (mktemp "$prefs.XXXXXX")
begin
    echo "## First-Run Personalization"
    echo ""
    echo "Generated by `bin/first-run.fish`. Re-run that script to update; it replaces this file."
    echo ""
    echo "- Shell flavor: `$shell_choice`"
    echo "- Primary language: `$lang_choice`"
    echo "- TDD discipline: `$tdd_choice`"
    echo "- Sycophancy intensity: `$syco_choice`"
    echo "- Caveman terseness: `$caveman_enabled`"
end > $prefs_tmp

if not mv $prefs_tmp $prefs
    echo "ERROR: failed to write $prefs" >&2
    rm -f $prefs_tmp
    exit 2
end

echo "Saved preferences: $prefs"

# --- step 3: enable hooks (optional) ------------------------------------

set -l hooks_yn (ask "Register repo hook (block-dangerous-git) in $settings? (Y/n) [Y]:" Y)
set -l hooks_enabled 0
if string match -qi 'y*' -- $hooks_yn
    set hooks_enabled 1
end

if test $hooks_enabled -eq 1
    # Hook paths + exec-bit validation already ran at preflight (top of file).

    # True when a PreToolUse entry that fires on Bash runs the same real file
    # as $hook. Commands that aren't plain paths (args, ${VARS}) don't count.
    function __first_run_guard_registered --argument-names settings hook
        set -l hook_real (realpath $hook)
        # objects/strings skip malformed elements; a jq error here would
        # read as "not registered" and add a new entry on every run.
        set -l bash_matcher '(.matcher // "") | strings | test("^[*]?$|Bash")'
        for cmd in (jq -r ".hooks.PreToolUse[]? | objects | select($bash_matcher) | .hooks[]?.command? // empty" $settings)
            if test -e "$cmd"; and test (realpath -- "$cmd") = "$hook_real"
                return 0
            end
        end
        return 1
    end

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

    # Skip adding the PreToolUse entry when one already runs the same file.
    # Compare real paths, not strings: an entry may name the link or the
    # file it points at, and a second entry would run the guard twice.
    set -l add_hook true
    if __first_run_guard_registered $settings $hook_dangerous
        set add_hook false
    end

    set -l tmp (mktemp)
    jq --arg cmd $hook_dangerous --argjson add_hook $add_hook '
        if $add_hook then
            .hooks //= {}
            | .hooks.PreToolUse //= []
            | .hooks.PreToolUse += [{
                matcher: "Bash",
                hooks: [{type: "command", command: $cmd, timeout: 5}]
            }]
          else . end
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
    # Read back before claiming success (#557: this line once printed with
    # no hook written).
    if not __first_run_guard_registered $settings $hook_dangerous
        echo "ERROR: wrote $settings but no PreToolUse hook runs $hook_dangerous" >&2
        exit 2
    end
    echo "Registered hooks in: $settings"
else
    echo "Skipped hook registration."
end

# --- step 4: verify -----------------------------------------------------

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

# --- step 5: next actions -----------------------------------------------

echo ""
echo "Done. Next actions:"
echo "  1. Try /define-the-problem in a fresh 'claude' session"
echo "  2. Browse /catalog for the skill inventory"
echo "  3. Read docs/operations.md for the long-form ops guide"
exit 0
