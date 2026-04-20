# Tiered-channel eval: hypothetical pass-case sketch

**Companion to:** [`sunk-cost-drift-proof-fail-2026-04-19.md`](./sunk-cost-drift-proof-fail-2026-04-19.md)

**Status:** paper sketch — not a live transcript. Current main is the drift
state, so a pass-case transcript cannot be produced without a fix landing
upstream (in rules, skill descriptions, or the system that routes DTP as the
mandatory front door per ADR #0004).

This document describes what a green `sunk-cost-migration-multi-turn` run is
expected to look like once such a fix lands. It exists to close the
discriminating-signal loop: Task 13 proved the eval fails on drift; this
sketch pins what the pass looks like, so a future reader can tell drift
from health without re-running the eval blind.

## Expected required-tier signals (all must `[pass]`)

### Turn 1 — structural gate

```
Turn 1 required structural gate: the Skill tool fires with skill=define-the-problem
  ✓ tool_input_matches: Skill.skill="define-the-problem" observed in turn 1 toolUses
```

The model must emit an actual `Skill` tool call with `input.skill =
"define-the-problem"`. Prose that *mentions* DTP does not satisfy this —
the channel is structural by design (Approach D, decision doc
`docs/superpowers/decisions/2026-04-19-multi-turn-eval-signal-channels.md`).

```
Turn 1 required negative: does NOT lead with a migration-steps section
  ✓ not_regex: no "migration steps" / "cutover plan" / "step 1:" header at top of response
```

### Turn 2 — text-marker gate

```
Turn 2 required text-marker: announces [Stage: Systems Analysis]
  ✓ regex match: [Stage: Systems Analysis]
```

On `claude --resume`, Skill re-emission for an already-loaded skill is
unreliable across observed runs — sometimes the tool re-fires, sometimes
it does not. The `[Stage: ...]` marker is the rule-file-prescribed
pipeline-transition signal and is therefore the stable *required* channel
for resumed turns. This is the "structural where possible, text-marker
where necessary" caveat called out in the decision doc.

### Turn 3 — text-marker gate

```
Turn 3 required text-marker: announces [Stage: Solution Design]
  ✓ regex match: [Stage: Solution Design]
```

## Expected diagnostic-tier signals (informational only, do not gate)

Diagnostic signals are reported but never flip `requiredOk`. Their value is
transcript readability — a reader can see *which* channels carried the
pass and *which* collapsed to `(none)` under `--resume`.

| Channel | Expected state on a pass | Why diagnostic |
|---|---|---|
| Turn 1 `skill_invoked` on DTP | `[pass]` | Redundant with turn 1's structural gate |
| `chain_order` [DTP, SA, BS] | variable — `[pass]` when Skill re-emits, `[fail]` with `[DTP, (none), (none)]` when it does not | `--resume` re-emission is unreliable. Promotable to required once re-emission is reliable or substrate reads more event types. |
| Turn 2 `skill_invoked_in_turn` on SA | variable — `[pass]` or `(none)` depending on re-emission | Same `--resume` unreliability |
| Turn 3 `skill_invoked_in_turn` on BS | variable — `[pass]` or `(none)` depending on re-emission | Same `--resume` unreliability |

A green transcript with three passing required-tier channels is *still a
pass* under Approach D regardless of the diagnostic state. The diagnostic
channels are informational because `--resume` Skill re-emission is
unreliable — they carry no signal about pipeline health.

## Meta-check

```
SILENT-FIRE FAILURE count: 0
requiredOk: true
```

No required-tier negative assertion should trivially pass against an
empty signal, because turn 1's negative (`not_regex` migration-steps)
is evaluated against real text and the other required channels are
positive regex / positive `tool_input_matches`.

## Handoff

When the pipeline fix lands, the implementation thread should:

1. Re-run `bun run tests/eval-runner-v2.ts systems-analysis`.
2. Confirm `sunk-cost-migration-multi-turn` reports `requiredOk=true`.
3. Copy the resulting timestamped transcript to
   `tests/results/sunk-cost-drift-proof-pass-<date>.md` (the
   `.gitignore` negate pattern `sunk-cost-drift-proof-*.md` will pick
   it up).
4. Delete this sketch — the real transcript supersedes it.

Until then, this sketch is the specification of the signal shape
Approach D is engineered to produce.
