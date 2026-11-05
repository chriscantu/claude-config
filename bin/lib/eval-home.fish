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
