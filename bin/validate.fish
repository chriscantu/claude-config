#!/usr/bin/env fish
# Structural validation of rules/ cross-references.
#
# `rules/planning.md` is the SINGLE anchor for pressure-framing-floor
# mechanics (named-cost emission contract, sentinel bypass, architectural
# invariant). Per ADR #0006/#0007 (rejected), four other rule files
# delegate to that anchor by reference rather than duplicating mechanics.
# That architecture is correct (see memory:
# per_gate_floor_blocks_substitutable) but creates a fragile cross-ref
# web — renaming the anchor file or restructuring its labeled blocks
# silently breaks every dependent rule with no test signal.
#
# This script catches structural breakage at lint time:
#   1. Required labeled blocks present in rules/planning.md
#   2. Dependent rule files still reference rules/planning.md
#
# Exits 0 when structurally sound, non-zero on first failure with a
# diagnostic. Intended for CI alongside link-config.fish --check and
# check-rules-drift.fish.
#
# Usage:
#   ./bin/validate.fish

set -l repo (cd (dirname (status --current-filename))/..; and pwd)
set -l rules $repo/rules

set -l errors 0

# --- Check 1: required labeled blocks in rules/planning.md ----------------
# These are bold inline labels (e.g. **Skip contract.**), not markdown
# headings. They identify the load-bearing sections that dependent rules
# delegate to. If a label disappears or is reworded, the anchor breaks.
set -l anchor $rules/planning.md
set -l required_labels \
    "**Skip contract.**" \
    "**Pressure-framing floor.**" \
    "**Emission contract — MANDATORY.**" \
    "**Architectural invariant.**" \
    "**Emergency bypass — sentinel file check.**"

if not test -f $anchor
    echo "FAIL: anchor file missing: $anchor"
    exit 1
end

for label in $required_labels
    if not grep -qF -- "$label" $anchor
        echo "FAIL: rules/planning.md missing required label: $label"
        set errors (math $errors + 1)
    end
end

# --- Check 2: dependent rules reference the anchor file -------------------
# Each dependent rule must contain the literal string "planning.md" so a
# future rename surfaces here instead of silently dangling. Sibling refs
# in rules/ omit the directory prefix; we match either form.
set -l dependents \
    fat-marker-sketch.md \
    goal-driven.md \
    think-before-coding.md \
    execution-mode.md

for dep in $dependents
    set -l path $rules/$dep
    if not test -f $path
        echo "FAIL: dependent rule missing: $path"
        set errors (math $errors + 1)
        continue
    end
    if not grep -qF -- "planning.md" $path
        echo "FAIL: rules/$dep does not reference planning.md"
        set errors (math $errors + 1)
    end
end

# --- Report ---------------------------------------------------------------
if test $errors -eq 0
    echo "OK: rules/ cross-references structurally sound"
    exit 0
else
    echo ""
    echo "Found $errors structural error(s) in rules/ cross-references."
    echo "Either restore the missing anchor / reference, or update this"
    echo "script if the anchor architecture itself is changing."
    exit 1
end
