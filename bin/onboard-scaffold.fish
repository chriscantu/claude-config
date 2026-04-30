#!/usr/bin/env fish
# Scaffold a per-org onboarding workspace.
#
# Usage:
#   bin/onboard-scaffold.fish --target <path> --cadence <preset> [--no-gh]
#
# --target   absolute path to the workspace dir (must not exist or be empty)
# --cadence  aggressive | standard | relaxed
# --no-gh    skip the `gh repo create --private` prompt (used by tests)

set -l target ""
set -l cadence "standard"
set -l skip_gh 0

set -l i 1
while test $i -le (count $argv)
    set -l arg $argv[$i]
    switch $arg
        case --target
            set i (math $i + 1)
            set target $argv[$i]
        case --cadence
            set i (math $i + 1)
            set cadence $argv[$i]
        case --no-gh
            set skip_gh 1
        case '*'
            echo "unknown arg: $arg" >&2
            exit 2
    end
    set i (math $i + 1)
end

if test -z "$target"
    echo "missing --target" >&2
    exit 2
end

# Refuse to clobber: target must not exist, OR exist and be empty.
if test -e $target
    set -l contents (ls -A $target 2>/dev/null)
    if test -n "$contents"
        echo "refusing to scaffold: $target already has contents" >&2
        exit 1
    end
end

mkdir -p $target
mkdir -p $target/stakeholders
mkdir -p $target/interviews/raw
mkdir -p $target/interviews/sanitized
mkdir -p $target/swot
mkdir -p $target/decks/slidev
mkdir -p $target/decisions

exit 0
