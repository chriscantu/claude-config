#!/usr/bin/env fish
# Install claude-config by symlinking files into ~/.claude/
# Run: fish install.fish
# Re-run safely — existing symlinks are replaced, regular files are backed up.

set repo_dir (cd (dirname (status filename)); and pwd)
set claude_dir "$HOME/.claude"

# Ensure target directories exist
mkdir -p "$claude_dir/rules" "$claude_dir/skills" "$claude_dir/agents"

# Symlink global CLAUDE.md
if test -f "$claude_dir/CLAUDE.md"; and not test -L "$claude_dir/CLAUDE.md"
    echo "Backing up existing CLAUDE.md → CLAUDE.md.bak"
    mv "$claude_dir/CLAUDE.md" "$claude_dir/CLAUDE.md.bak"
end
ln -sf "$repo_dir/global/CLAUDE.md" "$claude_dir/CLAUDE.md"
echo "✓ global/CLAUDE.md → ~/.claude/CLAUDE.md"

# Symlink rules
for rule in $repo_dir/rules/*.md
    set name (basename $rule)
    if test -f "$claude_dir/rules/$name"; and not test -L "$claude_dir/rules/$name"
        echo "Backing up existing rules/$name → rules/$name.bak"
        mv "$claude_dir/rules/$name" "$claude_dir/rules/$name.bak"
    end
    ln -sf "$rule" "$claude_dir/rules/$name"
    echo "✓ rules/$name → ~/.claude/rules/$name"
end

# Symlink skills (each skill is a directory with SKILL.md)
# -n flag: treat existing symlink-to-dir as file, so ln replaces it instead of descending
for skill_dir in $repo_dir/skills/*/
    set name (basename $skill_dir)
    set skill_dir (string trim --right --chars=/ $skill_dir)
    if test -d "$claude_dir/skills/$name"; and not test -L "$claude_dir/skills/$name"
        echo "Backing up existing skills/$name → skills/$name.bak"
        mv "$claude_dir/skills/$name" "$claude_dir/skills/$name.bak"
    end
    ln -sfn "$skill_dir" "$claude_dir/skills/$name"
    echo "✓ skills/$name → ~/.claude/skills/$name"
end

# Symlink agents
for agent in $repo_dir/agents/*.md
    set name (basename $agent)
    if test -f "$claude_dir/agents/$name"; and not test -L "$claude_dir/agents/$name"
        echo "Backing up existing agents/$name → agents/$name.bak"
        mv "$claude_dir/agents/$name" "$claude_dir/agents/$name.bak"
    end
    ln -sf "$agent" "$claude_dir/agents/$name"
    echo "✓ agents/$name → ~/.claude/agents/$name"
end

echo ""
echo "Done. Templates are in $repo_dir/templates/ (copy into repos as needed)."
