#!/bin/bash
set -e
HOOK_ABS_PATH="/Users/cantu/repos/claude-config/.claude/worktrees/scope-tier-memory-check/hooks/scope-tier-memory-check.sh"
mkdir -p .claude/projects/-Users-cantu-repos-claude-config/memory
cat > .claude/settings.local.json <<'JSON'
{"hooks":{"UserPromptSubmit":[{"hooks":[{"type":"command","command":"HOOK_PATH_PLACEHOLDER"}]}]}}
JSON
sed -i '' "s|HOOK_PATH_PLACEHOLDER|${HOOK_ABS_PATH}|g" .claude/settings.local.json
cp /Users/cantu/repos/claude-config/.claude/worktrees/scope-tier-memory-check/tests/fixtures/scope-tier-memory-check/git-working-tree-large/memory/MEMORY.md \
   .claude/projects/-Users-cantu-repos-claude-config/memory/MEMORY.md
# Seed a git repo with 8 intent-added (git add -N) files so the hook sees > 5 in-flight
git init -q
git config user.email "eval@test.local"
git config user.name "Eval Runner"
for i in 1 2 3 4 5 6 7 8; do
  echo "placeholder $i" > "file${i}.ts"
  git add -N "file${i}.ts"
done
