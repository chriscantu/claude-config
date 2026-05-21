#!/usr/bin/env fish
# Validate claude-config structural integrity and concept coverage.
# Run: fish validate.fish
#
# Phase 1: Static validation (frontmatter, cross-references, symlinks)
# Phase 2: Concept coverage (required behavioral concepts exist somewhere in config)

# CLAUDE_CONFIG_REPO_DIR env override enables fixture-based testing of validation
# phases without requiring the real claude-config repo on disk. Validate the
# override points at an existing dir — silently accepting a typo'd path would
# make every phase scan empty globs and emit false passes.
if set -q CLAUDE_CONFIG_REPO_DIR; and test -n "$CLAUDE_CONFIG_REPO_DIR"
    if not test -d "$CLAUDE_CONFIG_REPO_DIR"
        echo "Error: CLAUDE_CONFIG_REPO_DIR=$CLAUDE_CONFIG_REPO_DIR is not a directory" >&2
        exit 1
    end
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

# Source the shared symlink-layout library used by both this validator and
# bin/link-config.fish. Single source of truth for which paths are managed.
source $repo_dir/bin/lib/symlinks.fish

# Optional --skill <slug>: validate one skill's structural shape only.
# Skips Phase 1b/1c/1d/1e and Phase 2 — used by bin/new-skill on freshly
# scaffolded skills (no symlinks yet, concept coverage not its concern).
#
# Optional --log-path <path>: write JSONL phase telemetry; default off.
# Each phase emits one line {ts, commit, phase, status, duration_ms}.
# Foundation for Phase 1q retirement-signal monitoring (issue #352).
# HARNESS_VALIDATE_LOG env var enables default path
# .claude/state/validate-phase-log.jsonl when --log-path is unset.
set single_skill ""
set log_path ""
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
        case --log-path
            set i (math $i + 1)
            if test $i -gt (count $argv)
                echo "ERROR: --log-path requires a path argument" >&2
                exit 2
            end
            set log_path $argv[$i]
        case '--log-path=*'
            set log_path (string replace -r '^--log-path=' '' -- $arg)
            if test -z "$log_path"
                echo "ERROR: --log-path= requires a non-empty value" >&2
                exit 2
            end
        case '*'
            echo "ERROR: unknown argument: $arg" >&2
            echo "Usage: fish validate.fish [--skill <slug>] [--log-path <path>]" >&2
            exit 2
    end
    set i (math $i + 1)
end

# Env fallback: HARNESS_VALIDATE_LOG=1 (or any non-empty value) selects the
# default repo-local log path. --log-path takes precedence. The directory
# `.claude/state/` is already gitignored.
if test -z "$log_path"; and set -q HARNESS_VALIDATE_LOG; and test -n "$HARNESS_VALIDATE_LOG"
    set log_path "$repo_dir/.claude/state/validate-phase-log.jsonl"
end

function pass
    set -g pass_count (math $pass_count + 1)
    echo "  ✓ $argv"
end

function fail
    set -g fail_count (math $fail_count + 1)
    set -g _current_phase_failed 1
    echo "  ✗ $argv"
end

function warn
    set -g warn_count (math $warn_count + 1)
    echo "  ⚠ $argv"
end

# Phase-log telemetry helpers. Active only when $log_path is non-empty.
# fail() flips _current_phase_failed; _phase_begin closes the prior phase
# and resets the flag for the next one; _phase_finalize emits the last
# phase at end-of-run. Second-precision timing — fish lacks portable
# millisecond timestamps and Phase 1q's retirement-signal use case
# doesn't require sub-second resolution.
set -g _current_phase ""
set -g _phase_start_s 0
set -g _current_phase_failed 0

set -g _phase_log_write_warned 0

# Cache HEAD SHA once — _emit_phase_log fires per phase (17+ active phases)
# and the value never changes mid-run. Falls back to "unknown" on git error.
set -g _validate_commit (git -C $repo_dir rev-parse HEAD 2>/dev/null; or echo "unknown")

function _emit_phase_log --argument-names phase ph_status duration_ms
    test -z "$log_path"; and return 0
    set -l ts (date -u +"%Y-%m-%dT%H:%M:%SZ")
    set -l line "{\"ts\":\"$ts\",\"commit\":\"$_validate_commit\",\"phase\":\"$phase\",\"status\":\"$ph_status\",\"duration_ms\":$duration_ms}"
    if not mkdir -p (dirname $log_path) 2>/dev/null
        if test $_phase_log_write_warned -eq 0
            echo "  ⚠ phase-log write failed (mkdir): $log_path — telemetry disabled this run" >&2
            set -g _phase_log_write_warned 1
            set -g warn_count (math $warn_count + 1)
        end
        return 0
    end
    if not echo $line >> $log_path 2>/dev/null
        if test $_phase_log_write_warned -eq 0
            echo "  ⚠ phase-log write failed (append): $log_path — telemetry disabled this run" >&2
            set -g _phase_log_write_warned 1
            set -g warn_count (math $warn_count + 1)
        end
    end
end

