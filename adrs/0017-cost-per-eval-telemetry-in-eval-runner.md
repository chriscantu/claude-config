# ADR #0017: Add cost-per-eval telemetry to eval-runner-v2.ts live-run output

Date: 2026-05-20

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

The 2026-05-20 baseline (`docs/superpowers/decisions/2026-05-20-token-determinism-baseline.md`) flagged the absence of cost-per-eval telemetry as **determinism risk #1**: the eval substrate measures pass/fail and wall-clock but emits no dollar-cost or token-usage data. Every optimization ADR that proposes to compress, restructure, or extend rules/skills must justify itself on ROI grounds — and without per-eval cost data, the ROI side of that math is guesswork.

This gap had a concrete cost in this session: ADR #0016 (compress pr-validation.md) reached **Status: Proposed** before an SME audit caught that its ~330 tok/session saving was worth ~$14/year at Opus pricing vs multi-hour engineering. The bad-ROI candidate consumed substantive cycles (proposal authoring + PR opening + audit + rewrite + rejection commit + PR update + merge) that a cost-quantified gate would have prevented at proposal time. Cost telemetry is the substrate that makes ROI math cheap.

PR #363 (`feat(eval-runner): --concurrency N flag for parallel eval execution`, merged 2026-05-20) is the natural lineage for this work. That PR:

- Refactored eval runner from shared-counter mutation to per-eval `EvalResult` objects (the structural slot where cost data lands)
- Added `runLifecycleAsync` with awaited work + teardown (the lifecycle slot for cost capture after work resolves)
- Added per-eval `out` buffer + atomic flush (the output slot for cost display per eval)

Today `CliRun` carries `{ stdout, stderr, exitCode, failure? }`. No cost field. Cost data is available from the underlying Claude CLI in two known shapes:

1. **`claude --print --output-format json`** emits a final JSON object including usage and cost summary on supported versions. Requires changing the spawn invocation in `spawnClaudeCli` / `spawnClaudeCliAsync`.
2. **Stderr-side usage emission** on some CLI versions. Parse-on-stderr is fragile and version-dependent.
3. **Estimation fallback** — char-count × tier-pricing-table. Lossy (no thinking-token visibility, no cache hit accounting) but always available.

Forces in tension:

- **Cost-aware ROI vs CLI-version coupling.** Native CLI emission is accurate but couples the runner to a specific CLI output format. Estimation is version-independent but lossy.
- **Per-eval granularity vs aggregation.** Per-eval cost surfaces optimization candidates (top-N most expensive evals); aggregate cost suffices for ROI math. Both are cheap to compute once a single eval has cost data.
- **Dry-run vs live-run.** Dry-run has no CLI spawn → no native cost. Estimation can fill that gap but distorts the "live confirmation" semantic the dry/live split enforces. Cleaner: cost field is `null` in dry-run output, present in live-run output, with explicit display.
- **Existing eval substrate stability.** The runner is now substrate for 136 evals across 7 rules-evals suites + 7+ skill-evals suites. Schema changes risk breaking downstream parsers, validators (Phase 1m `evals.json` shape), and the `loadEvalFile` contract.

## Decision

We will add an optional cost telemetry channel to `eval-runner-v2.ts` along these axes:

1. **Schema additions** (non-breaking):
   - `CliRun.cost?: { usd: number | null; tokens?: { input: number; output: number }; source: "cli-native" | "estimated" | null }` — optional field, `null` source means dry-run or unavailable
   - `EvalResult.cost?: CliRun["cost"]` — aggregated per eval (sum across multi-turn chains)

2. **Capture strategy** (implementation-PR choice, NOT this ADR):
   - Try `claude --print --output-format json` first; parse final JSON object for `usage` + `total_cost_usd` keys
   - If field missing or parsing fails, fall back to char-count estimation with `source: "estimated"`
   - Dry-run produces `source: null`; field omitted from display

3. **Display in tiered summary** (additive, below existing pass/fail counts):
   - Per-skill aggregated cost line: `Skill verification: $0.42 (3 evals, source: cli-native)`
   - Final summary cost line: `Total cost: $X.XX across N live evals (M estimated, P dry-run)`
   - Top-3 most expensive evals listed when total > $1.00 (cheap optimization triage)

4. **Schema versioning**:
   - `EvalResult` gains an optional `schema_version: 2` field; existing parsers ignore unknown fields
   - Phase 1m `evals.json` validator unaffected — this is OUTPUT schema, not INPUT schema
   - Downstream consumers (none currently exist outside the runner itself) can opt in by reading the cost field

5. **Concurrency interaction** — cost aggregation is per-eval (`runPool` already returns per-index `EvalResult`); the aggregator sums after the pool returns. No new race condition surface beyond what PR #363 already shipped.

