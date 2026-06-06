# ADR #0022: HARD-GATE rule-mass audit — apply cap discipline to LOC + treat floor-trio split as one cap slot

Date: 2026-05-24

## Responsible Architect
Cantu

## Author
Cantu

## Contributors

* Claude (design partner)

## Lifecycle
POC

## Status
Proposed — the `memory-discipline.md` row is partially superseded by [ADR #0023](./0023-discrimination-must-be-measured-before-sizing-hard-gate-rules.md) (count-based sizing overturned by measured discrimination). The rest of this audit stands.

## Context

Issue [#418](https://github.com/chriscantu/claude-config/issues/418)
asked for an audit applying the HARD-GATE cap discipline (ADR #340 /
`rules/GOVERNANCE.md` § HARD-GATE Cap) to **LOC**, not just to count.
Today's load is 1,183 LOC across the HARD-GATE rule set, loaded into
every session as system-prompt context. Every LOC has a token cost and
an attention cost on every turn for every user.

The audit also surfaced two structural findings that weren't part of
the original ask:

1. **Cap-policy drift.** The current `rules/README.md` "What lives
   here" table contains **10 HARD-GATE entries**, not 8. The drift came
   from PR #385 splitting the original `planning.md` into a trio
   (`planning-pipeline.md` + `skip-contract.md` +
   `pressure-framing-floor.md`) without updating the cap policy. The
   trio was a refactoring move, not three new rule promotions — but
   the cap counts files, not concepts.

2. **Eval-coverage gap.** 4 of the 10 HARD-GATEs have **zero direct
   eval suite** under `rules-evals/`: `planning-pipeline.md`,
   `skip-contract.md`, `pressure-framing-floor.md`,
   `fat-marker-sketch.md`. Three of these are the floor trio (covered
   *indirectly* by `scope-tier-memory-check` evals); one
   (`fat-marker-sketch`) is HARD-GATE-without-discriminating-signal,
   which ADR #0019 disallows for skills and arguably should disallow
   for rules.

## Decision

Three decisions, plus an audit table.

### Decision 1 — Treat floor-trio split as one cap slot

Update the HARD-GATE cap policy in `rules/GOVERNANCE.md` to count the
floor trio (`planning-pipeline.md` + `skip-contract.md` +
`pressure-framing-floor.md`) as **one cap slot**, not three. Rationale:
the split was a documentation refactor (one rule, three files for
size/navigation), not three independent rule promotions. Counting them
as three would punish good documentation hygiene and effectively force
a future contributor to inline-restate to stay under cap.

Effective count after this change: **8 cap slots** (trio = 1) — matches
the stated cap. No new rule needed; this is a counting-rule clarification.

### Decision 2 — LOC budget per cap slot (advisory, not HARD)

Introduce an advisory LOC budget of **~150 LOC per cap slot** (median
of current sizes). Slots exceeding 150 LOC need a one-line "Why this
size" sentence at the top of the rule file. Slots over 200 LOC trigger
a trim-or-justify PR pass.

This is **advisory, not HARD-GATE-enforced** — adding a HARD-GATE about
HARD-GATE size would be exactly the self-referential meta-work the
architectural audit flagged. Soft check via a future `validate.fish`
warn-only phase (separate issue).

### Decision 3 — Per-rule recommendations

See audit table below. Each recommendation is a proposal, not a commit.
Acted-on trims get their own issues.

## Audit table

LOC counted via `wc -l`. Audience: primary user the rule earns its load
for. Eval lift: direct `rules-evals/<rule>/` suite + required-tier
assertion count.

| Rule | LOC | Audience | Eval suite | Required-tier | Recommendation |
|---|---:|---|---|---:|---|
| `planning-pipeline.md` | 180 | Universal | indirect (scope-tier) | — | **Keep as-is.** Spine of the discipline. Audience-universal. |
| `skip-contract.md` | 77 | Power-user / contributor | indirect | — | **Keep as-is.** Floor-trio member; size already small; mechanical content correctly factored out of planning-pipeline. |
| `pressure-framing-floor.md` | 181 | Power-user / contributor | indirect (scope-tier 14) | — | **Trim candidate.** Largest rule. Sentinel-bypass mechanics (lines documenting `DISABLE_PRESSURE_FLOOR` Bash check) are contributor-only. Propose: move bypass mechanics block to `rules/references/pressure-framing-bypass.md`; keep floor detection + scope-tier hook description in main rule. Target: ~110 LOC. |
| `fat-marker-sketch.md` | 50 | Universal | none (skill has eval) | 0 | **Keep + add eval.** Already minimum-sized. But ADR #0019 discriminating-signal discipline says HARD-GATEs without measurable signal at the boundary are theatre. File follow-up: add `rules-evals/fat-marker-sketch/` with discriminating assertions (e.g., "produces visual artifact reference vs text list when shape question follows brainstorming"). |
| `think-before-coding.md` | 148 | Universal | direct (4 required) | 4 | **Trim candidate (mild).** Format examples (Assumptions / Interpretations / Simpler-Path blocks) take ~40 LOC. Propose: collapse to single-block example + reference card pointer. Target: ~110 LOC. Boost eval coverage from 4 → 8+ required-tier (only universal HARD-GATE with single-digit signal). |
| `goal-driven.md` | 97 | Universal | direct (7 required) | 7 | **Keep as-is.** Sized appropriately, eval coverage adequate. |
| `execution-mode.md` | 109 | Contributor / senior IC | direct (12 required) | 12 | **Demote candidate (deliberate).** Earns load for contributors running subagent-driven-development; rarely fires for VP-tier daily use. Two options: (a) keep HARD-GATE, accept audience-mismatch as cost of contributor-grade discipline; (b) demote to soft rule, retain eval suite as guardrail. Recommend (a) — eval lift is strong (12 required-tier), removing it would regress contributor-side rigor. Tag as "contributor-tier HARD-GATE" in `GOVERNANCE.md`. |
| `pr-validation.md` | 187 | Contributor / senior IC | direct (13 required) | 13 | **Largest trim candidate.** 187 LOC for a rule that VP-tier users rarely encounter (they don't run `gh pr ready`). Mechanical adjudication block (zero-functional-change carve-out, mechanical `git diff --stat` quoting requirement) is ~40 LOC of contributor-specific procedure. Propose: extract mechanical carve-out into `rules/references/pr-validation-carveout.md`; keep trigger surface + test plan locator + skip contract in main rule. Target: ~130 LOC. |
| `disagreement.md` | 79 | Universal | direct (22 required) | 22 | **Keep as-is.** Anti-sycophancy core — the rule the README sells the project on. Strongest eval coverage (22 required-tier). Size is already tight. |
| `memory-discipline.md` | 75 | Universal | direct (4 required) | 4 | ~~**Keep + boost evals.** Size appropriate. 4 required-tier is single-digit — file follow-up to lift to 8+, matching the universal-HARD-GATE bar.~~ **Withdrawn — see [ADR #0023](./0023-discrimination-must-be-measured-before-sizing-hard-gate-rules.md).** A RED/GREEN audit (PR #461) found the eval count was measuring a broken injection path; only 2 of 8 scenarios discriminate. Rule shrunk 75→26 LOC; suite retiered 4 required → 2 required + 6 diagnostic. The "lift to 8+" follow-up (#425) is closed by the opposite outcome. |

**Totals:**
- Current: 1,183 LOC across 10 files (8 cap slots after Decision 1)
- If trim candidates acted: ~1,008 LOC (-175, ~15%)
- Eval-coverage gap closed: 2 follow-up issues (fat-marker-sketch eval, memory-discipline eval lift)

## Consequences

### Positive

- Cap policy stops drifting silently when documentation refactors land
  (Decision 1).
- LOC budget gives contributors a number to argue for or against when
  proposing rule edits (Decision 2).
- Per-rule recommendations are explicit proposals, surfaced in one
  place — easier to triage than discovering them piecemeal in 8
  separate PRs.
- Three of the trim candidates (`pr-validation`,
  `pressure-framing-floor`, `think-before-coding`) account for
  ~150 LOC of the proposed reduction. High-leverage targets.

### Negative

- Decision 1 (counting trio as 1) makes the cap *appear* to have headroom
  it does not have in practice — splitting any future rule into a sub-trio
  would replay the drift. Mitigation: document in `GOVERNANCE.md` that
  cap-slot consolidation requires the same architectural-conservation
  rationale that the original split satisfied.
- Decision 2 (LOC budget) introduces a soft norm that could be gamed by
  hyper-compressing rule text and offloading to `references/` files
  loaded only when called by skill. Mitigation: the budget is advisory
  and the `references/` files still consume tokens *when invoked*, so
  net cost depends on invocation frequency.
- Trim recommendations are opinionated — acting on them risks
  weakening rules whose verbose form earns its keep on edge cases that
  this audit didn't replay. Mitigation: each acted-on trim ships as a
  PR with the eval suite re-run; regressions block.

### Neutral / follow-ups

- Issue: trim `pr-validation.md` per recommendation (~57 LOC reduction).
- Issue: trim `pressure-framing-floor.md` per recommendation (~71 LOC reduction).
- Issue: trim `think-before-coding.md` per recommendation (~38 LOC reduction) + boost eval coverage 4 → 8+.
- Issue: add `rules-evals/fat-marker-sketch/` suite with discriminating assertions (closes the ADR #0019 gap at the rules layer).
- ~~Issue: boost `memory-discipline` eval coverage 4 → 8+.~~ (#425 — closed by the opposite outcome; see [ADR #0023](./0023-discrimination-must-be-measured-before-sizing-hard-gate-rules.md).)
- Issue: update `rules/GOVERNANCE.md` HARD-GATE Cap section per Decisions 1 + 2.

## Alternatives considered

### A — Don't audit; trust the existing count-cap

Status quo. Rejected — the architectural audit that produced this issue
found the rule layer growing while user-facing value (leadership skills)
did not. Counting files alone misses the cost.

### B — Hard-cap LOC at e.g. 150 per rule

Rejected — would force premature trimming of legitimately spine-sized
rules like `planning-pipeline.md` (180 LOC, universally applicable),
and would itself add HARD-GATE-about-HARD-GATE meta-rule complexity.
Advisory budget (Decision 2) gets most of the discipline at zero
HARD-GATE cost.

### C — Demote all contributor-audience HARD-GATEs to soft rules

Rejected — `execution-mode.md` and `pr-validation.md` both have strong
eval coverage (12 + 13 required-tier) and govern recurring failure
modes. Demoting to soft loses the pre-load enforcement that justifies
the HARD-GATE tier in the first place. Better path: tag
contributor-tier in `GOVERNANCE.md` and accept the audience-mismatch
cost as the explicit price of contributor-grade discipline.

### D — Re-merge the floor trio back into one file

Rejected — would un-do the navigation/size benefit PR #385 delivered
and re-introduce the 540 LOC monolith that motivated the split.
Decision 1 gets the cap-counting correction without the structural
regression.

## Related

- Issue #418 (parent — this audit)
- Issue #340 / `rules/GOVERNANCE.md` § HARD-GATE Cap (policy being
  refined)
- Issue #70 (merge rule content into skills, keep rules as thin
  gates — directionally aligned with the trim recommendations here)
- Issue #329 (rules protect against Claude failure modes but don't
  cultivate user critical thinking — adjacent concern, different cut)
- PR #385 (floor-trio split — origin of the cap-drift this ADR resolves)
- ADR #0019 (skill-eval discriminating-signal discipline — the
  fat-marker-sketch eval gap is a rule-layer analogue)
- [`rules/references/hard-gate-pattern-justification.md`](../rules/references/hard-gate-pattern-justification.md)
  (external grounding for the cap — forcing-function / poka-yoke canon
  and the alert-fatigue anti-pattern boundary the cap defends against)
