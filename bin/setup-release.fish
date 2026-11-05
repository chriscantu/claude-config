#!/usr/bin/env fish
# One-time setup for the release copy: a detached git worktree of origin/main
# that ~/.claude links to, so everyday sessions run only merged config.
# Safe to re-run.
#
# Usage: fish bin/setup-release.fish [--repo DIR] [--install]
#   --repo DIR   checkout to add the worktree to (default: this checkout)
#   --install    back up real files in ~/.claude as .bak before linking
#                (default is the safe sync, which errors on real files)
#
# Env:
#   CLAUDE_CONFIG_RELEASE_DIR   release copy location (default ~/.claude-config-release)
#   FIRST_RUN_SETTINGS_PATH     settings.json to edit (default ~/.claude/settings.json)
#
# Exit: 0 ok, 2 setup error.

set -l repo (cd (dirname (status --current-filename))/..; and pwd)
set -l link_flags
set -l i 1
while test $i -le (count $argv)
    switch $argv[$i]
        case --repo
            set i (math $i + 1)
            if test $i -gt (count $argv)
                echo "ERROR: --repo needs a directory" >&2
                exit 2
            end
            set repo $argv[$i]
        case --install
            set link_flags --install
        case '*'
            echo "ERROR: unknown argument: $argv[$i]" >&2
            echo "Usage: fish bin/setup-release.fish [--repo DIR] [--install]" >&2
            exit 2
    end
    set i (math $i + 1)
end

set -l release $HOME/.claude-config-release
test -n "$CLAUDE_CONFIG_RELEASE_DIR"; and set release $CLAUDE_CONFIG_RELEASE_DIR
set -l settings $HOME/.claude/settings.json
test -n "$FIRST_RUN_SETTINGS_PATH"; and set settings $FIRST_RUN_SETTINGS_PATH
set -l hook_cmd "$HOME/.claude/hooks/config-release-update.sh"

if not git -C $repo fetch -q origin main
    echo "ERROR: git fetch origin main failed in $repo" >&2
    exit 2
end

if test -e $release -a ! -e $release/.git
    echo "ERROR: $release exists but is not a git checkout. Move it aside and re-run." >&2
    exit 2
end

if not test -e $release/.git
    if not git -C $repo worktree add -q --detach $release origin/main
        echo "ERROR: could not create the release copy at $release" >&2
        exit 2
    end
    echo "Created release copy: $release"
end

if not fish $release/bin/link-config.fish $link_flags
    echo "ERROR: link-config.fish failed for $release" >&2
    exit 2
end

# --- register the SessionStart updater hook in settings.json -------------
mkdir -p (dirname $settings)
if not test -f $settings
    echo '{}' > $settings
end
if not jq -e . $settings >/dev/null 2>&1
    echo "ERROR: $settings is not valid JSON; not touching it." >&2
    exit 2
end

set -l already (jq --arg f config-release-update.sh \
    '[.hooks.SessionStart[]?.hooks[]? | select((.command // "") | endswith($f))] | length' $settings)
if test "$already" != 0
    echo "Hook already registered in $settings"
    exit 0
end

set -l backup "$settings.bak."(date -u +%Y%m%dT%H%M%SZ)
if not cp $settings $backup
    echo "ERROR: failed to back up $settings" >&2
    exit 2
end
echo "Backed up: $settings -> $backup"

set -l tmp (mktemp)
jq --arg cmd $hook_cmd '
    .hooks //= {}
    | .hooks.SessionStart //= []
    | .hooks.SessionStart += [{hooks: [{type: "command", command: $cmd, timeout: 5}]}]
' $settings > $tmp
if test $status -ne 0; or not mv $tmp $settings
    rm -f $tmp
    echo "ERROR: could not write $settings" >&2
    exit 2
end
echo "Registered SessionStart hook: $hook_cmd"
