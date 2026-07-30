#!/usr/bin/env fish
# setup-project-local.fish — render machine-specific PROJECT config that must
# never be committed (it carries per-machine absolute paths).
#
# The committed repo stays path-free: .claude/settings.json and
# .claude/launch.json.template contain no username paths. This script
# localizes them for the current machine into two gitignored files:
#
#   1. .claude/launch.json         rendered from launch.json.template with
#                                  ${HOME} expanded (excalidraw MCP server path)
#   2. .claude/settings.local.json adds $HOME/presentations to
#                                  permissions.additionalDirectories, merged
#                                  into any existing local settings
#
# Idempotent — safe to re-run. Run once after install.sh, or whenever the
# template changes.
#
# Usage:
#   fish bin/setup-project-local.fish        # render local config
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
            echo "Renders machine-specific .claude/launch.json and .claude/settings.local.json"
            echo "from committed, path-free templates. Idempotent; safe to re-run."
            exit 0
        case '*'
            echo "ERROR: unknown argument: $argv[1]" >&2
            echo "Usage: fish bin/setup-project-local.fish [--help]" >&2
            exit 2
    end
end

# --- 1. render launch.json from template --------------------------------
set -l template $repo/.claude/launch.json.template
set -l launch $repo/.claude/launch.json
if not test -f $template
    echo "ERROR: missing template: $template" >&2
    exit 2
end
# Literal (non-regex) substitution of the ${HOME} token, line by line.
string replace -a '${HOME}' $HOME <$template >$launch
if not jq -e . $launch >/dev/null 2>&1
    echo "ERROR: rendered $launch is not valid JSON." >&2
    exit 1
end
echo "Rendered: $launch"

# --- 2. merge presentations dir into settings.local.json ----------------
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