Pre-merge discriminating eval gate (per ADR #0005):

- **Required RED/GREEN:** new test in `tests/eval-runner-concurrency.test.ts` (or a new `tests/eval-runner-cost.test.ts`) that uses a fake `claude` driver to emit canned cost JSON and asserts:
  - `EvalResult.cost.usd` is populated when CLI emits cost
  - `EvalResult.cost.source` is `"estimated"` when CLI omits cost
  - `EvalResult.cost` is `undefined` (not present) when `--dry-run`
  - Final summary line includes `Total cost:` when ≥1 eval has cost data
- **RED on broken implementation:** if the cost-capture path silently drops the field on parse failure, the "estimated" assertion fails
- **GREEN on passing implementation:** all four assertions pass
- This is local-test substrate, NOT live-API spend — discriminating gate runs at zero API cost

## Consequences

Positive:

- **Unblocks ROI math for every future token-load optimization ADR.** The #0016 audit cycle becomes preventable — cost field makes "$14/year saved" visible at proposal time, not at audit time.
- **Enables top-N expensive-eval triage** for the 136-eval suite. Today's `EVAL_BASELINE.md` tracks pass-rate; with cost data, the substrate gains a complementary optimization signal.
- **Live-eval gate becomes economically inspectable.** PR #363's deferred live-run item (~$0.50-2 cost estimate) becomes a measured cost line for future PRs, eliminating the "cost-gated, deferred to merger" handwave.
- **Aligns with eval substrate's existing tiered-reporting design.** Cost is a natural fourth tier alongside Structural / Text / Diagnostic.

Negative:

- **CLI version coupling.** If `claude --print --output-format json` schema changes, the cost-capture path breaks silently (falls back to estimation). Mitigation: capture source explicitly and surface `source: "estimated"` in summary so divergence is visible.
- **Estimation lossiness.** Char-count × tier-pricing misses thinking-token usage, cache hits, batch discounts, prompt-caching credits. Estimated costs will systematically underreport real spend by an unknown factor. Mitigation: surface source label so consumers know not to compare estimated against actual line-items.
- **Schema additions, even non-breaking, require Phase 1m validator awareness.** The `evals.json` shape validator does not touch output schema, but a future contributor extending Phase 1m to output-schema coverage would need to handle the optional cost field. Document the additive shape in this ADR + the implementation PR.
- **Display surface grows.** Tiered summary already prints structural/text/diagnostic + pass-rate; adding cost lines extends the output. Conditional emission (only when ≥1 eval has cost data) keeps dry-run output unchanged.

Neutral:

- The cost field is optional on every code path; existing parsers and pipelines see no behavior change until they opt in.
- Estimation table requires periodic update as pricing changes. Mitigation: centralize the table in one source-of-truth constant with a `last_updated` comment.

## Implementation gate

Per ADR #0005: the discriminating eval test (Section 4 above) must exist + RED on a stubbed-broken implementation + GREEN on the live one before the ADR moves to Accepted. The test runs at zero API cost (fake driver), so no cost authorization is required for the gate itself.

The implementation PR's test plan MUST include:

- [ ] Unit test for `CliRun.cost` parsing path (native CLI emission) — fake driver
- [ ] Unit test for estimation fallback path — fake driver with missing cost field
- [ ] Unit test for dry-run path — `--dry-run` produces `cost: undefined`
- [ ] Schema-compat test — old-format `EvalResult` without `cost` field still parses
- [ ] One live N=1 run on `verification` skill (smallest live-runnable suite) to verify native CLI parsing — cost-gated; user authorization required

## Lessons applied from prior ADRs

- **From #0015 (Accepted):** discriminating eval substrate is non-negotiable; this ADR specifies the test signature up front rather than deferring.
- **From #0016 (Rejected):** ROI math is the first audit, not the last. This ADR's ROI is unbounded-positive (enables all future ROI math) rather than a fixed $14/year, justifying the engineering cost.
- **From #0006 / `per_gate_floor_blocks_substitutable.md`:** decomposed audit (per-axis verdict) catches bundled-decision defects. This ADR splits "cost capture" from "estimation fallback" from "display" so per-axis revert is mechanical.

## References

- Baseline that flagged this gap: `docs/superpowers/decisions/2026-05-20-token-determinism-baseline.md` (determinism risk #1)
- PR #363 — eval-runner concurrency lineage (`EvalResult`, `runLifecycleAsync`, per-eval buffer + flush)
- [ADR #0005](./0005-behavioral-adr-promotion-requires-discriminating-signal.md) — discriminating-signal requirement
- [ADR #0009](./0009-eval-runner-v2-canonical.md) — eval-runner-v2 canonical substrate
- [ADR #0015](./0015-split-rules-readme-governance-from-operations.md) — accepted token-budget ADR (structural)
- [ADR #0016](./0016-compress-pr-validation-overlapping-sections.md) — rejected wording-compression ADR; cost-telemetry gap is what made the bad ROI invisible at proposal time
- `tests/EVAL_BASELINE.md` — current pass-rate tracking surface (complementary to cost tracking)
- `tests/evals-lib.ts` — `EvalResult` type, `loadEvalFile` contract, Phase 1m validator
