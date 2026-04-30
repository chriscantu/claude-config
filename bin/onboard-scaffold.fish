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

if not contains $cadence aggressive standard relaxed
    echo "unknown cadence: $cadence (allowed: aggressive | standard | relaxed)" >&2
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

printf "# /onboard workspace gitignore — protect verbatim interview notes and secrets\n\ninterviews/raw/\n.env\n**/private/\n" > $target/.gitignore

set -l org_name (basename $target | sed -E 's/^onboard-//')
set -l today (date +%Y-%m-%d)

set -l weeks ""
switch $cadence
    case aggressive
        set weeks "W0|W1|W3|W4|W6|W7|W9"
    case standard
        set weeks "W0|W2|W4|W6|W8|W10|W13"
    case relaxed
        set weeks "W0|W3|W5|W8|W10|W13|W17"
end

set -l w (string split "|" $weeks)

printf "# 90-Day Ramp Plan — %s\n\nCadence: %s\nStarted: %s\n\n| Week | Milestone | Status |\n|---|---|---|\n| %s | Workspace scaffolded; manager-handoff captured | [ ] |\n| %s | Stakeholder map >=80%% | [ ] |\n| %s | >=8 interviews logged + INTERIM reflect-back deck | [ ] |\n| %s | SWOT v1 draft committed | [ ] |\n| %s | FINAL reflect-back deck delivered | [ ] |\n| %s | Quick-win candidate locked | [ ] |\n| %s | Quick-win shipped -> graduate | [ ] |\n\n## Cadence Mutes\n\n(none)\n\n## Notes\n\n(scratch space)\n" \
  $org_name $cadence $today $w[1] $w[2] $w[3] $w[4] $w[5] $w[6] $w[7] > $target/RAMP.md

git -C $target init -q -b main
git -C $target add .
git -C $target commit -q -m "Scaffold /onboard workspace"

exit 0
