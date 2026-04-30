#!/usr/bin/env fish
# Inspect or mute cadence nags for an /onboard workspace.
#
# Usage:
#   bin/onboard-status.fish --status   <workspace-path>
#   bin/onboard-status.fish --mute     <category> <workspace-path>
#   bin/onboard-status.fish --unmute   <category> <workspace-path>
#
# Categories: milestone | velocity   (calendar is Phase 4)

set -l mode ""
set -l category ""
set -l ws ""

set -l i 1
while test $i -le (count $argv)
    set -l arg $argv[$i]
    switch $arg
        case --status
            set mode status
            set i (math $i + 1)
            set ws $argv[$i]
        case --mute --unmute
            set mode (string sub -s 3 -- $arg)
            set i (math $i + 1)
            set category $argv[$i]
            set i (math $i + 1)
            set ws $argv[$i]
        case '*'
            echo "unknown arg: $arg" >&2
            exit 2
    end
    set i (math $i + 1)
end

if test -z "$ws"
    echo "missing workspace path" >&2
    exit 2
end
if not test -f $ws/RAMP.md
    echo "no RAMP.md at $ws" >&2
    exit 1
end

if test "$mode" = mute -o "$mode" = unmute
    if not contains $category milestone velocity
        echo "unknown category: $category (allowed: milestone | velocity)" >&2
        exit 2
    end
end

switch $mode
    case status
        set -l started (string match -r 'Started:\s*([0-9-]+)' < $ws/RAMP.md)[2]
        set -l started_epoch (date -j -f "%Y-%m-%d" $started "+%s" 2>/dev/null; or date -d $started "+%s")
        set -l now_epoch (date "+%s")
        set -l elapsed (math "($now_epoch - $started_epoch) / 86400")
        echo "Workspace: $ws"
        echo "Elapsed:   $elapsed days"
        set -l next (string match -r '\| (W[0-9]+) \| ([^|]+)\| \[ \]' < $ws/RAMP.md | head -3)
        if test -n "$next[1]"
            echo "Next milestone: $next[2] ($next[3])"
        else
            echo "Next milestone: (all checked)"
        end
        echo ""
        echo "Mutes:"
        sed -n '/## Cadence Mutes/,/##/p' $ws/RAMP.md | grep -E '^- ' ; or echo "  (none)"
    case mute
        # Force single-string semantics — without `string collect`, multi-line
        # regex patterns silently no-op (see plan Task 4 note).
        set -l ramp (cat $ws/RAMP.md | string collect)
        # Drop "(none)" placeholder if present.
        set ramp (string replace -r '(## Cadence Mutes\n\n)\(none\)\n' '$1' -- $ramp | string collect)
        # Append category if not already listed.
        if not string match -rq "(?m)^- $category\$" -- $ramp
            set ramp (string replace -r '(## Cadence Mutes\n\n(?:- [a-z]+\n)*)' "\$1- $category\n" -- $ramp | string collect)
        end
        printf '%s' $ramp > $ws/RAMP.md
    case unmute
        set -l ramp (cat $ws/RAMP.md | string collect)
        set ramp (string replace -r "(?m)^- $category\n" '' -- $ramp | string collect)
        # Re-insert (none) marker if Cadence Mutes is now empty.
        if not string match -rq '(?m)## Cadence Mutes\n\n- ' -- $ramp
            set ramp (string replace -r '(## Cadence Mutes\n\n)(?!\(none\))' '$1(none)\n' -- $ramp | string collect)
        end
        printf '%s' $ramp > $ws/RAMP.md
end
