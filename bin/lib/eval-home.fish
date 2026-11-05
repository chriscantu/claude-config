# Shared helper: where the eval config folder lives.
# The eval folder is a separate CLAUDE_CONFIG_DIR whose links point at the
# working checkout, so eval runs test the branch while ~/.claude stays on
# the release copy.

function eval_home_dir
    if test -n "$CLAUDE_EVAL_HOME"
        echo $CLAUDE_EVAL_HOME
    else
        echo $HOME/.claude-eval
    end
end

# _eval_home_resolve PATH → PATH with symlinks resolved, or PATH unchanged when
# it does not exist. link-config stores resolved targets, but callers pass the
# checkout as `pwd` gives it, which keeps symlinks (/tmp vs /private/tmp).
function _eval_home_resolve --argument-names path
    realpath $path 2>/dev/null; or echo $path
end

# eval_home_check REPO → 0 when the eval folder's CLAUDE.md links to
# REPO/global/CLAUDE.md. Otherwise prints why and the fix to stderr and
# returns 1, so callers never run against some other copy of the config.
function eval_home_check --argument-names repo
    set -l dir (eval_home_dir)
    set -l expected $repo/global/CLAUDE.md
    set -l actual (readlink $dir/CLAUDE.md 2>/dev/null)
    if test -z "$actual"
        echo "ERROR: eval config folder $dir is missing or not set up." >&2
    else if test (_eval_home_resolve $actual) != (_eval_home_resolve $expected)
        echo "ERROR: eval config folder $dir links CLAUDE.md to $actual, not this checkout ($expected)." >&2
    else
        return 0
    end
    echo "       Run: fish bin/setup-eval-home.fish" >&2
    return 1
end
