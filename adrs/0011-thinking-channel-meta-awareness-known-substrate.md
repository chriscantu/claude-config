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
2. **`not_thinking_contains` regression sentinel** — extend the stream-json
   assertion lib to inspect `thinking` events and add per-eval asserts on
   the canonical detection phrases (`"eval environment"`, `"claude-eval-"`,
   `"this is an eval"`). Prevents the prose-channel leak from
   re-introducing itself; doesn't mitigate the underlying detection.
   Tracked in [issue #190](https://github.com/chriscantu/claude-config/issues/190).
3. **Behavioral divergence is recorded but not treated as a blocker.** The
   ~0.5% rate is below the noise floor of single-run eval variance. If
   future audits show the rate climbing, or if a specific assertion
   demonstrates flip behavior tied to thinking-channel detection, escalate
   to cwd-laundering (option B in the audit).

## Why these and not others

- **Cwd laundering (decoy fixtures)** — rejected at current rate. Pre-seeding
  the scratch cwd with realistic decoy files would plausibly drop the rate
  toward 0.1% but costs 4-6 hours plus re-baselining 13 affected fixtures
  plus ongoing maintenance of the decoy pool. Decoys add their own cues
  (over-fit "fake project" shapes). Not worth it until the rate climbs or
  a structural assertion fails because of divergence.
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
- Sets a measurable threshold (0.5% divergence, 2% meta-awareness) for when
  re-evaluation is warranted.
- Closes #85 cleanly without forcing the cwd-laundering investment.

### Negative

- Accepts a small, measurable ecological-validity loss in eval results.
  The 6 divergent transcripts represent skills running with one fewer step
  than they would in a real-user invocation.
- The `not_thinking_contains` sentinel only catches the canonical phrases.
  Novel detection language (e.g. *"appears synthetic"*) would slip past
  until a future audit catches it.

### Neutral

- Audit cadence: re-run when substrate changes, when a specific eval shows
  unexplained variance, or quarterly.

## Validation

Audit reproducibility:

- Audit script captures the regex set in
  [`docs/superpowers/audits/2026-04-28-thinking-channel-meta-awareness.md`](../docs/superpowers/audits/2026-04-28-thinking-channel-meta-awareness.md).
- Re-running the audit against future transcript collections produces
  comparable rates if the substrate is unchanged. A jump above 1.0%
  divergence reopens this ADR.

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
