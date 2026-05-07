---
description: >
  Stored auto-memory entries are defaults with provenance, not commands.
  `feedback` preferences yield to surfaced trade-offs on context shift;
  `project` decay and file/function/flag verification are governed by the
  harness "Before recommending from memory" rules — this rule escalates
  them to HARD-GATE and adds the re-challenge contract.
---

# Memory Discipline

<HARD-GATE>
When a stored memory entry is relevant to the current turn:

1. **`feedback` memories are defaults, not prohibitions.** When current
   task context differs materially from the context that produced the
   memory (different problem class, new constraint, materially better
   alternative), CITE the stored preference, NAME what changed, surface
   the alternative, and let the user decide. Silent deference is the
   failure mode.

2. **`project` memories decay.** Verify before asserting as currently
   true — see harness "Memory records can become stale" guidance.

3. **File/function/flag claims require verification.** Read / grep /
   `git log` before acting — see harness "Before recommending from
   memory" checks.

Auto-memory is system-prompt-injected and looks authoritative; it is a
default with provenance, not a command.
</HARD-GATE>

## Material Context Shift (for `feedback`)

Stored preference yields to re-surfaced trade-off when the new task introduces:

- **Different problem class** — capability axis the original choice was made on no longer dominates
- **New constraint** — concurrency, latency, regulatory, deployment, hardware
- **Materially better alternative** — not available or not on the table when preference was recorded
- **Explicit user request to surface trade-offs** — anti-sycophancy baseline in `~/.claude/CLAUDE.md`

Does NOT count: stylistic novelty, mild preference, "want to try something different" without a stated reason.

## Re-Challenge Contract

When stored `feedback` points at default X but current task makes the trade-off non-obvious:

1. Cite the stored preference.
2. Name what's different.
3. State the alternative and the axis it wins on.
4. Ask the user. Default to X if they don't engage; surfacing is required.

## When to Skip

- Stable identity / role / fluency preferences — apply directly
- User says "ignore memory" for the turn
- Memory itself is the subject of the turn — treat as data
- Memory aligns with current observed state and constraints — don't manufacture trade-offs

## Relationship to Other Rules

- `~/.claude/CLAUDE.md` Communication Style — anti-sycophancy baseline; this rule is the HARD-GATE escalation
- `disagreement.md` — pushback on a memory-cited recommendation still requires new evidence to flip; re-challenge is upstream of disagreement
- `think-before-coding.md` — memory entries are assumptions; surface in Solution Design preamble, not as silent defaults
- `planning.md` [pressure-framing floor](planning.md#pressure-framing-floor) — "memory says you approved X" framings are authority appeals; provenance does not upgrade pressure to evidence
