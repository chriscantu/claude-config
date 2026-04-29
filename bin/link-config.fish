#!/usr/bin/env fish
# Idempotently symlink all repo-managed Claude config artifacts into ~/.claude/.
#
# Single source of truth for symlinking:
#   - rules/*.md, agents/*.md, commands/*.md → ~/.claude/<dir>/<file>
#   - skills/*/ → ~/.claude/skills/<name> (directory symlink)
#   - global/CLAUDE.md → ~/.claude/CLAUDE.md
#   - hooks/*.sh (excluding test-*) → ~/.claude/hooks/<file>
#
# Closes the silent-failure gap surfaced in PR #121: files added under any
# of these locations are NOT auto-loaded by the harness until a per-file
# symlink exists in ~/.claude/<dir>/. Run this script after adding,
# renaming, or removing any file in those directories.
#
# Usage:
#   ./bin/link-config.fish            # idempotent sync; refuse-on-real-file
#   ./bin/link-config.fish --install  # first-time setup; back up real files to .bak
#   ./bin/link-config.fish --check    # exit 1 if any link missing or stale (CI-friendly)
#
# Mode semantics:
#   default — install missing links, repair stale ones, ERROR on real files
#               (real files at the target path are NEVER overwritten)
#   --install — same, but BACK UP real files to <name>.bak then symlink.
#               If <name>.bak already exists, ERROR (won't clobber prior backup).
#   --check — read-only verification; exit 1 on missing/stale, exit 0 if clean
#
# Safe to re-run: existing correct symlinks are left alone, broken or wrong-target
# symlinks are repaired, real files are never silently overwritten.

set -l repo (cd (dirname (status --current-filename))/..; and pwd)
set -l home_claude $HOME/.claude

# Single source of truth for the managed symlink layout — shared with
# validate.fish Phase 1e via bin/lib/symlinks.fish.
source $repo/bin/lib/symlinks.fish

set -g mode install
if test (count $argv) -gt 0
    switch $argv[1]
        case --check
            set -g mode check
        case --install
            set -g mode first-install
        case '*'
            echo "ERROR: unknown argument: $argv[1]" >&2
            echo "Usage: ./bin/link-config.fish [--install | --check]" >&2
            exit 2
    end
end

set -g missing 0
set -g linked 0
set -g skipped 0
set -g errors 0
set -g backed_up 0

# Ensure parent directory exists for a destination link.
# Returns 0 on success, 1 on mkdir failure.
function ensure_parent_dir
    set -l dst_parent $argv[1]
    if test -d $dst_parent
        return 0
    end
    if not mkdir -p $dst_parent
        echo "ERROR: mkdir -p $dst_parent failed" >&2
        set -g errors (math $errors + 1)
        return 1
    end
end

# Link one src → dst (install / first-install path only — check mode routes
# through check_symlink_layout from bin/lib/symlinks.fish).
# Reads global $mode for first-install backup behavior.
#   install       — create or repair symlinks; ERROR on real files
#   first-install — create or repair symlinks; BACK UP real files to .bak then symlink
function link_one
    set -l src $argv[1]
    set -l dst $argv[2]
    set -l label $argv[3]

    # ln -s for files; -sfn for directories. Caller passes literal "dir" as
    # 4th arg when target is a directory (uses -sfn so existing symlink-to-dir
    # is replaced, not descended into).
    set -l ln_flags -s
    if test (count $argv) -ge 4; and test "$argv[4]" = dir
        set ln_flags -sfn
    end

    if test -L $dst
        set -l current (readlink $dst)
        if test "$current" = "$src"
            set -g skipped (math $skipped + 1)
            return 0
        end
        if not rm $dst
            echo "ERROR: rm $dst failed (cannot repair stale symlink)" >&2
            set -g errors (math $errors + 1)
            return 1
        end
        if not ln $ln_flags $src $dst
            echo "ERROR: ln $ln_flags $src $dst failed" >&2
            set -g errors (math $errors + 1)
            return 1
        end
        echo "REPAIRED: $label"
        set -g linked (math $linked + 1)
        return 0
    end

    if test -e $dst
        if test "$mode" = first-install
            # Refuse to clobber an existing .bak — that's a prior backup the
            # user may still need. Force them to resolve manually.
            if test -e $dst.bak
                echo "ERROR: $dst.bak already exists — refusing to overwrite prior backup. Move or remove it manually, then re-run."
                set -g errors (math $errors + 1)
                return 1
            end
            if not mv $dst $dst.bak
                echo "ERROR: mv $dst → $dst.bak failed" >&2
                set -g errors (math $errors + 1)
                return 1
            end
            echo "BACKED UP: $dst → $dst.bak"
            set -g backed_up (math $backed_up + 1)
            if not ln $ln_flags $src $dst
                echo "ERROR: ln $ln_flags $src $dst failed after backup" >&2
                set -g errors (math $errors + 1)
                return 1
            end
            echo "LINKED: $label"
            set -g linked (math $linked + 1)
            return 0
        end
        echo "ERROR: real file at $dst — not a symlink. Skipping (will not overwrite). Re-run with --install to back up and replace."
        set -g errors (math $errors + 1)
        return 0
    end

    if not ln $ln_flags $src $dst
        echo "ERROR: ln $ln_flags $src $dst failed" >&2
        set -g errors (math $errors + 1)
        return 1
    end
    echo "LINKED: $label"
    set -g linked (math $linked + 1)
end

# Check mode: delegate to the shared check_symlink_layout function from
# bin/lib/symlinks.fish. validate.fish Phase 1e uses the same function —
# both validators agree by construction.
if test "$mode" = check
    check_symlink_layout $repo $home_claude | while read -l result
        set parts (string split -m 3 "|" $result)
        set status_kind $parts[1]
        set dst $parts[2]
        set detail $parts[3]
        switch $status_kind
            case OK
                set -g skipped (math $skipped + 1)
            case MISSING
                echo "MISSING link: $dst"
                set -g missing (math $missing + 1)
            case STALE
                echo "STALE link: $dst -> $detail"
                set -g missing (math $missing + 1)
            case NOT_SYMLINK
                echo "ERROR: real file at $dst — not a symlink"
                set -g errors (math $errors + 1)
        end
    end
else
    # Install / first-install: iterate the shared layout and create symlinks.
    each_symlink_target $repo $home_claude | while read -l entry
        set parts (string split -m 3 "|" $entry)
        set kind $parts[1]
        set src $parts[2]
        set dst $parts[3]
        set label $parts[4]

        if not ensure_parent_dir (dirname $dst)
            continue
        end
        if test "$kind" = dir
            link_one $src $dst $label dir
        else
            link_one $src $dst $label
        end
    end
end

echo ""
if test "$mode" = first-install
    echo "Summary: linked=$linked already-ok=$skipped backed-up=$backed_up errors=$errors"
else
    echo "Summary: linked=$linked already-ok=$skipped errors=$errors missing=$missing"
end

if test "$mode" = check
    if test $missing -gt 0; or test $errors -gt 0
        exit 1
    end
end
if test $errors -gt 0
    exit 2
end
