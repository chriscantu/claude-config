#!/usr/bin/env fish
# Rotate excalidraw.log when it exceeds the size threshold.
#
# excalidraw.log is written by the excalidraw MCP server in the repo
# root. It grows indefinitely with canvas activity and is not rotated
# by the MCP server itself. Mirrors the rotate_log_if_needed pattern
# in hooks/scope-tier-memory-check.sh.
#
# Idempotent. Safe to invoke from any SessionStart hook, cron, or
# manually. Exits 0 even if the log doesn't exist.
#
# Usage:
#   bin/rotate-excalidraw-log.fish [--threshold-mb N] [--keep-tail-mb M]

set -l threshold_bytes (math "10 * 1024 * 1024")
set -l keep_tail_bytes (math "1 * 1024 * 1024")

set -l i 1
while test $i -le (count $argv)
    set -l arg $argv[$i]
    switch $arg
        case --threshold-mb
            set i (math $i + 1)
            if test $i -gt (count $argv)
                echo "missing value for --threshold-mb" >&2
                exit 2
            end
            set threshold_bytes (math "$argv[$i] * 1024 * 1024")
        case --keep-tail-mb
            set i (math $i + 1)
            if test $i -gt (count $argv)
                echo "missing value for --keep-tail-mb" >&2
                exit 2
            end
            set keep_tail_bytes (math "$argv[$i] * 1024 * 1024")
        case '*'
            echo "unknown arg: $arg" >&2
            exit 2
    end
    set i (math $i + 1)
end

set -l repo_root (git rev-parse --show-toplevel 2>/dev/null)
if test -z "$repo_root"
    # Not in a git repo — fall back to script-relative resolution.
    set repo_root (realpath (dirname (status filename))/..)
end

set -l log_file "$repo_root/excalidraw.log"
set -l rotated "$log_file.1"

if not test -f "$log_file"
    exit 0
end

# stat -f%z (BSD/macOS), -c%s (GNU/Linux). Mirror the dual-form check
# in hooks/scope-tier-memory-check.sh so this works in either env.
set -l size (stat -f%z "$log_file" 2>/dev/null; or stat -c%s "$log_file" 2>/dev/null; or echo 0)

if test "$size" -le "$threshold_bytes"
    exit 0
end

tail -c "$keep_tail_bytes" "$log_file" > "$rotated"
or begin
    echo "tail rotate failed for $log_file (exit $status)" >&2
    exit 1
end

: > "$log_file"
or begin
    echo "truncate failed for $log_file (exit $status)" >&2
    exit 1
end

echo "rotated $log_file ($size bytes -> tail $keep_tail_bytes saved to $rotated)" >&2
exit 0
