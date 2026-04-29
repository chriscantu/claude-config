#!/usr/bin/env fish
# Regression tests for validate.fish Phase 1l (Delegate-link presence).
#
# Phase 1l asserts each rule that delegates to a planning.md anchor still
# contains the `planning.md#<id>` link. The HARD-GATE silently weakens if a
# contributor deletes the entire delegate paragraph from a dependent rule —
# Phase 1g (drift) only fires on RESTATEMENT, Phase 1k (anchor-link target
# resolution) only fires on DANGLING anchor LINKS, neither catches DELETION.
#
# Tests:
#   A) Clean fixture mirroring real registry → Phase 1l passes
#   B) Deleted delegate link in multi-anchor rule → Phase 1l fails AND
#      surviving anchors in same rule still pass (no first-fail masking)
#   C) Missing dependent rule file → Phase 1l fails loudly
#   D) Empty anchor ID in CSV (trailing comma) → Phase 1l fails
#      (no silent grep-pattern collapse to bare "planning.md#")
#   E) Unreadable rule file → grep I/O error surfaces distinctly
#      (mirrors Phase 1g hardening; not misdirected to "missing link")

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

# Build a minimal fixture repo. Phase 1l only needs rules/*.md; sibling dirs
# satisfy other validate.fish phases that run alongside but do not affect
# the Phase 1l output slice we capture.
function make_fixture
    set fixture (mktemp -d)
    mkdir -p $fixture/rules $fixture/skills $fixture/agents $fixture/commands $fixture/adrs
    echo $fixture
end

# Restore permissions on chmod-locked fixture files BEFORE rm -rf so a test
# that aborts mid-run (e.g. Test E with chmod 000) does not leak an
# undeletable tempdir. Bounded to mktemp prefixes.
function cleanup_fixture
    set f $argv[1]
    if test -n "$f"; and begin
            string match -q "/tmp/*" $f
            or string match -q "/var/folders/*" $f
        end
        if test -d $f
            chmod -R u+rw $f 2>/dev/null
            rm -rf $f
        end
    end
end

# Seed every dependent rule registered in Phase 1l with all its registered
# anchor links. Anchor list mirrors the canonical registry in validate.fish.
function seed_full_registry
    set fixture $argv[1]
    echo "# planning sentinel (Phase 1l does not read this; sibling phases may)" > $fixture/rules/planning.md
    echo "Floor: planning.md#pressure-framing-floor planning.md#emission-contract planning.md#emergency-bypass-sentinel" > $fixture/rules/fat-marker-sketch.md
    echo "Floor: planning.md#pressure-framing-floor planning.md#emission-contract planning.md#emergency-bypass-sentinel planning.md#trivial-tier-criteria" > $fixture/rules/execution-mode.md
    echo "Floor: planning.md#pressure-framing-floor planning.md#emission-contract planning.md#emergency-bypass-sentinel" > $fixture/rules/goal-driven.md
    echo "Floor: planning.md#pressure-framing-floor planning.md#emission-contract planning.md#emergency-bypass-sentinel" > $fixture/rules/pr-validation.md
    echo "Floor: planning.md#emission-contract planning.md#trivial-tier-criteria" > $fixture/rules/think-before-coding.md
end

# Capture only the Phase 1l output slice. Sentinel marker if header missing.
function run_phase_1l
    set fixture $argv[1]
    set captured (env CLAUDE_CONFIG_REPO_DIR=$fixture fish $validate 2>&1 | sed -n '/── Delegate-link presence/,/^$/p')
    if test -z "$captured"
        echo "PHASE_1L_HEADER_MISSING"
    else
        printf '%s\n' $captured
    end
end

function assert_phase_1l_present
    set out $argv[1]
    set test_name $argv[2]
    if string match -q "*PHASE_1L_HEADER_MISSING*" -- "$out"
        t_fail "$test_name: Phase 1l header not found in validate.fish output — phase may have been renamed/removed"
        return 1
    end
    return 0
end

echo "── Test A: clean fixture with all delegate links → Phase 1l passes"
set fixture (make_fixture)
seed_full_registry $fixture
set out (run_phase_1l $fixture)
if assert_phase_1l_present "$out" "Test A"
    if not string match -q "*missing delegate link*" -- "$out"; and not string match -q "*grep returned error status*" -- "$out"
        t_pass "clean fixture: no missing-delegate-link or grep-error failures"
    else
        t_fail "clean fixture unexpectedly produced failures; got: $out"
    end
