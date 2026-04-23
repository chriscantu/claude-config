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
Proposed

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

## Promotion criteria

Per [ADR #0005](./0005-behavioral-adr-promotion-requires-discriminating-signal.md),
promotion to `Accepted` requires the four-condition discrimination demo:

1. Eval substrate — ✅ landed with this PR.
2. RED commit — intentionally broken FMS rules block; evals fail.
3. GREEN commit — block restored; evals pass.
4. Follow-up PR that lands the RED/GREEN pair and promotes to Accepted.

Until all four land, this ADR stays Proposed.

## References

- [ADR #0004](./0004-define-the-problem-mandatory-front-door.md) — pattern origin
- [ADR #0005](./0005-behavioral-adr-promotion-requires-discriminating-signal.md) — promotion discipline
- [ADR #0006](./0006-systems-analysis-pressure-framing-floor.md) — SA floor (sibling)
- [PR #112](https://github.com/chriscantu/claude-config/pull/112) — DTP floor substrate
- [PR #118](https://github.com/chriscantu/claude-config/pull/118) — sentinel bypass
- [Issue #117](https://github.com/chriscantu/claude-config/issues/117) — this generalization
