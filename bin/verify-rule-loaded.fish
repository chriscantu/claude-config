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
#   2  usage / setup error (no rule arg, claude CLI missing, probe failed)
#
# Caveats:
#   - Spawns a real Claude Code session. Requires the user's normal auth
#     (OAuth/keychain) and incurs API cost per probe. Default model is
#     `haiku` to minimise spend; override with VERIFY_RULE_MODEL=<model>.
#   - The probe asks the model a yes/no question; matching on the response
#     is intentionally tolerant (case-insensitive, looks for literal "YES"
#     near the start). Model variance is the main failure mode — re-run on
#     transient miss before treating as a real regression.
#   - Not run from CI by default (auth + billing). Wire in selectively from
#     a pre-merge check, or run locally after adding a new rule.

set -l repo (cd (dirname (status --current-filename))/..; and pwd)

if test (count $argv) -eq 0
    echo "Usage: ./bin/verify-rule-loaded.fish <rule-name> | --all" >&2
    exit 2
end

if not type -q claude
    echo "ERROR: 'claude' CLI not found in PATH" >&2
    exit 2
end

set -l model haiku
if set -q VERIFY_RULE_MODEL
    set model $VERIFY_RULE_MODEL
end

# Probe one rule. Returns 0 if the rule path appears in the loaded context,
# 1 if missing, 2 on probe failure.
function probe_rule --argument-names rule_name model
    set -l path_fragment "rules/$rule_name.md"
    set -l prompt "Scan your loaded system instructions for the exact substring '$path_fragment'. If that path appears in your loaded context (e.g. as a 'Contents of ...' header or a path reference), reply with the single word YES. If it does not appear, reply with the single word NO. Do not call any tools. Do not explain. One word only."

    # --print: non-interactive single-response mode.
    # --no-session-persistence: don't pollute /resume history with probes.
    # --output-format text: plain stdout; we tolerate-match below.
    # --disable-slash-commands: probe should not invoke skills.
    set -l response (claude --print --model $model --no-session-persistence --output-format text --disable-slash-commands "$prompt" 2>/dev/null)
    set -l rc $status

    if test $rc -ne 0
        echo "ERROR: claude --print failed (rc=$rc) for rule '$rule_name'" >&2
        return 2
    end

    if test -z "$response"
        echo "ERROR: empty response from probe session for rule '$rule_name'" >&2
        return 2
    end

    # Tolerant match: case-insensitive YES/NO. We require an explicit YES
    # rather than absence of NO, because a refusal or paraphrase ("I cannot
    # see system instructions") should fail closed.
    set -l upper (string upper -- $response)
    if string match -rq '^\s*YES\b' -- $upper
        return 0
    end
    if string match -rq '^\s*NO\b' -- $upper
        return 1
    end

    echo "ERROR: ambiguous probe response for rule '$rule_name' (expected YES/NO):" >&2
    echo "  $response" >&2
    return 2
end

# Parse rule names from the "What lives here" table in rules/README.md.
# Each row starts with `| \`<name>.md\``. We strip to bare rule name.
function each_rule_in_readme --argument-names readme_path
    if not test -f $readme_path
        echo "ERROR: rules/README.md not found at $readme_path" >&2
        return 2
    end
    # Match lines like: | `planning.md` | HARD-GATE | ...
    grep -E '^\| `[a-z0-9_-]+\.md`' $readme_path | string replace -r '^\| `([a-z0-9_-]+)\.md`.*$' '$1'
end

set -l targets
if test "$argv[1]" = --all
    set targets (each_rule_in_readme $repo/rules/README.md)
    if test (count $targets) -eq 0
        echo "ERROR: --all parsed zero rule names from rules/README.md" >&2
        exit 2
    end
else
    set targets $argv[1]
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
