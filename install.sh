#!/usr/bin/env bash
# Install claude-config by symlinking files into ~/.claude/
# Run: bash install.sh
# Re-run safely — existing symlinks are replaced, regular files are backed up.

set -euo pipefail

repo_dir="$(cd "$(dirname "$0")" && pwd)"
claude_dir="$HOME/.claude"

# Ensure target directories exist
mkdir -p "$claude_dir/rules" "$claude_dir/skills" "$claude_dir/agents"

# Symlink global CLAUDE.md
if [ -f "$claude_dir/CLAUDE.md" ] && [ ! -L "$claude_dir/CLAUDE.md" ]; then
    echo "Backing up existing CLAUDE.md → CLAUDE.md.bak"
    mv "$claude_dir/CLAUDE.md" "$claude_dir/CLAUDE.md.bak"
fi
ln -sf "$repo_dir/global/CLAUDE.md" "$claude_dir/CLAUDE.md"
echo "✓ global/CLAUDE.md → ~/.claude/CLAUDE.md"

# Symlink rules
for rule in "$repo_dir"/rules/*.md; do
    [ -f "$rule" ] || continue
    name="$(basename "$rule")"
    if [ -f "$claude_dir/rules/$name" ] && [ ! -L "$claude_dir/rules/$name" ]; then
        echo "Backing up existing rules/$name → rules/$name.bak"
        mv "$claude_dir/rules/$name" "$claude_dir/rules/$name.bak"
    fi
    ln -sf "$rule" "$claude_dir/rules/$name"
    echo "✓ rules/$name → ~/.claude/rules/$name"
done

# Symlink skills (each skill is a directory with SKILL.md)
for skill_dir in "$repo_dir"/skills/*/; do
    [ -d "$skill_dir" ] || continue
    name="$(basename "$skill_dir")"
    skill_dir="${skill_dir%/}"
    if [ -d "$claude_dir/skills/$name" ] && [ ! -L "$claude_dir/skills/$name" ]; then
        echo "Backing up existing skills/$name → skills/$name.bak"
        mv "$claude_dir/skills/$name" "$claude_dir/skills/$name.bak"
    fi
    ln -sfn "$skill_dir" "$claude_dir/skills/$name"
    echo "✓ skills/$name → ~/.claude/skills/$name"
done

# Symlink agents
for agent in "$repo_dir"/agents/*.md; do
    [ -f "$agent" ] || continue
    name="$(basename "$agent")"
    if [ -f "$claude_dir/agents/$name" ] && [ ! -L "$claude_dir/agents/$name" ]; then
        echo "Backing up existing agents/$name → agents/$name.bak"
        mv "$claude_dir/agents/$name" "$claude_dir/agents/$name.bak"
    fi
    ln -sf "$agent" "$claude_dir/agents/$name"
    echo "✓ agents/$name → ~/.claude/agents/$name"
done

echo ""
echo "Done. Templates are in $repo_dir/templates/ (copy into repos as needed)."
