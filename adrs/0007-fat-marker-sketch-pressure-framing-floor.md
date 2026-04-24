# ADR #0007: Apply pressure-framing floor to fat-marker-sketch gate

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
Rejected (2026-04-24)

## Context

[ADR #0004](./0004-define-the-problem-mandatory-front-door.md) established the
pressure-framing floor at the DTP gate. [ADR #0006](./0006-systems-analysis-pressure-framing-floor.md)
extends it to systems-analysis. This ADR completes the pipeline coverage by
applying the same pattern to the fat-marker-sketch gate (step 4 of
`rules/planning.md`).

The FMS gate governs the transition from approach selection to detailed
design. Observed failure modes:

- **Deadline pressure.** "10 minutes before meeting, skip the sketch" leaks
  past the prose skip contract in `rules/fat-marker-sketch.md`. The skill
  already has a strong rationalization table, but no structural enforcement.
- **Prose-as-sketch.** "You already described it two turns ago — that's the
  sketch" bypasses the visual-artifact requirement.
- **Stated-next-step.** "Skip sketch, produce the detailed design spec"
  routes directly to detailed design without an explicit cost-named skip.

The FMS skill's HARD-GATE is the strongest prose gate in the repo — its
rationalization table explicitly names time-pressure, prose-as-sketch,
fatigue, and component-scope framings. But prose gates are model-interpreted
at runtime; under combined pressure they leak. Structural enforcement closes
the loop.

## Decision

Apply the pressure-framing floor pattern established for DTP and
systems-analysis to the fat-marker-sketch gate. Copy-paste-parameterize
per [#117](https://github.com/chriscantu/claude-config/issues/117):

1. **Emission contract.** The MCP tool `acknowledge_named_cost_skip` accepts
   `gate="fat-marker-sketch"`. Honoring a named-cost skip REQUIRES emitting
   this tool call with the verbatim user cost-naming clause.
2. **Pressure-framing floor.** `rules/fat-marker-sketch.md` enumerates seven
   pressure categories (authority, sunk cost, exhaustion, deadline,
   prose-as-sketch, cosmetic minimizer, stated-next-step) and forbids bypass
   via any combination.
3. **Sentinel bypass.** Shared `DISABLE_PRESSURE_FLOOR` sentinel bypasses
   all three gates. Single flag, visible rollback.
4. **Structural evals.** Two discriminating pressure-framing evals added to
   `skills/fat-marker-sketch/evals/evals.json`: one for pressure detection
   (deadline + stated-next-step → `Skill` + Bash probe), one for honored
   skip (rework-risk cost named → `acknowledge_named_cost_skip` emission).

## Consequences

**Positive**

- Completes pipeline coverage — all three load-bearing gates (DTP, SA, FMS)
  have structural pressure-framing floors.
- FMS-specific pressure categories (prose-as-sketch, cosmetic minimizer) are
  now structurally caught, not just named in prose.
- Eval substrate distinguishes behavioral compliance ("here's why I'll
  sketch") from structural compliance (Skill tool actually invoked).

**Negative**

- Same duplication trade-off as ADR #0006 — accepted per
  [#117](https://github.com/chriscantu/claude-config/issues/117) non-goals.
- Third gate increases the surface area for the shared sentinel bypass:
  enabling `DISABLE_PRESSURE_FLOOR` now disables three floors at once. This
  is intentional (single-flag emergency rollback) but users should prefer
  fixing regressions over leaving the flag on.

## Rejection Rationale

Four-cell inverse-RED audit run 2026-04-24 against `rules/fat-marker-sketch.md`
and `rules/planning.md`. Same substrate and method as [ADR #0006](./0006-systems-analysis-pressure-framing-floor.md)
rejection ([issue #126](https://github.com/chriscantu/claude-config/issues/126)).
SA evals (11 scenarios, 40 assertions) used as cross-gate guard — no FMS-specific
eval suite existed; SA evals already cover the structural floor behavior.

| Config | SA evals | Assertions | Δ assertions |
|--------|----------|------------|-------------|
| Baseline (all floors intact) | 11/11 | 38/40 | — |
| FMS gutted, DTP intact | 9/11 | 36/40 | **-2 (noise)** |
| DTP gutted, FMS intact | 9/11 | 32/40 | **-6 (signal)** |
| Both gutted | 7/11 | 29/40 | **-9** |

**Finding:** same substitutable pattern as SA. Gutting FMS block alone produces
only noise-band degradation (−2 assertions, no structural required-tier failures
introduced by FMS absence). Gutting DTP alone produces a clear signal (−6 assertions,
`sunk-cost-migration` turn 1 required structural gate fails — DTP skill not invoked
under sunk-cost pressure). The FMS per-gate block adds zero eval-measurable load
given the DTP anchor already exists.

**Mechanism.** Under FMS-gutted config, model still invoked `acknowledge_named_cost_skip`
with correct gate, ran `DISABLE_PRESSURE_FLOOR` Bash probe, and invoked appropriate
Skill — all via generalization from DTP block. Confirms ADR #0006 mechanism applies
identically to FMS gate.

**Decision.** Reject per Karpathy #2 (simplicity first). Revert `rules/fat-marker-sketch.md`
per-gate block (~80 lines); replace with two-line pointer to DTP anchor. No FMS-specific
eval suite needed: SA evals serve as cross-gate guard and pass 3/3 structural
assertions under FMS-only config.

**What would reopen this.** Evidence that the single-anchor pattern fails for FMS
specifically — e.g., a prompt under sketch-specific pressure (prose-as-sketch,
cosmetic minimizer) that routes past DTP but not through SA, where the model fails
to generalize the floor contract. Reopening requires new evals that fail under
DTP-only AND pass under DTP+FMS, not just the per-gate shape attempted here.

## References

- [ADR #0004](./0004-define-the-problem-mandatory-front-door.md) — pattern origin
- [ADR #0005](./0005-behavioral-adr-promotion-requires-discriminating-signal.md) — promotion discipline
- [ADR #0006](./0006-systems-analysis-pressure-framing-floor.md) — SA floor (sibling)
- [PR #112](https://github.com/chriscantu/claude-config/pull/112) — DTP floor substrate
- [PR #118](https://github.com/chriscantu/claude-config/pull/118) — sentinel bypass
- [Issue #117](https://github.com/chriscantu/claude-config/issues/117) — this generalization
