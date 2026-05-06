#!/usr/bin/env fish
# Scaffold a per-org onboarding workspace.
#
# Usage:
#   skills/onboard/scripts/onboard-scaffold.fish --target <path> --cadence <preset> [--gh-create yes|no] [--no-gh]
#
# --target     absolute path to the workspace dir (must not exist or be empty)
# --cadence    aggressive | standard | relaxed
# --gh-create  yes | no (default no; SKILL.md prompts user with default yes and
#              passes the answer through); when yes, runs `gh repo create --private --push`
# --no-gh      hard-skip the gh repo create call; overrides --gh-create yes (used by tests)

set -l target ""
set -l cadence "standard"
set -l skip_gh 0
set -l gh_create "no"

set -l i 1
while test $i -le (count $argv)
    set -l arg $argv[$i]
    switch $arg
        case --target
            set i (math $i + 1)
            if test $i -gt (count $argv)
                echo "missing value for --target" >&2
                exit 2
            end
            set target $argv[$i]
        case --cadence
            set i (math $i + 1)
            if test $i -gt (count $argv)
                echo "missing value for --cadence" >&2
                exit 2
            end
            set cadence $argv[$i]
        case --no-gh
            set skip_gh 1
        case --gh-create
            set i (math $i + 1)
            if test $i -gt (count $argv)
                echo "missing value for --gh-create" >&2
                exit 2
            end
            set gh_create $argv[$i]
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

mkdir -p $target $target/stakeholders $target/interviews/raw $target/interviews/sanitized $target/swot $target/decks/slidev $target/decisions
or begin
    echo "mkdir failed for $target subdirs (exit $status)" >&2
    exit 1
end

printf "# /onboard workspace gitignore — protect verbatim interview notes and secrets\n\ninterviews/raw/\n.env\n**/private/\n" > $target/.gitignore
or begin
    echo "failed to write $target/.gitignore (exit $status)" >&2
    exit 1
end

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
if test (count $w) -ne 7
    echo "internal error: cadence weeks misconfigured for $cadence" >&2
    exit 4
end

printf "# 90-Day Ramp Plan — %s\n\nCadence: %s\nStarted: %s\n\n| Week | Milestone | Status |\n|---|---|---|\n| %s | Workspace scaffolded; manager-handoff captured | [ ] |\n| %s | Stakeholder map >=80%% | [ ] |\n| %s | >=8 interviews logged + INTERIM reflect-back deck | [ ] |\n| %s | SWOT v1 draft committed | [ ] |\n| %s | FINAL reflect-back deck delivered | [ ] |\n| %s | Quick-win candidate locked | [ ] |\n| %s | Quick-win shipped -> graduate | [ ] |\n\n## Cadence Mutes\n\n(none)\n\n## Notes\n\n(scratch space)\n" \
  $org_name $cadence $today $w[1] $w[2] $w[3] $w[4] $w[5] $w[6] $w[7] > $target/RAMP.md
or begin
    echo "failed to write $target/RAMP.md (exit $status)" >&2
    exit 1
end

printf "# Stakeholder Map — %s\n\nPopulated by /stakeholder-map. Manager-handoff seed below.\n\n## Direct reports\n\n(none yet)\n\n## Cross-functional partners\n\n(none yet)\n\n## Skip-level + leadership\n\n(none yet)\n\n## Influencers\n\n(none yet)\n" $org_name > $target/stakeholders/map.md
or begin
    echo "failed to write $target/stakeholders/map.md (exit $status)" >&2
    exit 1
end

git -C $target init -q -b main
or begin
    echo "git init failed in $target (exit $status)" >&2
    exit 1
end

git -C $target add .
or begin
    echo "git add failed in $target (exit $status)" >&2
    exit 1
end

git -C $target commit -q -m "Scaffold /onboard workspace"
or begin
    echo "git commit failed in $target (exit $status); check `git config user.email` and `git config user.name`" >&2
    exit 1
end

if test $skip_gh -eq 0; and test "$gh_create" = "yes"
    set -l repo_name (basename $target)
    gh repo create $repo_name --private --source=$target --remote=origin --push
    or begin
        set -l rc $status
        echo "gh repo create failed (exit $rc); local scaffold preserved at $target. Run `gh auth status` to diagnose." >&2
        exit 3
    end
end

exit 0
