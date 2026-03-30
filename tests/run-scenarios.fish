#!/usr/bin/env fish
# Run behavioral eval scenarios against Claude Code.
#
# Usage:
#   fish tests/run-scenarios.fish                    # run all scenarios
#   fish tests/run-scenarios.fish planning-pipeline   # run one scenario file
#
# Each scenario prompt is sent to `claude --print` (non-interactive, single-turn).
# Output is saved to tests/results/<scenario>-<timestamp>.md for manual review.
#
# This is NOT automated pass/fail — behavioral evals require human judgment.
# The script collects the outputs; you review them against the expected behavior
# checklists in each scenario file.

set repo_dir (cd (dirname (status filename)); and cd ..; and pwd)
if test -z "$repo_dir"
    echo "Error: Could not determine repository directory"
    exit 1
end

set scenarios_dir "$repo_dir/tests/scenarios"
set results_dir "$repo_dir/tests/results"
set timestamp (date +%Y-%m-%d-%H%M)

mkdir -p "$results_dir"; or begin
    echo "Error: Could not create results directory $results_dir"
    exit 1
end

# Check if claude CLI is available
if not command -q claude
    echo "Error: 'claude' CLI not found in PATH"
    exit 1
end

# Determine which scenarios to run
set scenario_filter ""
if test (count $argv) -gt 0
    set scenario_filter $argv[1]
end

set scenario_count 0
set run_count 0
set fail_run_count 0

for scenario_file in $scenarios_dir/*.md
    set scenario_name (basename $scenario_file .md)

    # Apply filter if specified
    if test -n "$scenario_filter"; and test "$scenario_name" != "$scenario_filter"
        continue
    end

    set scenario_count (math $scenario_count + 1)
    echo "━━━ $scenario_name ━━━"

    # Extract prompts from scenario file (lines starting with **Prompt:** )
    set prompts (grep '^\*\*Prompt:\*\*' "$scenario_file" | sed 's/^\*\*Prompt:\*\* //' | sed 's/"//g')

    if test (count $prompts) -eq 0
        echo "  ⚠ No prompts found (expected lines starting with **Prompt:**)"
        echo ""
        continue
    end

    set prompt_num 0

    for prompt in $prompts
        set prompt_num (math $prompt_num + 1)

        # Skip prompts that are contextual/conditional (start with parenthetical)
        if string match -q "(after*" -- "$prompt"
            set clean_prompt (string replace -r '^\(.*?\)\s*' '' "$prompt")
            if test -z "$clean_prompt"
                echo "  ⊘ Scenario $prompt_num: skipped (contextual prompt, needs prior state)"
                continue
            end
            set prompt "$clean_prompt"
        end

        set result_file "$results_dir/$scenario_name-$prompt_num-$timestamp.md"
        set err_file "$result_file.err"

        echo "  → Scenario $prompt_num: $prompt"
        echo "    Running claude --print..."

        # Run claude in print mode — capture stderr separately for diagnostics
        echo "$prompt" | claude --print 2>"$err_file" >"$result_file"

        if test $status -eq 0
            set run_count (math $run_count + 1)
            set line_count (wc -l <"$result_file" | string trim)
            echo "    ✓ Output saved ($line_count lines) → $result_file"
            rm -f "$err_file"
        else
            set fail_run_count (math $fail_run_count + 1)
            if test -s "$err_file"
                echo "    ✗ Claude error: "(cat "$err_file")
            else
                echo "    ✗ Claude returned a non-zero exit code"
            end
        end
    end

    echo ""
end

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Ran $run_count prompts across $scenario_count scenario files ($fail_run_count failed)"
echo "Results in: $results_dir/"
echo ""
echo "Next step: Review outputs against expected behavior checklists"
echo "in each scenario file ($scenarios_dir/)"

# Exit non-zero if no prompts succeeded
if test $run_count -eq 0; and test $scenario_count -gt 0
    echo ""
    echo "ERROR: No prompts ran successfully"
    exit 1
end
