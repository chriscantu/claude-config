#!/usr/bin/env fish
# Turn on the harness-enforced safety settings in ~/.claude/settings.json (#591).
#
# Prompts are not guarantees; deny rules, the sandbox, and hooks are. This
# script merges templates/safety-settings.json into your user settings and
# registers hooks/block-secret-reads.sh:
#   - Read deny rules for .env files, ~/.ssh, and credentials/ directories.
#     With the sandbox on, these also block shell commands at the OS level.
#   - The sandbox for shell commands, with no unsandboxed retry. `gh` runs
#     outside it because it fails TLS checks under the macOS sandbox.
#   - A PreToolUse hook that blocks Bash commands naming those files, so they
#     stay blocked when the sandbox is off or can't start.
#
# It only fills gaps: rules and list entries are added, and a sandbox key you
# already set (for example "enabled": false) is left alone. Re-run safely.
# Your autoMode settings stay personal; this script never touches them.
#
# Run: fish bin/setup-safety.fish
# Env: FIRST_RUN_SETTINGS_PATH  settings.json to edit (default ~/.claude/settings.json)

set -l repo (cd (dirname (status filename))/..; and pwd)
set -l template $repo/templates/safety-settings.json

set -l settings $HOME/.claude/settings.json
if set -q FIRST_RUN_SETTINGS_PATH
    set settings $FIRST_RUN_SETTINGS_PATH
end

# Register the ~/.claude/hooks link, not this checkout's file, so the hook
# follows the release copy rather than whatever branch this checkout is on.
set -l hook $HOME/.claude/hooks/block-secret-reads.sh

# --- preflight: refuse before any write --------------------------------

if not test -x $hook
    echo "ERROR: hook not executable: $hook" >&2
    echo "       Run 'fish install.fish' first so the hook is linked, then re-run." >&2
    exit 2
end

if not jq -e . $template >/dev/null 2>&1
    echo "ERROR: template is not valid JSON: $template" >&2
    exit 2
end

mkdir -p (dirname $settings); or exit 2
if not test -f $settings
    echo "{}" > $settings; or exit 2
end

if not jq -e 'type == "object"' $settings >/dev/null 2>&1
    echo "ERROR: $settings is not a valid JSON object. Refusing to modify." >&2
    echo "       Fix the file by hand, then re-run." >&2
    exit 1
end

# --- merge -------------------------------------------------------------

# Lists are unioned in order (yours first). For sandbox keys, your value wins
# over the template's. The hook is added only if no entry runs that command.
set -l merge '
    def union($a; $b): reduce (($a // []) + $b)[] as $x ([]; if index([$x]) then . else . + [$x] end);
    .permissions //= {}
    | .permissions.deny = union(.permissions.deny; $tpl.permissions.deny)
    | .sandbox = ($tpl.sandbox * (.sandbox // {}))
    | .sandbox.excludedCommands = union(.sandbox.excludedCommands; $tpl.sandbox.excludedCommands)
    | .hooks //= {}
    | .hooks.PreToolUse //= []
    | if any(.hooks.PreToolUse[]?.hooks[]?; .command? == $hook) then .
      else .hooks.PreToolUse += [{matcher: "Bash", hooks: [{type: "command", command: $hook, timeout: 5}]}]
      end
'

# Write beside the target, then rename: a same-directory mv is atomic, so
# Claude Code never loads a half-written file.
set -l tmp (mktemp "$settings.XXXXXX")
jq --slurpfile t $template --arg hook $hook ". as \$s | \$t[0] as \$tpl | \$s | $merge" $settings > $tmp
if test $status -ne 0; or not test -s $tmp
    echo "ERROR: jq failed to merge into $settings" >&2
    rm -f $tmp
    exit 2
end

if cmp -s $tmp $settings
    rm -f $tmp
    echo "Safety settings already present in: $settings"
    exit 0
end

set -l backup "$settings.bak."(date -u +%Y%m%dT%H%M%SZ)
if not cp $settings $backup
    echo "ERROR: failed to back up $settings" >&2
    rm -f $tmp
    exit 2
end
echo "Backed up: $settings -> $backup"

if not mv $tmp $settings
    echo "ERROR: failed to write $settings" >&2
    rm -f $tmp
    exit 2
end

# Read back before claiming success.
if not jq -e --arg hook $hook 'any(.hooks.PreToolUse[]?.hooks[]?; .command? == $hook)' $settings >/dev/null
    echo "ERROR: wrote $settings but the secret-read hook is not registered" >&2
    exit 2
end

echo "Safety settings merged into: $settings"
if test (jq -r '.sandbox.enabled' $settings) != true
    echo "NOTE: your settings keep \"sandbox.enabled\" off, so only the deny rules and hook apply." >&2
end
