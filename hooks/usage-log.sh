#!/bin/bash
# usage-log.sh — UserPromptSubmit hook
# Detects leadership-toolkit slash-command invocations and appends one JSONL
# line per event to $USAGE_LOG (default: ~/.claude/usage.jsonl).
#
# Schema per ADR #0021:
#   {"ts":"<ISO-8601>","event":"skill_invoked","skill":"/onboard","session":"<id>"}
#
# NO skill-argument content. NO PII. Only ts, event, skill, session.
set -u

USAGE_LOG="${USAGE_LOG:-${HOME}/.claude/usage.jsonl}"

INPUT=$(cat 2>/dev/null || true)
if [[ -z "$INPUT" ]]; then exit 0; fi

PROMPT=$(printf '%s' "$INPUT" | jq -r '.prompt // empty' 2>/dev/null || true)
if [[ -z "$PROMPT" ]]; then exit 0; fi

SESSION=$(printf '%s' "$INPUT" | jq -r '.session_id // empty' 2>/dev/null || true)

# Canonical leadership-toolkit skill list (ADR #0021).
LEADERSHIP_SKILLS=(
  "/onboard"
  "/strategy-doc"
  "/stakeholder-map"
  "/swot"
  "/1on1-prep"
  "/present"
  "/architecture-overview"
)

# Extract only the leading slash-command token (word ending at whitespace or
# end-of-string). No argument content captured — PII protection by design.
SLASH_TOKEN=$(printf '%s' "$PROMPT" | grep -oE '^/[a-z0-9][a-z0-9-]*' || true)
if [[ -z "$SLASH_TOKEN" ]]; then exit 0; fi

MATCHED_SKILL=""
for skill in "${LEADERSHIP_SKILLS[@]}"; do
  if [[ "$SLASH_TOKEN" == "$skill" ]]; then
    MATCHED_SKILL="$skill"
    break
  fi
done

if [[ -z "$MATCHED_SKILL" ]]; then exit 0; fi

# Append JSONL line. mkdir -p guards first-run when ~/.claude/ may not exist.
LOG_DIR=$(dirname "$USAGE_LOG")
if ! mkdir -p "$LOG_DIR" 2>/dev/null; then exit 0; fi

TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
jq -n -c \
  --arg ts "$TS" \
  --arg skill "$MATCHED_SKILL" \
  --arg session "${SESSION:-}" \
  '{"ts":$ts,"event":"skill_invoked","skill":$skill,"session":$session}' \
  >> "$USAGE_LOG" 2>/dev/null || true

exit 0
