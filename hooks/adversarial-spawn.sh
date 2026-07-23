#!/bin/bash
# adversarial-spawn.sh — swarm fan-out coordinator
# Spawns the worker adversaries listed in adversarial-config.json .workers
# (default: security, perf, scope, test-gap, correctness), waits for all
# (with timeout), then spawns the arbiter to synthesize.
# Args:
#   $1 = diff hash (8-32 hex chars; rejected otherwise)
#   $2 = trigger reason (sanitized to [a-zA-Z0-9._=/-], max 80 chars)
set -u

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
[[ -z "$REPO_ROOT" ]] && exit 0
cd "$REPO_ROOT" || exit 0

LOG_FILE=".claude/state/critiques/.spawn-log"
mkdir -p .claude/state/critiques

# ── Input validation (fixes #1, #2) ──────────────────────────────────────────
RAW_HASH="${1:-}"
RAW_REASON="${2:-unspecified}"

# DIFF_HASH must be lowercase hex, 8-32 chars. Reject anything else.
if [[ ! "$RAW_HASH" =~ ^[a-f0-9]{8,32}$ ]]; then
  {
    echo "[$(date -u +%FT%TZ)] reject invalid_diff_hash raw=$(printf '%q' "$RAW_HASH" | head -c 60)"
  } >> "$LOG_FILE" 2>&1
  exit 0
fi
DIFF_HASH="$RAW_HASH"

# REASON: strip to a safe charset and length.
REASON=$(printf '%s' "$RAW_REASON" | tr -cd 'a-zA-Z0-9._=/:-' | head -c 80)
[[ -z "$REASON" ]] && REASON="unspecified"

# ── Config ──────────────────────────────────────────────────────────────────
CONFIG="hooks/adversarial-config.json"
[[ ! -f "$CONFIG" ]] && exit 0

WORKER_TIMEOUT=$(jq -r '.worker_timeout_seconds // 180' "$CONFIG")
ARBITER_TIMEOUT=$(jq -r '.arbiter_timeout_seconds // 180' "$CONFIG")
MAX_BUDGET=$(jq -r '.max_budget_usd_per_agent // 0.50' "$CONFIG")
WORKERS_JSON=$(jq -r '.workers | join(" ")' "$CONFIG")
[[ -z "$WORKERS_JSON" || "$WORKERS_JSON" == "null" ]] && WORKERS_JSON="security perf scope test-gap correctness"

BRANCH=$(git branch --show-current 2>/dev/null | tr -c 'a-zA-Z0-9._-' '_' | sed 's/__*/_/g')
[[ -z "$BRANCH" ]] && BRANCH="detached"
SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "nosha")

SHA_DIR=".claude/state/critiques/${BRANCH}-${SHA}-${DIFF_HASH}"
mkdir -p "$SHA_DIR"

DIFF_FILE="$SHA_DIR/.diff"
git diff HEAD 2>/dev/null > "$DIFF_FILE"

# ── Pure-bash timeout wrapper (fix #3) ───────────────────────────────────────
# Usage: run_with_timeout <seconds> <cmd...>
# Returns the command's exit code, or 124 on timeout (GNU timeout convention).
# Distinguishes "killed by our timer" from external SIGTERM (143) / OOM (137)
# via a marker file the killer touches IMMEDIATELY before sending SIGTERM.
# If the marker exists after `wait`, our timer fired. Otherwise the command
# died on its own — preserve its exit code, even if it was 143/137.
run_with_timeout() {
  local secs="$1"; shift
  local marker
  marker=$(mktemp -t adv-tmo.XXXXXX) || { "$@"; return $?; }
  rm -f "$marker"
  "$@" &
  local cmd_pid=$!
  ( sleep "$secs"; touch "$marker"; kill -TERM "$cmd_pid" 2>/dev/null; sleep 2; kill -KILL "$cmd_pid" 2>/dev/null ) &
  local killer_pid=$!
  wait "$cmd_pid" 2>/dev/null
  local exit_code=$?
  local timed_out=0
  [[ -e "$marker" ]] && timed_out=1
  kill -KILL "$killer_pid" 2>/dev/null
  wait "$killer_pid" 2>/dev/null
  rm -f "$marker"
  if [[ "$timed_out" -eq 1 ]]; then
    return 124
  fi
  return "$exit_code"
}

