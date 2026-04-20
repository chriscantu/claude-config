# ADR #0005: Behavioral ADRs promote to Accepted only after a discriminating required-channel signal exists

Date: 2026-04-20

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

This repo's ADR template has a `Status` field with values `Proposed`, `Accepted`,
`Implemented`, `Deprecated`, `Superseded`. The transition from `Proposed` to
`Accepted` is currently a judgment call with no written criteria.

For ADRs that prescribe **behavioral guarantees** — assertions about how Claude
or the planning pipeline will act under specified inputs — this lack of criteria
has produced a recurring failure mode across
[#90](https://github.com/chriscantu/claude-config/issues/90) and its decision
docs (04-17 through 04-20):

- An ADR is drafted with a behavioral claim (e.g., [ADR #0004](./0004-define-the-problem-mandatory-front-door.md):
  "DTP is the mandatory front door").
- Implementation proceeds in parallel with status promotion.
- Regression evals later reveal the behavioral claim holds only partially, or
  only through fragile text proxies.
- The ADR is informally understood to be "mostly true" but its `Status` label no
  longer reflects the evidence.

The [2026-04-19 decision doc](../docs/superpowers/decisions/2026-04-19-multi-turn-eval-signal-channels.md)
surfaced a concrete proposal to close this gap: status promotion should depend
on whether a regression eval produces a *discriminating required-channel
signal* — a structural (non-text-proxied) signal that distinguishes a passing
implementation from a failing one under spoof-resistant conditions. The tiered-
channel assertion model (PR #107) shipped the substrate to express such signals;
the governance rule that uses it has not been written down.

This ADR formalizes that rule so future behavioral ADRs cannot quietly promote
ahead of evidence.

### Forces in tension

- **Aspirational ADRs vs. evidence-bound ADRs.** Some ADRs describe intent that
  shapes design direction before anything can be measured. Treating all ADRs as
  evidence-bound would block legitimate aspirational work.
- **Text proxies vs. structural signals.** An eval can assert "skill X fires" via
  a text marker (easy, brittle) or via a `tool_input_matches` structural channel
  (harder, spoof-resistant). Promotion criteria that accept text proxies leak
  false positives.
- **Multi-turn verification.** Some behavioral claims span turns (chain
  progression, resume behavior). A required signal that fires on turn 1 does not
  evidence turns 2-3. The rule must specify *across which turns* the signal must
  discriminate.
- **Lifecycle drift.** An ADR accepted under one substrate may become unverifiable
  if the substrate changes (e.g., a CLI behavior change breaks `--resume` signal
  re-emission). The rule must address demotion, not just promotion.

## Decision

Add a written promotion criterion to the ADR lifecycle. **Behavioral ADRs** — ADRs
whose `Decision` section asserts an observable claim about how Claude, the
planning pipeline, or any repo-owned skill/rule will behave under specified
inputs — promote from `Proposed` to `Accepted` **only when all four conditions
hold**:

1. **A regression eval exists** in `tests/` that exercises the claim.
2. **The eval's pass criterion depends on a required-tier assertion** (per the
   2026-04-19 tiered-channel model). Diagnostic-tier assertions do not qualify.
3. **The required assertion uses a structural channel** where one is available
   (`tool_input_matches`, `skill_invoked_in_turn`, `chain_order`). A text-marker
   required assertion is acceptable **only** on turns where the substrate
   demonstrably cannot emit a structural signal, and that limit must be named in
   the ADR's Consequences section.
4. **The eval discriminates.** A deliberately broken implementation of the
   behavioral claim produces a red required-tier result; the passing
   implementation produces green. The discrimination must be demonstrated, not
   asserted — e.g., a commit that implements the claim alongside a commit or
   branch that breaks it, with eval output from both.

ADRs that do **not** make behavioral claims (tooling adoption, governance,
process, decisions about what not to build) are not subject to this rule. They
promote under the existing judgment-call process.

**Demotion:** An `Accepted` or `Implemented` behavioral ADR is demoted to
`Proposed` if its discriminating eval degenerates — e.g., the required channel
becomes unreliable (substrate change, flake above an agreed threshold), or the
eval itself is removed without replacement. Demotion is a normal lifecycle
event, not a failure signal about the ADR's underlying idea.

**Scope marker:** ADRs subject to this rule carry a `## Promotion criteria` or
`## Evidence` section naming the eval path(s), the required-channel assertion(s),
and the discrimination demonstration. Absence of this section in a behavioral
ADR is itself a defect.

We will **not** build:

- An automated promotion checker. The criterion is a review standard, not a CI
  gate. Verification happens when the author moves the `Status` line.
- A separate "behavioral ADR" template. The existing template is extended with
  an optional section; the rule applies based on content, not template variant.
- Retroactive demotion of existing `Implemented` ADRs without review. See the
  Consequences section for how ADR #0004 specifically is affected.

## Consequences

**Positive:**

- **Closes a class of governance drift.** ADR #0004's experience — `Proposed`
  for weeks while behavioral evidence was ambiguous — becomes the explicit
  normal, not an accident. Status reflects evidence.
- **Forces eval-authoring earlier.** Authors drafting a behavioral ADR now have
  a visible next step (write the discriminating eval) rather than relying on
  post-hoc evidence.
- **Uses shipped infrastructure.** PR #106 and PR #107 produced the tiered-
  channel substrate this rule depends on. No new tooling required.
- **Makes text-marker fallbacks honest.** The rule doesn't ban text-marker
  required channels; it requires naming the substrate limit when one is used.
  That surfaces the "we're text-proxying this because `--resume` can't re-emit
  Skill" reality in the ADR itself.

**Negative:**

- **Raises cost of behavioral ADRs.** Drafting one now includes eval-authoring
  and a discrimination demo. Some ADRs that would have been drafted quickly and
  promoted on gut feel will either stay `Proposed` longer or not be filed at all.
  The latter is acceptable: if evidence can't be produced, the claim isn't
  reliable enough to promote anyway.
- **Retroactive ambiguity for existing ADRs.** ADR #0004 is `Proposed` and makes
  a behavioral claim. Under this rule it cannot promote until the 04-20
  escalation's three structural blockers (single-turn eval/ADR conflict, chain-
  progression via `--resume`, named-cost-skip substrate) resolve and a
  discriminating eval exists. That is the correct outcome — but it means #0004
  may stay `Proposed` indefinitely if those blockers are not worked.
- **Demotion is social overhead.** Moving an `Implemented` ADR back to `Proposed`
  is a visible reversal. Teams may under-demote to avoid the appearance of
  regression. Partial mitigation: the rule frames demotion as normal lifecycle,
  not failure.

**Neutral:**

- **No change to non-behavioral ADRs.** ADRs #0001 and #0003 (tooling/adoption
  decisions) are unaffected. The rule narrows cleanly to behavioral content.
- **No change to the ADR template.** The `## Promotion criteria` / `## Evidence`
  section is optional for non-behavioral ADRs and required for behavioral ones;
  the template itself doesn't need a new required field.

## Implementation notes (non-binding)

If this ADR is accepted, the implementation likely touches:

1. `adrs/0004-define-the-problem-mandatory-front-door.md` — add a `## Promotion
   criteria` section naming the evals that would discriminate it. Under current
   evidence (see the 04-20 escalation) none of them pass, so this ADR stays
   `Proposed`. That is the intended outcome.
2. A short note in `adrs/README.md` (or equivalent index, if one exists) stating
   the rule so future authors encounter it before drafting.
3. No changes to `rules/planning.md`, skills, or eval substrate. This is a
   governance rule, not a behavioral one — it applies to itself trivially
   (non-behavioral, so no discriminating eval required).

## Promotion criteria

This ADR is non-behavioral and therefore not subject to its own rule. It
promotes from `Proposed` to `Accepted` once the author has applied it to at
least one existing behavioral ADR (likely #0004) as a shakedown pass, and no
issues surface that invalidate the rule's shape.
