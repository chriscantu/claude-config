#!/usr/bin/env fish
# Turn on the harness-enforced safety settings in ~/.claude/settings.json (#591).
#
# Prompts can be missed. Deny rules and the sandbox are enforced by Claude
# Code; the hook is a best-effort backstop that matches command text. This
# script merges templates/safety-settings.json into your user settings and
# registers hooks/block-secret-reads.sh:
#   - Read deny rules for .env files at any depth, ~/.ssh, and credentials/
#     directories. With the sandbox on, these also block shell commands at
#     the OS level. Edit deny rules keep Claude from creating the hook's
#     off switch and from rewriting settings files to undo all of this.
#   - The sandbox for shell commands, with no unsandboxed retry. Weaker
#     network isolation lets `gh` pass TLS checks inside the macOS sandbox,
#     so it needs no exclusion.
#   - A PreToolUse hook that blocks Bash commands naming those files, so they
#     stay blocked when the sandbox is off or can't start.
#
# It only fills gaps: rules and list entries are added, and a sandbox key you
# already set (for example "enabled": false) is left alone, and every run
# names the ones that weaken the template. Re-run safely.
# Your autoMode settings stay personal; this script never touches them.
#
# Run: fish bin/setup-safety.fish
# Env: FIRST_RUN_SETTINGS_PATH  settings.json to edit (default ~/.claude/settings.json)

if not command -q jq
    echo "ERROR: jq is not installed. Install it (brew install jq), then re-run." >&2
    exit 2
end

set -l repo (cd (dirname (status filename))/..; and pwd)
set -l template $repo/templates/safety-settings.json

set -l settings $HOME/.claude/settings.json
if set -q FIRST_RUN_SETTINGS_PATH
    set settings $FIRST_RUN_SETTINGS_PATH
end
# Back up beside the path as given, not the link's target: dotfile managers
# keep the target in a git repo, where filters such as git-crypt match
# settings.json but not a .bak copy, and settings can hold tokens in env.
set -l backup_base $settings
# Dotfile managers often link settings.json. Edit the file the link points to,
# or the final rename would replace the link with a plain file.
if test -L $settings
    set -l target (readlink -f $settings)
    if test $status -ne 0; or not test -e "$target"
        echo "ERROR: $settings is a symlink that points nowhere. Fix the link, then re-run." >&2
        exit 2
    end
    echo "Following symlink: $settings -> $target"
    set settings $target
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

# report_sandbox_overrides SETTINGS TEMPLATE → one NOTE per kept setting that
# switches off a protection: a sandbox key that differs from the template, the
# "gh *" exclusion earlier templates added, or disableAllHooks. A "fills gaps
# only" merge must never hide that.
function report_sandbox_overrides --argument-names settings template
    jq -r --slurpfile t $template '
        (.sandbox // {}) as $mine
        | ($t[0].sandbox | to_entries[]
            | .key as $k
            | select(($mine | has($k)) and $mine[$k] != .value)
            | "NOTE: your settings keep \"sandbox.\($k)\": \($mine[$k] | tojson) (the template sets \(.value | tojson)), so that sandbox protection is off."),
          (select($mine.excludedCommands // [] | index(["gh *"]))
            | "NOTE: your settings keep \"gh *\" in \"sandbox.excludedCommands\", so gh runs outside the sandbox. It no longer needs to; remove the entry by hand."),
          (select(.disableAllHooks == true)
            | "NOTE: your settings keep \"disableAllHooks\": true, so the secret-read hook never runs.")
    ' $settings >&2
end

# --- merge -------------------------------------------------------------

# Rules an earlier template added and this one replaces. "//**/" blocked the
# file name anywhere on disk, so the sandbox also blocked temp test fixtures;
# "~/**/" still covers every project under home (#613). Only these exact
# strings are removed, and each run that removes one says so.
set -l retired '["Edit(//**/.claude/settings.json)", "Edit(//**/.claude/settings.local.json)"]'
jq -r --argjson r $retired '
    .permissions.deny // [] | .[] | select(. as $x | $r | index([$x]))
    | "NOTE: replacing \"\(.)\" with the template'"'"'s home-folder rule."
' $settings >&2

# A hook counts as registered only under a matcher that fires on Bash: an entry
# under "Read" alone would never run for shell commands.
set -l registered 'def registered($hook): any(.hooks.PreToolUse[]? | select((.matcher // "") | test("^([*]|)$|Bash")) | .hooks[]?; .command? == $hook);'

# Lists are unioned in order (yours first). For sandbox keys, your value wins
# over the template's. The hook is added only if no Bash entry runs it.
set -l merge $registered'
    def union($a; $b): reduce (($a // []) + $b)[] as $x ([]; if index([$x]) then . else . + [$x] end);
    .permissions //= {}
    | .permissions.deny = union((.permissions.deny // []) - $retired; $tpl.permissions.deny)
    | .sandbox = ($tpl.sandbox * (.sandbox // {}))
    | .hooks //= {}
    | .hooks.PreToolUse //= []
    | if registered($hook) then .
      else .hooks.PreToolUse += [{matcher: "Bash", hooks: [{type: "command", command: $hook, timeout: 5}]}]
      end
'

# Merge in memory and compare before touching the disk. The sandbox blocks new
# files beside ~/.claude/settings.json, so a re-run with nothing to change must
# not create a temp file (#598).
set -l merged (jq --slurpfile t $template --arg hook $hook --argjson retired $retired ". as \$s | \$t[0] as \$tpl | \$s | $merge" $settings | string collect)
if test $pipestatus[1] -ne 0; or test -z "$merged"
    echo "ERROR: jq failed to merge into $settings" >&2
    exit 2
end

if printf '%s\n' $merged | cmp -s - $settings
    echo "Safety settings already present in: $settings"
    report_sandbox_overrides $settings $template
    exit 0
end

# Write beside the target, then rename: a same-directory mv is atomic, so
# Claude Code never loads a half-written file. cp -p first gives the temp
# file the original's mode; mktemp alone would leave it 0600.
set -l tmp (mktemp "$settings.XXXXXX")
if test $status -ne 0; or not cp -p $settings $tmp
    echo "ERROR: could not create a temp file beside $settings" >&2
    test -n "$tmp"; and rm -f $tmp
    exit 2
end
if not printf '%s\n' $merged > $tmp
    echo "ERROR: could not write the temp file beside $settings" >&2
    rm -f $tmp
    exit 2
end

set -l backup "$backup_base.bak."(date -u +%Y%m%dT%H%M%SZ)
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
if not jq -e --arg hook $hook "$registered registered(\$hook)" $settings >/dev/null
    echo "ERROR: wrote $settings but the secret-read hook is not registered" >&2
    exit 2
end

echo "Safety settings merged into: $settings"
report_sandbox_overrides $settings $template
