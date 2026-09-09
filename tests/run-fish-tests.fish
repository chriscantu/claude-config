#!/usr/bin/env fish
# Runs every fish-shell regression test file under tests/ and aggregates
# results. Failure of any file fails the run.
#
# Conventions (see tests/README.md):
#   - tests/*-test.fish           — fish regression suites (e.g. symlinks-test.fish)
#   - tests/validate-phase-*.fish — validate.fish phase regression suites
#   - tests/hooks/*.test.sh       — bash hook suites (run via `bash`)
#
# A new test file dropped in matching any pattern is picked up automatically —
# no edit to this driver or to CI required. The hook suites are bash, not fish,
# but were previously discovered by NO runner (they ran only when a human typed
# them); folding them in here is the single CI entry point for all regressions.

set repo_dir (cd (dirname (status filename)); and cd ..; and pwd)
set tests_dir "$repo_dir/tests"

set test_files
for f in $tests_dir/*-test.fish $tests_dir/validate-phase-*.fish
    if test -f $f
        set test_files $test_files $f
    end
end

set hook_test_files
for f in $tests_dir/hooks/*.test.sh
    if test -f $f
        set hook_test_files $hook_test_files $f
    end
end

if test (count $test_files) -eq 0; and test (count $hook_test_files) -eq 0
    echo "No test files found under $tests_dir/"
    exit 1
end

set failed 0
set ran 0

for f in $test_files
    set rel (string replace "$repo_dir/" "" "$f")
    echo "═════════════════════════════════════════════════"
    echo "Running: $rel"
    echo "═════════════════════════════════════════════════"
    fish $f
    set rc $status
    set ran (math $ran + 1)
    if test $rc -ne 0
        set failed (math $failed + 1)
        echo "FAILED: $rel (exit $rc)"
    end
    echo ""
end

# Hook suites are bash, not fish — run them through `bash`, same aggregation.
for f in $hook_test_files
    set rel (string replace "$repo_dir/" "" "$f")
    echo "═════════════════════════════════════════════════"
    echo "Running: $rel"
    echo "═════════════════════════════════════════════════"
    bash $f
    set rc $status
    set ran (math $ran + 1)
    if test $rc -ne 0
        set failed (math $failed + 1)
        echo "FAILED: $rel (exit $rc)"
    end
    echo ""
end

echo "─────────────────────────────────────────────────"
echo "Test driver: $ran files run, $failed failed"
if test $failed -gt 0
    exit 1
end
exit 0
