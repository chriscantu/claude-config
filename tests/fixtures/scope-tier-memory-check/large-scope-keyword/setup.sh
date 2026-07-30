#!/bin/bash
set -e
# Manual-testing helper (NOT run by the automated eval runner — see ../README.md).
# Reproduces this fixture's scope-tier hook state in the current repo checkout.
# Portable: no committed username paths.
HOOK_ABS_PATH="$HOME/.claude/hooks/scope-tier-memory-check.sh"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# Claude Code derives the per-project memory dir by replacing '/' with '-' in
# the absolute project path; derive it from $PWD so no username is hardcoded.
PROJECT_SLUG="$(printf '%s' "$PWD" | sed 's#/#-#g')"
mkdir -p ".claude/projects/${PROJECT_SLUG}/memory"
cat > .claude/settings.local.json <<'JSON'
{"hooks":{"UserPromptSubmit":[{"hooks":[{"type":"command","command":"HOOK_PATH_PLACEHOLDER"}]}]}}
JSON
sed -i '' "s|HOOK_PATH_PLACEHOLDER|${HOOK_ABS_PATH}|g" .claude/settings.local.json
cp "$SCRIPT_DIR/memory/MEMORY.md" \
   ".claude/projects/${PROJECT_SLUG}/memory/MEMORY.md"
