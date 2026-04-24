# ADR #0006: Apply pressure-framing floor to systems-analysis gate

Date: 2026-04-23

## Responsible Architect
Cantu

## Author
Cantu

## Contributors

* Claude (design partner)

## Lifecycle
POC

## Status
Rejected (2026-04-23)

## Context

[ADR #0004](./0004-define-the-problem-mandatory-front-door.md) established the
pressure-framing floor as a reusable rules-layer pattern: prose skip contracts
are insufficient because pressure framings (authority, sunk cost, exhaustion,
deadline, stated-next-step) slip past natural-language gates. Structural
enforcement via (1) `Skill` tool invocation, (2) MCP emission contract, and
(3) `DISABLE_PRESSURE_FLOOR` sentinel bypass has been stable since PR #112.

The systems-analysis gate (step 2 of the planning pipeline) had the same
loophole with no structural enforcement. Observed failure modes:

- **Authority + cosmetic minimizer.** "CTO reviewed, it's low-risk — just a
  column" bypassed the 60-second surface-area scan under
  [Issue #68](https://github.com/chriscantu/claude-config/issues/68).
- **Sunk cost.** Signed-contract framings skipped the scan under
  [Issue #90](https://github.com/chriscantu/claude-config/issues/90).
- **Preview/visuals opt-in.** Prompts offering visual opt-ins short-circuited
  the scan under [Issue #87](https://github.com/chriscantu/claude-config/issues/87).

Prior prose skip contract in `rules/planning.md` step 2 relied on the model
honoring "generic skip framings run the scan anyway" — a rule with no
structural signal.

## Decision

Apply the pressure-framing floor pattern established for DTP to the
systems-analysis gate. Copy-paste-parameterize per [#117](https://github.com/chriscantu/claude-config/issues/117):

1. **Emission contract.** The MCP tool `acknowledge_named_cost_skip`
   (`mcp-servers/named-cost-skip-ack.ts`) accepts `gate="systems-analysis"`.
   Honoring a named-cost skip REQUIRES emitting this tool call.
2. **Pressure-framing floor.** `rules/planning.md` step 2 enumerates six
   pressure categories (authority, sunk cost, cosmetic minimizer, exhaustion,
   deadline, stated-next-step) and forbids bypass via any combination.
3. **Sentinel bypass.** The shared `DISABLE_PRESSURE_FLOOR` sentinel file
   bypasses all three gates (DTP, SA, FMS). Runtime rollback without a
   revert chain. Visible via `ls ~/.claude/ .claude/ | grep DISABLE`.
4. **Structural evals.** Two discriminating pressure-framing evals added to
   `skills/systems-analysis/evals/evals.json`: one for pressure detection
   (authority + cosmetic minimizer → `Skill` + Bash probe), one for honored
   skip (named cost → `acknowledge_named_cost_skip` emission).

No unifying meta-skill. No inheritance. Each gate's floor block is
independently readable and maintainable.

## Consequences

**Positive**

- Closes three bugs ([#68](https://github.com/chriscantu/claude-config/issues/68),
  [#87](https://github.com/chriscantu/claude-config/issues/87),
  [#90](https://github.com/chriscantu/claude-config/issues/90))
  with one structural pattern.
- Pattern is proven (DTP since PR #112) — replication cost low.
- Eval substrate picks up structural signal (`tool_input_matches`), not
  prose-regex text-compliance.

**Negative**

- Rules-layer duplication — each gate carries its own ~80-line floor block.
  Accepted trade per [#117](https://github.com/chriscantu/claude-config/issues/117)
  non-goals: "copy-paste-parameterize, not inheritance."
- Pressured prompts incur extra latency (Bash probe + Skill invocation)
  even when user would have tolerated a fast path. Accepted per floor
  philosophy: correctness over speed under pressure.

## Rejection Rationale

Attempted [ADR #0005](./0005-behavioral-adr-promotion-requires-discriminating-signal.md)
four-condition promotion demo on 2026-04-23 (see
[issue #126](https://github.com/chriscantu/claude-config/issues/126),
[PR #127](https://github.com/chriscantu/claude-config/pull/127)).
Four-cell inverse-RED matrix on `rules/planning.md` + `rules/fat-marker-sketch.md`.
Legend: `SA evals` = count of passing evals in `skills/systems-analysis/evals/evals.json`
(11 total). `Assertions` = count of passing assertion checks across all 11 evals
(40 total, including diagnostic-tier).

| Config | SA evals | Assertions |
|--------|----------|------------|
| Baseline (all floors) | 11/11 | 38/40 |
| SA step 2 gutted, DTP step 1 intact | 11/11 | 38/40 |
| DTP step 1 gutted, SA step 2 intact | 11/11 | 38/40 |
| All floors gutted (DTP + SA + FMS) | 5/11 | 26/40 |

**Finding:** per-gate blocks are substitutable, not layered. One anchor suffices —
model generalizes emission-contract + Bash-probe + Skill invocation to the
correct gate per user prompt. PR #125 SA-specific per-gate block adds zero
eval-measurable load given the DTP per-gate block already exists.

**Mechanism.** Under the SA-step-2-gutted RED, the model emitted
`acknowledge_named_cost_skip` with `gate="systems-analysis"` and verbatim
`user_statement`, ran the `DISABLE_PRESSURE_FLOOR` Bash probe, and invoked
`Skill(systems-analysis)` — all three required-tier signals fired via
generalization from the DTP per-gate block. The model treats the floor as one
semantic template keyed to the active pipeline stage, not as three per-gate
blocks.

**Decision.** Reject per Karpathy #2 (simplicity first). The per-gate
duplication introduced by this ADR is speculative robustness without
evidence at the current eval substrate. Revert the rules-layer block;
keep the new SA evals as cross-gate generalization regression guards
(they pass 3/3 under DTP-only config, discriminate under minimal-rules).

**What would reopen this.** Evidence that the single-anchor pattern fails
under distribution shift not covered by current evals — e.g., a new
pressure framing that routes to SA but does not satisfy DTP, or a model
regression where the generalization breaks. Reopening requires new evals
that fail under DTP-only AND pass under DTP+SA, not just the per-gate
RED/GREEN shape attempted here.

## References

- [ADR #0004](./0004-define-the-problem-mandatory-front-door.md) — pattern origin
- [ADR #0005](./0005-behavioral-adr-promotion-requires-discriminating-signal.md) — promotion discipline
- [PR #112](https://github.com/chriscantu/claude-config/pull/112) — DTP floor substrate
- [PR #118](https://github.com/chriscantu/claude-config/pull/118) — sentinel bypass
- [Issue #117](https://github.com/chriscantu/claude-config/issues/117) — this generalization
- [Issue #126](https://github.com/chriscantu/claude-config/issues/126) — rejection finding
- [PR #127](https://github.com/chriscantu/claude-config/pull/127) — original blocker doc (superseded by this rejection)
