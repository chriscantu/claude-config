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
#   --install — same, but BACK UP real files to <name>.bak then symlink
#   --check — read-only verification; exit 1 on missing/stale, exit 0 if clean
#
# Safe to re-run: existing correct symlinks are left alone, broken or wrong-target
# symlinks are repaired.

set -l repo (cd (dirname (status --current-filename))/..; and pwd)
set -l home_claude $HOME/.claude
set -l md_dirs rules agents commands
# skills/ are directories; hooks/ are .sh files. Each gets its own loop.
set -l skills_src $repo/skills
set -l skills_dst $home_claude/skills
set -l hooks_src $repo/hooks
set -l hooks_dst $home_claude/hooks
set -l claude_md_src $repo/global/CLAUDE.md
set -l claude_md_dst $home_claude/CLAUDE.md

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

# Ensure parent directory exists for a destination link. Honors $mode: in
# check mode, missing dirs count as missing; otherwise mkdir -p.
function ensure_parent_dir
    set -l dst_parent $argv[1]
    if test -d $dst_parent
        return 0
    end
    if test "$mode" = check
        echo "MISSING dir: $dst_parent"
        set -g missing (math $missing + 1)
        return 1
    end
    mkdir -p $dst_parent
end

# Link one src → dst with mode-aware semantics.
# $mode behavior:
#   check         — report STALE/MISSING; never modify filesystem
#   install       — create or repair symlinks; ERROR on real files
#   first-install — create or repair symlinks; BACK UP real files to .bak then symlink
function link_one
    set -l src $argv[1]
    set -l dst $argv[2]
    set -l label $argv[3]

    # ln -s for files, ln -sfn for directories handled by caller via $is_dir.
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
        if test "$mode" = check
            echo "STALE link: $dst -> $current (expected $src)"
            set -g missing (math $missing + 1)
            return 0
        end
        rm $dst
        ln $ln_flags $src $dst
        echo "REPAIRED: $label"
        set -g linked (math $linked + 1)
        return 0
    end

    if test -e $dst
        if test "$mode" = first-install
            mv $dst $dst.bak
            echo "BACKED UP: $dst → $dst.bak"
            set -g backed_up (math $backed_up + 1)
            ln $ln_flags $src $dst
            echo "LINKED: $label"
            set -g linked (math $linked + 1)
            return 0
        end
        echo "ERROR: real file at $dst — not a symlink. Skipping (will not overwrite). Re-run with --install to back up and replace."
        set -g errors (math $errors + 1)
        return 0
    end

    if test "$mode" = check
        echo "MISSING link: $dst"
        set -g missing (math $missing + 1)
        return 0
    end
    ln $ln_flags $src $dst
    echo "LINKED: $label"
    set -g linked (math $linked + 1)
end

# 1. Markdown directories: rules/, agents/, commands/
for dir in $md_dirs
    set -l src_dir $repo/$dir
    set -l dst_dir $home_claude/$dir

    if not test -d $src_dir
        continue
    end

    if not ensure_parent_dir $dst_dir
        continue
    end

    for src in $src_dir/*.md
        set -l name (basename $src)
        # Skip README files — they're documentation, not loadable rules
        if test "$name" = README.md
            continue
        end
        link_one $src $dst_dir/$name "$dir/$name"
    end
end

# 2. Skills: each skill is a directory; symlink the directory itself.
if test -d $skills_src
    if ensure_parent_dir $skills_dst
        for src_dir in $skills_src/*/
            set -l src (string trim --right --chars=/ $src_dir)
            set -l name (basename $src)
            link_one $src $skills_dst/$name "skills/$name" dir
        end
    end
end

# 3. Hooks: link .sh files (skip test fixtures).
if test -d $hooks_src
    if ensure_parent_dir $hooks_dst
        for src in $hooks_src/*.sh
            set -l name (basename $src)
            # Skip test fixtures — they're for repo CI, not the harness.
            if string match -q 'test-*' $name
                continue
            end
            link_one $src $hooks_dst/$name "hooks/$name"
        end
    end
end

# 4. Global CLAUDE.md
if test -f $claude_md_src
    if ensure_parent_dir $home_claude
        link_one $claude_md_src $claude_md_dst "CLAUDE.md"
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
