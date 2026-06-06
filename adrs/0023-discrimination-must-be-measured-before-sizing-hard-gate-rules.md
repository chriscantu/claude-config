# ADR #0023: Discrimination must be measured with faithful injection before counting evals or sizing a HARD-GATE rule

Date: 2026-06-05

## Responsible Architect
Cantu

## Author
Cantu

## Contributors

* Claude (design partner)

## Lifecycle
GA

## Status
Proposed

## Context

Partially supersedes the `memory-discipline.md` row of
[ADR #0022](./0022-hard-gate-rule-mass-audit.md) (HARD-GATE rule-mass audit).
The rest of #0022 stands.

ADR #0022 audited the HARD-GATE rule set by **counting** required-tier evals
per rule. Its `memory-discipline.md` row judged the rule "size appropriate"
at 75 LOC and, on the basis that 4 required-tier evals was "single-digit,
below the universal-HARD-GATE bar," filed a follow-up (issue
[#425](https://github.com/chriscantu/claude-config/issues/425)) to "lift
eval coverage 4 → 8+."

A RED/GREEN discrimination audit of the suite (PR
[#461](https://github.com/chriscantu/claude-config/pull/461), 4 GREEN +
8 RED runs on 2026-06-05, subscription auth) surfaced facts not visible to a
count-based audit:

- The eval suite injected the stored memory via `scratch_decoy`, which writes
  files into the run's scratch cwd. The scratch cwd is **never auto-loaded**
  into model context — the model only sees those files if it happens to list
  the directory. The faithful simulation of auto-memory is `additional_context`,
  which wraps the entry in a `<system-reminder>` exactly as session-start
  auto-memory loads. Under the broken injection, the planted memory rarely
  reached the model, and evals passed on generic advice without exercising
  the rule. The eval **count** #0022 relied on was therefore measuring
  nothing about whether the rule changes behavior.
- After fixing injection (`scratch_decoy` → `additional_context` for all 8
  evals), only **2 of 8** scenarios discriminate — i.e., pass with the rule
  loaded and fail with it stripped: `feedback-default-cited` (a `feedback`
  memory that is a safe default but must be cited as stored, +50 points) and
  `verification-before-file-recommendation` (verify a named path before
  asserting it, +38 points). The other 6 pass with or without the rule —
  base model competence, not rule-induced.
- The rule was shrunk 75 → 26 LOC by removing the prose that fed only the 6
  non-discriminating scenarios (the `project`-decay point, Material Context
  Shift, Re-Challenge Contract, Relationship-to-Other-Rules, Scope). The
  minimal rule was verified GREEN 5/5 on both discriminators (Vitest 100%,
  lint 100%) — same or better than the full rule's Vitest 75% — establishing
  the removed prose as non-load-bearing.

This composes with [ADR #0019](./0019-skill-eval-discriminating-signal-discipline.md):
#0019 requires discriminating signal at a rule's boundary; this ADR records
that the **measurement instrument itself** (injection fidelity) must be
validated before the signal — or its absence — can be trusted.

## Decision

We will measure discrimination with faithful memory injection — and confirm
the injection path actually reaches model context — **before** counting evals
or sizing a HARD-GATE rule. Eval count is not a proxy for rule value; a
required-tier eval that passes identically with and without the rule provides
no signal regardless of how many such evals exist.

Concretely, for `memory-discipline.md`:

- The "size appropriate at 75 LOC" and "lift eval coverage 4 → 8+"
  recommendations in ADR #0022 are withdrawn. Issue #425 is closed by the
  opposite outcome.
- The rule is shrunk to its two load-bearing contracts (feedback-default
  provenance; file/function/flag verification) at 26 LOC.
- The suite is retiered to 2 required-tier (the discriminators) + 6
  diagnostic-tier (reported, non-gating), replacing the count-driven "8
  required" target.

For HARD-GATE rules generally: a sizing or eval-coverage decision must cite a
measured discrimination gap (GREEN pass-rate − RED pass-rate) produced under
verified-faithful injection, not an eval count.

## Consequences

- **Easier:** Future rule-sizing decisions have a sharper test — measured
  discrimination, not LOC or eval count. The injection-fidelity check
  (`additional_context` vs `scratch_decoy`) is now a named, reusable
  precondition for any memory-class eval.
- **Easier:** `memory-discipline.md` drops 49 LOC of per-session context load
  with no measured behavior loss.
- **Harder / cost:** Discrimination measurement is more expensive than
  counting — it requires GREEN and RED runs (rule loaded vs stripped), and
  text-tier evals are flaky enough to need 3–5× repeats. Count-based audits
  are cheaper but, as shown, can be wrong.
- **Negative — model-version coupling:** Discrimination was measured on Opus
  4.8. The 6 cut scenarios were base-competence **for this model**. A weaker
  or future model could regress on them, and the shrunk rule would no longer
  cover them. If the threat model includes weaker models, some of the cut
  prose may warrant restoration; this decision is reversible (re-expand the
  rule) but should be re-measured, not assumed.
- **Neutral — doc drift:** The shrink removed the rule's Scope section that
  [ADR #0020](./0020-memory-layer-primary-and-delegations.md) cross-references.
  No link breaks (no inbound anchors), and the rule still governs auto-memory
  MD; #0020's prose describing that section is now stale but not contradicted.
- **Neutral — partial supersede:** Only the `memory-discipline.md` row of ADR
  #0022 is withdrawn. The rest of the #0022 audit (other rules, the floor-trio
  cap-slot decision, the LOC-budget framing) is unaffected.

## Related

- [`rules/references/hard-gate-pattern-justification.md`](../rules/references/hard-gate-pattern-justification.md)
  — external grounding for the HARD-GATE pattern. This ADR's
  measure-before-sizing discipline is the "internal canary" that keeps
  the gate set on the correct side of the alert-fatigue anti-pattern
  boundary documented there.
