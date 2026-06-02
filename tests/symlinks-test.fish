#!/usr/bin/env fish
# Regression tests for bin/lib/symlinks.fish — see lib for function contracts.
# Tests use isolated fixture dirs under mktemp.

set repo_dir (cd (dirname (status filename)); and cd ..; and pwd)
set lib "$repo_dir/bin/lib/symlinks.fish"

if not test -f $lib
    echo "FATAL: $lib not found — extract bin/lib/symlinks.fish before running tests" >&2
    exit 2
end

source $lib

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

# Build a fixture "repo" with one entry in each managed location.
function make_repo_fixture
    set fixture (mktemp -d)
    mkdir -p $fixture/rules $fixture/agents $fixture/commands $fixture/skills/myskill $fixture/hooks $fixture/global
    echo "# rule" > $fixture/rules/foo.md
    echo "# rule README" > $fixture/rules/README.md
    echo "# agent" > $fixture/agents/bar.md
    echo "# command" > $fixture/commands/baz.md
    echo "# skill" > $fixture/skills/myskill/SKILL.md
    printf '#!/usr/bin/env bash\necho ok\n' > $fixture/hooks/real.sh
    printf '#!/usr/bin/env bash\necho fixture\n' > $fixture/hooks/test-fixture.sh
    chmod +x $fixture/hooks/*.sh
    echo "# claude" > $fixture/global/CLAUDE.md
    echo $fixture
end

function make_home_fixture
    set fixture (mktemp -d)
    echo $fixture
end

# Bounded-prefix cleanup — same pattern as tests/validate-phase-1g.fish.
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

# Symlink the full layout from repo into home (helper to avoid needing
# bin/link-config.fish for tests of the layout iterator + check function).
function install_layout
    set repo $argv[1]
    set home $argv[2]
    each_symlink_target $repo $home | while read -l entry
        set parts (string split -m 3 "|" $entry)
        set kind $parts[1]
        set src $parts[2]
        set dst $parts[3]
        mkdir -p (dirname $dst)
        if test "$kind" = dir
            ln -sfn $src $dst
        else
            ln -s $src $dst
        end
    end
end

echo "── Test A: each_symlink_target yields all expected entries"
set repo (make_repo_fixture)
set home (make_home_fixture)
set entries (each_symlink_target $repo $home)
# Expected entries:
#   rules/foo.md (README skipped), agents/bar.md, commands/baz.md,
#   skills/myskill (dir), hooks/real.sh (test-* skipped), CLAUDE.md
# Total = 6
set count (count $entries)
if test $count -eq 6
    t_pass "iterator yields 6 entries"
else
    t_fail "expected 6 entries, got $count: $entries"
end

# Spot-check kinds and labels
set kinds_ok 1
for entry in $entries
    set parts (string split -m 3 "|" $entry)
    set kind $parts[1]
    if not contains $kind file dir
        t_fail "unexpected kind: $kind in $entry"
        set kinds_ok 0
    end
end
if test $kinds_ok -eq 1
    t_pass "all entries have kind ∈ {file, dir}"
end

# Skill must be kind=dir
set found_skill_dir 0
for entry in $entries
    if string match -q "dir|*skills/myskill*" $entry
        set found_skill_dir 1
    end
end
if test $found_skill_dir -eq 1
    t_pass "skills/myskill yielded as kind=dir"
else
    t_fail "skills/myskill not yielded as dir: $entries"
end

# README.md must NOT appear
set readme_leaked 0
for entry in $entries
    if string match -q "*rules/README.md*" $entry
        set readme_leaked 1
    end
end
if test $readme_leaked -eq 0
    t_pass "rules/README.md correctly excluded"
else
    t_fail "rules/README.md leaked into iterator output"
end

# test-*.sh must NOT appear
set test_hook_leaked 0
for entry in $entries
    if string match -q "*hooks/test-fixture.sh*" $entry
        set test_hook_leaked 1
    end
end
if test $test_hook_leaked -eq 0
    t_pass "hooks/test-fixture.sh correctly excluded"
else
    t_fail "hooks/test-fixture.sh leaked into iterator output"
end
cleanup_fixture $repo
cleanup_fixture $home

echo ""
echo "── Test B: check_symlink_layout returns MISSING on empty home"
set repo (make_repo_fixture)
set home (make_home_fixture)
set results (check_symlink_layout $repo $home)
set missing_count 0
for r in $results
    if string match -q "MISSING|*" $r
        set missing_count (math $missing_count + 1)
    end
end
if test $missing_count -eq 6
    t_pass "all 6 entries report MISSING"
else
    t_fail "expected 6 MISSING, got $missing_count: $results"
end
cleanup_fixture $repo
cleanup_fixture $home

echo ""
echo "── Test C: check_symlink_layout returns OK after install"
set repo (make_repo_fixture)
set home (make_home_fixture)
install_layout $repo $home
set results (check_symlink_layout $repo $home)
set ok_count 0
for r in $results
    if string match -q "OK|*" $r
        set ok_count (math $ok_count + 1)
    end
end
if test $ok_count -eq 6
    t_pass "all 6 entries report OK"
else
    t_fail "expected 6 OK after install, got $ok_count: $results"
end
cleanup_fixture $repo
cleanup_fixture $home

echo ""
echo "── Test D: stale symlink reports STALE"
set repo (make_repo_fixture)
set home (make_home_fixture)
install_layout $repo $home
# Re-point one symlink at wrong target
rm $home/rules/foo.md
ln -s /tmp/nonexistent-target-(random) $home/rules/foo.md
set results (check_symlink_layout $repo $home)
set found_stale 0
for r in $results
    if string match -q "STALE|*foo.md*" $r
        set found_stale 1
    end
end
if test $found_stale -eq 1
    t_pass "stale symlink reported"
else
    t_fail "stale symlink not detected: $results"
end
cleanup_fixture $repo
cleanup_fixture $home

echo ""
echo "── Test E: real file at dst reports NOT_SYMLINK"
set repo (make_repo_fixture)
set home (make_home_fixture)
mkdir -p $home/rules
echo "real file" > $home/rules/foo.md
set results (check_symlink_layout $repo $home)
set found_realfile 0
for r in $results
    if string match -q "NOT_SYMLINK|*foo.md*" $r
        set found_realfile 1
    end
end
if test $found_realfile -eq 1
    t_pass "real file at dst reported as NOT_SYMLINK"
else
    t_fail "real file not detected: $results"
end
cleanup_fixture $repo
cleanup_fixture $home

echo ""
echo "── Test F: each_orphan_symlink finds dst whose target is in repo but not in layout"
set repo (make_repo_fixture)
set home (make_home_fixture)
install_layout $repo $home
# Plant an orphan: symlink rules/retired.md → repo/rules/foo.md (a real file
# in the fixture). dst path is not yielded by each_symlink_target → orphan.
mkdir -p $home/rules
ln -s $repo/rules/foo.md $home/rules/retired.md
set orphans (each_orphan_symlink $repo $home)
set found_orphan 0
for o in $orphans
    if string match -q "ORPHAN|$home/rules/retired.md|*" $o
        set found_orphan 1
    end
end
if test $found_orphan -eq 1
    t_pass "orphan symlink reported"
else
    t_fail "orphan symlink not detected: $orphans"
end
cleanup_fixture $repo
cleanup_fixture $home

echo ""
echo "── Test G: each_orphan_symlink ignores symlinks pointing outside repo"
set repo (make_repo_fixture)
set home (make_home_fixture)
install_layout $repo $home
# Foreign symlink — points outside $repo. Must NOT be flagged. Simulates a
# user's other plugin living next to us under ~/.claude/rules/.
set foreign (mktemp)
echo "# foreign rule" > $foreign
mkdir -p $home/rules
ln -s $foreign $home/rules/from-other-plugin.md
set orphans (each_orphan_symlink $repo $home)
set leaked_foreign 0
for o in $orphans
    if string match -q "*from-other-plugin.md*" $o
        set leaked_foreign 1
    end
end
if test $leaked_foreign -eq 0
    t_pass "foreign symlink correctly ignored (repo-prefix guard)"
else
    t_fail "foreign symlink flagged: $orphans"
end
rm -f $foreign
cleanup_fixture $repo
cleanup_fixture $home

echo ""
echo "── Test H: each_orphan_symlink ignores real files at managed dst"
set repo (make_repo_fixture)
set home (make_home_fixture)
install_layout $repo $home
# A real file (not a symlink) at a managed namespace dir. Must be ignored by
# the orphan walker — handled by NOT_SYMLINK in check_symlink_layout.
mkdir -p $home/rules
echo "real" > $home/rules/notalink.md
set orphans (each_orphan_symlink $repo $home)
set leaked_realfile 0
for o in $orphans
    if string match -q "*notalink.md*" $o
        set leaked_realfile 1
    end
end
if test $leaked_realfile -eq 0
    t_pass "real file at managed dst correctly ignored"
else
    t_fail "real file flagged as orphan: $orphans"
end
cleanup_fixture $repo
cleanup_fixture $home

echo ""
echo "─────────────────────────────────────────────────"
echo "Symlinks lib regression: $test_pass passed, $test_fail failed"
if test $test_fail -gt 0
    exit 1
end
exit 0
