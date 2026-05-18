#!/usr/bin/env fish
# install-scope-tier-hook.fish
#
# Idempotent installer for the scope-tier UserPromptSubmit hook.
# Adds an entry to ~/.claude/settings.json without clobbering other hooks.
# Re-run safely to fix drift.
#
# Usage:
#   fish bin/install-scope-tier-hook.fish           # install
#   fish bin/install-scope-tier-hook.fish --check   # exit 0 if registered, 1 if missing
#   fish bin/install-scope-tier-hook.fish --remove  # remove the hook entry

set -l repo_root (cd (dirname (status --current-filename))/..; and pwd)
set -l hook_path "$repo_root/hooks/scope-tier-memory-check.sh"
set -l settings "$HOME/.claude/settings.json"

if not test -x "$hook_path"
    echo "Error: hook script not executable at $hook_path" >&2
    exit 2
end

if not test -f "$settings"
    echo "{}" > "$settings"
end

set -l mode "install"
if test (count $argv) -gt 0
    switch $argv[1]
        case --check
            set mode "check"
        case --remove
            set mode "remove"
        case '*'
            echo "Unknown flag: $argv[1]" >&2
            echo "Usage: fish bin/install-scope-tier-hook.fish [--check | --remove]" >&2
            exit 2
    end
end

switch $mode
    case check
        if jq -e --arg p "$hook_path" \
            '.hooks.UserPromptSubmit // [] | any(.hooks // [] | any(.command == $p))' \
            "$settings" >/dev/null 2>&1
            echo "Hook registered: $hook_path"
            exit 0
        else
            echo "Hook NOT registered in $settings" >&2
            exit 1
        end

    case remove
        set -l tmp (mktemp)
        jq --arg p "$hook_path" '
            if .hooks.UserPromptSubmit then
                .hooks.UserPromptSubmit |= map(
                    .hooks |= map(select(.command != $p))
                ) | .hooks.UserPromptSubmit |= map(select((.hooks // []) | length > 0))
            else . end
        ' "$settings" > "$tmp"; and mv "$tmp" "$settings"
        echo "Hook removed (if present): $hook_path"
        exit 0

    case install
        set -l tmp (mktemp)
        jq --arg p "$hook_path" '
            .hooks //= {}
            | .hooks.UserPromptSubmit //= []
            | if (.hooks.UserPromptSubmit | any(.hooks // [] | any(.command == $p))) then .
              else .hooks.UserPromptSubmit += [{hooks: [{type: "command", command: $p}]}] end
        ' "$settings" > "$tmp"; and mv "$tmp" "$settings"
        echo "Hook installed: $hook_path"
        echo "Verify: fish $repo_root/bin/install-scope-tier-hook.fish --check"
        exit 0
end
