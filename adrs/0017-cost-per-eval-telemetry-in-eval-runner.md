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
Proposed (revised 2026-05-20 after SME audit — see §SME Audit)

## Context

The 2026-05-20 baseline (`docs/superpowers/decisions/2026-05-20-token-determinism-baseline.md`) flagged the absence of cost-per-eval telemetry as **determinism risk #1**: the eval substrate measures pass/fail and wall-clock but emits no dollar-cost or token-usage data.

Today `CliRun` carries `{ stdout, stderr, exitCode, failure? }`. The Claude CLI provides native cost emission via `--print --output-format json` (verified via `claude --help`), and the CLI separately accepts `--max-budget-usd` (verified) which confirms server-side cost tracking exists. The runner does not capture either.

Adjacent context, useful for future contributors:

- PR #363 (`feat(eval-runner): --concurrency N flag for parallel eval execution`, merged 2026-05-20) refactored eval runner from shared-counter mutation to per-eval `EvalResult` objects + per-eval `out` buffer + atomic flush. That refactor is the natural slot for adding optional per-eval cost data.
- The eval substrate is now 136 evals across 7 rules-evals suites + 7+ skill-evals suites. Output schema changes risk breaking downstream parsers if any exist.

Forces in tension:

- **Cost-aware ROI math vs CLI-version coupling.** Native CLI emission requires depending on a specific JSON output shape that Anthropic owns.
- **Per-eval granularity vs aggregation.** Per-eval enables top-N expensive-eval triage; aggregate suffices for ROI math.
- **Native capture vs estimation fallback.** Native cost is accurate when available. Estimation is structurally unreliable — see §SME Audit findings.
- **Dry-run vs live-run.** Dry-run has no CLI spawn → no native cost. Field should be `null`/omitted, not estimated.

## Decision (revised)

We will add an **optional, native-source-only** cost telemetry channel to `eval-runner-v2.ts`:

1. **Schema additions** (non-breaking):
   - `CliRun.cost?: { usd: number; tokens?: { input: number; output: number; cache_read?: number; cache_creation?: number } } | null` — present when CLI emitted parseable cost JSON, `null` when CLI ran but cost JSON was absent/unparseable, omitted (`undefined`) on dry-run
   - `EvalResult.cost?: CliRun["cost"]` — aggregated per eval (sum across multi-turn chains)
   - `schema_version: 2` optional field on `EvalResult` for future consumers

2. **Capture strategy** — native only:
   - Spawn invocation changes from current shape to `claude --print --output-format json …`
   - Parse the final JSON object; extract documented cost + usage fields (exact field names verified in implementation PR via a one-time paid `claude --print` smoke)
   - On parse failure or missing fields: set `cost: null` and emit a single `[eval-runner] cost capture failed: <reason>` warning to stderr. Do NOT fall back to char-count estimation.

3. **Estimation explicitly out of scope.** See §SME Audit for why estimation is rejected. A separate ADR may revisit estimation if a use case for relative-comparison-within-session emerges.

4. **Display in tiered summary** (additive, conditional on ≥1 eval having `cost.usd`):
   - Per-skill aggregated cost line: `Skill verification: $0.42 (3 evals)`
   - Final summary cost line: `Total cost: $X.XX across N live evals (M live without cost data, P dry-run)`
   - Top-3 most expensive evals listed when total > $1.00 (cheap optimization triage)
   - When no eval has cost data: cost lines omitted entirely (preserves dry-run output)

5. **Concurrency interaction** — cost aggregation is per-eval (`runPool` returns per-index `EvalResult`); the aggregator sums after the pool returns. No new race surface beyond PR #363.

