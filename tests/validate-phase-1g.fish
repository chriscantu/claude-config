#!/usr/bin/env fish
# Regression tests for validate.fish Phase 1g hardening.
#
# Exercises silent-failure modes that Phase 1g previously masked:
#   A) empty rules/ dir          — drift loop scanned nothing → silent pass
#   B) unreadable rule with drift — `grep -lF 2>/dev/null` swallowed exit 2
#   C) clean fixture              — sanity check the happy path still passes
#   D) drift restatement          — drift detection still fires on regressions
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

# Build a minimal fixture repo. Phase 1g only needs rules/*.md; the other
# directories satisfy other validate.fish phases that run alongside it.
function make_fixture
    set fixture (mktemp -d)
    mkdir -p $fixture/rules $fixture/skills $fixture/agents $fixture/commands $fixture/adrs
    echo $fixture
end

# Restore permissions on any chmod-locked fixture files BEFORE rm -rf, so a
# test that sets `chmod 000` and aborts mid-run does not leak an undeletable
# tempdir. Bounded to /tmp/* and /var/folders/* (mktemp prefixes) — guard the
# OR branch with `begin; ...; or ...; end` so fish's left-to-right and/or
# parsing produces the intended `(non-empty) AND (tmp OR var/folders)`.
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

# Run validate.fish against fixture, capture only Phase 1g output lines.
# If the Phase 1g header is missing (renamed/removed), sed returns empty —
# emit a sentinel marker so callers can fail loudly rather than chasing
# every assertion-mismatch as a generic "did not produce expected" error.
function run_phase_1g
    set fixture $argv[1]
    set captured (env CLAUDE_CONFIG_REPO_DIR=$fixture fish $validate 2>&1 | sed -n '/── Canonical-string drift/,/^$/p')
    if test -z "$captured"
        echo "PHASE_1G_HEADER_MISSING"
    else
        printf '%s\n' $captured
    end
end

function assert_phase_1g_present
    set out $argv[1]
    set test_name $argv[2]
    if string match -q "*PHASE_1G_HEADER_MISSING*" -- "$out"
        t_fail "$test_name: Phase 1g header not found in validate.fish output — phase may have been renamed/removed"
        return 1
    end
    return 0
end

echo "── Test A: empty rules/ dir → Phase 1g must fail loudly"
set fixture (make_fixture)
set out (run_phase_1g $fixture)
if assert_phase_1g_present "$out" "Test A"
    if string match -q "*rules/ directory empty or missing*" -- "$out"
        t_pass "empty rules/ produces explicit fail"
    else
        t_fail "empty rules/ did not produce expected fail message; got: $out"
    end
end
cleanup_fixture $fixture

echo ""
echo "── Test B: unreadable rule file containing drift → grep error status surfaces"
set fixture (make_fixture)
# Seed a planning.md so the rules glob is non-empty; a sibling drift_file
# becomes unreadable to trigger grep's error exit.
echo "# canonical home" > $fixture/rules/planning.md
echo "≤ ~200 LOC functional change" > $fixture/rules/drift_file.md
chmod 000 $fixture/rules/drift_file.md
set out (run_phase_1g $fixture)
# chmod restore moved into cleanup_fixture (chmod -R u+rw) so an early-abort
# between this point and the assertion still cleans up safely.
if assert_phase_1g_present "$out" "Test B"
    if string match -q "*grep returned error status*" -- "$out"
        t_pass "unreadable file produces explicit fail (grep error status)"
    else
        # On systems where root or the test runner can read 000 files, grep won't
        # error. Treat that as a skip rather than a failure.
        if test (id -u) -eq 0
            echo "  ⚠ skipping: running as root, chmod 000 does not block reads"
        else
            t_fail "unreadable file did not produce expected error; got: $out"
        end
    end
end
cleanup_fixture $fixture

echo ""
echo "── Test C: clean fixture → Phase 1g passes for all four registry entries"
set fixture (make_fixture)
echo "# canonical home with all four canonical strings" > $fixture/rules/planning.md
echo "≤ ~200 LOC functional change" >> $fixture/rules/planning.md
echo "Single component / single-file primary surface" >> $fixture/rules/planning.md
echo "Unambiguous approach (one obvious design" >> $fixture/rules/planning.md
echo "Low blast radius (no cross-team" >> $fixture/rules/planning.md
echo "# unrelated rule" > $fixture/rules/other.md
set out (run_phase_1g $fixture)
if assert_phase_1g_present "$out" "Test C"
    # Single-condition `if` with `;` chaining — multi-line `and`-after-if-body
    # would parse as discarded statements inside the then-branch, not as
    # condition extension. Assert all four canonical labels appear AND no
    # drift was reported AND the empty-rules guard did not fire.
    if string match -q "*Trivial-tier LOC criterion: no drift*" -- "$out"; and string match -q "*Trivial-tier surface criterion: no drift*" -- "$out"; and string match -q "*Trivial-tier approach criterion: no drift*" -- "$out"; and string match -q "*Trivial-tier blast-radius criterion: no drift*" -- "$out"; and not string match -q "*rules/ directory empty*" -- "$out"; and not string match -q "*drift:*" -- "$out"
        t_pass "clean fixture passes Phase 1g (all four labels present, no drift, no empty-rules fail)"
    else
        t_fail "clean fixture did not pass cleanly; got: $out"
    end
end
cleanup_fixture $fixture

echo ""
echo "── Test D: drift fixture → drift loop fires fail on non-canonical home"
set fixture (make_fixture)
echo "# canonical" > $fixture/rules/planning.md
echo "≤ ~200 LOC functional change" >> $fixture/rules/planning.md
echo "≤ ~200 LOC functional change" > $fixture/rules/drifted.md
set out (run_phase_1g $fixture)
if assert_phase_1g_present "$out" "Test D"
    if string match -q "*drift:*restated in rules/drifted.md*" -- "$out"
        t_pass "drift restatement detected"
    else
        t_fail "drift restatement not detected; got: $out"
    end
end
cleanup_fixture $fixture

echo ""
echo "── Test E: CLAUDE_CONFIG_REPO_DIR pointing at non-existent dir → exit 1"
set bad_dir /tmp/claude-config-nonexistent-(random)
env CLAUDE_CONFIG_REPO_DIR=$bad_dir fish $validate >/dev/null 2>&1
set rc $status
if test $rc -eq 1
    t_pass "non-existent CLAUDE_CONFIG_REPO_DIR produces exit 1"
else
    t_fail "expected exit 1 for non-existent dir, got: $rc"
end

echo ""
echo "─────────────────────────────────────────────────"
echo "Phase 1g regression: $test_pass passed, $test_fail failed"
if test $test_fail -gt 0
    exit 1
end
exit 0