# ── Worker spawn ─────────────────────────────────────────────────────────────
# Each worker runs claude --print under a timeout AND a budget cap (fix #5).
spawn_worker() {
  local role="$1"
  local agent="${role}-adversary"
  local out_file="${SHA_DIR}/${role}.md"
  local prompt="Analyze the git diff piped to you. Branch: ${BRANCH}. SHA: ${SHA}. Trigger reason: ${REASON}. Produce the ${role} critique per your output contract."

  {
    echo "[$(date -u +%FT%TZ)] worker=$role start timeout=${WORKER_TIMEOUT}s budget=\$${MAX_BUDGET}"
  } >> "$LOG_FILE" 2>&1

  # NOTE: --max-budget-usd only takes effect on the API-key auth path.
  # Under OAuth (Max plan) it is advisory; the timeout is the load-bearing cap.
  run_with_timeout "$WORKER_TIMEOUT" \
    env -u ANTHROPIC_API_KEY claude --print \
    --no-session-persistence \
    --agent "$agent" \
    --max-budget-usd "$MAX_BUDGET" \
    --dangerously-skip-permissions \
    --add-dir "$REPO_ROOT" \
    --output-format text \
    "$prompt" \
    < "$DIFF_FILE" \
    > "$out_file" 2>>"$LOG_FILE"

  local exit_code=$?
  {
    echo "[$(date -u +%FT%TZ)] worker=$role end exit=$exit_code bytes=$(wc -c < "$out_file" 2>/dev/null || echo 0)"
  } >> "$LOG_FILE" 2>&1
}

# ── Fan out workers in parallel ──────────────────────────────────────────────
{
  echo "[$(date -u +%FT%TZ)] swarm start branch=$BRANCH sha=$SHA hash=$DIFF_HASH reason=$REASON workers=[$WORKERS_JSON] dir=$SHA_DIR"
} >> "$LOG_FILE" 2>&1

PIDS=()
for role in $WORKERS_JSON; do
  spawn_worker "$role" &
  PIDS+=($!)
done

for pid in "${PIDS[@]}"; do
  wait "$pid" 2>/dev/null || true
done

# ── Arbiter ─────────────────────────────────────────────────────────────────
ARBITER_OUT="${SHA_DIR}/SUMMARY.md"
# Build the worker-file list from the same config-driven worker set the swarm ran,
# so adding/removing a worker keeps the arbiter prompt in sync automatically.
WORKER_FILES=""
WORKER_COUNT=0
for role in $WORKERS_JSON; do
  WORKER_FILES="${WORKER_FILES:+$WORKER_FILES, }${role}.md"
  WORKER_COUNT=$((WORKER_COUNT + 1))
done
ARBITER_PROMPT="Synthesize the ${WORKER_COUNT} worker critiques in directory: ${SHA_DIR}. Branch: ${BRANCH}. SHA: ${SHA}. Read ${WORKER_FILES} from that directory (any may be missing or a no-findings block), merge, rank, and emit the consolidated summary per your output contract."

{
  echo "[$(date -u +%FT%TZ)] arbiter start timeout=${ARBITER_TIMEOUT}s"
} >> "$LOG_FILE" 2>&1

run_with_timeout "$ARBITER_TIMEOUT" \
  env -u ANTHROPIC_API_KEY claude --print \
  --no-session-persistence \
  --agent arbiter \
  --max-budget-usd "$MAX_BUDGET" \
  --dangerously-skip-permissions \
  --add-dir "$REPO_ROOT" \
  --output-format text \
  "$ARBITER_PROMPT" \
  > "$ARBITER_OUT" 2>>"$LOG_FILE"

ARBITER_EXIT=$?

{
  echo "[$(date -u +%FT%TZ)] arbiter end exit=$ARBITER_EXIT bytes=$(wc -c < "$ARBITER_OUT" 2>/dev/null || echo 0)"
} >> "$LOG_FILE" 2>&1

# ── Pattern log (fix #4: replaces unpinned `npx @claude-flow@latest`) ────────
# Append a single JSON line per fire to a local file. No external deps.
# Schema: { ts, branch, sha, hash, top1, top2 }
if [[ -s "$ARBITER_OUT" ]]; then
  TOP_TITLES=$(grep -E '^### [0-9]+\.' "$ARBITER_OUT" | head -2 | sed 's/^### [0-9]*\. *//')
  TOP1=$(echo "$TOP_TITLES" | sed -n '1p')
  TOP2=$(echo "$TOP_TITLES" | sed -n '2p')
  jq -n -c \
    --arg ts "$(date -u +%FT%TZ)" \
    --arg branch "$BRANCH" \
    --arg sha "$SHA" \
    --arg hash "$DIFF_HASH" \
    --arg top1 "$TOP1" \
    --arg top2 "$TOP2" \
    '{ts:$ts, branch:$branch, sha:$sha, hash:$hash, top1:$top1, top2:$top2}' \
    >> ".claude/state/critiques/.patterns.jsonl" 2>>"$LOG_FILE" || true
fi

{
  echo "[$(date -u +%FT%TZ)] swarm end dir=$SHA_DIR"
} >> "$LOG_FILE" 2>&1

mv "$DIFF_FILE" "$SHA_DIR/.diff-captured" 2>/dev/null || true

exit "$ARBITER_EXIT"
