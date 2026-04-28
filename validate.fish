#!/usr/bin/env fish
# Validate claude-config structural integrity and concept coverage.
# Run: fish validate.fish
#
# Phase 1: Static validation (frontmatter, cross-references, symlinks)
# Phase 2: Concept coverage (required behavioral concepts exist somewhere in config)

# CLAUDE_CONFIG_REPO_DIR env override enables fixture-based testing of validation
# phases without requiring the real claude-config repo on disk.
if set -q CLAUDE_CONFIG_REPO_DIR; and test -n "$CLAUDE_CONFIG_REPO_DIR"
    set repo_dir $CLAUDE_CONFIG_REPO_DIR
else
    set repo_dir (cd (dirname (status filename)); and pwd)
end
if test -z "$repo_dir"
    echo "Error: Could not determine repository directory"
    exit 1
end

set claude_dir "$HOME/.claude"
set pass_count 0
set fail_count 0
set warn_count 0

# Optional --skill <slug>: validate one skill's structural shape only.
# Skips Phase 1b/1c/1d/1e and Phase 2 — used by bin/new-skill on freshly
# scaffolded skills (no symlinks yet, concept coverage not its concern).
set single_skill ""
set i 1
while test $i -le (count $argv)
    set arg $argv[$i]
    switch $arg
        case --skill
            set i (math $i + 1)
            if test $i -gt (count $argv)
                echo "ERROR: --skill requires a slug argument" >&2
                exit 2
            end
            set single_skill $argv[$i]
        case '*'
            echo "ERROR: unknown argument: $arg" >&2
            echo "Usage: fish validate.fish [--skill <slug>]" >&2
            exit 2
    end
    set i (math $i + 1)
end

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

# Helper: check if frontmatter contains a field (searches only between --- delimiters)
function frontmatter_has
    # Usage: frontmatter_has <file> <field_pattern>
    sed -n '2,/^---$/p' $argv[1] | sed '$d' | grep -q $argv[2]
end

# Helper: extract a frontmatter field value
function frontmatter_get
    # Usage: frontmatter_get <file> <field_name>
    sed -n '2,/^---$/p' $argv[1] | sed '$d' | grep "^$argv[2]:" | head -1 | sed "s/^$argv[2]: *//"
end

# Helper: validate one skill's structural shape (frontmatter + template invariants).
# Used by Phase 1a and by --skill <slug> mode. Issues fail/pass/warn directly.
function check_skill_shape
    # Usage: check_skill_shape <skill_dir>
    set -l skill_dir $argv[1]
    set -l name (basename $skill_dir)
    set -l skill_file "$skill_dir/SKILL.md"

    if not test -f "$skill_file"
        fail "$name: missing SKILL.md"
        return
    end

    set -l first_line (head -1 "$skill_file")
    if test "$first_line" != "---"
        fail "$name: missing frontmatter (no opening ---)"
        return
    end

    if not frontmatter_has "$skill_file" "^name:"
        fail "$name: missing 'name:' in frontmatter"
    else
        set -l fm_name (frontmatter_get "$skill_file" "name")
        if test "$fm_name" != "$name"
            fail "$name: frontmatter name '$fm_name' doesn't match directory name '$name'"
        else
            pass "$name: frontmatter valid"
        end
    end

    if not frontmatter_has "$skill_file" "^description:"
        fail "$name: missing 'description:' in frontmatter"
    end

    # Template invariant (warn-only — pre-template skills may lack these):
    # see templates/skill/ and #58 for rationale.
    if not test -d "$skill_dir/evals"
        warn "$name: missing evals/ directory (template invariant — see templates/README.md)"
    else if not test -f "$skill_dir/evals/evals.json"
        warn "$name: missing evals/evals.json (template invariant)"
    end
end

# ─────────────────────────────────────────────────
# Phase 1: Static Validation
# ─────────────────────────────────────────────────

echo "Phase 1: Static Validation"
echo ""

# Single-skill mode: validate one skill's structural shape only, then exit.
if test -n "$single_skill"
    set -l one_dir $repo_dir/skills/$single_skill
    if not test -d $one_dir
        fail "skills/$single_skill/ does not exist"
    else
        echo "── Skill frontmatter (single: $single_skill)"
        check_skill_shape $one_dir
    end
    echo ""
    echo "─────────────────────────────────────────────────"
    echo "Results: $pass_count passed, $fail_count failed, $warn_count warnings"
    if test $fail_count -gt 0
        echo "VALIDATION FAILED"
        exit 1
    end
    exit 0
end

