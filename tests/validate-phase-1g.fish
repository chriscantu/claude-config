#!/usr/bin/env fish
# Regression tests for validate.fish Phase 1g hardening (issue #177).
#
# Exercises three silent-failure modes that Phase 1g previously masked:
#   A) empty rules/ dir          — drift loop scanned nothing → silent pass
#   B) unreadable rule with drift — `grep -lF 2>/dev/null` swallowed exit 2
#   C) clean fixture              — sanity check the happy path still passes
#
# Tests use the CLAUDE_CONFIG_REPO_DIR env override to point validate.fish at
# fixture directories instead of the real repo.

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

# Build a minimal fixture repo. Phase 1g only needs rules/*.md, but the rest
# of validate.fish runs too. We point at our fixture's rules/ dir AND copy a
# planning.md that satisfies Phase 1f anchor requirements when needed.
function make_fixture
    set fixture (mktemp -d)
    mkdir -p $fixture/rules $fixture/skills $fixture/agents $fixture/commands $fixture/adrs
    echo $fixture
end

function cleanup_fixture
    set f $argv[1]
    if test -n "$f"; and string match -q "/tmp/*" $f; or string match -q "/var/folders/*" $f
        rm -rf $f
    end
end

# Run validate.fish against fixture, capture only Phase 1g output lines.
function run_phase_1g
    set fixture $argv[1]
    env CLAUDE_CONFIG_REPO_DIR=$fixture fish $validate 2>&1 | sed -n '/── Canonical-string drift/,/^$/p'
end

echo "── Test A: empty rules/ dir → Phase 1g must fail loudly"
set fixture (make_fixture)
set out (run_phase_1g $fixture)
if string match -q "*rules/ directory empty or missing*" -- "$out"
    t_pass "empty rules/ produces explicit fail"
else
    t_fail "empty rules/ did not produce expected fail message; got: $out"
end
cleanup_fixture $fixture

echo ""
echo "── Test B: unreadable rule file containing drift → grep status 2 surfaces"
set fixture (make_fixture)
# Seed a planning.md so the rules glob is non-empty; a sibling drift_file
# becomes unreadable to trigger grep exit 2.
echo "# canonical home" > $fixture/rules/planning.md
echo "≤ ~200 LOC functional change" > $fixture/rules/drift_file.md
chmod 000 $fixture/rules/drift_file.md
set out (run_phase_1g $fixture)
chmod 644 $fixture/rules/drift_file.md  # restore so cleanup works
if string match -q "*grep returned error status 2*" -- "$out"
    t_pass "unreadable file produces explicit fail (grep exit 2)"
else
    # On systems where root or the test runner can read 000 files, grep won't
    # error. Treat that as a skip rather than a failure.
    if test (id -u) -eq 0
        echo "  ⚠ skipping: running as root, chmod 000 does not block reads"
    else
        t_fail "unreadable file did not produce expected error; got: $out"
    end
end
cleanup_fixture $fixture

echo ""
echo "── Test C: clean fixture → Phase 1g passes"
set fixture (make_fixture)
echo "# canonical home with all four canonical strings" > $fixture/rules/planning.md
echo "≤ ~200 LOC functional change" >> $fixture/rules/planning.md
echo "Single component / single-file primary surface" >> $fixture/rules/planning.md
echo "Unambiguous approach (one obvious design" >> $fixture/rules/planning.md
echo "Low blast radius (no cross-team" >> $fixture/rules/planning.md
echo "# unrelated rule" > $fixture/rules/other.md
set out (run_phase_1g $fixture)
if string match -q "*no drift (canonical home rules/planning.md)*" -- "$out"
    and not string match -q "*rules/ directory empty*" -- "$out"
    and not string match -q "*drift:*" -- "$out"
    t_pass "clean fixture passes Phase 1g"
else
    t_fail "clean fixture did not pass cleanly; got: $out"
end
cleanup_fixture $fixture

echo ""
echo "── Test D: drift fixture → drift loop fires fail on non-canonical home"
set fixture (make_fixture)
echo "# canonical" > $fixture/rules/planning.md
echo "≤ ~200 LOC functional change" >> $fixture/rules/planning.md
echo "≤ ~200 LOC functional change" > $fixture/rules/drifted.md
set out (run_phase_1g $fixture)
if string match -q "*drift:*restated in rules/drifted.md*" -- "$out"
    t_pass "drift restatement detected"
else
    t_fail "drift restatement not detected; got: $out"
end
cleanup_fixture $fixture

echo ""
echo "─────────────────────────────────────────────────"
echo "Phase 1g regression: $test_pass passed, $test_fail failed"
if test $test_fail -gt 0
    exit 1
end
exit 0