function _phase_begin --argument-names id
    if test -n "$_current_phase"
        set -l ph_status pass
        test $_current_phase_failed -eq 1; and set ph_status fail
        set -l dur 0
        test $_phase_start_s -ne 0; and set dur (math \( (date +%s) - $_phase_start_s \) "* 1000")
        _emit_phase_log $_current_phase $ph_status $dur
    end
    set -g _current_phase $id
    set -g _phase_start_s (date +%s)
    set -g _current_phase_failed 0
end

function _phase_finalize
    if test -n "$_current_phase"
        set -l ph_status pass
        test $_current_phase_failed -eq 1; and set ph_status fail
        set -l dur 0
        test $_phase_start_s -ne 0; and set dur (math \( (date +%s) - $_phase_start_s \) "* 1000")
        _emit_phase_log $_current_phase $ph_status $dur
        set -g _current_phase ""
    end
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

# Validates the structural shape of an evals.json file against the contract
# enforced by tests/evals-lib.ts loadEvalFile: top-level {skill, evals[]} with
# each entry having name, exactly one of prompt/turns, and a non-empty
# assertions array (single-turn) or per-turn prompt+assertions (multi-turn).
# Phase 1m calls this for both skills/ and rules-evals/.
#
# A `__SCANNED__` sentinel is emitted per eval so the loop can verify the
# filter actually visited every entry. Without it, a future filter regression
# that makes every `select(...)` predicate miss would produce empty output and
# look indistinguishable from "no violations" — re-introducing the same
# silent-skip class issue #203 was meant to close.
function check_evals_json_shape
    set -l file $argv[1]
    set -l label $argv[2]

    if not test -f $file
        fail "$label: missing evals.json"
        return
    end

    if not jq -e . $file >/dev/null 2>&1
        fail "$label: invalid JSON"
        return
    end

    if not jq -e '.skill | type == "string" and length > 0' $file >/dev/null 2>&1
        fail "$label: missing or non-string top-level 'skill'"
        return
    end

    if not jq -e '.evals | type == "array"' $file >/dev/null 2>&1
        fail "$label: missing or non-array top-level 'evals'"
        return
    end

    set -l count_err (mktemp)
    set -l count (jq '.evals | length' $file 2>$count_err)
    set -l count_status $status
    if test $count_status -ne 0
        fail "$label: jq failed to read evals length (status $count_status): "(head -1 $count_err)
        rm -f $count_err
        return
    end
    rm -f $count_err
    if test -z "$count"; or not string match -qr '^\d+$' -- "$count"
        fail "$label: jq returned non-numeric eval count: '$count'"
        return
    end
    if test $count -eq 0
        warn "$label: evals array is empty"
        return
    end

    set -l jq_err (mktemp)
    set -l raw_lines (jq -r '.evals | to_entries[] | . as $e |
        ($e.value.name // "eval[\($e.key)]") as $id |
        ($e.value | [
            (if (has("name") and (.name | type == "string") and (.name | length > 0)) then null else "eval[\($e.key)] missing non-empty string '"'"'name'"'"'" end),
            (if ((has("prompt") and (.prompt | type == "string") and (.prompt | length > 0)) or (has("turns") and (.turns | type == "array") and (.turns | length > 0))) then null else "\($id) missing non-empty '"'"'prompt'"'"' or '"'"'turns'"'"'" end),
            (if (has("prompt") and has("turns")) then "\($id) has both '"'"'prompt'"'"' and '"'"'turns'"'"' (pick one)" else null end),
            (if (has("prompt") and ((has("assertions") | not) or ((.assertions | type) != "array") or ((.assertions | length) == 0))) then "\($id) single-turn eval missing non-empty '"'"'assertions'"'"' array" else null end),
            (if (has("turns") and (.turns | type == "array")) then
                (.turns | to_entries | map(
                    select((.value | type != "object")
                        or ((.value.prompt | type) != "string")
                        or ((.value.prompt | length) == 0)
                        or ((.value.assertions | type) != "array")
                        or ((.value.assertions | length) == 0)
                    ) | "\($id) turns[\(.key)] missing non-empty '"'"'prompt'"'"' or non-empty '"'"'assertions'"'"' array"
                ) | .[])
             else null end)
        ] | flatten | map(select(. != null)) | .[]),
        "__SCANNED__"' $file 2>$jq_err)
    set -l jq_status $status
    if test $jq_status -ne 0
        fail "$label: jq schema check errored (status $jq_status): "(head -1 $jq_err)
        rm -f $jq_err
        return
    end
    rm -f $jq_err

    set -l scanned 0
    set -l violations
    for line in $raw_lines
        if test "$line" = __SCANNED__
            set scanned (math $scanned + 1)
        else if test -n "$line"
            set violations $violations $line
        end
    end

    if test $scanned -ne $count
        fail "$label: filter coverage gap (scanned $scanned of $count evals — possible filter regression)"
        return
    end

    if test (count $violations) -gt 0
        for v in $violations
            fail "$label: $v"
        end
    else
        pass "$label: evals.json shape valid ($count evals)"
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
_phase_begin "1a"
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
_phase_begin "1b"
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
_phase_begin "1c"
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
_phase_begin "1d"
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
# MISSING is fail; STALE and NOT_SYMLINK are warn (former is recoverable
# via re-install, latter requires manual resolution). Capture the lib
# output to a list before iterating so an empty result (e.g. lib early-
# return on bad args) is loud instead of a silent zero-iteration loop.
_phase_begin "1e"
echo "── Symlink verification"

set results (check_symlink_layout $repo_dir $claude_dir)
if test (count $results) -eq 0
    fail "check_symlink_layout returned no entries — repo or home unset?"
else
    for result in $results
        set -l parts (string split -m 3 "|" $result)
        set -l status_kind $parts[1]
        set -l dst $parts[2]
        set -l detail $parts[3]
        set -l rel (string replace "$claude_dir/" "~/.claude/" $dst)
        switch $status_kind
            case OK
                pass "$rel symlinked"
            case MISSING
                fail "$rel missing — run install.fish"
            case STALE
                warn "$rel points to $detail (expected source)"
            case NOT_SYMLINK
                warn "$rel exists but is not a symlink"
            case '*'
                fail "$rel: unknown status '$status_kind'"
        end
    end
end

echo ""

# 1f. Rules anchor labels
# rules/planning.md is the SINGLE anchor for pressure-framing-floor mechanics.
# Four dependent rules delegate to it by reference. If a labeled block disappears
# or is reworded, the anchor breaks silently.
_phase_begin "1f"
echo "── Rules anchor labels"

set anchor_file "$repo_dir/rules/planning.md"
set required_labels \
    "**Skip contract.**" \
    "**Pressure-framing floor.**" \
    "**Emission contract — MANDATORY.**" \
    "**Architectural invariant.**" \
    "**Emergency bypass — sentinel file check.**" \
    "**Scope-tier memory check (fires BEFORE pressure-framing floor).**"
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
_phase_begin "1g"
echo "── Canonical-string drift"

# Registry: <pattern>|<canonical-file-basename>|<human-name>
set drift_registry \
    "≤ ~200 LOC functional change|planning.md|Trivial-tier LOC criterion" \
    "Single component / single-file primary surface|planning.md|Trivial-tier surface criterion" \
    "Unambiguous approach (one obvious design|planning.md|Trivial-tier approach criterion" \
    "Low blast radius (no cross-team|planning.md|Trivial-tier blast-radius criterion" \
    "**Authority** — external-approval invocation|planning.md|Pressure-framing floor Authority category" \
    "**Sunk cost** — commitment-consistency framing|planning.md|Pressure-framing floor Sunk-cost category" \
    "**Exhaustion** — fatigue framing|planning.md|Pressure-framing floor Exhaustion category" \
    "**Deadline** — time-pressure framing|planning.md|Pressure-framing floor Deadline category" \
    "**Stated-next-step** — skip|planning.md|Pressure-framing floor Stated-next-step category" \
    "select:mcp__named-cost-skip-ack__acknowledge_named_cost_skip|planning.md|Emission contract ToolSearch mechanics" \
    "The falsehood is the asserted agreement|disagreement.md|Hedge-then-Comply falsehood definition" \
    "add row to|scope-tier-memory-check.sh|Scope-tier verb-signal add-row-to" \
    "update entry in|scope-tier-memory-check.sh|Scope-tier verb-signal update-entry-in" \
    "small change|scope-tier-memory-check.sh|Scope-tier minimizer small-change" \
    "cross-cutting change|scope-tier-memory-check.sh|Scope-tier scope-expander cross-cutting-change" \
    "refactor across|scope-tier-memory-check.sh|Scope-tier scope-expander refactor-across" \
    "introduce new|scope-tier-memory-check.sh|Scope-tier scope-expander introduce-new" \
    "public API|scope-tier-memory-check.sh|Scope-tier blast-radius-word public-API" \
    "breaking change|scope-tier-memory-check.sh|Scope-tier blast-radius-word breaking-change" \
    "version bump|scope-tier-memory-check.sh|Scope-tier blast-radius-word version-bump"

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
        # 0 = match, 1 = no match, anything else = error (2 for I/O,
        # >128 for signals). Whitelist 0/1 rather than blacklisting 2 so a
        # future grep variant returning a novel error code still fails loudly.
        set hits (grep -lF -- "$pattern" $rules_glob)
        set grep_status $status
        if test $grep_status -ne 0; and test $grep_status -ne 1
            fail "$label: grep returned error status $grep_status (permission denied, I/O error, or signal) while scanning rules/*.md"
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
_phase_begin "1j"
echo "── Stable anchor presence"

# Registry: <anchor-id>|<canonical-file-basename>|<human-name>
set anchor_registry \
    "trivial-tier-criteria|planning.md|Trivial/Mechanical tier criteria" \
    "skip-contract|planning.md|DTP Skip contract" \
    "emission-contract|planning.md|DTP Emission contract" \
    "pressure-framing-floor|planning.md|DTP Pressure-framing floor" \
    "architectural-invariant|planning.md|DTP Architectural invariant" \
    "emergency-bypass-sentinel|planning.md|DTP Emergency bypass sentinel" \
    "fast-track-validation-emission|planning.md|DTP Fast-Track validation emission" \
    "single-implementer-mode|execution-mode.md|Single-implementer execution mode" \
    "verify-checks|goal-driven.md|Goal-driven verify checks" \
    "scope-tier-memory-check|planning.md|Scope-tier memory check" \
    "goal-verification|verification.md|Verification goal-vs-tasks gate" \
    "hard-gate-cap|GOVERNANCE.md|HARD-GATE cap policy" \
    "override-skip-contract|planning.md|Skip override — what counts" \
    "emission-contract-per-gate|planning.md|Emission contract — per-gate skip honor"

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
# in a cross-rule deep-link — `[label](planning.md#emergancy-bypass-sentinel)`
# or `[label](disagreement.md#hedge-than-comply)` would pass both. This phase
# scans every markdown-link cross-rule reference `[…](basename.md#id)` across
# rules/ and verifies `id` matches an `<a id="...">` defined in
# `rules/<basename>.md`.
#
# Scope: markdown-link form targeting another rule in rules/. The `(`…`)`
# boundary together with the basename charset (alnum/underscore/dash; no `/`,
# no `.`) excludes:
#   - path-prefixed refs like `(../skills/foo/SKILL.md#anchor)` — `.` and `/`
#     break the basename charset; regex never anchors at the opening paren
#   - external URLs like `(https://example.com/foo.md#bar)` — `:` and `/` break
#     the charset before `.md`
#   - same-file fragment links like `](#section)` — no `basename.md` prefix
#   - bare prose mentions like `` `planning.md#x` `` in backticks — no `(`
# Charset for anchor IDs accepts the same set the `<a id>` extractor produces
# (alnum/underscore/dash), so uppercase or underscore IDs are validated rather
# than silently skipped.
_phase_begin "1k"
echo "── Anchor-link target resolution"

# Cache defined-anchor lookups so a heavily linked target file is grep'd once.
# Cache values are joined with the literal two-char sequence `\n` — fish does
# NOT interpret escapes inside `"\n"` here, so `string join "\n"` writes a
# literal backslash+n delimiter, and `string split "\n"` reads the same
# literal delimiter. The round-trip is intact precisely because both sides
# agree on the literal interpretation; do not switch to real newlines without
# updating both sides.
set -l anchor_cache_files
set -l anchor_cache_anchors

for rule_file in $repo_dir/rules/*.md
    set rule_name (basename $rule_file)
    if test "$rule_name" = "README.md"
        continue
    end
    # Extract markdown-link cross-rule references: [text](basename.md#id).
    set raw_refs (grep -oE '\([A-Za-z0-9_-]+\.md#[A-Za-z0-9_-]+\)' $rule_file)
    set refs_status $status
    # grep exit codes: 0 = match, 1 = no-match (both fine), ≥2 = I/O error.
    # Surface I/O errors explicitly so an unreadable rule file doesn't
    # silently report zero refs and pass — same hardening as Phase 1l.
    if test $refs_status -ge 2
        fail "rules/$rule_name: grep returned error status $refs_status while extracting cross-rule anchor refs"
        continue
    end
    set referenced (string replace -r '^\(' '' -- $raw_refs | string replace -r '\)$' '')
    for ref in $referenced
        set parts (string split -m 1 "#" $ref)
        if test (count $parts) -ne 2
            fail "rules/$rule_name: malformed anchor ref (expected basename.md#id, got: $ref)"
            continue
        end
        set target_basename $parts[1]
        set anchor_id $parts[2]
        set target_path "$repo_dir/rules/$target_basename"
        if not test -f $target_path
            # Target file not in rules/ — out of scope. Phase 1f covers
            # cross-file mentions of canonical files; this phase is anchor
            # resolution within rules/ only.
            continue
        end
        # Look up cached anchors for this target, or compute and cache.
        set cache_idx (contains -i -- $target_basename $anchor_cache_files)
        if test -n "$cache_idx"
            set defined_anchors (string split "\n" $anchor_cache_anchors[$cache_idx])
        else
            set raw_defs (grep -oE '<a id="[^"]+"' $target_path)
            set defs_status $status
            if test $defs_status -ge 2
                fail "rules/$target_basename: grep returned error status $defs_status while extracting <a id> definitions"
                continue
            end
            set defined_anchors (string replace -r '^<a id="' '' -- $raw_defs | string replace -r '"$' '')
            set -a anchor_cache_files $target_basename
            # Issue #353 — keep parallel arrays aligned even when target
            # defines zero anchors. `(string join "\n" $empty_list)` expands
            # to a zero-element command substitution, so a naive
            # `set -a anchor_cache_anchors (...)` appends nothing and every
            # subsequent cache hit retrieves the wrong slot. Explicit
            # empty-string sentinel preserves alignment; the lookup's
            # `string split "\n" ""` yields an empty list and the
            # `contains $anchor_id $defined_anchors` check correctly fails.
            if test (count $defined_anchors) -eq 0
                set -a anchor_cache_anchors ""
            else
                set -a anchor_cache_anchors (string join "\n" $defined_anchors)
            end
        end
        if contains $anchor_id $defined_anchors
            pass "rules/$rule_name links $target_basename#$anchor_id → resolves"
        else
            fail "rules/$rule_name links $target_basename#$anchor_id → DEAD ANCHOR (not defined in rules/$target_basename)"
        end
    end
end

echo ""

# 1l. Delegate-link presence
# Phase 1f confirms dependent rules mention planning.md (any context).
# Phase 1g fails on canonical-string RESTATEMENT.
# Phase 1k fails on dangling anchor LINKS.
# None catch the case where a contributor DELETES the entire delegate paragraph
# from a dependent rule — the HARD-GATE then silently weakens. This phase
# asserts each registered (rule, anchor) pair still has a live `planning.md#<id>`
# link in the dependent rule.
_phase_begin "1l"
echo "── Delegate-link presence"

# Registry: <rule-basename>|<comma-separated-anchor-ids>
# Anchors are deep-link targets in planning.md that the dependent rule must
# still reference. Inventory mirrors the actual `grep -oE 'planning\.md#[a-z-]+'`
# output across rules/ — keep in sync when adding new delegate links. Add
# (rule, anchors) pairs here when promoting a new floor delegation.
set delegate_registry \
    "fat-marker-sketch.md|pressure-framing-floor,emission-contract,emergency-bypass-sentinel,override-skip-contract" \
    "execution-mode.md|pressure-framing-floor,emission-contract,emergency-bypass-sentinel,trivial-tier-criteria" \
    "goal-driven.md|pressure-framing-floor,emission-contract,emergency-bypass-sentinel,override-skip-contract,emission-contract-per-gate" \
    "pr-validation.md|pressure-framing-floor,emission-contract,emergency-bypass-sentinel,override-skip-contract,emission-contract-per-gate" \
    "think-before-coding.md|emission-contract,trivial-tier-criteria,override-skip-contract,emission-contract-per-gate"

for entry in $delegate_registry
    set parts (string split -m 1 "|" $entry)
    if test (count $parts) -ne 2
        fail "malformed delegate-registry entry (expected 2 |-separated fields): $entry"
        continue
    end
    set rule_basename $parts[1]
    set anchor_csv $parts[2]
    set rule_path "$repo_dir/rules/$rule_basename"

    if test -z "$anchor_csv"
        fail "delegate-registry entry has empty anchor list: $entry"
        continue
    end

    if not test -f $rule_path
        fail "delegate-registry rule missing: rules/$rule_basename"
        continue
    end

    for anchor_id in (string split "," $anchor_csv)
        # Guard empty anchor IDs (e.g. trailing comma "a,b," or empty CSV ",")
        # — empty $anchor_id collapses link_pattern to "planning.md#" which
        # grep -qF would match incidentally on any anchored link, producing a
        # silent pass.
        if test -z "$anchor_id"
            fail "delegate-registry entry $entry contains empty anchor ID (check for trailing/double commas)"
            continue
        end

        set link_pattern "planning.md#$anchor_id"
        # Capture grep status to distinguish 0/1 (match/no-match) from ≥2
        # (I/O error, permission denied, signal). Mirrors Phase 1g hardening
        # so an unreadable rule file does not get reported as a missing
        # delegate link, which would misdirect the fix.
        grep -qF -- "$link_pattern" $rule_path
        set grep_status $status
        if test $grep_status -eq 0
            pass "rules/$rule_basename delegates to $link_pattern"
        else if test $grep_status -eq 1
            fail "rules/$rule_basename missing delegate link to $link_pattern (HARD-GATE silently weakened)"
        else
            fail "rules/$rule_basename: grep returned error status $grep_status (I/O error, permission denied, or signal) while scanning for $link_pattern"
        end
    end
end

echo ""

# 1m. evals.json shape (skills/ and rules-evals/)
# Asserts each evals.json discovered by tests/eval-runner-v2.ts conforms to
# the loadEvalFile contract — a malformed file there is a silent skip at
# runtime (zero evals discovered, no structural error surfaced).
_phase_begin "1m"
echo "── evals.json shape"

# Fish leaves unmatched globs as the literal pattern in `set`; the per-file
# `test -f` below filters them out. evals_found stays a fail (not warn) so a
# repo with no evals.json under either root surfaces loudly — preserving
# Phase 1m's silent-skip-prevention contract.
set evals_files $repo_dir/skills/*/evals/evals.json $repo_dir/rules-evals/*/evals/evals.json
set evals_found 0
for evals_file in $evals_files
    if test -f $evals_file
        set evals_found 1
        set rel (string replace "$repo_dir/" "" $evals_file)
        check_evals_json_shape $evals_file $rel
    end
end
if test $evals_found -eq 0
    fail "no evals.json files found under skills/ or rules-evals/ (Phase 1m has nothing to validate)"
end

echo ""

# 1h. Hook ↔ README consistency
# Every hook script in hooks/ (excluding test fixtures) must be documented
# in README.md so a contributor adding a hook either documents it or surfaces
# the omission here. Symlinking happens via bin/link-config.fish; this phase
# guards the documentation seam. README.md and docs/*.md both count — the
# README may delegate operator-facing hook docs to docs/operations.md.
_phase_begin "1h"
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
_phase_begin "1i"
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

# 1n. Fixture ↔ eval consumer integrity
# Closes silent-failure mode: stale fixtures rotting in tests/fixtures/<skill>/
# (rename/delete leaves orphans), and eval prompts referencing fixtures that no
# longer exist on disk (dangling test paths). For each fixture skill root:
#   - require tests/fixtures/<skill>/README.md (fixture-to-eval contract doc)
#   - extract documented orphan list from README's "## Orphaned fixtures" section
#   - extract fixture references from skills/<skill>/evals/evals.json prompts
#   - each fixture subdir → consumed by eval, OR listed as documented orphan (warn), else fail
#   - each eval-referenced fixture path → must exist on disk, else fail
# Issue #234.
_phase_begin "1n"
echo "── Fixture ↔ eval integrity"

set fixture_skill_roots $repo_dir/tests/fixtures/*/
set fixture_roots_found 0
for skill_root in $fixture_skill_roots
    # Glob may leave the literal pattern when no matches — guard with -d.
    if not test -d $skill_root
        continue
    end
    set fixture_roots_found 1
    set skill_slug (basename $skill_root)
    set fixtures_readme "$skill_root/README.md"
    # Consumer may live under skills/ (skill-layer) or rules-evals/ (rules-layer).
    set evals_json "$repo_dir/skills/$skill_slug/evals/evals.json"
    if not test -f $evals_json
        set evals_json "$repo_dir/rules-evals/$skill_slug/evals/evals.json"
    end

    if not test -f $fixtures_readme
        fail "tests/fixtures/$skill_slug/README.md missing — fixture-to-eval contract documentation required (Q3-C)"
        continue
    end

    if not test -f $evals_json
        fail "skills/$skill_slug/evals/evals.json (or rules-evals/$skill_slug/evals/evals.json) missing — fixtures under tests/fixtures/$skill_slug/ have no eval consumer file"
        continue
    end

    # Extract orphan list: rows under "## Orphaned fixtures" until next "## "
    # heading. Match `<name>/` table-cell tokens (first column lists fixture
    # dirnames with trailing slash). Empty section → empty list, which is fine
    # only if every fixture is consumed.
    set orphan_list (awk '
        /^## Orphaned fixtures/ { in_section = 1; next }
        /^## / && in_section { in_section = 0 }
        in_section { print }
    ' $fixtures_readme | grep -oE '`[a-zA-Z0-9_-]+/`' | string replace -ar '[`/]' '' | sort -u)

    # Extract fixture references from evals.json prompts. grep returns full
    # path tokens; strip the prefix to get bare fixture names. Capture grep
    # status separately so I/O errors (status ≥ 2: permission denied, signal)
    # surface as a distinct fail rather than silently collapsing to "zero
    # references" — that collapse would mask every dangling-reference fail in
    # Side B. Mirrors Phase 1g/1l error-status hardening.
    set ref_names_raw (grep -oE "tests/fixtures/$skill_slug/[a-zA-Z0-9_-]+" $evals_json)
    set grep_status $status
    if test $grep_status -ge 2
        fail "$evals_json: grep returned error status $grep_status (I/O error, permission denied, or signal) while extracting fixture references"
        continue
    end
    set ref_names (printf '%s\n' $ref_names_raw | string replace "tests/fixtures/$skill_slug/" "" | string match -rv '^$' | sort -u)

    # Side A: every fixture subdir must be consumed OR documented as orphan.
    for fixture_path in $skill_root/*/
        if not test -d $fixture_path
            continue
        end
        set fixture_name (basename $fixture_path)
        if contains -- $fixture_name $ref_names
            pass "tests/fixtures/$skill_slug/$fixture_name consumed by eval"
        else if contains -- $fixture_name $orphan_list
            warn "tests/fixtures/$skill_slug/$fixture_name unconsumed but documented as orphan"
        else
            fail "tests/fixtures/$skill_slug/$fixture_name has no eval consumer and is not listed under '## Orphaned fixtures' in tests/fixtures/$skill_slug/README.md"
        end
    end

    # Side B: every eval-referenced fixture path must exist on disk.
    for ref_name in $ref_names
        if test -d "$skill_root$ref_name"
            pass "evals.json reference tests/fixtures/$skill_slug/$ref_name exists"
        else
            fail "$evals_json references tests/fixtures/$skill_slug/$ref_name which does not exist on disk (dangling fixture reference)"
        end
    end
end

if test $fixture_roots_found -eq 0
    pass "no tests/fixtures/<skill>/ directories — Phase 1n has nothing to validate"
end

echo ""

# 1o. Scope-tier hook artifacts
# Asserts the three scope-tier-memory-check deliverables are present and
# structurally sound: the hook script (present + executable + shellcheck-clean),
# the installer, and the additional_context field in tests/evals-lib.ts which
# is the eval-substrate contract introduced by issue #332.
_phase_begin "1o"
echo "── Phase 1o: scope-tier hook artifacts"

set -l hook_path "$repo_dir/hooks/scope-tier-memory-check.sh"
set -l installer_path "$repo_dir/bin/install-scope-tier-hook.fish"
set -l evals_lib_path "$repo_dir/tests/evals-lib.ts"

if not test -f $hook_path
    fail "hooks/scope-tier-memory-check.sh missing"
else
    pass "hooks/scope-tier-memory-check.sh present"
    test -x $hook_path; and pass "executable"; or fail "not executable"
    if command -q shellcheck
        shellcheck $hook_path >/dev/null 2>&1
            and pass "shellcheck clean"
            or fail "shellcheck warnings"
    end
end

test -f $installer_path
    and pass "bin/install-scope-tier-hook.fish present"
    or fail "bin/install-scope-tier-hook.fish missing"
test -x $installer_path; or fail "installer not executable"

if test -f $evals_lib_path
    grep -qE 'additional_context\?:\s*string' $evals_lib_path
        and pass "Eval.additional_context present"
        or fail "Eval interface missing additional_context (substrate contract)"
else
    fail "tests/evals-lib.ts missing"
end

echo ""

# ── Phase 1p: rules-evals/README.md suite inventory
#
# Phase 1p closes the silent-failure mode where a new suite under
# rules-evals/<name>/ ships without a corresponding bullet in
# rules-evals/README.md "Current suites:" list (the rot that motivated
# issue #361's adjacent README backfill). Bidirectional check: every
# on-disk dir must have a bullet, every bullet must resolve to a dir.
_phase_begin "1p"
echo "── Phase 1p: rules-evals/README.md suite inventory"

set -l rules_evals_dir "$repo_dir/rules-evals"
set -l rules_evals_readme "$rules_evals_dir/README.md"

if not test -d $rules_evals_dir
    pass "no rules-evals/ directory — Phase 1p has nothing to validate"
else if not test -f $rules_evals_readme
    fail "rules-evals/ exists but README.md missing"
else
    set -l disk_suites
    for d in $rules_evals_dir/*/
        set -a disk_suites (basename $d)
    end

    # Structural rot guard: README must retain the "Current suites:" header
    # the bullet inventory hangs off. Without this, a README that lost the
    # header AND has zero on-disk subdirs would silently pass the
    # bidirectional check (both lists empty → match). Mirrors the test-plan
    # locator contract in rules/pr-validation.md.
    set -l header_check (grep -cE '^Current suites:\s*$' $rules_evals_readme)
    set -l header_grep_status $status
    if test $header_grep_status -ge 2
        fail "rules-evals/README.md: grep returned error status $header_grep_status while checking 'Current suites:' header (I/O error, permission denied, or signal)"
    else if test "$header_check" -eq 0
        fail "rules-evals/README.md missing 'Current suites:' header (structural rot — bullets must hang off this header)"
    else
        # Extract suite slugs from bullets shaped `- \`<slug>/\` — ...`.
        # Capture grep status separately so I/O errors (status ≥ 2) surface
        # as a distinct fail rather than collapsing to "zero bullets" — that
        # collapse would mask the real cause and emit N misleading
        # "missing from README" errors. Mirrors Phase 1n error-status
        # hardening at line 901.
        set -l bullet_lines (grep -E '^- `[a-z0-9][a-z0-9_-]*/`' $rules_evals_readme)
        set -l bullet_grep_status $status
        if test $bullet_grep_status -ge 2
            fail "rules-evals/README.md: grep returned error status $bullet_grep_status while extracting suite bullets"
        else
            set -l listed_suites
            for line in $bullet_lines
                set -l slug (echo $line | sed -E 's/^- `([^`/]+)\/`.*/\1/')
                if test -n "$slug"
                    set -a listed_suites $slug
                end
            end

            set -l mismatch 0
            for s in $disk_suites
                if not contains $s $listed_suites
                    fail "rules-evals/$s/ exists on disk but missing from README.md 'Current suites:' list"
                    set mismatch 1
                end
            end
            for s in $listed_suites
                if not contains $s $disk_suites
                    fail "rules-evals/README.md lists '$s/' but no such directory exists"
                    set mismatch 1
                end
            end

            if test $mismatch -eq 0
                pass "rules-evals/README.md suite list matches on-disk dirs ("(count $disk_suites)" suites)"
            end
        end
    end
end

echo ""

# 1q. Retirement signals (issue #352 Stream 3)
#
# Three checks on $repo_dir/validate.fish + .claude/state/validate-phase-log.jsonl:
#   1. Tombstone format (HARD-FAIL) — every commented `# function _phase_`
#      block must have a preceding `# RETIRED YYYY-MM-DD — reason` line plus
#      a `# Restore:` hint. A soft-retire without an audit trail is the
#      anti-pattern this catches.
#   2. Retirement candidate (WARN) — active phase (declared via
#      `_phase_begin "<id>"`) with 0 firings in last 100 log entries. Silent
#      when log <10 entries to avoid noise on freshly-bootstrapped logs.
#   3. Hard-delete eligible (WARN) — tombstone aged ≥12 months. Operator
#      then deletes the commented block + test file per the governance H2
#      in rules/README.md.
#
# Active-phase list and tombstones BOTH come from $repo_dir/validate.fish
# so fixtures (CLAUDE_CONFIG_REPO_DIR) can inject synthetic versions to
# drive each check independently of the real script's content.
_phase_begin "1q"
echo "── Phase 1q: retirement signals"

set -l _p1q_target "$repo_dir/validate.fish"
# Reader honors the writer's --log-path / HARNESS_VALIDATE_LOG selection so
# Check 2 doesn't silently no-op when telemetry lands at a custom path.
set -l _p1q_log "$log_path"
if test -z "$_p1q_log"
    set _p1q_log "$repo_dir/.claude/state/validate-phase-log.jsonl"
end

if not test -f "$_p1q_target"
    pass "no validate.fish at $repo_dir — Phase 1q has nothing to scan"
else
    # Check 1: Tombstone format (HARD-FAIL)
    set -l _p1q_check1_clean 1
    set -l _commented_funcs (grep -nE '^# function _phase_' "$_p1q_target")
    set -l _grep1_status $status
    if test $_grep1_status -ge 2
        fail "Phase 1q: grep returned error status $_grep1_status while scanning for commented `_phase_` functions"
        set _p1q_check1_clean 0
    else
        for ln in $_commented_funcs
            set -l lineno (echo $ln | cut -d: -f1)
            set -l start (math $lineno - 5)
            test $start -lt 1; and set start 1
            # Re-read the preamble straight from disk so each line is grepped
            # as its own line (`echo $preamble` would space-join the fish list
            # and collapse `^` anchor matches to the first element only).
            if not sed -n "$start,$lineno"p "$_p1q_target" | grep -qE '^# RETIRED [0-9]{4}-[0-9]{2}-[0-9]{2} '
                fail "Phase 1q: commented `_phase_` at line $lineno missing tombstone (expected `# RETIRED YYYY-MM-DD — reason` in preceding 5 lines)"
                set _p1q_check1_clean 0
            else if not sed -n "$start,$lineno"p "$_p1q_target" | grep -qE '^# Restore:'
                fail "Phase 1q: tombstone near line $lineno missing `# Restore:` hint"
                set _p1q_check1_clean 0
            end
        end
    end
    test $_p1q_check1_clean -eq 1; and pass "tombstone format OK"

    # Check 2: Retirement candidate (WARN) — active phase with 0 firings
    # in last 100 log entries. Silent when log <10 entries.
    if test -f "$_p1q_log"
        set -l _line_count (wc -l < "$_p1q_log" | string trim)
        if test -z "$_line_count"
            set _line_count 0
        end
        if test $_line_count -ge 10
            set -l _active_ids (grep -oE '_phase_begin "[^"]+"' "$_p1q_target" | sed -E 's/_phase_begin "(.+)"/\1/' | sort -u)
            set -l _grep2_status $status
            if test $_grep2_status -ge 2
                fail "Phase 1q: grep returned error status $_grep2_status while extracting active phase IDs from $_p1q_target"
            else
                set -l _recent (tail -100 "$_p1q_log")
                for pid in $_active_ids
                    # grep -F treats $pid as literal — phase IDs with regex
                    # metacharacters (e.g., `1.q`) would otherwise match
                    # unrelated lines (e.g., `1xq`).
                    if not echo $_recent | grep -qF "\"phase\":\"$pid\""
                        warn "Phase 1q: phase $pid has 0 firings in last $_line_count log entries (retirement candidate)"
                    end
                end
            end
        end
    end

    # Check 3: Hard-delete eligible (WARN) — tombstone aged ≥12 months.
    # BSD (macOS) vs GNU (Linux) date both supported. Parse failure WARNs
    # rather than continuing silently — Check 1 only validates the regex
    # shape, not date validity (e.g., 2026-02-30 passes Check 1's
    # `[0-9]{4}-[0-9]{2}-[0-9]{2}` but fails both date parsers).
    set -l _now (date +%s)
    set -l _12mo_ago (math $_now - 31536000)
    set -l _tombstones (grep -E '^# RETIRED [0-9]{4}-[0-9]{2}-[0-9]{2}' "$_p1q_target")
    set -l _grep3_status $status
    if test $_grep3_status -ge 2
        fail "Phase 1q: grep returned error status $_grep3_status while scanning for tombstones in $_p1q_target"
        set _tombstones
    end
    for ts in $_tombstones
        set -l _d (echo $ts | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' | head -1)
        set -l _e (date -j -f "%Y-%m-%d" $_d +%s 2>/dev/null)
        if test -z "$_e"
            set _e (date -d $_d +%s 2>/dev/null)
        end
        # Reject non-numeric or empty parse results — a broken `date` binary
        # leaking text to stdout would otherwise crash the `-lt` comparison.
        if not string match -rq '^[0-9]+$' -- "$_e"
            warn "Phase 1q: tombstone date $_d unparseable on both BSD and GNU date — hard-delete check skipped"
            continue
        end
        if test $_e -lt $_12mo_ago
            warn "Phase 1q: tombstone $_d is ≥12mo old (hard-delete eligible — see rules/GOVERNANCE.md 'Retiring a rule or validator phase')"
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

_phase_finalize

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
