#!/usr/bin/env fish
# Simulates the anti-sycophancy pushback dialog (strategy-doc scenario). Run under asciinema:
#   TERM=xterm-256color asciinema rec assets/anti-sycophancy-pushback.cast --overwrite --cols 90 --rows 30 --command "fish assets/simulate-pushback.fish"

set -g BOLD (set_color --bold)
set -g DIM (set_color --dim)
set -g BLUE (set_color brblue)
set -g GREEN (set_color brgreen)
set -g YELLOW (set_color bryellow)
set -g RESET (set_color normal)

clear

# --- Frame 1: caption (3s) ---
printf "$DIM# Setup: VP asked Claude to draft a Q3 strategy doc for the platform org.$RESET\n"
printf "$DIM# Claude is mid-pipeline at problem definition. User pushes back.$RESET\n\n"
sleep 3

# --- Frame 2: user pushback, no evidence (4s) ---
printf "$BOLD$GREEN▸ You$RESET\n"
sleep 0.4
printf "Just frame it around 'improve velocity' — we'll sharpen the metric later.\n\n"
sleep 3.5

# --- Frame 3: Claude holds (9s) ---
printf "$BOLD$BLUE◆ Claude$RESET\n"
sleep 0.4
printf "I disagree. 'Improve velocity' isn't a measurable goal; it's an aspiration.\n"
printf "Without a baseline (PR cycle-time, lead-time, deploy frequency) the doc\n"
printf "becomes a slide deck nobody can hold the org to.\n\n"
sleep 2.5
printf "%s\"We'll sharpen it later\"%s is sunk-cost framing — not new evidence\n" $YELLOW $RESET
printf "per rules/disagreement.md.\n\n"
sleep 2.0
printf "What would change my mind: a baseline metric, a stakeholder sign-off,\n"
printf "or a deadline I don't know about that makes vague-first cheaper.\n\n"
sleep 3.5

# --- Frame 4: user supplies evidence (5s) ---
printf "$BOLD$GREEN▸ You$RESET\n"
sleep 0.4
printf "Fair. Product signed off because Q3 is the baseline-measurement quarter —\n"
printf "PR cycle-time p50 is 4.2 days, target Q4 is 2 days. 'Velocity' = that metric.\n\n"
sleep 4.0

# --- Frame 5: Claude reverses (7s) ---
printf "$BOLD$BLUE◆ Claude$RESET\n"
sleep 0.4
printf "That's new evidence. Named metric (PR cycle-time p50) + baseline (4.2d)\n"
printf "+ target (2d) + measurement-quarter context make the framing concrete.\n\n"
sleep 2.0
printf "$BOLD$GREEN✓ Proceeding with OKR: 'reduce PR cycle-time p50 from 4.2d → 2d'.$RESET\n"
printf "Drafting structure: Goal / Baseline / Initiatives / Owners / Measurement cadence.\n"
sleep 3.5