# 1a. Skill frontmatter
echo "── Skill frontmatter"
set skill_dirs $repo_dir/skills/*/
if test (count $skill_dirs) -eq 0; or not test -d "$skill_dirs[1]"
    fail "No skill directories found in $repo_dir/skills/"
else
    for skill_dir in $skill_dirs
        check_skill_shape (string trim --right --chars=/ "$skill_dir")
    end
end

echo ""

# 1b. Rule frontmatter
echo "── Rule frontmatter"
set rule_files $repo_dir/rules/*.md
if test (count $rule_files) -eq 0; or not test -f "$rule_files[1]"
    fail "No rule files found in $repo_dir/rules/"
else
    for rule in $rule_files
        set name (basename $rule .md)
        # README is documentation, not a loadable rule
        if test "$name" = README
            continue
        end

        set first_line (head -1 "$rule")
        if test $status -ne 0
            fail "$name: could not read file"
            continue
        end
        if test "$first_line" != "---"
            fail "$name: missing frontmatter (no opening ---)"
            continue
        end

        if not frontmatter_has "$rule" "^description:"
            fail "$name: missing 'description:' in frontmatter"
        else
            pass "$name: frontmatter valid"
        end
    end
end

echo ""

# 1c. Agent frontmatter
echo "── Agent frontmatter"
set agent_files $repo_dir/agents/*.md
if test (count $agent_files) -eq 0; or not test -f "$agent_files[1]"
    fail "No agent files found in $repo_dir/agents/"
else
    for agent in $agent_files
        set name (basename $agent .md)

        set first_line (head -1 "$agent")
        if test $status -ne 0
            fail "$name: could not read file"
            continue
        end
        if test "$first_line" != "---"
            fail "$name: missing frontmatter (no opening ---)"
            continue
        end

        set has_desc 0
        set has_tools 0
        if frontmatter_has "$agent" "^description:"
            set has_desc 1
        end
        if frontmatter_has "$agent" "^tools:"
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
end

echo ""

# 1d. Pipeline cross-references
echo "── Pipeline cross-references"

# Extract all skill/agent invocation targets from rules and skills
set targets (grep -rhoE 'invoke.*`/([a-z-]+)`' $repo_dir/rules/ $repo_dir/skills/ 2>/dev/null | grep -oE '/[a-z-]+' | sed 's|^/||' | sort -u)

if test (count $targets) -eq 0
    warn "No invocation targets found — cross-reference check skipped (verify the grep pattern matches your invoke syntax)"
else
    for target in $targets
        if test -d "$repo_dir/skills/$target"
            pass "/$target referenced and exists as skill"
        else if test -f "$repo_dir/agents/$target.md"
            pass "/$target referenced and exists as agent"
        else
            fail "/$target referenced in pipeline but no matching skill or agent found"
        end
    end
end

echo ""

# 1e. Symlink verification
echo "── Symlink verification"

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
    end
end

for rule in $repo_dir/rules/*.md
    set name (basename $rule)
    # README is documentation, not a loadable rule
    if test "$name" = README.md
        continue
    end
    if test -L "$claude_dir/rules/$name"
        pass "~/.claude/rules/$name symlinked"
    else
        fail "~/.claude/rules/$name missing — run install.fish"
    end
end

for agent in $repo_dir/agents/*.md
    set name (basename $agent)
    if test -L "$claude_dir/agents/$name"
        pass "~/.claude/agents/$name symlinked"
    else
        fail "~/.claude/agents/$name missing — run install.fish"
    end
end

if test -L "$claude_dir/CLAUDE.md"
    pass "~/.claude/CLAUDE.md symlinked"
else
    fail "~/.claude/CLAUDE.md missing — run install.fish"
end

echo ""

# 1f. Rules anchor labels
# rules/planning.md is the SINGLE anchor for pressure-framing-floor mechanics.
# Four dependent rules delegate to it by reference. If a labeled block disappears
# or is reworded, the anchor breaks silently.
echo "── Rules anchor labels"

set anchor_file "$repo_dir/rules/planning.md"
set required_labels \
    "**Skip contract.**" \
    "**Pressure-framing floor.**" \
    "**Emission contract — MANDATORY.**" \
    "**Architectural invariant.**" \
    "**Emergency bypass — sentinel file check.**"
set dependent_rules \
    fat-marker-sketch.md \
    goal-driven.md \
    think-before-coding.md \
    execution-mode.md \
    pr-validation.md

if not test -f "$anchor_file"
    fail "anchor file missing: rules/planning.md"
else
    for label in $required_labels
        if grep -qF -- "$label" "$anchor_file"
            pass "planning.md contains label: $label"
        else
            fail "planning.md missing required label: $label"
        end
    end
end

for dep in $dependent_rules
    set dep_path "$repo_dir/rules/$dep"
    if not test -f "$dep_path"
        fail "dependent rule missing: rules/$dep"
        continue
    end
    if grep -qF -- "planning.md" "$dep_path"
        pass "rules/$dep references planning.md"
    else
        fail "rules/$dep does not reference planning.md"
    end
end

echo ""

# 1g. Canonical-string drift
# Some rule values are defined canonically in one file and referenced — but not
# restated — by other rules. "Do not restate" markers are editor hints, not
# enforcement. This phase greps for canonical strings outside their canonical
# home and fails if found.
echo "── Canonical-string drift"

# Registry: <pattern>|<canonical-file-basename>|<human-name>
set drift_registry \
    "≤ ~200 LOC functional change|planning.md|Trivial-tier LOC criterion" \
    "Single component / single-file primary surface|planning.md|Trivial-tier surface criterion" \
    "Unambiguous approach (one obvious design|planning.md|Trivial-tier approach criterion" \
    "Low blast radius (no cross-team|planning.md|Trivial-tier blast-radius criterion"

# Guard: empty rules/ dir means the drift loop scans nothing and silently passes.
# Pre-check before the loop so missing-rules-dir is loud, not silent.
set rules_glob $repo_dir/rules/*.md
if test (count $rules_glob) -eq 0
    fail "rules/ directory empty or missing — Phase 1g cannot scan for drift"
else
    for entry in $drift_registry
        set parts (string split -m 2 "|" $entry)
        if test (count $parts) -ne 3
            fail "malformed drift-registry entry (expected 3 |-separated fields): $entry"
            continue
        end
        set pattern $parts[1]
        set canonical $parts[2]
        set label $parts[3]

        # No 2>/dev/null: surface permission errors instead of treating an
        # unreadable rule file as a silent pass. Capture grep exit status —
        # 0 = match, 1 = no match, 2 = error (e.g. permission denied).
        set hits (grep -lF -- "$pattern" $rules_glob)
        set grep_status $status
        if test $grep_status -eq 2
            fail "$label: grep returned error status 2 (permission denied or I/O error) while scanning rules/*.md"
            continue
        end

        set drift_found 0
        for hit in $hits
            set hit_basename (basename $hit)
            if test "$hit_basename" != "$canonical"
                fail "drift: '$label' restated in rules/$hit_basename — canonical home is rules/$canonical"
                set drift_found 1
            end
        end

        if test $drift_found -eq 0
            pass "$label: no drift (canonical home rules/$canonical)"
        end
    end
end

echo ""

# 1j. Stable anchor presence
# Some rule constructs are promoted to citable anchors so dependent rules can
# deep-link via `[text](planning.md#kebab-name)`. Auto-generated heading IDs
# are fragile (em dashes, punctuation, renames break them silently); explicit
# `<a id="…">` anchors are the load-bearing contract. This phase asserts each
# registered anchor is still present in its canonical home.
echo "── Stable anchor presence"

# Registry: <anchor-id>|<canonical-file-basename>|<human-name>
set anchor_registry \
    "trivial-tier-criteria|planning.md|Trivial/Mechanical tier criteria" \
    "skip-contract|planning.md|DTP Skip contract" \
    "emission-contract|planning.md|DTP Emission contract" \
    "pressure-framing-floor|planning.md|DTP Pressure-framing floor" \
    "architectural-invariant|planning.md|DTP Architectural invariant" \
    "emergency-bypass-sentinel|planning.md|DTP Emergency bypass sentinel"

for entry in $anchor_registry
    set parts (string split -m 2 "|" $entry)
    if test (count $parts) -ne 3
        fail "malformed anchor-registry entry (expected 3 |-separated fields): $entry"
        continue
    end
    set anchor_id $parts[1]
    set canonical $parts[2]
    set label $parts[3]

    set anchor_path "$repo_dir/rules/$canonical"
    if not test -f $anchor_path
        fail "anchor home missing: rules/$canonical"
        continue
    end

    set marker "<a id=\"$anchor_id\"></a>"
    if grep -qF -- "$marker" $anchor_path
        pass "$label: anchor #$anchor_id present in rules/$canonical"
    else
        fail "$label: missing $marker in rules/$canonical (deep-links from dependents will dangle)"
    end
end

echo ""

# 1k. Anchor-link target resolution
# Phase 1j confirms anchors exist in their canonical file. Phase 1f confirms
# dependent rules mention the canonical file. Neither catches a typo'd anchor
# in a deep-link from a dependent — `[label](planning.md#emergancy-bypass-sentinel)`
# would pass both. This phase greps every `planning.md#<id>` reference inside
# rules/ and verifies the `<id>` matches an `<a id="...">` actually defined
# in planning.md.
echo "── Anchor-link target resolution"

set planning_path "$repo_dir/rules/planning.md"
if not test -f $planning_path
    fail "rules/planning.md missing — cannot resolve anchor links"
else
    # Build set of defined anchor IDs in planning.md
    set defined_anchors (grep -oE '<a id="[^"]+"' $planning_path | string replace -r '<a id="' '' | string replace -r '"$' '')

    # Scan every rules/*.md (except planning.md itself) for planning.md#... links
    for rule_file in $repo_dir/rules/*.md
        set rule_name (basename $rule_file)
        if test "$rule_name" = "planning.md"; or test "$rule_name" = "README.md"
            continue
        end
        # Extract anchor IDs referenced as planning.md#<id>
        set referenced_anchors (grep -oE 'planning\.md#[a-z0-9-]+' $rule_file | string replace -r 'planning\.md#' '')
        for ref in $referenced_anchors
            if contains $ref $defined_anchors
                pass "rules/$rule_name links planning.md#$ref → resolves"
            else
                fail "rules/$rule_name links planning.md#$ref → DEAD ANCHOR (not defined in planning.md)"
            end
        end
    end
end

echo ""

# 1h. Hook ↔ README consistency
# Every hook script in hooks/ (excluding test fixtures) must be documented
# in README.md so a contributor adding a hook either documents it or surfaces
# the omission here. Symlinking happens via bin/link-config.fish; this phase
# guards the documentation seam. README.md and docs/*.md both count — the
# README may delegate operator-facing hook docs to docs/operations.md.
echo "── Hook ↔ user docs consistency"

set readme "$repo_dir/README.md"
set doc_targets $readme
for doc in $repo_dir/docs/*.md
    set doc_targets $doc_targets $doc
end
if not test -f $readme
    fail "README.md missing"
else
    for src in $repo_dir/hooks/*.sh
        set hook_name (basename $src)
        # Skip test fixtures — they're for repo CI, not user-facing hooks.
        if string match -q 'test-*' $hook_name
            continue
        end
        set found_in
        for target in $doc_targets
            if test -f $target; and grep -qF -- "$hook_name" $target
                set found_in $found_in (string replace "$repo_dir/" "" $target)
            end
        end
        if test (count $found_in) -gt 0
            pass "hooks/$hook_name documented in $found_in"
        else
            fail "hooks/$hook_name not mentioned in README.md or docs/*.md (add usage docs or rename test-*)"
        end
    end
end

echo ""

# 1i. Dangling hook permissions in .claude/settings.json (warn-only)
# The repo's project-local .claude/settings.json may grant Bash permissions
# pointing at hook scripts (e.g., for protected-file checks). When a hook is
# renamed or removed, those permissions can dangle. Warn so they get cleaned;
# don't fail because the path is user/machine-specific (e.g., absolute paths
# from another machine remain valid for that user's setup).
echo "── Dangling hook permissions (warn-only)"

set proj_settings "$repo_dir/.claude/settings.json"
if not test -f $proj_settings
    pass ".claude/settings.json absent — nothing to scan"
else
    # Extract any "Bash(<path>/hooks/<name>.sh)" permission strings, then
    # check the basename exists in repo's hooks/ directory.
    set bash_hook_perms (grep -oE 'Bash\([^)]*hooks/[a-zA-Z0-9_-]+\.sh\)' $proj_settings 2>/dev/null)
    if test (count $bash_hook_perms) -eq 0
        pass "no Bash hook permissions in .claude/settings.json"
    else
        for perm in $bash_hook_perms
            set hook_basename (string match -r 'hooks/([a-zA-Z0-9_-]+\.sh)' -- $perm)[2]
            if test -z "$hook_basename"
                continue
            end
            if test -f "$repo_dir/hooks/$hook_basename"
                pass "permission $perm → hooks/$hook_basename exists"
            else
                warn "permission $perm references hooks/$hook_basename which does not exist in repo (stale entry?)"
            end
        end
    end
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
    set concept_count 0
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

        set concept_count (math $concept_count + 1)

        # Validate the regex pattern before using it
        echo "test" | grep -E "$pattern" >/dev/null 2>&1
        set grep_status $status
        if test $grep_status -eq 2
            fail "$desc (invalid regex pattern: $pattern)"
            continue
        end

        # grep -rlE across rules/ skills/ global/
        set matches (grep -rlE "$pattern" $repo_dir/rules/ $repo_dir/skills/ $repo_dir/global/ 2>/dev/null)
        set grep_status $status

        # Distinguish "no match" (status 1) from "error" (status 2)
        if test $grep_status -eq 2
            fail "$desc (grep error searching for: $pattern)"
        else if test (count $matches) -gt 0
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

    if test $concept_count -eq 0
        fail "No concepts found in required-concepts.txt (file may be empty or malformed)"
    end
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
