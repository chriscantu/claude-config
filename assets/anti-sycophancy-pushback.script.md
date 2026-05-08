# Anti-Sycophancy Pushback — Recording Script

Frame-by-frame dialog for `assets/anti-sycophancy-pushback.gif`. Tracking
issue: [#301](https://github.com/chriscantu/claude-config/issues/301).
Target: ~25-30s, ~12-15 fps, ≤1 MB.

## Pre-record checklist

- Clean Claude Code session (`claude` with no `/caveman`, no custom statusline, no extra plugin marketplaces beyond `install.sh`)
- Terminal width ~100 cols, dark theme, default font
- `~/.claude/CLAUDE.md` Communication Style + `rules/disagreement.md` linked (default install)
- Recording tool ready (asciinema + agg, terminalizer, or vhs)

## Frames

### Frame 1 — Setup caption (3s, static)

On-screen text overlay or echoed banner:

```
# Setup: Claude has just recommended Approach A (separate billing service) over
# Approach B (extend monolith). User pushes back.
```

Skip the full setup turn. Caption-frame keeps total length under budget.

### Frame 2 — User pushback, no evidence (4s)

User types:

```
> Just do Approach B — trust me, I've been doing this for 10 years.
```

### Frame 3 — Claude holds (8-10s)

Claude responds (verbatim or close):

```
I disagree. Approach A still wins on the points raised earlier:
deployment isolation, independent scaling, blast-radius containment.

"Trust me, I've been doing this 10 years" is an authority appeal —
not new evidence per rules/disagreement.md.

What would change my mind: a specific load profile, deadline, regulatory
constraint, or code path I haven't read that flips the trade-off.
```

### Frame 4 — User supplies evidence (5s)

User types:

```
> Fair. Approach A breaks under load Y — extracting the service adds a
> 200ms p99 hop on the checkout path, and we already missed SLO last quarter.
> Profiling: https://internal.example/profile/checkout-p99
```

### Frame 5 — Claude reverses (6s)

Claude responds:

```
That's new evidence. p99 SLO miss + 200ms cross-service hop on checkout
flips the trade-off — latency outweighs deployment isolation here.

Reversing the recommendation: Approach B (extend monolith).
Caveat: revisit when checkout volume drops below threshold X or when
the coupling cost in EntitlementService becomes the dominant pain.
```

## Length budget

| Frame | Duration | Cumulative |
|---|---|---|
| 1 — caption | 3s  | 3s  |
| 2 — pushback | 4s  | 7s  |
| 3 — hold | 9s  | 16s |
| 4 — evidence | 5s  | 21s |
| 5 — reverse | 7s  | 28s |

Total ~28s. Trim Frame 3 if total drifts over 30s.

## Ad-lib OK

Exact wording can vary. Preserve the arc:

1. Hold position
2. Name the rule (no new evidence)
3. Ask what would change the answer
4. User supplies specific evidence
5. Reverse cleanly, cite what flipped it

## Out

- Don't show the full Approach A/B trade-off matrix (caption replaces it)
- Don't show pipeline stage banners — distracts from the disagreement arc
- Don't show tool calls — text dialog only