Pre-merge discriminating eval gate (per ADR #0005):

- **Required RED/GREEN** — new test file (`tests/eval-runner-cost.test.ts`) using a fake `claude` driver. Assertions:
  - `EvalResult.cost.usd` populated when fake driver emits canned cost JSON
  - `EvalResult.cost === null` when fake driver emits text-only output (cost capture failed path)
  - `EvalResult.cost` is `undefined` when `--dry-run`
  - Final summary line includes `Total cost:` when ≥1 eval has cost data; absent when none do
- **Zero API cost for the gate.** Fake driver tests RED/GREEN locally.
- **One paid item:** smoke run of `claude --print --output-format json` against a trivial eval to verify the JSON field names match what the implementation parses. Cost-gated; ~$0.10-0.50 estimated.

## Consequences

Positive:

- **Surfaces per-eval cost data** for the 136-eval substrate. Top-N expensive-eval triage becomes possible (currently invisible).
- **Sharpens ROI math** for future optimization ADRs. Cost discipline + cost data is stronger than cost discipline alone.
- **Live-eval gate becomes economically inspectable.** PR #363's deferred live-run item (~$0.50-2 cost estimate) becomes a measured cost line, eliminating guesses.
- **Native-only path is robust to model/pricing changes** because Anthropic owns the cost calculation; the runner only reads it.

Negative:

- **CLI version coupling.** If `--output-format json` schema changes, capture silently sets `cost: null` and warns once per run. Downstream display omits cost lines for affected evals. Mitigation: schema change is visible in test failure of the one-time paid smoke item; periodic re-run on CLI updates flags drift.
- **Doesn't help dry-run sessions.** Dry-run output unchanged. Acceptable; the substrate split between dry-run (schema only) and live-run (behavioral) is intentional.
- **No estimation fallback** means sessions where CLI doesn't emit cost get NO cost line, not an approximate one. Per §SME Audit, this is the right trade.
- **Schema additions, even non-breaking, document a contract.** Future runner refactors must preserve the cost field shape OR explicitly bump `schema_version`. Captured in implementation PR's test plan.

Neutral:

- Cost field is optional on every code path; consumers see no behavior change until they opt in.
- Native JSON parsing adds ~5-10 lines of code path; modest engineering surface.

## Implementation gate

Per ADR #0005: the discriminating-eval test (Section 5 above) must exist + RED on a stubbed-broken implementation + GREEN on the live one before this ADR moves to Accepted.

Implementation PR test plan MUST include:

- [ ] Unit test: native cost-capture path (fake driver emits canned JSON)
- [ ] Unit test: cost-capture-failed path (fake driver emits text, `cost === null`)
- [ ] Unit test: dry-run path (`cost === undefined`)
- [ ] Schema-compat test: old-format `EvalResult` without `cost` field still parses
- [ ] **Paid smoke (cost-gated):** one `claude --print --output-format json` invocation against the cheapest eval to verify JSON field names. Failure of this smoke = exact field-name reality differs from ADR assumption = revise capture parsing before merge.

## SME Audit (added 2026-05-20)

User requested architect + Anthropic-SME review prior to merge. Findings revised the original proposal as below.

### Finding 1: ROI claim was overstated

Original ADR claimed "unbounded-positive ROI." The #0016 audit cycle was caught using pricing tables + session-volume guesses — no per-eval cost data required. **Cost telemetry sharpens ROI math; it does not enable it.** Revised ADR scopes the value claim to two concrete benefits:
- Per-eval cost surfacing for top-N expensive-eval triage (today invisible)
- Sharpening (not enabling) future optimization ROI math

### Finding 2: Tier-analogy was wrong

Original ADR described cost as "a natural fourth tier alongside Structural / Text / Diagnostic." Those are assertion-tier categories (pass/fail criteria); cost is a measurement. The analogy is incoherent. Removed from revised ADR.

### Finding 3: Estimation fallback is structurally unreliable

Original ADR proposed char-count × tier-pricing fallback when native cost is unavailable. Anthropic-SME audit findings:

- **Prompt caching** offers up to 90% input-token discount. Char-count estimation cannot model cache hits → systematic overcount of 5-10× on cache-heavy workloads (which evals tend to be, since prompts repeat across the suite).
- **Extended thinking tokens** are not visible in stdout; estimation cannot count them → systematic undercount when thinking is enabled.
- **Batch API** offers 50% discount (eval suites likely don't use batch, but worth noting).
- Combined error: estimation could be off by 5-10× in either direction depending on cache hit rate and thinking usage.

A cost number that is unreliable by 5-10× is worse than no cost number, because consumers will treat the number as authoritative. **Drop estimation entirely.** Make cost field `null` when CLI doesn't emit it. Future ADR may revisit estimation if a relative-comparison-within-session use case is identified.

### Finding 4: CLI version-skew worst case under-addressed

Original ADR mentioned version coupling but did not specify behavior when `--output-format json` shape changes. Revised: explicit `cost: null` + single stderr warning per run; display omits cost lines for affected evals. Periodic paid-smoke item flags drift.

### Finding 5: Engineering cost not stated

Original ADR omitted engineering hours. Revised estimate (informational, not a gate):
- Spawn invocation + JSON parse path: ~1.5-2 hr
- Cost aggregation across multi-turn + concurrency: ~1 hr (substrate from PR #363 already supports per-eval results)
- Display lines + conditional emission: ~30 min
- 4 unit tests + paid smoke: ~1.5 hr
- Total: ~4.5-5 hr engineering + ~$0.10-0.50 paid smoke

Value: enables top-N expensive-eval triage (today impossible) + sharpens ROI math for future ADRs (today rough). Hard to quantify directly; reasonable judgment is "worth it for substrate that runs forever."

### Finding 6: Per-axis decomposition discipline applied

Per #0016 lessons, original ADR bundled four axes:
- a) Schema additions
- b) Capture path (native)
- c) Estimation fallback
- d) Display

Revised: (c) is dropped per Finding 3. (a) + (b) + (d) remain tightly coupled (display requires capture, capture requires schema) so they ship together. If implementation PR finds (d) controversial, it can ship as a follow-up with conditional emission flag.

## Lessons applied from prior ADRs

- **From #0015 (Accepted):** discriminating eval substrate is non-negotiable; this ADR specifies the test signature up front.
- **From #0016 (Rejected):** ROI math is the first audit, not the last. SME audit caught the overclaim before merge — exactly the discipline #0016 lacked.
- **From #0006 / `per_gate_floor_blocks_substitutable.md`:** decomposed audit (per-axis verdict) catches bundled-decision defects. SME audit dropped one axis (estimation) and kept three.

## References

- Baseline: `docs/superpowers/decisions/2026-05-20-token-determinism-baseline.md` (determinism risk #1)
- PR #363 — eval-runner concurrency, the substrate this builds on
- [ADR #0005](./0005-behavioral-adr-promotion-requires-discriminating-signal.md) — discriminating-signal requirement
- [ADR #0009](./0009-eval-runner-v2-canonical.md) — eval-runner-v2 canonical substrate
- [ADR #0015](./0015-split-rules-readme-governance-from-operations.md) — accepted analogous baseline candidate (structural)
- [ADR #0016](./0016-compress-pr-validation-overlapping-sections.md) — rejected wording ADR; cost-telemetry gap is one piece of what made the audit cycle expensive
- `tests/EVAL_BASELINE.md` — current pass-rate tracking surface (complementary to cost tracking)
- `tests/evals-lib.ts` — `EvalResult` type, `loadEvalFile` contract, Phase 1m validator
