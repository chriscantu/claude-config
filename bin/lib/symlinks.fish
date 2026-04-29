# Single source of truth for the claude-config symlink layout.
#
# Two functions, both pure (no I/O side effects):
#
#   each_symlink_target REPO HOME_CLAUDE
#     Yields one line per managed symlink target:
#       kind|src|dst|label
#     where kind ∈ {file, dir}, src is the absolute repo path, dst is the
#     absolute path under ~/.claude, and label is a short human-readable name.
#
#     Layout (canonical here — both validators iterate this function):
#       rules/*.md      → file (README.md skipped)
#       agents/*.md     → file (README.md skipped)
#       commands/*.md   → file (README.md skipped)
#       skills/*/       → dir
#       hooks/*.sh      → file (test-* skipped)
#       global/CLAUDE.md → file (target dst is HOME_CLAUDE/CLAUDE.md)
#
#   check_symlink_layout REPO HOME_CLAUDE
#     Consumes the iterator and yields one status line per entry:
#       status|dst|detail
#     where status ∈ {OK, MISSING, STALE, NOT_SYMLINK}
#       OK          — dst is symlink pointing at src; detail = src
#       MISSING     — dst does not exist; detail = src (expected target)
#       STALE       — dst is symlink with wrong target; detail = current target
#       NOT_SYMLINK — dst exists as real file/dir; detail = "real file"
#
# Both callers (validate.fish Phase 1e and bin/link-config.fish) source this
# file. If the layout changes, edit each_symlink_target — both validators
# inherit the change automatically.

function each_symlink_target --argument-names repo home_claude
    if test -z "$repo"; or test -z "$home_claude"
        echo "each_symlink_target: usage: each_symlink_target REPO HOME_CLAUDE" >&2
        return 2
    end

    # 1. Markdown directories: rules/, agents/, commands/
    for dir in rules agents commands
        set -l src_dir $repo/$dir
        if not test -d $src_dir
            continue
        end
        for src in $src_dir/*.md
            if not test -f $src
                continue
            end
            set -l name (basename $src)
            # README.md is documentation, not a loadable rule/agent/command.
            if test "$name" = README.md
                continue
            end
            printf 'file|%s|%s|%s\n' $src $home_claude/$dir/$name "$dir/$name"
        end
    end

    # 2. Skills: directories.
    set -l skills_src $repo/skills
    if test -d $skills_src
        for src_dir in $skills_src/*/
            set -l src (string trim --right --chars=/ $src_dir)
            set -l name (basename $src)
            printf 'dir|%s|%s|%s\n' $src $home_claude/skills/$name "skills/$name"
        end
    end

    # 3. Hooks: .sh files (skip test fixtures).
    set -l hooks_src $repo/hooks
    if test -d $hooks_src
        for src in $hooks_src/*.sh
            if not test -f $src
                continue
            end
            set -l name (basename $src)
            if string match -q 'test-*' $name
                continue
            end
            printf 'file|%s|%s|%s\n' $src $home_claude/hooks/$name "hooks/$name"
        end
    end

    # 4. Global CLAUDE.md singleton.
    set -l claude_md_src $repo/global/CLAUDE.md
    if test -f $claude_md_src
        printf 'file|%s|%s|%s\n' $claude_md_src $home_claude/CLAUDE.md CLAUDE.md
    end
end

function check_symlink_layout --argument-names repo home_claude
    if test -z "$repo"; or test -z "$home_claude"
        echo "check_symlink_layout: usage: check_symlink_layout REPO HOME_CLAUDE" >&2
        return 2
    end

    each_symlink_target $repo $home_claude | while read -l entry
        set -l parts (string split -m 3 "|" $entry)
        set -l src $parts[2]
        set -l dst $parts[3]

        if test -L $dst
            set -l current (readlink $dst)
            if test "$current" = "$src"
                printf 'OK|%s|%s\n' $dst $src
            else
                printf 'STALE|%s|%s\n' $dst $current
            end
        else if test -e $dst
            printf 'NOT_SYMLINK|%s|%s\n' $dst "real file"
        else
            printf 'MISSING|%s|%s\n' $dst $src
        end
    end
end
