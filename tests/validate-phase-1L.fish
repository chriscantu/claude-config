#!/usr/bin/env fish
# Regression tests for validate.fish Phase 1L (Delegate-link presence).
#
# Phase 1L asserts each rule that delegates to a planning.md anchor still
# contains the `planning.md#<id>` link. The HARD-GATE silently weakens if a
# contributor deletes the entire delegate paragraph from a dependent rule —
# Phase 1g (drift) only fires on RESTATEMENT, Phase 1k only fires on DANGLING
# anchor LINKS, neither catches DELETION.
#
# Tests:
#   A) Clean fixture mirroring real registry → Phase 1L passes
#   B) Deleted delegate link in dependent rule → Phase 1L fails loudly
#   C) Missing dependent rule file → Phase 1L fails loudly

set repo_dir (cd (dirname (status filename)); and cd ..; and pwd)
set validate "$repo_dir/validate.fish"

set test_pass 0
set test_fail 0

function t_pass
    set -g test_pass (math $test_pass + 1)
    echo "  ✓ $argv"
end

function t_fail
    set -g test_fail (math $test_fail + 1)
    echo "  ✗ $argv"
end

# Build a minimal fixture repo with rules/ populated to satisfy Phase 1L's
# delegate registry. Other validate.fish phases run alongside but their
# pass/fail does not affect the Phase 1L slice we capture.
function make_fixture
    set fixture (mktemp -d)
    mkdir -p $fixture/rules $fixture/skills $fixture/agents $fixture/commands $fixture/adrs
    echo $fixture
end

function cleanup_fixture
    set f $argv[1]
    if test -n "$f"; and begin
            string match -q "/tmp/*" $f
            or string match -q "/var/folders/*" $f
        end
        if test -d $f
            rm -rf $f
        end
    end
end

# Seed planning.md with both anchors that the registry expects to delegate to.
function seed_planning
    set fixture $argv[1]
    echo '<a id="pressure-framing-floor"></a>' > $fixture/rules/planning.md
    echo '<a id="emission-contract"></a>' >> $fixture/rules/planning.md
end

# Seed a dependent rule with both delegate links.
function seed_full_dependent
    set fixture $argv[1]
    set name $argv[2]
    echo "Floor delegated via planning.md#pressure-framing-floor and planning.md#emission-contract." > $fixture/rules/$name
end

# Seed a dependent rule missing the pressure-framing-floor link (deletion case).
function seed_partial_dependent
    set fixture $argv[1]
    set name $argv[2]
    echo "Only emission contract: planning.md#emission-contract" > $fixture/rules/$name
end

# Capture only the Phase 1L slice. Sentinel marker if header missing.
function run_phase_1L
    set fixture $argv[1]
    set captured (env CLAUDE_CONFIG_REPO_DIR=$fixture fish $validate 2>&1 | sed -n '/── Delegate-link presence/,/^$/p')
    if test -z "$captured"
        echo "PHASE_1L_HEADER_MISSING"
    else
        printf '%s\n' $captured
    end
end

function assert_phase_1L_present
    set out $argv[1]
    set test_name $argv[2]
    if string match -q "*PHASE_1L_HEADER_MISSING*" -- "$out"
        t_fail "$test_name: Phase 1L header not found in validate.fish output — phase may have been renamed/removed"
        return 1
    end
    return 0
end

echo "── Test A: clean fixture with all delegate links → Phase 1L passes"
set fixture (make_fixture)
seed_planning $fixture
seed_full_dependent $fixture fat-marker-sketch.md
seed_full_dependent $fixture execution-mode.md
seed_full_dependent $fixture goal-driven.md
seed_full_dependent $fixture pr-validation.md
echo "Only emission contract: planning.md#emission-contract" > $fixture/rules/think-before-coding.md
set out (run_phase_1L $fixture)
if assert_phase_1L_present "$out" "Test A"
    if not string match -q "*missing delegate link*" -- "$out"
        t_pass "clean fixture: no missing-delegate-link failures"
    else
        t_fail "clean fixture unexpectedly produced missing-delegate-link failures; got: $out"
    end
end
cleanup_fixture $fixture

echo ""
echo "── Test B: dependent rule with deleted delegate link → Phase 1L fails loudly"
set fixture (make_fixture)
seed_planning $fixture
# fat-marker-sketch is registered for BOTH anchors; seed only emission-contract
# to simulate a contributor deleting the pressure-framing-floor delegate paragraph.
seed_partial_dependent $fixture fat-marker-sketch.md
seed_full_dependent $fixture execution-mode.md
seed_full_dependent $fixture goal-driven.md
seed_full_dependent $fixture pr-validation.md
echo "Only emission contract: planning.md#emission-contract" > $fixture/rules/think-before-coding.md
set out (run_phase_1L $fixture)
if assert_phase_1L_present "$out" "Test B"
    if string match -q "*rules/fat-marker-sketch.md missing delegate link to planning.md#pressure-framing-floor*" -- "$out"
        t_pass "deleted delegate link surfaces explicit fail"
    else
        t_fail "deleted delegate link not detected; got: $out"
    end
end
cleanup_fixture $fixture

echo ""
echo "── Test C: missing dependent rule file → Phase 1L fails loudly"
set fixture (make_fixture)
seed_planning $fixture
# Seed every dependent EXCEPT fat-marker-sketch.md to trigger the missing-file branch.
seed_full_dependent $fixture execution-mode.md
seed_full_dependent $fixture goal-driven.md
seed_full_dependent $fixture pr-validation.md
echo "Only emission contract: planning.md#emission-contract" > $fixture/rules/think-before-coding.md
set out (run_phase_1L $fixture)
if assert_phase_1L_present "$out" "Test C"
    if string match -q "*delegate-registry rule missing: rules/fat-marker-sketch.md*" -- "$out"
        t_pass "missing dependent rule surfaces explicit fail"
    else
        t_fail "missing dependent rule not detected; got: $out"
    end
end
cleanup_fixture $fixture

echo ""
echo "─────────────────────────────────────────────────"
echo "Phase 1L regression: $test_pass passed, $test_fail failed"
if test $test_fail -gt 0
    exit 1
end
exit 0
