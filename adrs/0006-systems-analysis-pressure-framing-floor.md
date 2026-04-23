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
Proposed

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
2. **Pressure-framing floor.** `rules/planning.md` step 2 enumerates five
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

## Promotion criteria

Per [ADR #0005](./0005-behavioral-adr-promotion-requires-discriminating-signal.md),
promotion to `Accepted` requires the four-condition discrimination demo:

1. Eval substrate that reads structural signal (`tool_input_matches` on
   `Skill(systems-analysis)` and on `acknowledge_named_cost_skip`) — ✅
   landed with this PR.
2. RED commit — an intentionally broken rules-layer block that fails the
   new evals.
3. GREEN commit — the rules-layer block restored; evals pass.
4. Follow-up PR that lands the RED/GREEN pair and promotes this ADR to
   Accepted.

Until all four land, this ADR stays Proposed.

## References

- [ADR #0004](./0004-define-the-problem-mandatory-front-door.md) — pattern origin
- [ADR #0005](./0005-behavioral-adr-promotion-requires-discriminating-signal.md) — promotion discipline
- [PR #112](https://github.com/chriscantu/claude-config/pull/112) — DTP floor substrate
- [PR #118](https://github.com/chriscantu/claude-config/pull/118) — sentinel bypass
- [Issue #117](https://github.com/chriscantu/claude-config/issues/117) — this generalization
