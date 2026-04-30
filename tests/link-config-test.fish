#!/usr/bin/env fish
# Round-trip regression test for bin/link-config.fish.
#
# Asserts that --install (against a fixture HOME) produces a layout that
# --check verifies as 0 errors / 0 missing — i.e. the install loop and
# check_symlink_layout/each_symlink_target agree by construction.
#
# Issue #201, deferred from PR #198 review (pr-test-analyzer Important #1).

set repo_dir (cd (dirname (status filename)); and cd ..; and pwd)
set script "$repo_dir/bin/link-config.fish"

if not test -f $script
    echo "FATAL: $script not found" >&2
    exit 2
end

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

# Each test gets a fresh fixture HOME; --install creates ~/.claude/ subdirs
# under it. The repo under test is the live one (script is location-derived).
# Logs land inside $home so they share fixture lifecycle (cleanup_fixture
# frees them) and avoid /tmp pid-collision risk under parallel CI.

echo "── Test A: --install on empty HOME succeeds, --check verifies clean"
set home (mktemp -d)
set install_log $home/install.log
set check_log $home/check.log
env HOME=$home fish $script --install >$install_log 2>&1
set install_rc $status
if test $install_rc -eq 0
    t_pass "--install exit 0"
else
    t_fail "--install exit $install_rc; log: "(cat $install_log)
end

env HOME=$home fish $script --check >$check_log 2>&1
set check_rc $status
if test $check_rc -eq 0
    t_pass "--check exit 0 after install"
else
    t_fail "--check exit $check_rc; log: "(cat $check_log)
end

set bad_lines 0
while read -l line
    if string match -qr '^(MISSING|STALE|ERROR)' -- $line
        set bad_lines (math $bad_lines + 1)
    end
end <$check_log
if test $bad_lines -eq 0
    t_pass "--check produced 0 MISSING/STALE/ERROR lines"
else
    t_fail "--check produced $bad_lines bad lines: "(cat $check_log)
end

echo ""
echo "── Test B: re-running --install is idempotent (linked=0)"
set reinstall_log $home/reinstall.log
env HOME=$home fish $script --install >$reinstall_log 2>&1
set reinstall_rc $status
if test $reinstall_rc -eq 0
    t_pass "second --install exit 0"
else
    t_fail "second --install exit $reinstall_rc; log: "(cat $reinstall_log)
end

set summary_line ""
while read -l line
    if string match -q 'Summary:*' -- $line
        set summary_line $line
    end
end <$reinstall_log
# Anchor to the literal `Summary: linked=0 ` prefix so a future format
# token like `relinked=0` cannot false-pass.
if string match -q 'Summary: linked=0 *' -- $summary_line
    t_pass "idempotent: linked=0 in summary ($summary_line)"
else
    t_fail "expected 'Summary: linked=0 …', got: $summary_line"
end
if string match -qr 'already-ok=[1-9]' -- $summary_line
    t_pass "already-ok > 0 in summary"
else
    t_fail "expected already-ok > 0, got: $summary_line"
end
cleanup_fixture $home

echo ""
echo "── Test C: --check exits non-zero when a symlink is broken"
set home (mktemp -d)
set broken_log $home/broken.log
env HOME=$home fish $script --install >/dev/null 2>&1
if test $status -ne 0
    t_fail "setup --install failed"
else
    # Break one symlink: re-point CLAUDE.md (always present) at a nonexistent target.
    set broken_dst $home/.claude/CLAUDE.md
    if test -L $broken_dst
        rm $broken_dst
        ln -s /tmp/nonexistent-link-target-(random) $broken_dst
        env HOME=$home fish $script --check >$broken_log 2>&1
        set broken_rc $status
        if test $broken_rc -ne 0
            t_pass "--check exit $broken_rc (non-zero) on broken symlink"
        else
            t_fail "--check should fail on broken symlink, got exit 0"
        end

        set found_stale 0
        while read -l line
            if string match -q 'STALE link:*CLAUDE.md*' -- $line
                set found_stale 1
            end
        end <$broken_log
        if test $found_stale -eq 1
            t_pass "STALE line emitted for broken CLAUDE.md"
        else
            t_fail "expected STALE line for CLAUDE.md, got: "(cat $broken_log)
        end
    else
        t_fail "setup: expected $broken_dst to be a symlink"
    end
end
cleanup_fixture $home

echo ""
echo "─────────────────────────────────────────────────"
echo "link-config round-trip: $test_pass passed, $test_fail failed"
if test $test_fail -gt 0
    exit 1
end
exit 0
