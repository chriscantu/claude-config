#!/usr/bin/env fish
# Simulates the anti-sycophancy pushback dialog (strategy-doc scenario). Run under asciinema:
#   TERM=xterm-256color asciinema rec assets/anti-sycophancy-pushback.cast --overwrite --cols 90 --rows 30 --command "fish assets/simulate-pushback.fish"

set -g BOLD (set_color --bold)
set -g DIM (set_color --dim)
set -g BLUE (set_color brblue)
set -g GREEN (set_color brgreen)
set -g YELLOW (set_color bryellow)
set -g RESET (set_color normal)

# Speaker label, then a short beat so the viewer reads who is talking first.
function speaker --argument-names color label
    printf '%s%s%s%s\n' $BOLD $color $label $RESET
    sleep 0.4
end

# One line per argument; pass "" for a blank line. Text goes through %s,
# so a literal % in dialog can't be misread as a format directive.
function say
    printf '%s\n' $argv
end

clear

# --- Frame 1: caption (3s) ---
say "$DIM# Setup: VP asked Claude to draft a Q3 strategy doc for the platform org.$RESET" \
    "$DIM# Claude is mid-pipeline at problem definition. User pushes back.$RESET" ""
sleep 3

# --- Frame 2: user pushback, no evidence (4s) ---
speaker $GREEN "▸ You"
say "Just frame it around 'improve velocity' — we'll sharpen the metric later." ""
sleep 3.5

# --- Frame 3: Claude holds (9s) ---
speaker $BLUE "◆ Claude"
say "I disagree. 'Improve velocity' isn't a measurable goal; it's an aspiration." \
    "Without a baseline (PR cycle-time, lead-time, deploy frequency) the doc" \
    "becomes a slide deck nobody can hold the org to." ""
sleep 2.5
say "$YELLOW\"We'll sharpen it later\"$RESET is sunk-cost framing — not new evidence" \
    "per rules/disagreement.md." ""
sleep 2.0
say "What would change my mind: a baseline metric, a stakeholder sign-off," \
    "or a deadline I don't know about that makes vague-first cheaper." ""
sleep 3.5

# --- Frame 4: user supplies evidence (5s) ---
speaker $GREEN "▸ You"
say "Fair. Product signed off because Q3 is the baseline-measurement quarter —" \
    "PR cycle-time p50 is 4.2 days, target Q4 is 2 days. 'Velocity' = that metric." ""
sleep 4.0

# --- Frame 5: Claude reverses (7s) ---
speaker $BLUE "◆ Claude"
say "That's new evidence. Named metric (PR cycle-time p50) + baseline (4.2d)" \
    "+ target (2d) + measurement-quarter context make the framing concrete." ""
sleep 2.0
say "$BOLD$GREEN✓ Proceeding with OKR: 'reduce PR cycle-time p50 from 4.2d → 2d'.$RESET" \
    "Drafting structure: Goal / Baseline / Initiatives / Owners / Measurement cadence."
sleep 3.5
