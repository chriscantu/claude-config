#!/bin/bash
set -e
HOOK_ABS_PATH="/Users/cantu/.claude/hooks/scope-tier-memory-check.sh"
mkdir -p .claude/projects/-Users-cantu-repos-claude-config/memory
cat > .claude/settings.local.json <<'JSON'
{"hooks":{"UserPromptSubmit":[{"hooks":[{"type":"command","command":"HOOK_PATH_PLACEHOLDER"}]}]}}
JSON
sed -i '' "s|HOOK_PATH_PLACEHOLDER|${HOOK_ABS_PATH}|g" .claude/settings.local.json
cp /Users/cantu/repos/claude-config/.claude/worktrees/scope-tier-memory-check/tests/fixtures/scope-tier-memory-check/pressure-framing-minimizer/memory/MEMORY.md \
   .claude/projects/-Users-cantu-repos-claude-config/memory/MEMORY.md
