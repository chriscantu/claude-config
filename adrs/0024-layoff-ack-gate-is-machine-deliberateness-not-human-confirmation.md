# ADR #0024: The layoff-acknowledgment gate enforces machine deliberateness, not human confirmation

Date: 2026-06-10

## Responsible Architect
Cantu

## Author
Cantu

## Contributors

* Claude (design partner)
* security-adversary swarm worker (finding source)

## Lifecycle
POC

## Status
Accepted

## Context

`/org-design` Phase 2b-ii (`reduce-headcount`, commit `b4d805b`, Re #35) added a machine layoff-acknowledgment gate: `applyMutation`'s `reduce-headcount` case throws unless `spec.acknowledged === true`, and the CLI maps that throw to exit 65. The gate exists because modeling a layoff persists named individuals and a cut decision into an NDA workspace — the systems-analysis for 2b flagged this as the highest-sensitivity item and demanded "a REAL gate, not prose."

A post-implementation security review (3-critic ruflo swarm) surfaced a structural finding (F1):

> The machine gate checks one thing: `spec.acknowledged === true`. The actor that writes that flag is the LLM orchestrator itself (SKILL.md: "Only on confirm, set `acknowledged: true`"). There is no second factor — no human-entered token, no hash of a confirmation string, no out-of-band signal the scorer can independently check. The gate raises the bar from "zero deliberateness" to "one boolean the prose-bound actor controls." That is genuinely stronger than nothing, but it is structurally a self-attestation, not an enforcement boundary.

This ADR records the conscious acceptance of that residual risk and the reasoning for not pursuing an in-architecture "fix."

Forces in tension:

- **True enforcement vs the filesystem/LLM architecture.** A real enforcement boundary requires an out-of-band human signal the machine can verify independently. In a skill where the LLM is both the actor that sets the flag and the enforcer of the human-confirm prose, no such signal exists without leaving the architecture.
- **Marginal hardening vs theater.** Several "stronger gate" options raise the bar by a hair while adding real complexity and a false sense of enforcement.
- **Honesty of the documented claim.** Whatever the gate does, the docs must not overclaim it.

## Decision

We **accept the self-attestation residual risk** and do not pursue an in-architecture enforcement boundary. The gate is documented as machine-enforced *deliberateness* plus prose-enforced *human confirmation* — explicitly not full machine enforcement.

Mitigation options were enumerated and rejected as either theater or non-viable:

1. **Confirm-token** (user types `CONFIRM-LAYOFF-<x>`, scorer validates shape) — rejected as theater. The LLM knows the token format and can fabricate it; marginal bar-raise for real complexity.
2. **Interactive stdin/TTY prompt in the scorer** — rejected as non-viable. The scorer is invoked by the LLM orchestrator via `bun run`, with no human TTY attached; an interactive prompt breaks the invocation model.
3. **Out-of-band human-created file** (user runs `touch` themselves, scorer checks mtime) — rejected. The LLM has the Write tool and can create the file itself; making it truly out-of-band requires a user shell action that adds friction and clock-skew fragility (cf. cold-wake timing) for a still-circumventable bar.
4. **True enforcement boundary** — not achievable without leaving the filesystem/LLM architecture; that is a different product, out of scope for the ramp toolkit.

Two adjacent, actionable items were split out rather than bundled:

- **Guard hardening (done in this change).** The gate check was tightened from falsy `!spec.acknowledged` to strict `spec.acknowledged !== true` (security finding F4). Both are fail-closed on a field-absent spec today, but the strict form is resistant to a future refactor that inverts the guard to `=== false` (which would silently admit field-absent specs). A regression test pins field-absent → exit 65.
- **Named-individual persistence (deferred to an issue).** Security finding F3 (the persisted artifact and its slug embed real names with only a prose review gate) is a cross-cutting slug-convention question touching the 2a/2b-i modes (`<hire>-add`, `<person>-reporting`), not a 2b-ii cleanup. It gets its own decision rather than a rushed one-off.

## Consequences

Positive:

- **The strongest gate the architecture supports is in place and honestly labeled.** The machine guarantees a layoff projection is impossible without a deliberate `acknowledged:true` flag-flip — the exact "accidental or casual layoff modeling" failure the systems-analysis named is closed.
- **The documented claim matches reality.** `scenario-checks.md` states the machine "CANNOT verify a human actually confirmed... no false claim of full enforcement," and the SKILL.md `description` was corrected (finding F2) to add the "machine-enforced deliberateness; human confirm is prose-bound" caveat to the authoritative routing surface.
- **No theater shipped.** Effort was not spent on circumventable hardening that would imply an enforcement boundary that does not exist.

Negative / residual risk (accepted):

- **A prompt-injection in `structure.md` or the conversational intake could induce the LLM to set `acknowledged:true` without a real human confirm.** The machine cannot detect this. This is the irreducible residual risk of self-attestation in an LLM-driven skill; it is accepted, not mitigated.
- **The bar against a determined or compromised orchestrator is low** — one boolean the prose-bound actor controls. The gate defends against accident and casualness, not against an adversarial actor in the orchestration loop.

Neutral:

- If the toolkit ever moves part of this flow out of the pure filesystem/LLM model (e.g. a real CLI a human drives directly), option 2 (TTY confirm) becomes viable and this ADR should be revisited.

## References

- Spec: `docs/superpowers/specs/2026-06-09-org-design-scenario-modeling-phase-2b-ii-design.md` (§Machine ack gate — "the strongest gate the filesystem/LLM architecture supports")
- Commit `b4d805b` — Phase 2b-ii implementation (Re #35)
- `skills/org-design/scripts/scenario-scorer.ts` — gate at the `reduce-headcount` case in `applyMutation`
- `skills/org-design/scenario-checks.md` — the honest machine-vs-prose boundary doc
- Issue #35 — `/org-design` scenario modeling (parent, open through 2b-iii)
