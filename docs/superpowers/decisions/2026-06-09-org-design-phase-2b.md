# /org-design Phase 2b — design context breadcrumb

**Date**: 2026-06-09
**Issue**: #35 (Phase 2b)
**Pipeline state**: DTP ✅ + systems-analysis ✅ done (this breadcrumb).
- **2b-i SHIPPED** — add/merge/change-reporting; [spec](../specs/2026-06-09-org-design-scenario-modeling-phase-2b-i-design.md), MERGED PR #471 (main 48e3d56).
- **2b-ii brainstorming ✅** — reduce-headcount + layoff ack; [spec](../specs/2026-06-09-org-design-scenario-modeling-phase-2b-ii-design.md) written. Branch `feature/org-design-phase-2b-ii` (off main). **Resume at: `superpowers:writing-plans` against the 2b-ii spec.**
- **2b-iii** — matrix + recommended-option + experimental→stable eval flip. Not started.
**Predecessors**: [Phase 1 spec](../specs/2026-06-08-org-design-analyze-inherited-design.md) · [Phase 2a spec](../specs/2026-06-08-org-design-scenario-modeling-phase-2a-design.md) (split-team, MERGED PR #470, commit 45a8ba3 on main).

## Resume instructions

New-session opener: `/org-design Phase 2b — resume from docs/superpowers/decisions/2026-06-09-org-design-phase-2b.md, pick up at brainstorming`.
First brainstorming question is the **2b decomposition** (below). Then write the Phase 2b spec → plan → implement. Do this on a fresh `feature/org-design-phase-2b` branch off `main` (NOT the lingering local `feature/org-design-phase-2a`).

## Problem Statement (from DTP)

- **User**: Director/VP at days 60+ in an `/onboard <org>` workspace; has done the Phase-1 descriptive read and can model one move (Phase 2a `split-team`).
- **Problem**: Can only model splits, one scenario at a time. Real reorg needs the other 4 moves (add/reduce headcount, merge teams, change reporting) AND side-by-side comparison to pick one. `reduce-headcount` = layoff modeling (names + cut order); `recommended-option` makes the skill *prescribe* a winner (rubber-stamp risk).
- **Impact**: Highest-stakes, least-reversible decisions (cuts, merges) fall back to whiteboard/memory — where an unseen second-order effect does the most damage. No matrix = comparison happens in the head. No layoff guardrail = casual cut-planning.
- **Evidence**: 2a spec "Out of scope (Phase 2b)" enumerates these; #35 was scenario-first; user explicitly required layoffs get special review (2026-06-09 session). P1-high, days-60+ arc, feeds `/strategy-doc`.
- **Constraints**: Build on the 2a engine; reuse mode wall, both gates, namespace, NDA contract, fences, atomic write. No HRIS; manual `org/structure.md`; filesystem only.

## Systems Analysis (Full Pass) — summary

**Reused substrate (2a, shipped):** `skills/org-design/scripts/scenario-scorer.ts` — `parseStructure`, `applySplit`, `computeMetrics`, `checkValidity` (4 rules: `orphaned_report` / `reporting_cycle` / `zero_report_manager` / `subviable_oncall`), `run(structureMd, spec)` → `ScenarioResult`, CLI entrypoint. Mode wall (analyze vs scenario, disjoint namespaces, backtracking scoped to analyze). Two gates: machine validity refuse + universal human review-before-persist. Namespace `decisions/<date>-org-scenario-<slug>.md`. NDA `onboard-guard`. Section fences. Atomic write.

**Genuinely new in 2b + risk:**
1. **`reduce-headcount` = layoff artifact** (highest sensitivity): named individuals + cut order persisted in an NDA workspace. The heightened ack must be a REAL gate, not prose. Failure mode: casual cut-planning normalized; artifact existing at all is the risk.
2. **`recommended-option` vs observe-before-act**: first place the skill prescribes. Must reconcile with Phase-1 discipline + `rules/planning-pipeline.md` decision-framework — rank + show work + flag irreversibility, NEVER a bare "do this." Rubber-stamp risk.
3. **Multi-scenario comparison**: N scenarios scored + compared → likely scorer signature change (discriminated-union `ScenarioSpec` replacing the bare `SplitTeamSpec` arg; N-scenario run variant or caller-loop). The one real refactor of shipped code — touch surgically.
4. **New mutation validity surfaces**: merge → span blowout (>7, reported not failure); reduce → stranded on-call (`subviable_oncall`) + orphaned reports + new system-SPOF; add → minimal; reporting-change → cycle (`reporting_cycle`). **Likely NO new validity rule needed** — the existing 4 cover these. Confirm in brainstorming.

**Edge cases**: all-invalid multi-scenario (matrix must say "no valid option + why each breaks", not emit a broken recommendation); tied/marginal recommendations (surface ties as ties).

## Open decisions for brainstorming (in order)

1. **2b decomposition** — one spec for all 4 modes + matrix + recommended-option + layoff ack, OR sub-phase it (e.g. 2b-i structural modes add/merge/reporting; 2b-ii reduce-headcount + layoff ack; 2b-iii matrix + recommended-option)? The 2a decompose lesson + [[feedback_right_size_ceremony]] argue for sub-phasing — this is the largest increment yet. **Recommended: sub-phase.**
2. **Layoff heightened-ack shape** — pre-generation block-and-confirm (refuse to model until intent acknowledged) vs post-render extra gate on top of the universal review. User said "review the plan thoroughly before moving forward" → leans post-render (review a produced plan) with a pre-ack acknowledgment.
3. **`recommended-option` form** — prescribe a winner vs rank-and-show-work-with-irreversibility-flags. Reconcile with observe-before-act. **Lean: rank + reasoning + flag irreversible, user chooses.**
4. **Trade-off matrix** — which metrics (span/SPOF/on-call/ratio deltas per scenario) + compact N-scenario rendering (Mermaid? table?).
5. **Scorer refactor shape** — discriminated-union `ScenarioSpec`; keep `applySplit` signature stable (Phase 2a evals + the merged code depend on it).

## Notes
- Keep "Re #N" (not "Closes #35") in commits so #35 survives until 2b fully ships.
- Phase 2a PR test plan left a follow-up: a 3–5× confirmatory live-eval run before flipping `org-design` `status: experimental` → `stable`. Fold into 2b's final phase.
- Lingering local state: `feature/org-design-phase-2a` branch still checked out with pre-existing uncommitted `docs/catalog.md` + `tests/sycophancy/client.ts` edits (NOT this work's — leave them). Get onto a clean `feature/org-design-phase-2b` off `main` in the new session.
