#!/usr/bin/env fish
# Idempotently symlink all repo-managed Claude config artifacts into ~/.claude/.
#
# Closes the silent-failure gap surfaced in PR #121: files added under
# repos/claude-config/{rules,agents,commands} are NOT auto-loaded by the harness
# until a per-file symlink exists in ~/.claude/<dir>/. Run this script after
# adding, renaming, or removing any file in those directories.
#
# Usage:
#   ./bin/link-config.fish          # install missing links + report
#   ./bin/link-config.fish --check  # exit 1 if any link missing or stale (CI-friendly)
#
# Safe to re-run: existing correct symlinks are left alone, broken or wrong-target
# symlinks are repaired, real files at the target path are NEVER overwritten.

set -l repo (cd (dirname (status --current-filename))/..; and pwd)
set -l home_claude $HOME/.claude
set -l dirs rules agents commands

set -l mode install
if test (count $argv) -gt 0; and test "$argv[1]" = --check
    set mode check
end

set -l missing 0
set -l linked 0
set -l skipped 0
set -l errors 0

for dir in $dirs
    set -l src_dir $repo/$dir
    set -l dst_dir $home_claude/$dir

    if not test -d $src_dir
        continue
    end

    if not test -d $dst_dir
        if test "$mode" = check
            echo "MISSING dir: $dst_dir"
            set missing (math $missing + 1)
            continue
        end
        mkdir -p $dst_dir
    end

    for src in $src_dir/*.md
        set -l name (basename $src)
        # Skip README files — they're documentation, not loadable rules
        if test "$name" = README.md
            continue
        end
        set -l dst $dst_dir/$name

        if test -L $dst
            set -l current (readlink $dst)
            if test "$current" = "$src"
                set skipped (math $skipped + 1)
                continue
            end
            # Symlink exists but points elsewhere
            if test "$mode" = check
                echo "STALE link: $dst -> $current (expected $src)"
                set missing (math $missing + 1)
                continue
            end
            rm $dst
            ln -s $src $dst
            echo "REPAIRED: $dst"
            set linked (math $linked + 1)
        else if test -e $dst
            echo "ERROR: real file at $dst — not a symlink. Skipping (will not overwrite)."
            set errors (math $errors + 1)
        else
            if test "$mode" = check
                echo "MISSING link: $dst"
                set missing (math $missing + 1)
                continue
            end
            ln -s $src $dst
            echo "LINKED: $name"
            set linked (math $linked + 1)
        end
    end
end

echo ""
echo "Summary: linked=$linked already-ok=$skipped errors=$errors missing=$missing"

if test "$mode" = check
    if test $missing -gt 0; or test $errors -gt 0
        exit 1
    end
end
if test $errors -gt 0
    exit 2
end
