# #109 path decision — chain-progression substrate across `--resume`

**Date:** 2026-04-21
**Status:** Decided — design-only; recommendation awaiting user approval
**Related:**
- [#109](https://github.com/chriscantu/claude-config/issues/109) — the problem this doc picks a path for
- [Decision doc 2026-04-19](./2026-04-19-multi-turn-eval-signal-channels.md) — tiered-channel model that defined required vs. diagnostic
- [Decision doc 2026-04-20 (escalation)](./2026-04-20-pressure-framing-floor-escalation.md) § "sunk-cost-migration-multi-turn turns 2–3" — where the problem was isolated to substrate
- [Decision doc 2026-04-20 (split)](./2026-04-20-issue-90-split-strategy.md) — places #109 in the broader #90 decomposition
- [ADR #0004](../../../adrs/0004-define-the-problem-mandatory-front-door.md) — behavioral ADR whose promotion scope #109 bounds
- [ADR #0005](../../../adrs/0005-behavioral-adr-promotion-requires-discriminating-signal.md) — governance rule; its "substrate-limit exception" is path 3's escape hatch
- [PR #106](https://github.com/chriscantu/claude-config/pull/106) — multi-turn substrate
- [PR #107](https://github.com/chriscantu/claude-config/pull/107) — tiered-channel assertion model

## Problem statement

Multi-turn evals on `claude --resume` cannot produce a reliable required-tier
structural signal on turns 2–3. `Skill` tool-use re-emission is non-deterministic
across runs, and the `[Stage: ...]` text markers in `rules/planning.md` are the
only fallback channel — which is why ADR #0005's substrate-limit exception was
carved out in the first place. See #109 for the full framing; see the 04-20
escalation § "chain-progression layer" for the evidence.

ADR #0004 currently cites this exception as *interim*, tracked by this issue.
This doc picks the path that either makes the limit resolvable or makes it
permanent.

## Prior investigation — what the current extractor ignores

`tests/evals-lib.ts`:`extractSignals` consumes only `type:"assistant"` events
(tool_use + text content blocks) and `type:"result"` events. It ignores
`type:"user"` and `type:"system"` events. Sampling
`tests/results/systems-analysis-sunk-cost-migration-multi-turn-v2-multiturn-2026-04-20T19-21-41.md`
(11 user events, 7 system events across 3 turns):

- `user/tool_result` events carry `"Launching skill: <name>"` strings — but only
  when the model re-emitted `Skill` tool-use in the same turn. The tool_result
  is a *consequence* of the tool_use. Same reliability ceiling.
- `system/hook_started` and `system/hook_response` events fire around
  `SessionStart` hooks and carry `additionalContext` payload (rule/skill
  content). These fire per session, not per stage-transition. No stage signal.
- `system/init` carries session metadata (`session_id`, `tools`, `cwd`,
  `mcp_servers`). No stage signal.

Stage markers `[Stage: Systems Analysis]` and `[Stage: Solution Design]` are
**assistant text** emitted per the rule contract. The current extractor already
captures them via `finalText` (concatenated `assistant/text` blocks). The
turn-2–3 assertions that fail are already reading the channel path 1 proposes
to expand — they fail because the model doesn't emit the marker, not because
the extractor misses it.

This finding is load-bearing for path 1's assessment below.

## Path 1 — Extend `extractSignals` to read user/system stream-json events

### Implementation cost

Isolated change: ~30–80 LOC in `tests/evals-lib.ts` to iterate `user` and
`system` events, plus new `Signals` fields (`toolResults[]`, `hookEvents[]`),
plus assertion variants targeting them (e.g., `tool_result_contains`). Maybe
1 day of runner work, single file, no new deps.

### Reliability ceiling

**Unknown — but the investigation above suggests low for this specific
problem.** None of the event types the extractor ignores carry stage-
progression signal independent of model output. Stage markers are assistant
text that `finalText` already captures; `Skill` re-emission drives all
downstream `user/tool_result` "Launching skill" strings. Hook events fire on
session lifecycle, not stage transitions.

To resolve: would need a spike that enumerates every stream-json event type on
a turn where `Skill` did NOT re-emit and identifies one that still
discriminates stage progression. My sample did not find one. An exhaustive
enumeration across ≥5 baselines would be needed to rule it out — but the
theoretical case is weak because the CLI doesn't natively emit stage-
transition events; stage is a rule-layer contract over assistant text, not a
transport-layer concept.

**A path-1-adjacent variant exists: add a custom hook (`PostToolUse`, `Stop`,
or similar) to the eval harness that writes a stage-transition event into the
stream.** That would create a structural signal where none exists today. But
that is not "extend the extractor" — it's new substrate infrastructure, and
fits path 2's cost signature more than path 1's. Flagged as a finding below;
not scored as path 1.

### Governance consequence

None direct. If reliability ceiling holds, ADR #0004's substrate-limit
exception stays interim and eventually resolves. If ceiling fails (likely),
path 3 becomes the fallback — so path 1 is essentially "attempt, then fall
back to 3 on failure."

### Coupling cost

Isolated to the extractor. Does not affect single-turn evals (they never
hit turn 2–3), #108's work (it's turn-1 structural), or the named-cost-skip
contract (#110).

### Reversibility

High. A failed extractor extension is a revert. Disk cost is one branch.

## Path 2 — Migrate multi-turn evals to SDK-based session management

### Implementation cost

Eval-runner-v2 rewrite. `tests/eval-runner-v2.ts` currently spawns the CLI
via `spawnSync(claudeBin, ...)` — SDK migration means pulling in
`@anthropic-ai/sdk` (or `@anthropic-ai/claude-agent-sdk`), replacing the
CLI path with a stateful session object, and re-deriving the signal
extraction against whatever shape the SDK exposes. Multi-day: several
hundred LOC touched, new dependencies, re-validation of all 8 existing
multi-turn evals against the new substrate, and a parallel single-turn path
(unless the SDK migration covers both — which expands scope further).

Also introduces a dependency on SDK API surface stability. The CLI is the
product; the SDK is an internal-facing API that can change. This is a real
cost.

### Reliability ceiling

**High — probably the highest of the three.** An SDK session maintains
conversation state in-process; there is no CLI re-emission variance because
the transport is different. Tool-use blocks are emitted programmatically on
each turn, not regenerated from a serialized session resume. The model
still has to decide to invoke `Skill`, but the substrate won't drop the
signal on the floor when it does.

Qualifier: the SDK may have its own event-shape quirks not yet characterized
in this repo. "Highest reliability ceiling" assumes the SDK behaves as
documented; a spike would be required to confirm.

### Governance consequence

Potentially large. If path 2 lands and proves reliable, ADR #0004's
substrate-limit exception becomes unnecessary — multi-turn behavioral claims
can use structural required-tier signals across all turns. This unlocks
future behavioral ADRs that today would be capped at turn 1 structural +
turn 2–3 diagnostic-only.

### Coupling cost

**Highest of the three.** Two parallel eval substrates (CLI-based v2 for
single-turn, SDK for multi-turn) unless the single-turn path also migrates.
Any drift between them becomes flake. Also introduces a runtime dependency
on the SDK package; version bumps, breaking changes, and auth-mode
differences (the SDK uses API keys; the CLI uses subscription auth) are
new operational burden.

The auth-mode difference is non-trivial: the user runs `claude` via
subscription. SDK usage may require an API key, which is a separate billing
path. Cost per eval run changes shape.

### Reversibility

Medium. Parking the SDK path is straightforward if the v1/v2 CLI runner is
kept alongside. Deleting it after adoption is a larger revert — but during
the initial rollout, a flag-gated two-runner setup is a natural safety
valve.

## Path 3 — Formal text-marker relaxation

### Implementation cost

~1 hour. ADR #0004 edit: move the substrate-limit exception from *interim*
to *permanent* language in the Consequences section, and remove (or reframe)
the "tracked by #109" resolution path. Close #109 as *resolved by accepting
the limit*. The tiered-channel model (PR #107) already supports diagnostic-
tier on turns 2–3; no code change required. Possibly update eval JSON to
explicitly tier turn-2–3 assertions as diagnostic where they currently
default to required.

### Reliability ceiling

N/A — path 3 does not attempt to improve the signal. It accepts the current
ceiling (~text-marker reliability on `--resume` which is what it is) and
reclassifies what the signal is load-bearing for.

### Governance consequence

**Largest of the three.** ADR #0004's behavioral scope permanently shrinks
to turn 1. Any future behavioral ADR asserting a multi-turn chain-
progression claim would be structurally capped at turn-1 required-tier +
turn 2–3 diagnostic-only. ADR #0005's substrate-limit exception becomes a
permanent category rather than an interim carve-out. The repo accepts
"multi-turn chain progression is not contractually verifiable" as a
durable constraint.

The pressure-framing-floor escalation already ruled out fixing this at the
rule layer. Path 3 is the governance equivalent of that ruling — it says
the substrate layer won't be fixed either.

### Coupling cost

None. No eval-runner change, no new dependency, no parallel substrate.

### Reversibility

High *from a code standpoint* (trivial edit), but **low socially** — once
ADR #0004 is promoted to `Accepted` under the reduced scope, future authors
who want broader multi-turn behavioral coverage must either reopen the ADR
or write a new one that re-justifies the substrate. The *Accepted* label
encodes the accepted scope. Re-expanding requires either path 1 or path 2
to land anyway, with ADR edits layered on top.

## Trade-off table

| Criterion | Path 1 (extractor) | Path 2 (SDK) | Path 3 (relax) |
|---|---|---|---|
| **Impl cost** | ~1 day, 30–80 LOC, 1 file | multi-day, ~hundreds LOC, new deps, auth-mode change | ~1 hour, ADR edit + tier flips |
| **Reliability ceiling** | unknown — investigation suggests low for this problem | high (assumes SDK behaves as documented; spike required to confirm) | N/A — accepts current ceiling |
| **Governance consequence** | none direct; falls back to path 3 on failure | unlocks future multi-turn behavioral coverage | ADR #0004 perm. capped at turn 1; ADR #0005 exception becomes permanent category |
| **Coupling cost** | isolated to extractor | two parallel substrates; SDK dep; auth-mode delta | none |
| **Reversibility** | high (revert branch) | medium (SDK removal after adoption is larger) | high in code, low socially after promotion |

## Recommendation

**Path 3 — formal text-marker relaxation.**

### Why

1. **Path 1's reliability ceiling is probably too low to justify even a spike.**
   The prior investigation in this doc enumerated the stream-json event types
   the extractor misses. None carry stage-progression signal independent of
   the model's assistant output (which is already captured). The stage-marker
   contract is rule-layer text, not transport-layer structure. A spike could
   rule this out definitively, but the theoretical case is weak: the CLI
   doesn't emit stage-transition events because stage is not a CLI concept.
2. **Path 2's cost is disproportionate to the problem it solves.** SDK
   migration doubles substrate surface area, adds a new dependency, changes
   auth-mode/billing shape, and its benefit (reliable multi-turn structural
   signal) is currently load-bearing for exactly one open behavioral ADR
   (#0004), which itself only needs turn-1 coverage to promote (#108's
   criterion). Paying multi-day runner-rewrite cost for a permanent
   substrate-layer safety net is overbuilding relative to demand.
3. **Path 3 aligns with the 04-20 escalation's diagnosis.** That escalation
   concluded the problem is structural, not rule-layer. ADR #0005 already
   carved the substrate-limit exception. ADR #0004 already cites it as
   interim. Path 3 is the honest completion of work already done — it moves
   an interim acknowledgement to a permanent one, which is what the evidence
   already supports.
4. **#109 does not block #108.** The split strategy (04-20) explicitly
   ordered #108 (turn-1 pressure-framing) as independently resolvable. ADR
   #0004's Promotion criteria already treat multi-turn assertions as
   diagnostic-tier pending #109. Path 3 does not change #108's critical
   path — it just stops pretending the substrate-limit is temporary.

### What path 3 gives up

- **Future multi-turn structural coverage.** If someone later wants a
  behavioral ADR whose claim depends on turn 2–3 structural signal, they
  will need to re-open this decision and land path 2 (or a spike of path 1,
  or something not yet considered). Path 3 does not foreclose that — but
  it does make the path not-already-taken, and the ADR lifecycle will carry
  the scar.
- **A discriminating required-channel signal for chain progression.** Path
  3 admits that this class of assertion cannot discriminate structurally
  under the current substrate. Any future "the model progresses through
  stages 1 → 2 → 3 under input X" claim is limited to diagnostic-tier
  evidence. ADR #0005's bar for behavioral promotion on multi-turn claims
  effectively becomes unreachable for this class of claim until the
  substrate changes.
- **Optionality.** Paths 1 and 2 leave the door open for "maybe the
  substrate can be made better later." Path 3 closes that door
  *socially*, even though the code-level door stays open. Re-expanding
  the scope requires ADR work, not just code work.

## What the recommendation does NOT commit to

- **Not committing to removing multi-turn evals.** The multi-turn substrate
  (PR #106) stays. The tiered-channel model (PR #107) stays. What changes
  is how turn-2–3 assertions are *tiered* — diagnostic, not required — and
  how ADR #0004 *describes* the scope it makes claims over.
- **Not committing to closing #109 without further documentation.** #109
  closes with a link to this doc as the resolution; the decision rationale
  must be preserved so future authors don't re-litigate.
- **Not committing to removing path 1 or path 2 from future consideration.**
  If a later behavioral ADR genuinely requires multi-turn structural
  coverage, path 2 (or a well-scoped path 1 spike) can be revisited on
  its own merits. Path 3 is a decision about *current* substrate
  economics, not a decision about *all possible futures*.
- **Not committing to edits in this session.** Design-only per task
  boundaries. Next step belongs to a separate implementation thread.

## Finding flagged (not recommended)

During path 1 analysis, a fourth option surfaced: **add a custom hook
(`PostToolUse`, `Stop`, or similar) to the eval harness that emits a
structural stage-transition event into the stream.** This would create
discriminating signal where none exists today, without SDK migration. It
fits path 1's "read more events" framing but its cost signature matches
path 2 (new infrastructure, parallel contract between eval harness and
rule layer). Not scored here because the task boundaries enumerate three
paths and require a separate review cycle for new ones. Filing as a note
for any future thread that reopens this decision.

## Next step if approved

**Open an implementation thread to:**

1. Edit [ADR #0004](../../../adrs/0004-define-the-problem-mandatory-front-door.md)
   Consequences and Promotion criteria sections — reframe the substrate-
   limit exception from *interim (tracked by #109)* to *permanent* with a
   link to this doc.
2. Flip any turn-2–3 required-tier assertions on multi-turn evals to
   diagnostic-tier in the relevant `evals.json` files.
3. Close [#109](https://github.com/chriscantu/claude-config/issues/109) as
   *resolved by accepting the substrate limit*, linking this doc.

No rule, skill, or runner code is touched by the implementation. It is
entirely a governance + eval-JSON change.
