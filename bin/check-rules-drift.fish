#!/usr/bin/env fish
# Detect drift in canonical rule strings across rules/.
#
# Some rule values (e.g. Trivial/Mechanical tier criteria) are defined
# canonically in one file (`rules/planning.md`) and referenced — but not
# restated — by other rules. "Do not restate" markers in those files are
# editor hints, not enforcement; nothing prevents a future edit from
# silently restating the criteria in a second file and drifting later.
#
# This script is the enforcement: greps for canonical strings outside
# their canonical home and exits non-zero if found.
#
# Usage:
#   ./bin/check-rules-drift.fish          # report and exit non-zero on drift
#
# Add to CI alongside `link-config.fish --check`.

set -l repo (cd (dirname (status --current-filename))/..; and pwd)
set -l rules $repo/rules

set -l errors 0

# Canonical-home registry: <pattern>|<canonical-file-basename>|<human-name>
# Pattern is a fixed string passed to grep -F. Canonical file is the ONLY
# rules/ file allowed to contain the pattern. Match the README check for
# the canonical pattern wording exactly — drift in the pattern itself is
# also drift.
set -l registry \
    "≤ ~200 LOC functional change|planning.md|Trivial-tier LOC criterion" \
    "Single component / single-file primary surface|planning.md|Trivial-tier surface criterion" \
    "Unambiguous approach (one obvious design|planning.md|Trivial-tier approach criterion" \
    "Low blast radius (no cross-team|planning.md|Trivial-tier blast-radius criterion"

for entry in $registry
    set -l pattern (string split -m 2 "|" $entry)[1]
    set -l canonical (string split -m 2 "|" $entry)[2]
    set -l label (string split -m 2 "|" $entry)[3]

    set -l hits (grep -lF -- "$pattern" $rules/*.md 2>/dev/null)

    for hit in $hits
        set -l basename (basename $hit)
        if test "$basename" != "$canonical"
            echo "DRIFT: '$label' restated in rules/$basename — canonical home is rules/$canonical"
            set errors (math $errors + 1)
        end
    end
end

if test $errors -eq 0
    echo "OK: no drift across "(count $registry)" canonical strings"
    exit 0
else
    echo ""
    echo "Found $errors drift instance(s). Either:"
    echo "  - Remove the restated string and replace with a reference to the canonical file, or"
    echo "  - Update this script's registry if the canonical home itself is changing."
    exit 1
end
