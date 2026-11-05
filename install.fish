#!/usr/bin/env fish
# Install claude-config in two parts:
#   1. A release copy (detached worktree of origin/main) that ~/.claude links to,
#      so everyday sessions run only merged config. See bin/setup-release.fish.
#   2. An eval folder (~/.claude-eval) linked to this checkout, so evals test
#      the branch you are working on. See bin/setup-eval-home.fish.
# Run: fish install.fish
# Re-run safely.
#
# Symlink logic lives in bin/link-config.fish (single source of truth).
# To undo the split and link ~/.claude to this checkout again:
#   fish bin/link-config.fish --source <checkout>

set -l repo_dir (cd (dirname (status filename)); and pwd)

fish $repo_dir/bin/setup-release.fish --repo $repo_dir
set -l release_status $status
if test $release_status -ne 0
    exit $release_status
end

fish $repo_dir/bin/setup-eval-home.fish
set -l eval_status $status
# Exit 1 means the eval login is missing. The script already printed the
# login command. Install can finish; evals just won't run until you log in.
if test $eval_status -eq 1
    echo "WARNING: eval login missing. Evals will not run until you log in (command above)." >&2
else if test $eval_status -ne 0
    exit $eval_status
end

echo ""
echo "Want to personalize global/CLAUDE.md and register hooks?"
echo "  Run: fish $repo_dir/bin/first-run.fish"
