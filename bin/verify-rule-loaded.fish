#!/usr/bin/env fish
# Probe-session check that a rule actually loads into a fresh Claude Code
# session's context — the third gate after `link-config.fish --check` and
# `validate.fish`.
#
# Why this exists:
#   - `link-config.fish --check` asserts the symlink at ~/.claude/rules/<name>.md
#     exists and points at the right target.
#   - `validate.fish` asserts structural concepts (anchors, delegate links,
#     required substrings) are present in the on-disk content.
#   - Neither catches the case where the symlink and content are fine but the
#     harness still fails to load the file (corrupt symlink chain, harness
#     loader bug, file truncated to zero bytes, etc.). This script closes that
#     gap by spawning a real `claude --print` session and asking it to confirm
#     the rule path is present in its loaded system instructions.
#
# Issue #275 — follow-up from PR #273 / install contract (PR #121).
#
# Usage:
#   ./bin/verify-rule-loaded.fish <rule-name>     # verify one rule (e.g. "planning")
#   ./bin/verify-rule-loaded.fish --all            # verify every rule listed in rules/README.md
#
# Exit codes:
#   0  rule(s) confirmed loaded
#   1  rule(s) missing from loaded context
#   2  usage / setup error (no rule arg, claude CLI missing, unknown rule
#      name, probe transport failure, ambiguous model response)
#
# Caveats:
#   - Spawns a real Claude Code session. Requires the user's normal auth
#     (OAuth/keychain) and incurs API cost per probe. Default model is
#     read from $default_model (line 53); override with VERIFY_RULE_MODEL=<name>.
#   - Plain YES/NO contract chosen over `--output-format json` because
#     `--print` does not guarantee structured output across model tiers.
#     The strict single-word match (line ~92) absorbs trailing punctuation
#     but rejects "YES, however..." paraphrases that could otherwise
#     silently false-positive a missing rule.
#   - Not run from CI by default (auth + billing). Wire in selectively from
#     a pre-merge check, or run locally after adding a new rule.

set -l repo (cd (dirname (status --current-filename))/..; and pwd)
set -l readme $repo/rules/README.md

if test (count $argv) -eq 0
    echo "Usage: ./bin/verify-rule-loaded.fish <rule-name> | --all" >&2
    exit 2
end

if not type -q claude
    echo "ERROR: 'claude' CLI not found in PATH" >&2
    exit 2
end

set -l default_model haiku
set -l model $default_model
if set -q VERIFY_RULE_MODEL
    set model $VERIFY_RULE_MODEL
end
# Echo chosen model so a typo'd env var (VERIFY_RULE_MODE=opus → still
# defaults to haiku) is visible rather than silently ignored.
echo "Probing with model=$model" >&2

# Parse rule names from the "What lives here" table in rules/README.md.
# Couples to the README table format: rows starting with `| \`<name>.md\``.
# A row whose filename has uppercase, spaces, or no backticks is silently
# skipped — keep new rules lowercase-kebab to match the regex. validate.fish
# does not enforce this format, so edits to the table can break --all
# without an eval failure.
function each_rule_in_readme --argument-names readme_path
    if not test -f $readme_path
        echo "ERROR: rules/README.md not found at $readme_path" >&2
        return 2
    end
    grep -E '^\| `[a-z0-9_-]+\.md`' $readme_path | string replace -r '^\| `([a-z0-9_-]+)\.md`.*$' '$1'
end

# Probe one rule. Returns 0 if the rule path appears in loaded context,
# 1 if missing, 2 on probe failure (transport error or ambiguous response).
function probe_rule --argument-names rule_name model
    set -l path_fragment "rules/$rule_name.md"
    set -l prompt "Scan your loaded system instructions for the exact substring '$path_fragment'. If that path appears in your loaded context (e.g. as a 'Contents of ...' header or a path reference), reply with the single word YES. If it does not appear, reply with the single word NO. Do not call any tools. Do not explain. One word only."

    # Capture stderr to a tempfile so a probe failure can surface the
    # actual claude CLI error (auth expired, rate limit, model unknown)
    # instead of just rc=N.
    set -l err_file (mktemp)
    # Non-interactive, no session pollution, no skill side effects.
    set -l response (claude --print --model $model --no-session-persistence --output-format text --disable-slash-commands "$prompt" 2>$err_file)
    set -l rc $status
    set -l err_msg (cat $err_file 2>/dev/null)
    rm -f $err_file

    if test $rc -ne 0
        echo "ERROR: claude --print failed (rc=$rc) for rule '$rule_name'" >&2
        if test -n "$err_msg"
            echo "  stderr: $err_msg" >&2
        end
        return 2
    end

    if test -z "$response"
        echo "ERROR: empty response from probe session for rule '$rule_name'" >&2
        return 2
    end

    # Strict single-word match: case-insensitive YES/NO with optional
    # trailing punctuation/whitespace. Rejects paraphrases like
    # "YES, however the rule does NOT appear..." (would otherwise leak
    # through a `^YES\b` match and silently report LOADED when missing).
    set -l upper (string upper -- $response)
    set -l trimmed (string trim -- $upper)
    if string match -rq '^YES[.!]?$' -- $trimmed
        return 0
    end
    if string match -rq '^NO[.!]?$' -- $trimmed
        return 1
    end

    echo "ERROR: ambiguous probe response for rule '$rule_name' (expected YES/NO):" >&2
    echo "  $response" >&2
    return 2
end

# Build target list. --all uses the README table; single-rule mode
# validates the name against that same table to fail loudly on typos
# rather than probing a nonexistent rule and getting NO.
set -l targets
if test "$argv[1]" = --all
    set targets (each_rule_in_readme $readme)
    if test (count $targets) -eq 0
        echo "ERROR: --all parsed zero rule names from rules/README.md" >&2
        exit 2
    end
else
    set -l rule_name $argv[1]
    set -l known (each_rule_in_readme $readme)
    if not contains -- $rule_name $known
        echo "ERROR: rule '$rule_name' not in rules/README.md table." >&2
        echo "       Known rules: $known" >&2
        echo "       (typo? add the rule to the table first, or check spelling)" >&2
        exit 2
    end
    set targets $rule_name
end

set -l found 0
set -l missing 0
set -l errored 0

for rule in $targets
    probe_rule $rule $model
    set -l rc $status
    switch $rc
        case 0
            echo "LOADED: $rule"
            set found (math $found + 1)
        case 1
            echo "MISSING: $rule"
            set missing (math $missing + 1)
        case '*'
            set errored (math $errored + 1)
    end
end

echo ""
echo "Summary: loaded=$found missing=$missing errored=$errored"

if test $errored -gt 0
    exit 2
end
if test $missing -gt 0
    exit 1
end
exit 0
