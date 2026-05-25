# Anti-Sycophancy Pushback — Recording Script

Frame-by-frame dialog for `assets/anti-sycophancy-pushback.gif`. Tracking
issue: [#301](https://github.com/chriscantu/claude-config/issues/301).
Scenario re-shoot: [#419](https://github.com/chriscantu/claude-config/issues/419).
Target: ~25-30s, ~12-15 fps, ≤1 MB.

## Pre-record checklist

- Clean Claude Code session (`claude` with no `/caveman`, no custom statusline, no extra plugin marketplaces beyond `install.sh`)
- Terminal width ~100 cols, dark theme, default font
- `~/.claude/CLAUDE.md` Communication Style + `rules/disagreement.md` linked (default install)
- Recording tool ready (asciinema + agg, terminalizer, or vhs)

## Frames

### Frame 1 — Setup caption (3s, static)

On-screen caption:

```
# Setup: VP asked Claude to draft a Q3 strategy doc for the platform org.
# Claude is mid-pipeline at problem definition. User pushes back.
```

Skip the full setup turn. Caption-frame keeps total length under budget.

### Frame 2 — User pushback, no evidence (4s)

User types:

```
> Just frame it around 'improve velocity' — we'll sharpen the metric later.
```

### Frame 3 — Claude holds (9s)

Claude responds (verbatim or close):

```
I disagree. 'Improve velocity' isn't a measurable goal; it's an aspiration.
Without a baseline (PR cycle-time, lead-time, deploy frequency) the doc
becomes a slide deck nobody can hold the org to.

"We'll sharpen it later" is sunk-cost framing — not new evidence
per rules/disagreement.md.

What would change my mind: a baseline metric, a stakeholder sign-off,
or a deadline I don't know about that makes vague-first cheaper.
```

### Frame 4 — User supplies evidence (5s)

User types:

```
> Fair. Product signed off because Q3 is the baseline-measurement quarter —
> PR cycle-time p50 is 4.2 days, target Q4 is 2 days. 'Velocity' = that metric.
```

### Frame 5 — Claude reverses (7s)

Claude responds:

```
That's new evidence. Named metric (PR cycle-time p50) + baseline (4.2d)
+ target (2d) + measurement-quarter context make the framing concrete.

✓ Proceeding with OKR: 'reduce PR cycle-time p50 from 4.2d → 2d'.
Drafting structure: Goal / Baseline / Initiatives / Owners / Measurement cadence.
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
4. User supplies specific evidence (named metric + baseline + deadline / sign-off)
5. Reverse cleanly, cite what flipped it

## Out

- Don't show the full Q3 strategy outline (caption replaces it)
- Don't show pipeline stage banners — distracts from the disagreement arc
- Don't show tool calls — text dialog only
