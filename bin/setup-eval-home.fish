#!/usr/bin/env fish
# Build or refresh the eval config folder (default ~/.claude-eval).
#
# Eval sessions must match production (same plugins, settings, hooks) except
# that hooks run from the eval folder's links (the branch under test) and the
# release updater hook is dropped.
#
# Usage: fish bin/setup-eval-home.fish [--no-auth-check]
# Exit:  0 ok, 1 eval login missing, 2 setup error. Safe to re-run.

set -l repo (cd (dirname (status --current-filename))/..; and pwd)
source $repo/bin/lib/eval-home.fish

set -l auth_check 1
for arg in $argv
    switch $arg
        case --no-auth-check
            set auth_check 0
        case '*'
            echo "ERROR: unknown argument: $arg" >&2
            echo "Usage: fish bin/setup-eval-home.fish [--no-auth-check]" >&2
            exit 2
    end
end

set -l eval_home (eval_home_dir)
set -l prod $HOME/.claude

# 1. Link the checkout into the eval folder.
mkdir -p $eval_home; or exit 2
fish $repo/bin/link-config.fish --source $repo --home $eval_home; or exit 2

# 2. Share production plugins. Keep a real plugins dir as plugins.bak (once).
if test -d $eval_home/plugins; and not test -L $eval_home/plugins
    if test -e $eval_home/plugins.bak
        echo "ERROR: $eval_home/plugins is a real directory and plugins.bak already exists; resolve by hand" >&2
        exit 2
    end
    mv $eval_home/plugins $eval_home/plugins.bak; or exit 2
end
ln -sfn $prod/plugins $eval_home/plugins; or exit 2

# 3. Derive settings.json: hooks run from the eval folder; drop the updater.
if not test -f $prod/settings.json
    echo "ERROR: $prod/settings.json not found" >&2
    exit 2
end
set -l filter '
  def fix: if (.command // "") | startswith($old)
           then .command = $new + .command[($old | length):] else . end;
  if .hooks == null then . else
    .hooks |= (
      with_entries(
        .value |= (
          map(.hooks |= map(select((.command // "") | endswith("config-release-update.sh") | not) | fix))
          | map(select((.hooks | length) > 0))
        )
        | select((.value | length) > 0)
      )
    )
  end'
jq --arg old "$prod/hooks/" --arg new "$eval_home/hooks/" $filter $prod/settings.json > $eval_home/settings.json.tmp
or begin
    rm -f $eval_home/settings.json.tmp
    echo "ERROR: could not derive $eval_home/settings.json" >&2
    exit 2
end
mv $eval_home/settings.json.tmp $eval_home/settings.json; or exit 2

# 4. Carry over the personal rules file written by first-run.
if test -e $prod/rules/first-run-personalization.md
    mkdir -p $eval_home/rules; or exit 2
    ln -sfn $prod/rules/first-run-personalization.md $eval_home/rules/first-run-personalization.md; or exit 2
end

# 5. Eval runs need their own login.
if test $auth_check -eq 1
    set -l status_out (env -u ANTHROPIC_API_KEY CLAUDE_CONFIG_DIR=$eval_home claude auth status 2>&1)
    if not string match -qr '"loggedIn":\s*true' -- $status_out
        echo "Run: env CLAUDE_CONFIG_DIR=$eval_home claude auth login"
        exit 1
    end
end
exit 0
