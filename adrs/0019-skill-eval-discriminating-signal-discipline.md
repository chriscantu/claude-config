# ADR #0019: Skill-layer evals carry the same discriminating-signal discipline as rule-layer evals, and stay colocated under `skills/<name>/evals/`

Date: 2026-05-21

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

[ADR #0005](./0005-behavioral-adr-promotion-requires-discriminating-signal.md)
established discriminating-signal discipline for behavioral ADRs: a required-tier
assertion in a regression eval must distinguish a deliberately broken implementation
(RED) from a passing one (GREEN) at the ADR's specific boundary. `rules-evals/`
inherited this discipline through the
[2026-04-23 clarification](./0005-behavioral-adr-promotion-requires-discriminating-signal.md#clarification-2026-04-23-discrimination-must-be-at-the-adrs-specific-boundary)
that tightened scope to "the ADR's specific boundary."

Skill-layer evals (`skills/<name>/evals/evals.json`) currently exist for 7 skills —
`architecture-overview`, `define-the-problem`, `fat-marker-sketch`, `glossary`,
`sdr`, `strategy-doc`, `systems-analysis` — and all 7 carry required-tier
assertions in practice. The discipline is *applied* but not *written down* as
policy. Three concrete consequences:

- A new skill's eval suite has no obligation to ship discriminating signal at
  the skill's behavioral boundary — only a JSON-shape obligation enforced by
  `validate.fish` Phase 1m.
- The "skills are the product surface" framing (issue #379) means behavioral
  drift here ships directly to users, yet the layer carries no formal
  discrimination guarantee.
- The natural reading of #379 was to mirror `rules-evals/` structurally — a new
  top-level `skills-evals/` root. That reading rests on the assumption that
  `rules-evals/`'s sibling-root layout is inherently better, which is false:
  [`rules-evals/README.md`'s "Why a sibling root rather than `skills/`"](../rules-evals/README.md#why-a-sibling-root-rather-than-skills)
  documents the layout was forced by `install.fish`/`bin/link-config.fish`
  symlinking every `skills/` subdir as a real skill that requires `SKILL.md`
  frontmatter — a constraint that does not apply to skill evals living *inside*
  a real skill.

Forces in tension:

- **Layout symmetry vs. colocation.** Sibling-root `skills-evals/` symmetrizes
  the layout against `rules-evals/`. Colocated `skills/<name>/evals/` symmetrizes
  the skill (skill code + skill evals together) and avoids 7 migration moves +
  runner-root expansion + cross-link rewrites.
- **Policy formalization vs. churn.** The discriminating-signal discipline can
  be formalized without moving any file. Moving files to formalize policy is
  cost without benefit when the policy is location-agnostic.
- **Forward enforcement vs. retrofit.** New skill-eval suites can be required to
  ship required-tier signal from day one. Existing 7 suites already comply, so
  no retrofit cost.

## Decision

Three concrete pieces:

1. **Skill-layer evals carry the same discriminating-signal discipline as
   rule-layer evals.** Every `skills/<name>/evals/evals.json` MUST contain
   at least one `"tier": "required"` assertion across its evals[] array. The
   required assertion(s) must discriminate at the skill's behavioral boundary
   per ADR #0005's
   [2026-04-23 clarification](./0005-behavioral-adr-promotion-requires-discriminating-signal.md#clarification-2026-04-23-discrimination-must-be-at-the-adrs-specific-boundary)
   — removing the skill's load-bearing state must turn the required-tier
   assertion red.

2. **Skill evals stay colocated under `skills/<name>/evals/`.** Issue #379's
   literal proposal — a new top-level `skills-evals/` root mirroring
   `rules-evals/` — is rejected. The sibling-root layout for `rules-evals/` was
   forced by the `SKILL.md` frontmatter constraint on `skills/` subdirs, a
   constraint that does not apply when the evals live *inside* a real skill
   directory whose `SKILL.md` already exists. Migration would move 7 suites,
   add a third root to `eval-runner-v2.ts`, and force cross-link rewrites
   against `tests/EVALS.md` and the existing `rules-evals/README.md` coverage
   map — all without behavioral benefit.

3. **Enforcement is mechanical.** `validate.fish` Phase 1r (new) fails when any
   `skills/<name>/evals/evals.json` contains zero required-tier assertions.
   This is the skill-layer mirror of `rules-evals/` discipline: Phase 1m
   already enforces JSON shape parity across both roots; Phase 1r adds the
   discriminating-signal-presence check.

**Scope of "discriminating signal":** identical to ADR #0005. Structural channels
(`tool_input_matches`, `skill_invoked_in_turn`, `chain_order`) preferred;
text-marker required assertions acceptable only where substrate cannot emit
structural signal, with the limit named in the skill's eval description.

We will **not** build:

- A top-level `skills-evals/` directory. Rejected per above.
- Automated discrimination demonstration (RED-commit / GREEN-commit pair) on
  every skill-eval. ADR #0005's discrimination-demo gate applies at behavioral
  *ADR promotion* time, not at every eval edit. Phase 1r enforces *presence* of
  required-tier signal, not its discriminating power — that remains a review
  standard.
- A separate skill-eval template or schema. The `tests/eval-runner-v2.ts`
  schema already supports the `tier` field across both roots; no new substrate
  required.

## Consequences

**Positive:**

- **Formalizes existing practice.** All 7 current skill-eval suites already
  carry required-tier assertions. ADR encodes what is, prevents drift toward
  what wasn't.
- **Avoids 7-suite migration cost.** No file moves, no runner-root expansion,
  no cross-link rewrites. Issue #379's acceptance reframed (sibling root → in-place
  discipline + validator + ADR) absorbs the substantive intent without the churn.
- **Phase 1r catches regressions cheaply.** A new contributor adding a
  regex-only eval suite gets blocked at `validate.fish` time, not at first
  user-visible behavioral drift.
- **Symmetry preserved where it matters.** Skill-eval discipline = rule-eval
  discipline via shared ADR #0005 lineage; layout symmetry sacrificed because
  the sibling-root rationale doesn't apply to skill evals.

**Negative:**

- **Layout asymmetry.** Readers familiar with `rules-evals/` may expect a
  matching `skills-evals/` root. Mitigation: `tests/EVALS.md` gains a
  Skill-Layer Suite Inventory section explicitly explaining the colocation
  choice + linking this ADR.
- **No discrimination *demonstration* required at eval-add time.** Phase 1r
  enforces required-tier *presence*, not its load-bearing power. A contributor
  could in principle add a required-tier assertion that always passes (e.g., a
  trivial structural check satisfied by any output). Mitigation: review
  standard from ADR #0005 still applies; this is the same trade-off
  `rules-evals/` already accepts.
- **Inventory drift risk.** The new `tests/EVALS.md` Skill-Layer Suite
  Inventory section can drift from on-disk reality (parallel to Phase 1p for
  `rules-evals/README.md`). Phase 1p-equivalent for the skill inventory is
  out of scope for this ADR; tracked as a follow-up if drift surfaces.

**Neutral:**

- **No change to `eval-runner-v2.ts`.** Both roots already discovered at
  startup; no new wiring needed.
- **No change to skill structure.** `skills/<name>/evals/evals.json` continues
  to be the canonical home; this ADR adds policy, not files.

## Implementation notes (non-binding)

If this ADR is accepted, the implementation likely touches:

1. `validate.fish` — new Phase 1r: scan `skills/*/evals/evals.json`; fail if any
   file has zero `"tier": "required"` occurrences across its `assertions[]`
   entries. Modeled on Phase 1m's discovery pattern. Hard-fail (consistent
   with 1m/1n/1p).
2. `tests/validate-phase-1r.test.ts` — regression coverage with synthetic
   fixtures: one suite with required-tier passes; one without fails.
3. `tests/EVALS.md` — new "Skill-Layer Suite Inventory" section mirroring
   `rules-evals/README.md`'s "Current suites:" list, plus a paragraph
   explaining the colocation choice (with link back to this ADR).
4. `rules/README.md` — append Phase 1r row to the validate.fish phase
   inventory table in the "Verifying the install" section.

## Promotion criteria

This ADR is **non-behavioral** (a governance/process decision about where evals
live and what they must contain). Per ADR #0005, non-behavioral ADRs are not
subject to the four-condition discrimination gate. It promotes from `Proposed`
to `Accepted` once:

- Phase 1r is implemented and passes against all 7 existing skill-eval suites
  without modification (proving the policy reflects current practice).
- A synthetic RED fixture (skill-eval suite with zero required-tier
  assertions) trips Phase 1r as expected (proving the validator discriminates).
- No issues surface during the shakedown pass that invalidate the policy's
  shape.

## Related

- [ADR #0005](./0005-behavioral-adr-promotion-requires-discriminating-signal.md) — parent discipline (behavioral ADR promotion gate).
- [Issue #379](https://github.com/chriscantu/claude-config/issues/379) — origin of this ADR. This ADR resolves #379 by reframing acceptance: in-place discipline + validator + ADR instead of literal `skills-evals/` sibling root.
- [`rules-evals/README.md`](../rules-evals/README.md) — sibling-root rationale for rule evals.
- [`tests/EVALS.md`](../tests/EVALS.md) — runner + schema + (new) skill-layer suite inventory.
