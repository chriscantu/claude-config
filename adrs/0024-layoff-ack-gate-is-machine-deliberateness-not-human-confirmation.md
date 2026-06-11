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

The gate's threat model is **accident / casualness**, not an adversarial orchestrator (the latter is conceded out of scope in Consequences, Negative). Two of the rejections below were initially argued on adversarial-circumvention grounds — the wrong axis. Re-argued here against accident, the honest reason each is still rejected is **marginal gain over the confirmation SKILL.md already requires, at a friction/fragility cost** — not "theater." Note the existing baseline: `acknowledged:true` is already prose-bound to an explicit conversational confirmation in which the user sees the named people and the NDA-workspace gravity. Each option below is evaluated as *what it adds over that conversational confirm, against accident*.

1. **Confirm-token** (user types `CONFIRM-LAYOFF-<cut-person>`, scorer validates shape) — against an adversary, theater (the LLM knows the format and can fabricate it). Against accident, a ceremony token would raise deliberateness by forcing the named person to be echoed back. But the user already gave a deliberate conversational confirm; a token adds a transcription step for marginal accident-prevention over that. Rejected on cost vs marginal gain, **not** as theater.
2. **Interactive stdin/TTY prompt in the scorer** — non-viable. The scorer is invoked by the LLM orchestrator via `bun run`, with no human TTY attached; an interactive prompt breaks the invocation model. (Becomes viable only if part of this flow moves to a human-driven CLI — see Revisit triggers.)
3. **Out-of-band human-created file** (user runs `!touch` themselves, scorer checks mtime) — against an adversary, circumventable (the LLM has Write). Against accident, a user-typed shell command IS a genuine second factor — the human's own keystroke, not the LLM's. It is rejected on **friction/fragility vs marginal gain**: it adds a mandatory shell step to every layoff model and introduces mtime/clock-skew fragility (cf. cold-wake timing), again for marginal accident-prevention over the conversational confirm already required. Explicitly NOT rejected on adversarial-circumvention grounds — that is the wrong axis for this gate's threat model.
4. **True enforcement boundary** — not achievable without leaving the filesystem/LLM architecture; that is a different product, out of scope for the ramp toolkit.

The retained claim is therefore precise: this is the strongest gate the architecture supports **without adding per-use human friction beyond the conversational confirm**. Option #3 could raise the accident bar marginally further at a friction/fragility cost judged not worth it; that trade is recorded here rather than asserted away.

Two adjacent, actionable items were split out rather than bundled:

- **Guard hardening (done in this change).** The gate check was tightened from falsy `!spec.acknowledged` to strict `spec.acknowledged !== true` (security finding F4). Both are fail-closed on a field-absent spec today, but the strict form is resistant to a future refactor that inverts the guard to `=== false` (which would silently admit field-absent specs). A regression test pins field-absent → exit 65.
- **Named-individual persistence (deferred to #473).** Security finding F3 (the persisted artifact and its slug embed real names with only a prose review gate) is a cross-cutting slug-convention question touching the 2a/2b-i modes (`<hire>-add`, `<person>-reporting`), not a 2b-ii cleanup. It gets its own decision rather than a rushed one-off. **Seam ownership:** the worst case — a named-individual artifact persisted on a falsely-flipped flag — sits between the risk accepted *here* (the flag) and the names deferred *there* (#473). #473 explicitly inherits this ADR's residual risk and owns that combined case; neither decision may assume the other covers it.

## Consequences

Positive:

- **The strongest zero-added-friction gate the architecture supports is in place and honestly labeled.** The machine guarantees a layoff projection is impossible without a deliberate `acknowledged:true` flag-flip — the exact "accidental or casual layoff modeling" failure the systems-analysis named is closed. (A higher-friction option could raise the accident bar marginally further — see the Decision's mitigation analysis — at a cost judged not worth it.)
- **The documented claim matches reality.** `scenario-checks.md` states the machine "CANNOT verify a human actually confirmed... no false claim of full enforcement," and the SKILL.md `description` was corrected (finding F2) to add the "machine-enforced deliberateness; human confirm is prose-bound" caveat to the authoritative routing surface.
- **No theater shipped.** Effort was not spent on circumventable hardening that would imply an enforcement boundary that does not exist.

Negative / residual risk (accepted):

- **A prompt-injection in `structure.md` or the conversational intake could induce the LLM to set `acknowledged:true` without a real human confirm.** The machine cannot detect this. This is the irreducible residual risk of self-attestation in an LLM-driven skill; it is accepted, not mitigated.
- **The bar against a determined or compromised orchestrator is low** — one boolean the prose-bound actor controls. The gate defends against accident and casualness, not against an adversarial actor in the orchestration loop.
- **Precedent scope (bounded, stated to prevent inheritance).** This ADR narrows the systems-analysis "REAL gate, not prose" requirement to "machine-enforced deliberateness, honestly labeled" — ONLY for this operation, ONLY under the pure-filesystem/LLM constraint. It is NOT a general license. A future sensitive gate where a true enforcement boundary IS achievable must build that boundary, not cite #0024 for self-attestation. Do not generalize the floor past the constraint that forced it.

Neutral:

- If the toolkit ever moves part of this flow out of the pure filesystem/LLM model (e.g. a real CLI a human drives directly), option 2 (TTY confirm) becomes viable and this ADR should be revisited.

## Revisit and detection triggers

An accepted-risk ADR needs a signal that the risk fired, not just an acceptance. The residual risk here is a layoff artifact persisted on a flag flipped without a real human confirm.

- **Detection (post-hoc) — currently absent, cheap to add.** The persisted artifact does NOT record the confirmation exchange, so a falsely-flipped flag is indistinguishable from a legitimately-confirmed one after the fact. The recommended first hardening if this risk ever becomes a concern: have SKILL.md step 8 embed a short confirmation-provenance line in the artifact, making a false flag detectable. Noted, not done here.
- **Revisit triggers:** (a) any observed layoff artifact whose transcript shows no explicit user confirmation; (b) the toolkit moving part of this flow to a human-driven CLI (unblocks option 2); (c) a second sensitive operation needing a gate — at which point the bounded-precedent question above must be answered for that operation, not inherited from this one.

## References

- Spec: `docs/superpowers/specs/2026-06-09-org-design-scenario-modeling-phase-2b-ii-design.md` (§Machine ack gate — "the strongest gate the filesystem/LLM architecture supports")
- Commit `b4d805b` — Phase 2b-ii implementation (Re #35)
- `skills/org-design/scripts/scenario-scorer.ts` — gate at the `reduce-headcount` case in `applyMutation`
- `skills/org-design/scenario-checks.md` — the honest machine-vs-prose boundary doc
- Issue #35 — `/org-design` scenario modeling (parent, open through 2b-iii)
