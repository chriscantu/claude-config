# /org-design Phase 2b-i — structural scenario modes (add / merge / change-reporting)

**Date**: 2026-06-09
**Issue**: #35 (Phase 2b, sub-phase i of iii)
**Predecessors**: [Phase 1 spec](2026-06-08-org-design-analyze-inherited-design.md) (#468) · [Phase 2a spec](2026-06-08-org-design-scenario-modeling-phase-2a-design.md) (`split-team`, MERGED #470, commit 45a8ba3) · [2b breadcrumb](../decisions/2026-06-09-org-design-phase-2b.md) (DTP + systems-analysis).
**Pipeline state**: DTP ✅ + systems-analysis ✅ (breadcrumb) → brainstorming ✅ (this spec). Resume at `writing-plans`.

## Phase 2b decomposition (decided this session)

Phase 2b splits into three independently-shippable sub-phases:

- **2b-i (THIS SPEC)** — discriminated-union scorer refactor + `add-headcount`, `merge-teams`, `change-reporting`.
- **2b-ii** — `reduce-headcount` + the heightened layoff acknowledgment gate.
- **2b-iii** — multi-scenario trade-off matrix + recommended-option output.

Rationale: largest increment yet (2a decompose lesson + right-size-ceremony memory). The refactor dependency sets the cut — adding a second mode type forces the union immediately, so it lands in 2b-i; the matrix needs ≥2 modes to exist before it has anything to compare, so it waits for 2b-iii; layoff sensitivity is isolated in its own phase so the ack gate is not bundled with routine structural modes.

## Problem Statement (from DTP, scoped to 2b-i)

- **User**: Director/VP at days 60+ in an `/onboard <org>` workspace; has done the Phase-1 descriptive read and can model a team split (Phase 2a).
- **Problem (2b-i slice)**: Can only model `split-team`. Three more structural moves — growing the org (`add-headcount`), consolidating teams (`merge-teams`), and re-wiring reporting lines (`change-reporting`) — fall back to whiteboard/memory, where an unseen second-order effect (broken reporting chain, span blowout, new on-call SPOF) does the most damage.
- **Impact**: These three are the routine structural reorg moves. Without a deterministic projection + validity gate, the manager reasons about the after-state in their head.
- **Evidence**: 2a spec "Out of scope (Phase 2b+)" enumerates these four modes; #35 was scenario-first; P1-high, days-60+ arc.
- **Constraints**: Build on the 2a engine; reuse mode wall, both gates, namespace, NDA contract (`onboard-guard`), section fences, atomic write. No HRIS; manual `org/structure.md`; filesystem only. `applySplit` signature MUST stay stable (2a evals + merged code depend on it).

## Systems Analysis (from breadcrumb, confirmed)

**Reused substrate (2a, shipped):** `skills/org-design/scripts/scenario-scorer.ts` — `parseStructure`, `applySplit`, `computeMetrics` (span / system-SPOF / on-call / M:IC ratio), `checkValidity` (4 rules: `orphaned_report` / `reporting_cycle` / `zero_report_manager` / `subviable_oncall`), `run(structureMd, spec)` → `ScenarioResult`, CLI entrypoint. Mode wall (analyze vs scenario, disjoint namespaces). Two gates: machine validity refuse + universal human review-before-persist. Namespace `decisions/<date>-org-scenario-<slug>.md`. Section fences. Atomic write.

**New in 2b-i + risk:**
1. **Scorer signature change** — `run()` currently takes a bare `SplitTeamSpec`. Adding a second mode type forces a discriminated-union `ScenarioSpec`. This is the one real refactor of shipped code — touch surgically, keep `applySplit` and the existing split tests untouched.
2. **Delta generalization** — `run()` lines 211-216 compute `addedTeams`/`removedTeams` with split-specific logic (`spec.into`, `spec.targetTeam`). For non-split modes this must derive from a generic team-set diff. Split keeps its override branch.
3. **No new validity rule** — confirmed against the 4 shipped rules: merge span>7 is reported-not-failure by design; orphan / cycle / zero-report / subviable-oncall cover add + merge + reporting completely.

## Scope

**In scope (Phase 2b-i)**:
- Refactor `ScenarioSpec` to a discriminated union of four spec types; `applySplit` signature unchanged.
- Three new pure mutation functions: `applyAdd`, `applyMerge`, `applyReporting`, each `(people: Person[], spec) → Person[]`.
- `run()` dispatches on `spec.type`; `checkValidity` / `computeMetrics` / `movedReports` reused mode-agnostically.
- Generalize the `addedTeams`/`removedTeams` delta for non-split modes; split retains its existing branch.
- CLI entrypoint accepts the four spec types.
- SKILL.md routes the three new operations in `scenario` mode (today they refuse with a Phase-2b message); conversational gather per mode; reuse review gate, fences, atomic write, namespace.
- Co-located unit tests for the three new modes (happy path + one validity trip each); existing split tests untouched.

**Out of scope (Phase 2b-ii / 2b-iii)**:
- `reduce-headcount` and the heightened layoff acknowledgment gate (2b-ii).
- Multi-scenario trade-off matrix + recommended-option output (2b-iii).
- Excalidraw rendering (Mermaid only). `/strategy-doc` hand-off. HRIS / directory auto-import.

## Approach

Same hybrid as 2a: deterministic TS scorer owns mutation + recompute + validity; SKILL.md orchestrates gather / branch / render / gate / persist. 2b-i adds three mutation functions behind a discriminated-union dispatch and extends the orchestrator's mode routing. No new layer, no new gate, no new validity rule.

### Scorer — discriminated union

```ts
export type ScenarioSpec =
  | SplitTeamSpec        // unchanged from 2a
  | AddHeadcountSpec
  | MergeTeamsSpec
  | ChangeReportingSpec;

export interface AddHeadcountSpec {
  type: "add-headcount";
  hires: Person[];                       // full Person schema, gathered conversationally
  reassign?: Record<string, string>;     // existing person -> new manager (e.g. give a new EM reports)
}

export interface MergeTeamsSpec {
  type: "merge-teams";
  teams: string[];                       // >=2 teams to merge
  newName: string;
  survivingManager: string;              // the M who leads the merged team
}

export interface ChangeReportingSpec {
  type: "change-reporting";
  reassign: Record<string, string>;      // person -> new manager
}
```

### Per-mode mutation semantics

- **add-headcount** — append `hires` rows to the people list; apply `reassign` to reparent existing people onto a new hire. `reassign` is what lets a new-manager hire avoid an instant `zero_report_manager` failure (give them reports). Validity catches `orphaned_report` (hire reports to a nonexistent manager) and `reporting_cycle`.
- **merge-teams** — every member of `teams` gets `team = newName`. Each non-surviving manager (role `M` in `teams`, `!== survivingManager`) gets `reportsTo = survivingManager` with **role unchanged (`M`)** — a sub-manager whose own reports keep reporting to them (sub-hierarchy preserved). Everyone else's `reportsTo` is unchanged. Result: `span[survivingManager]` grows by the count of folded-in sub-managers (and any direct reports of merged teams that already reported to the surviving manager). Span > 7 is reported in metrics, **not** a validity failure.
- **change-reporting** — apply the `reassign` map (person → new manager); no team relabel. `reporting_cycle` and `orphaned_report` guard the result.

### Delta generalization (the one edit to shipped `run()`)

`run()` currently computes `addedTeams`/`removedTeams` with split-specific logic referencing `spec.into` and `spec.targetTeam` (lines 211-216). Refactor:

- `split-team` → keep the existing override branch verbatim (targetTeam always treated as removed; `into` names added).
- `add-headcount` / `merge-teams` / `change-reporting` → generic team-set diff: `addedTeams = teamsAfter \ teamsBefore`, `removedTeams = teamsBefore \ teamsAfter`. Merge naturally yields `removedTeams = the merged-away teams`, `addedTeams = [newName]`; add yields a new team only if a hire introduces a new label; reporting yields neither.

Implemented as `if (spec.type === "split-team") { /* existing */ } else { /* generic diff */ }`.

### Validity — no new rule

The four shipped rules cover every new mutation's failure surface:

| Mode | Failure surface | Covered by |
|---|---|---|
| add-headcount | hire reports to missing manager; new M with no reports; cycle | `orphaned_report`, `zero_report_manager`, `reporting_cycle` |
| merge-teams | span blowout (reported, not a failure); stranded on-call after relabel | metrics (span), `subviable_oncall` |
| change-reporting | reparent to missing manager; reporting loop | `orphaned_report`, `reporting_cycle` |

## Invocation

Unchanged from 2a:

```
/org-design <org> --mode=scenario [--workspace <path>]
```

`--mode=scenario` now routes four operations (`split-team`, `add-headcount`, `merge-teams`, `change-reporting`), gathered conversationally. `reduce-headcount` still refuses with a Phase-2b-ii message.

## SKILL.md changes

- Extend the scenario-mode operation router: the three new ops, previously refused with a Phase-2b message, now gather → score → render → gate → persist.
- Per-mode conversational gather:
  - **add-headcount**: full `Person` row(s) for each hire + optional reassignments.
  - **merge-teams**: which teams, new name, surviving manager.
  - **change-reporting**: which person(s), new manager(s).
- Transcribe gathered intent into the matching `ScenarioSpec` JSON block, invoke the scorer, branch on `result.valid`.
- Reuse verbatim: machine validity gate (refuse + no-write on failure), universal human review gate (print full artifact, require explicit confirm before write), section fences, atomic write-temp-rename, before/after Mermaid + delta table.
- Namespace slugs: `<newName>-merge`, `<person>-add` (or `<team>-add` for a team-scoped hire), `<person>-reporting`. Same coexist / mutate-in-place / refuse-on-2+ rules as 2a.
- Mode wall, NDA guard (`onboard-guard refuse-raw`), backtracking guardrail scoping all unchanged.
- Version `0.2.0 → 0.3.0`.

## Tests

Extend `skills/org-design/scripts/scenario-scorer.test.ts`:

- **add-headcount**: happy path (hire reporting to existing manager, metrics reflect new report); validity trip (hire reports to nonexistent manager → `orphaned_report`).
- **merge-teams**: happy path (two teams → one, surviving-manager span grows, non-surviving manager keeps role M + sub-hierarchy); validity trip (e.g. merge that strands an on-call rotation at ≤1 → `subviable_oncall`).
- **change-reporting**: happy path (reparent, metrics reflect span shift); validity trip (reassign that creates a `reporting_cycle`).
- **Regression guard**: existing `split-team` tests run unchanged and pass.
- CLI: each of the four `spec.type` values dispatches; an unknown type still errors with `EX_DATAERR`.

## File layout

```
skills/org-design/
├── SKILL.md                       # extend: route 3 new ops, version 0.3.0
├── scenario-checks.md             # extend: 3 new spec formats + mutation semantics
├── scripts/
│   ├── scenario-scorer.ts         # union refactor + applyAdd/applyMerge/applyReporting + run() dispatch + delta generalization
│   └── scenario-scorer.test.ts    # extend: 3 new modes + regression
├── analysis-checks.md             # unchanged
└── structure-template.md          # unchanged (input schema reused)
```

## Verification

- `cd skills/org-design/scripts && bun test scenario-scorer.test.ts` — all pass (new + existing split regression).
- `bunx tsc --noEmit` on the scorer — clean (discriminated union exhaustive in `run()` dispatch).
- CLI smoke per mode: hand a structure.md + a per-mode scenario.json, observe valid `ScenarioResult` JSON for happy paths and a non-empty `failures[]` for the trip cases.

## Notes

- Keep `Re #35` (not `Closes #35`) in commits so #35 survives until 2b-ii and 2b-iii ship.
- The 2a PR test plan left a follow-up: a 3–5× confirmatory live-eval run before flipping `org-design` `status: experimental` → `stable`. Fold into 2b-iii (the final 2b phase), not here.
- Pre-existing uncommitted `docs/catalog.md` + `tests/sycophancy/client.ts` edits are unrelated — leave them.