end
cleanup_fixture $fixture

echo ""
echo "── Test B: deleted link in multi-anchor rule → fail surfaces AND surviving anchors still pass"
set fixture (make_fixture)
seed_full_registry $fixture
# fat-marker-sketch is registered for 3 anchors; drop pressure-framing-floor
# but keep the other two. Asserts the inner loop does NOT break on first
# fail — the surviving pass lines must still appear, so a regression that
# short-circuits the loop after one fail would be caught.
echo "Only: planning.md#emission-contract planning.md#emergency-bypass-sentinel" > $fixture/rules/fat-marker-sketch.md
set out (run_phase_1l $fixture)
if assert_phase_1l_present "$out" "Test B"
    if string match -q "*rules/fat-marker-sketch.md missing delegate link to planning.md#pressure-framing-floor*" -- "$out"; and string match -q "*rules/fat-marker-sketch.md delegates to planning.md#emission-contract*" -- "$out"; and string match -q "*rules/fat-marker-sketch.md delegates to planning.md#emergency-bypass-sentinel*" -- "$out"
        t_pass "deleted link surfaces fail; surviving anchors still pass (no break-on-first-fail regression)"
    else
        t_fail "deleted-link / surviving-anchor assertions did not all match; got: $out"
    end
end
cleanup_fixture $fixture

echo ""
echo "── Test C: missing dependent rule file → Phase 1l fails loudly"
set fixture (make_fixture)
seed_full_registry $fixture
rm $fixture/rules/fat-marker-sketch.md
set out (run_phase_1l $fixture)
if assert_phase_1l_present "$out" "Test C"
    if string match -q "*delegate-registry rule missing: rules/fat-marker-sketch.md*" -- "$out"
        t_pass "missing dependent rule surfaces explicit fail"
    else
        t_fail "missing dependent rule not detected; got: $out"
    end
end
cleanup_fixture $fixture

echo ""
echo "── Test D: empty anchor ID in CSV (trailing comma) → Phase 1l fails"
# Phase 1l's empty-anchor guard prevents `planning.md#` (no anchor) from
# matching incidentally on any anchored link. The registry is hard-coded in
# validate.fish, so simulate the bad-input case via a temp validator copy
# whose registry has been surgically edited to inject a trailing comma.
set fixture (make_fixture)
seed_full_registry $fixture
set tmp_validate (mktemp).fish
# Use # as sed delimiter to avoid clashing with literal | inside the entry.
sed 's#"think-before-coding.md|emission-contract,trivial-tier-criteria"#"think-before-coding.md|emission-contract,"#' $validate > $tmp_validate
set out (env CLAUDE_CONFIG_REPO_DIR=$fixture fish $tmp_validate 2>&1 | sed -n '/── Delegate-link presence/,/^$/p')
rm -f $tmp_validate
if string match -q "*empty anchor ID*" -- "$out"
    t_pass "trailing-comma anchor surfaces explicit fail (no silent grep-pattern collapse)"
else
    t_fail "empty-anchor guard did not fire; got: $out"
end
cleanup_fixture $fixture

echo ""
echo "── Test E: unreadable rule file → grep I/O error surfaces distinctly"
set fixture (make_fixture)
seed_full_registry $fixture
chmod 000 $fixture/rules/fat-marker-sketch.md
set out (run_phase_1l $fixture)
if assert_phase_1l_present "$out" "Test E"
    if string match -q "*grep returned error status*" -- "$out"
        t_pass "unreadable file produces grep-error fail (not misdirected to 'missing link')"
    else
        if test (id -u) -eq 0
            echo "  ⚠ skipping: running as root, chmod 000 does not block reads"
        else
            t_fail "unreadable file did not produce grep-error; got: $out"
        end
    end
end
cleanup_fixture $fixture

echo ""
echo "─────────────────────────────────────────────────"
echo "Phase 1l regression: $test_pass passed, $test_fail failed"
if test $test_fail -gt 0
    exit 1
end
exit 0
