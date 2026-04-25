# ADR #0008: Trivial/Mechanical tier and execution-mode sizing guard

Date: 2026-04-25

## Responsible Architect
Cantu

## Author
Cantu

## Contributors

* Claude (design partner)

## Lifecycle
POC

## Status
Accepted (2026-04-25)

## Context

Planning pipeline (`rules/planning.md`: DTP → SA → Solution Design → FMS)
HARD-GATEs fire for ALL work above bug-fix tier. Scope Calibration tops out
at Prototype/POC with full-pass DTP + SA. No tier accommodates "small new
feature, obvious single approach, low blast radius."

Concrete instance: [PR #131](https://github.com/chriscantu/claude-config/pull/131)
(closes [#129](https://github.com/chriscantu/claude-config/issues/129)) shipped
~150 LOC of functional code through 7 subagent implementers + 5 reviewers + a
fix subagent + an 860-line spec+plan deleted before merge. ~5x token cost vs
need. Pipeline was designed for ambiguous or high-blast-radius work; a 150-LOC
reporting tweak with one obvious design is neither.

Per-task 2-stage review under `superpowers:subagent-driven-development` also
failed to catch 2 acceptance-criteria gaps in PR #131 — only the final
cross-task review caught them. Per-task gates didn't pay for themselves at
this size.

Two coupled failure modes:
1. **Planning-pipeline ceremony cost** mismatched to feature cost (no
   Trivial tier).
2. **Execution-mode ceremony cost** mismatched to plan size (subagent-driven
   per-task review on small mechanical tasks).

## Decision

Two-part change, single PR:

**Part 1 — `rules/planning.md` Scope Calibration adds Trivial/Mechanical tier.**
Tier qualifies ONLY when ALL four criteria hold:

- ≤ ~200 LOC functional change
- Single component / single-file primary surface
- Unambiguous approach (one obvious design, no viable alternatives worth weighing)
- Low blast radius (no cross-team / cross-system effects)

Tier behavior: skip DTP, 60s SA scan only, skip brainstorming, skip FMS,
prefer single-implementer execution mode. `goal-driven.md` and
`verification.md` STILL apply.

**Part 2 — `rules/execution-mode.md` (new HARD-GATE) wraps subagent-driven-dev.**
Sizing guard: subagent-driven mode requires ≥5 tasks AND ≥2 files AND ≥300 LOC
OR integration coupling. Otherwise single-implementer + single final review.
Controller announces selected mode + rationale before first dispatch.

Pressure-framing floor applies to both via the DTP per-gate anchor (per ADR
#0006 rejection and memory `per_gate_floor_blocks_substitutable.md` —
per-gate floor blocks are substitutable, not layered).

Trivial-tier criteria are stated canonically in `planning.md`. Other rules
(`think-before-coding.md`, `execution-mode.md`) reference but do not restate
to prevent drift.

## Alternatives Considered

**A. Single-tier with named-cost downgrade per gate.** User states "skip
DTP for this small change, I accept <cost>" at each gate. Rejected:
forces named-cost emission on every small task, defeats the goal of
right-sizing ceremony to feature cost. The named-cost mechanism is
designed for genuine override of safety, not for routine sizing.

**B. Tier auto-detection by static analysis.** Claude inspects the
prompt + a quick repo probe to classify tier. Rejected: subjective
criteria ("unambiguous approach") cannot be reliably auto-detected.
Hardcoding the criteria as a checklist the controller applies is more
honest about the judgment call.

**C. Hardcoded thresholds vs externalized config.** Thresholds (200 LOC,
300 LOC, 5 tasks, 4 tasks) live inline in markdown rules. Rejected
externalizing to YAML/JSON: premature; no second consumer of the
thresholds, no observed need to tune frequently. Revisit if threshold
churn appears in commit log.

**D. Per-gate Trivial-tier carve-outs in each HARD-GATE rule.** Update
`fat-marker-sketch.md`, `superpowers:brainstorming`, etc. each to
enumerate Trivial-tier in their skip lists. Rejected for two reasons:
(1) plugin-cached skills (brainstorming) are not directly editable
without a wrapping rule; (2) per ADR #0006 + memory
`per_gate_floor_blocks_substitutable.md`, per-gate duplication adds zero
eval-measurable load when an anchor is present. Tier carve-out is
asserted from `planning.md` as the pipeline-controller's authority over
which gates fire.

## Consequences

**Positive:**
- Right-sized ceremony for small-feature work. Estimated ~5x token
  reduction on tasks like PR #131.
- Single-implementer execution mode removes per-task gates that
  empirically miss cross-task defects (per PR #131: 5 of 7 per-task
  reviews returned clean approval; the 2 missed AC gaps surfaced only
  in final review).
- Pressure-framing floor inherited from DTP anchor — no new bypass
  surface introduced.

**Negative:**
- Tier criteria are subjective at runtime ("unambiguous approach" is
  judgment, not measurement). Mitigation: three of four criteria are
  measurable from prompt/quick probe (LOC, file count, blast radius).
- Adding a fifth tier requires synchronized edits to `planning.md`,
  `think-before-coding.md`, `execution-mode.md`. Acceptable until a
  fifth tier is contemplated.
- No telemetry on Trivial-tier fire rate. Future threshold tuning is
  unguided; depends on user observation in real use.

**Promotion conditions (POC → Accepted permanent):**
- ≥3 distinct sessions where Trivial-tier fires correctly on genuine
  small-feature work AND the pipeline does NOT fire on standard work.
  PR #131-class instances are the discriminating signal.
- No observed false-positive Trivial classifications causing missed
  blast-radius checks.
- Eval suite extended with 3-of-4 boundary discrimination (currently
  deferred — see PR #134 review).

**Rejection conditions:**
- Trivial-tier exploited as a routine bypass (pressure framings
  consistently routed as Trivial).
- Bug class observed where missing DTP/SA on Trivial-classified work
  caused production issue.
- Drift across `planning.md` / `think-before-coding.md` /
  `execution-mode.md` despite "do not restate" markers (would indicate
  the canonical-source pattern is insufficient — needs lint check
  promoted from suggestion to enforcement).

## References

- [PR #131](https://github.com/chriscantu/claude-config/pull/131) — concrete
  instance of cost mismatch
- [Issue #132](https://github.com/chriscantu/claude-config/issues/132) —
  Trivial/Mechanical tier
- [Issue #133](https://github.com/chriscantu/claude-config/issues/133) —
  execution-mode sizing guard
- [PR #134](https://github.com/chriscantu/claude-config/pull/134) —
  implementation
- [ADR #0005](./0005-behavioral-adr-promotion-requires-discriminating-signal.md)
  — discriminating-signal requirement (applies to promotion conditions above)
- [ADR #0006](./0006-systems-analysis-pressure-framing-floor.md) — rejection
  established that per-gate floor blocks are substitutable; this ADR honors
  that pattern
- Memory `per_gate_floor_blocks_substitutable.md` — anchor-and-link pattern
- Memory `feedback_right_size_ceremony.md` — captured the lesson
