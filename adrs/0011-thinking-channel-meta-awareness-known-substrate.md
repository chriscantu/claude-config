# ADR #0011: Thinking-channel meta-awareness is a known substrate property; structural assertions are the mitigation

Date: 2026-04-28

## Responsible Architect
Cantu

## Author
Cantu

## Contributors

* Claude (design partner)

## Lifecycle
Stable

## Status
Accepted

## Context

[Issue #85](https://github.com/chriscantu/claude-config/issues/85) opened after
PR #77's live run when the `define-the-problem/bug-fix-skips-pipeline`
transcript began with prose like *"This is an eval test case for the
`define-the-problem` skill…"* — Claude detected eval framing and altered
visible output to match what it inferred the eval wanted. That broke
ecological validity for any regex-on-prose assertion: passing or failing for
the wrong reason.

Two changes since materially defused the original failure mode:

- **PR #93** (2026-04-17) — eval runs moved into a disposable `mkdtemp`
  scratch cwd with `--permission-mode bypassPermissions`. The repo-context
  tell that triggered the user-visible preamble is gone. No transcript since
  has reproduced the *"This is an eval test case…"* opener.
- **PR #89** (2026-04-17) and the v2 substrate ([ADR #0009](0009-eval-runner-v2-canonical.md))
  — assertions migrated off regex-on-prose to structural signals
  (`skill_invoked`, `not_skill_invoked`, `chain_order`,
  `skill_invoked_in_turn`, `tool_input_matches`). Structural assertions read
  the stream-json event channel, not prose.

The 2026-04-28 audit
([`docs/superpowers/audits/2026-04-28-thinking-channel-meta-awareness.md`](../docs/superpowers/audits/2026-04-28-thinking-channel-meta-awareness.md))
quantified the residual signal across all 1311 v2 transcripts:

- **2.14%** of transcripts contain meta-awareness in the `thinking` channel
- **0.46%** show execution-path divergence — meta-awareness AND a behavioral
  skip of a canonical skill step (e.g. brainstorming step 1, "Explore
  project context")
- Hot spots concentrate in `*-honored-skip-named-cost` fixtures where the
  prompt is short and the empty scratch cwd is itself the detection cue
  (max divergence: 12.5% on `sdr-routes-to-blueprint-for-reusable-pattern`,
  6.0% on `systems-analysis-honored-skip-named-cost`)

The detection signal moved from the user-visible prose channel into the
`thinking` channel. Structural assertions don't read `thinking`, so the
direct assertion-flip mechanism that motivated #85 is gone. What remains is
behavioral divergence: in the small set of cases where Claude infers eval
from the empty cwd, it sometimes short-circuits a canonical skill step. The
divergence reaches the visible output and CAN affect structural assertions
indirectly (e.g. a skipped tool call), but the audit shows assertion
correctness is largely preserved at current rates.

## Decision

Accept thinking-channel meta-awareness as a **known property** of the
current eval substrate. Document the property and the rates. Do not invest
in cwd-laundering decoys at the current divergence rate (0.46%). Add a
regression sentinel at the prose channel (covered separately in
[issue #190](https://github.com/chriscantu/claude-config/issues/190)) so
the leak that PR #93 fixed cannot silently re-emerge.

The mitigation strategy is:

1. **Structural assertions are the primary defense.** Continue migrating
   regex-on-prose assertions to `skill_invoked` / `chain_order` /
   `tool_input_matches` (per [issue #92](https://github.com/chriscantu/claude-config/issues/92)).
   These don't read `thinking`, so the residual leak does not flip them.
2. **`not_thinking_contains` regression sentinel ([issue #190](https://github.com/chriscantu/claude-config/issues/190))** —
   note honestly: this is regression insurance for the **prose-channel** leak
   that PR #93 fixed, NOT mitigation for the thinking-channel divergence this
   ADR is about. It catches re-emergence of the `"This is an eval test case…"`
   user-visible preamble; it does not reduce the 0.46% thinking-channel
   divergence rate. Listed here for completeness, not as cover.
3. **Behavioral divergence is recorded but not treated as a blocker — at
   current per-fixture rates.** Cross-reference with assertion outcomes (audit
   §"Per-fixture cross-reference"): all 6 divergent transcripts passed their
   required structural assertions. The structural-assertion set in
   [#92](https://github.com/chriscantu/claude-config/issues/92) does not
   currently assert "context-exploration step ran" — that gap is what
   makes the divergence invisible to the gate, not a guarantee that no
   ecological-validity loss occurred. Re-evaluation triggers (per-fixture):
   - **Reopen this ADR if any single fixture's divergence rate exceeds 10%**
     across N≥10 runs (current max: `sdr-routes-to-blueprint` at 12.5% / N=8 —
     under N threshold; `systems-analysis-honored-skip-named-cost` at 6.0% /
     N=50 — under rate threshold)
   - **Reopen if global divergence exceeds 1.0%** (currently 0.46%)
   - **Reopen if any structural assertion is shown to flip outcome on a
     divergent transcript** (audit shows zero such cases today)
   - Escalation path: targeted decoy on hot-spot fixtures (Option B-lite,
     ~1 hr) before full cwd-laundering.

## Why these and not others

- **Cwd laundering — full (all 13 affected fixtures)** — rejected at current
  rate. Costs 4-6 hours plus re-baselining plus ongoing decoy-pool
  maintenance. Decoys add their own cues (over-fit "fake project" shapes).
  Not worth it until per-fixture rates breach the thresholds in mitigation
  point 3.
- **Cwd laundering — targeted (Option B-lite, hot-spot fixtures only)** —
  deferred. Pre-seed only the 4 fixtures showing divergence today
  (`sdr-routes-to-blueprint-for-reusable-pattern`,
  `systems-analysis-honored-skip-named-cost`,
  `systems-analysis-sunk-cost-migration-multi-turn`,
  `define-the-problem-honored-skip-named-cost`) with a single decoy file
  (e.g. `README.md` + a stub source file). Estimated effort: ~1 hour.
  Deferred (not rejected) — preferred escalation path if any threshold in
  mitigation point 3 trips. Listed here so the abort plan has a concrete
  next move rather than "do something."
- **Reverting PR #93** — the empty cwd is part of the detection cue, but
  reverting #93 reintroduces the perm-gate hang fixed by #88 and the
  prose-channel preamble that was the original #85 failure mode. The
  trade-off favors the current state.
- **Asserting meta-awareness explicitly per #85's direction 3** — partially
  done via structural assertions. A per-eval `not_thinking_contains` covers
  the residual prose-channel leak; asserting "did skill complete the
  canonical path" is what `skill_invoked` and `chain_order` already do.

## Consequences

### Positive

- Documents the substrate property explicitly so future contributors don't
  re-discover it as a "weird Claude response" mystery.
- Sets per-fixture re-evaluation thresholds (mitigation point 3) so the
  abort plan can fire on hot-spot regressions, not just global drift.
- Closes #85 cleanly without forcing the cwd-laundering investment.

### Negative

- Accepts a measurable ecological-validity loss in eval results. The 6
  divergent transcripts represent skills running with one fewer step than
  they would in a real-user invocation. On hot-spot fixtures this is a
  6-12% rate, not a global 0.5% rate — eval consumers reading
  `*-honored-skip-named-cost` results should treat them as carrying a
  ~6% noise floor on canonical-step completion (see audit hot-spot table).
- Structural assertions don't currently check "context-exploration step
  ran." That coverage gap is what keeps divergent transcripts passing —
  closing it via a `did_invoke` / `chain_order` assertion would surface
  divergence as actual failures, raising the bar past "accept" to
  "fix or document per-fixture." Out of scope for this ADR; tracked
  conceptually under [#92](https://github.com/chriscantu/claude-config/issues/92).
- The `not_thinking_contains` sentinel ([#190](https://github.com/chriscantu/claude-config/issues/190))
  catches only canonical prose-channel phrases. Novel detection language
  (e.g. *"appears synthetic"*, *"this looks like a benchmark"*) slips past
  until a future audit catches it.

### Neutral

- Audit cadence: re-run when ANY of the following:
  - Eval substrate changes (`tests/eval-runner-v2.ts`, scratch-cwd setup,
    permission-mode flags)
  - **Claude model version bump** (Sonnet/Opus/Haiku minor or major) — model
    upgrades shift detection sensitivity without touching the runner; do
    not assume thinking-channel behavior is stable across versions
  - A specific eval shows unexplained variance vs. its historical pass rate
  - Quarterly cadence floor

## Validation

Audit reproducibility:

- Audit script captures the regex set in
  [`docs/superpowers/audits/2026-04-28-thinking-channel-meta-awareness.md`](../docs/superpowers/audits/2026-04-28-thinking-channel-meta-awareness.md).
- Re-running the audit against future transcript collections produces
  comparable rates if the substrate AND Claude model version are
  unchanged. The reopen thresholds in mitigation point 3 are canonical:
  any single fixture above 10% divergence at N≥10, OR global divergence
  above 1.0%, OR any divergent transcript flipping a structural
  assertion.

## References

- [#85](https://github.com/chriscantu/claude-config/issues/85) — original
  meta-awareness bug
- [#190](https://github.com/chriscantu/claude-config/issues/190) — follow-up
  for `not_thinking_contains` assertion (tracker)
- [#88](https://github.com/chriscantu/claude-config/issues/88), [PR #93](https://github.com/chriscantu/claude-config/pull/93)
  — scratch cwd + bypassPermissions
- [#86](https://github.com/chriscantu/claude-config/issues/86), [PR #89](https://github.com/chriscantu/claude-config/pull/89)
  — stream-json structural assertions
- [ADR #0009](0009-eval-runner-v2-canonical.md) — v2 substrate canonical
- [ADR #0010](0010-v1-eval-runner-removed.md) — v1 retired
- [`docs/superpowers/audits/2026-04-28-thinking-channel-meta-awareness.md`](../docs/superpowers/audits/2026-04-28-thinking-channel-meta-awareness.md)
  — supporting audit data
