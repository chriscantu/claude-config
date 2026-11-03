#!/usr/bin/env fish
# setup-project-local.fish — add $HOME/presentations to the gitignored
# .claude/settings.local.json, so the committed .claude/settings.json stays
# free of per-machine absolute paths.
#
# The path is merged into permissions.additionalDirectories, keeping any
# existing local settings.
#
# Idempotent — safe to re-run. Run once after install.sh.
#
# Usage:
#   fish bin/setup-project-local.fish        # update local settings
#   fish bin/setup-project-local.fish --help

set -l repo (cd (dirname (status --current-filename))/..; and pwd)
if test -z "$repo" -o ! -d "$repo/.claude"
    echo "ERROR: cannot resolve repo root (got: '$repo')." >&2
    echo "       Expected to find <repo>/.claude/ alongside bin/setup-project-local.fish." >&2
    exit 2
end

if test (count $argv) -gt 0
    switch $argv[1]
        case --help -h
            echo "Usage: fish bin/setup-project-local.fish"
            echo ""
            echo "Adds \$HOME/presentations to .claude/settings.local.json."
            echo "Idempotent; safe to re-run."
            exit 0
        case '*'
            echo "ERROR: unknown argument: $argv[1]" >&2
            echo "Usage: fish bin/setup-project-local.fish [--help]" >&2
            exit 2
    end
end

set -l local_settings $repo/.claude/settings.local.json
set -l presentations "$HOME/presentations"
if not test -f $local_settings
    echo "{}" >$local_settings
end
# Refuse to clobber a malformed local settings file.
if not jq -e . $local_settings >/dev/null 2>&1
    echo "ERROR: $local_settings is not valid JSON. Refusing to modify." >&2
    echo "       Fix the file manually, then re-run." >&2
    exit 1
end
set -l tmp (mktemp)
jq --arg d $presentations '
    .permissions //= {}
    | .permissions.additionalDirectories //= []
    | .permissions.additionalDirectories |= ((. + [$d]) | unique)
' $local_settings >$tmp
if test $status -ne 0
    echo "ERROR: jq failed on $local_settings" >&2
    rm -f $tmp
    exit 2
end
if not mv $tmp $local_settings
    echo "ERROR: failed to write $local_settings" >&2
    rm -f $tmp
    exit 2
end
echo "Localized: $local_settings (+ $presentations)"

exit 0
