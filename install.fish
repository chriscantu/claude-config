#!/usr/bin/env fish
# Install claude-config by symlinking files into ~/.claude/
# Run: fish install.fish
# Re-run safely — existing symlinks are replaced, regular files are backed up.

set repo_dir (cd (dirname (status filename)); and pwd)
set claude_dir "$HOME/.claude"

# Ensure target directories exist
mkdir -p "$claude_dir/rules"

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

echo ""
echo "Done. Templates are in $repo_dir/templates/ (copy into repos as needed)."
