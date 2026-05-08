#!/usr/bin/env fish
# Simulates the anti-sycophancy pushback dialog. Run under asciinema:
#   TERM=xterm-256color asciinema rec assets/anti-sycophancy-pushback.cast --overwrite --cols 90 --rows 30 --command "fish assets/simulate-pushback.fish"

set -g BOLD (set_color --bold)
set -g DIM (set_color --dim)
set -g BLUE (set_color brblue)
set -g GREEN (set_color brgreen)
set -g YELLOW (set_color bryellow)
set -g RESET (set_color normal)

clear

# --- Frame 1: caption (3s) ---
printf "$DIM# Setup: Claude has recommended Approach A (separate billing service)$RESET\n"
printf "$DIM# over Approach B (extend monolith). User pushes back.$RESET\n\n"
sleep 3

# --- Frame 2: user pushback, no evidence (4s) ---
printf "$BOLD$GREEN▸ You$RESET\n"
sleep 0.4
printf "Just do Approach B — trust me, I've been doing this for 10 years.\n\n"
sleep 3.5

# --- Frame 3: Claude holds (8s) ---
printf "$BOLD$BLUE◆ Claude$RESET\n"
sleep 0.4
printf "I disagree. Approach A still wins on deployment isolation,\n"
printf "independent scaling, and blast-radius containment.\n\n"
sleep 1.5
printf "%s\"Trust me, I've been doing this 10 years\"%s is an authority appeal —\n" $YELLOW $RESET
printf "not new evidence per rules/disagreement.md.\n\n"
sleep 2.0
printf "What would change my mind: a specific load profile, deadline, regulatory\n"
printf "constraint, or code path I haven't read that flips the trade-off.\n\n"
sleep 3.5

# --- Frame 4: user supplies evidence (5s) ---
printf "$BOLD$GREEN▸ You$RESET\n"
sleep 0.4
printf "Fair. Approach A breaks under load Y — extracting the service adds a\n"
printf "200ms p99 hop on the checkout path, and we missed SLO last quarter.\n\n"
sleep 4.0

# --- Frame 5: Claude reverses (7s) ---
printf "$BOLD$BLUE◆ Claude$RESET\n"
sleep 0.4
printf "That's new evidence. p99 SLO miss + 200ms cross-service hop on\n"
printf "checkout flips the trade-off — latency outweighs deployment isolation.\n\n"
sleep 2.0
printf "$BOLD$GREEN✓ Reversing the recommendation: Approach B (extend monolith).$RESET\n"
printf "Caveat: revisit when checkout volume drops below threshold X.\n"
sleep 3.5
