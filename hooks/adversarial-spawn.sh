#!/bin/bash
# adversarial-spawn.sh — backgrounded claude --print invocation
# Args:
#   $1 = diff hash (16-char hex, for output naming)
#   $2 = trigger reason (loc=N | files=N | path=...)
set -u

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
[[ -z "$REPO_ROOT" ]] && exit 0
cd "$REPO_ROOT" || exit 0

DIFF_HASH="${1:-unknown}"
REASON="${2:-unspecified}"

CONFIG="hooks/adversarial-config.json"
MAX_BUDGET=$(jq -r '.max_budget_usd' "$CONFIG" 2>/dev/null || echo "0.50")
AGENT=$(jq -r '.agent_name' "$CONFIG" 2>/dev/null || echo "code-adversary")

BRANCH=$(git branch --show-current 2>/dev/null | tr -c 'a-zA-Z0-9._-' '_' | sed 's/__*/_/g')
[[ -z "$BRANCH" ]] && BRANCH="detached"
SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "nosha")

OUT_DIR=".claude/state/critiques"
mkdir -p "$OUT_DIR"
OUT_FILE="$OUT_DIR/${BRANCH}-${SHA}-${DIFF_HASH}.md"
LOG_FILE="$OUT_DIR/.spawn-log"

# Prompt assembled inline. Diff piped via stdin.
PROMPT="Analyze the git diff piped to you. Branch: ${BRANCH}. SHA: ${SHA}. Trigger reason: ${REASON}.

Produce the adversarial critique per your output contract. Stop after 3-7 findings."

{
  echo "[$(date -u +%FT%TZ)] spawn start branch=$BRANCH sha=$SHA hash=$DIFF_HASH reason=$REASON out=$OUT_FILE"
} >> "$LOG_FILE" 2>&1

# NOTE: --bare is intentionally omitted — it disables OAuth/keychain auth,
# which would force fallback to ANTHROPIC_API_KEY billing. Max plan auth requires OAuth.
# Recursion risk is low because the code-adversary agent only uses Read/Grep/Bash —
# none of those fire PostToolUse hooks.
# `--no-session-persistence` keeps the adversarial run out of session history.
# `--dangerously-skip-permissions` needed for non-interactive Read/Grep/Bash.
# Unset ANTHROPIC_API_KEY so claude --print falls back to keychain OAuth
# (Max plan auth). With the env var set, claude bills against the API key
# instead of the subscription. Scoped to this invocation only.
git diff HEAD 2>/dev/null | env -u ANTHROPIC_API_KEY claude --print \
  --no-session-persistence \
  --agent "$AGENT" \
  --dangerously-skip-permissions \
  --add-dir "$REPO_ROOT" \
  --output-format text \
  "$PROMPT" \
  > "$OUT_FILE" 2>>"$LOG_FILE"

EXIT=$?

{
  echo "[$(date -u +%FT%TZ)] spawn end exit=$EXIT bytes=$(wc -c < "$OUT_FILE" 2>/dev/null || echo 0)"
} >> "$LOG_FILE" 2>&1

exit "$EXIT"
