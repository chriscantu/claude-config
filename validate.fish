#!/usr/bin/env fish
# Validate claude-config structural integrity and concept coverage.
# Run: fish validate.fish
#
# Phase 1: Static validation (frontmatter, cross-references, symlinks)
# Phase 2: Concept coverage (required behavioral concepts exist somewhere in config)

set repo_dir (cd (dirname (status filename)); and pwd)
set claude_dir "$HOME/.claude"
set pass_count 0
set fail_count 0
set warn_count 0

function pass
    set -g pass_count (math $pass_count + 1)
    echo "  ✓ $argv"
end

function fail
    set -g fail_count (math $fail_count + 1)
    echo "  ✗ $argv"
end

function warn
    set -g warn_count (math $warn_count + 1)
    echo "  ⚠ $argv"
end

# ─────────────────────────────────────────────────
# Phase 1: Static Validation
# ─────────────────────────────────────────────────

echo "Phase 1: Static Validation"
echo ""

# 1a. Skill frontmatter
echo "── Skill frontmatter"
for skill_dir in $repo_dir/skills/*/
    set name (basename $skill_dir)
    set skill_file "$skill_dir/SKILL.md"

    if not test -f "$skill_file"
        fail "$name: missing SKILL.md"
        continue
    end

    # Check for opening frontmatter delimiter
    set first_line (head -1 "$skill_file")
    if test "$first_line" != "---"
        fail "$name: missing frontmatter (no opening ---)"
        continue
    end

    # Check for name field
    if not grep -q "^name:" "$skill_file"
        fail "$name: missing 'name:' in frontmatter"
    else
        # Verify name matches directory name
        set fm_name (grep "^name:" "$skill_file" | head -1 | sed 's/^name: *//')
        if test "$fm_name" != "$name"
            fail "$name: frontmatter name '$fm_name' doesn't match directory name '$name'"
        else
            pass "$name: frontmatter valid"
        end
    end

    # Check for description field
    if not grep -q "^description:" "$skill_file"
        fail "$name: missing 'description:' in frontmatter"
    end
end

echo ""

# 1b. Rule frontmatter
echo "── Rule frontmatter"
for rule in $repo_dir/rules/*.md
    set name (basename $rule .md)

    set first_line (head -1 "$rule")
    if test "$first_line" != "---"
        fail "$name: missing frontmatter (no opening ---)"
        continue
    end

    if not grep -q "^description:" "$rule"
        fail "$name: missing 'description:' in frontmatter"
    else
        pass "$name: frontmatter valid"
    end
end

echo ""

# 1c. Agent frontmatter
echo "── Agent frontmatter"
for agent in $repo_dir/agents/*.md
    set name (basename $agent .md)

    set first_line (head -1 "$agent")
    if test "$first_line" != "---"
        fail "$name: missing frontmatter (no opening ---)"
        continue
    end

    set has_desc 0
    set has_tools 0
    if grep -q "^description:" "$agent"
        set has_desc 1
    end
    if grep -q "^tools:" "$agent"
        set has_tools 1
    end

    if test $has_desc -eq 1 -a $has_tools -eq 1
        pass "$name: frontmatter valid"
    else
        if test $has_desc -eq 0
            fail "$name: missing 'description:' in frontmatter"
        end
        if test $has_tools -eq 0
            fail "$name: missing 'tools:' in frontmatter"
        end
    end
end

echo ""

# 1d. Pipeline cross-references
echo "── Pipeline cross-references"

# Extract all skill/agent invocation targets from rules and skills
set targets (grep -rhoE 'invoke.*`/([a-z-]+)`' $repo_dir/rules/ $repo_dir/skills/ 2>/dev/null | grep -oE '/[a-z-]+' | sed 's|^/||' | sort -u)

for target in $targets
    if test -d "$repo_dir/skills/$target"
        pass "/$target referenced and exists as skill"
    else if test -f "$repo_dir/agents/$target.md"
        pass "/$target referenced and exists as agent"
    else
        fail "/$target referenced in pipeline but no matching skill or agent found"
    end
end

echo ""

# 1e. Symlink verification
echo "── Symlink verification"
set symlink_ok 1

for skill_dir in $repo_dir/skills/*/
    set name (basename $skill_dir)
    if test -L "$claude_dir/skills/$name"
        set link_target (readlink "$claude_dir/skills/$name")
        set expected (string trim --right --chars=/ "$skill_dir")
        if test "$link_target" = "$expected"
            pass "~/.claude/skills/$name symlinked correctly"
        else
            warn "~/.claude/skills/$name points to $link_target (expected $expected)"
        end
    else if test -d "$claude_dir/skills/$name"
        warn "~/.claude/skills/$name exists but is not a symlink"
    else
        fail "~/.claude/skills/$name missing — run install.fish"
        set symlink_ok 0
    end
end

for rule in $repo_dir/rules/*.md
    set name (basename $rule)
    if test -L "$claude_dir/rules/$name"
        pass "~/.claude/rules/$name symlinked"
    else
        fail "~/.claude/rules/$name missing — run install.fish"
        set symlink_ok 0
    end
end

for agent in $repo_dir/agents/*.md
    set name (basename $agent)
    if test -L "$claude_dir/agents/$name"
        pass "~/.claude/agents/$name symlinked"
    else
        fail "~/.claude/agents/$name missing — run install.fish"
        set symlink_ok 0
    end
end

if test -L "$claude_dir/CLAUDE.md"
    pass "~/.claude/CLAUDE.md symlinked"
else
    fail "~/.claude/CLAUDE.md missing — run install.fish"
end

echo ""

# ─────────────────────────────────────────────────
# Phase 2: Concept Coverage
# ─────────────────────────────────────────────────

echo "Phase 2: Concept Coverage"
echo ""

set concepts_file "$repo_dir/tests/required-concepts.txt"
if not test -f "$concepts_file"
    fail "required-concepts.txt not found at $concepts_file"
else
    # Search across rules and skills for each required concept
    while read -l line
        # Skip comments and blank lines
        if string match -q "#*" -- "$line"; or test -z (string trim "$line")
            continue
        end

        # Parse: pattern | description
        set pattern (string split " | " -- "$line")[1]
        set desc (string split " | " -- "$line")[2]

        if test -z "$desc"
            warn "Malformed concept line: $line"
            continue
        end

        # grep -rlE across rules/ skills/ global/
        set matches (grep -rlE "$pattern" $repo_dir/rules/ $repo_dir/skills/ $repo_dir/global/ 2>/dev/null)

        if test (count $matches) -gt 0
            # Show which files contain it
            set file_list ""
            for m in $matches
                set rel (string replace "$repo_dir/" "" "$m")
                set file_list "$file_list $rel"
            end
            pass "$desc (found in:$file_list)"
        else
            fail "$desc"
        end
    end <"$concepts_file"
end

echo ""

# ─────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────

echo "─────────────────────────────────────────────────"
echo "Results: $pass_count passed, $fail_count failed, $warn_count warnings"

if test $fail_count -gt 0
    echo "VALIDATION FAILED"
    exit 1
else if test $warn_count -gt 0
    echo "VALIDATION PASSED (with warnings)"
    exit 0
else
    echo "VALIDATION PASSED"
    exit 0
end
