# /org-design Phase 2b-ii — reduce-headcount + layoff acknowledgment gate

**Date**: 2026-06-09
**Issue**: #35 (Phase 2b, sub-phase ii of iii)
**Predecessors**: [Phase 1 spec](2026-06-08-org-design-analyze-inherited-design.md) (#468) · [Phase 2a spec](2026-06-08-org-design-scenario-modeling-phase-2a-design.md) (`split-team`, #470) · [Phase 2b-i spec](2026-06-09-org-design-scenario-modeling-phase-2b-i-design.md) (`add`/`merge`/`change-reporting`, MERGED #471, commit 48e3d56 on main) · [2b breadcrumb](../decisions/2026-06-09-org-design-phase-2b.md).
**Pipeline state**: DTP ✅ + systems-analysis ✅ (breadcrumb, covers all of 2b incl. reduce-headcount) → brainstorming ✅ (this spec). Resume at `writing-plans`.

## Phase 2b decomposition (recap)

- **2b-i** — discriminated-union scorer refactor + `add-headcount` / `merge-teams` / `change-reporting`. SHIPPED (#471).
- **2b-ii (THIS SPEC)** — `reduce-headcount` (the 5th and final scenario mode) + the heightened layoff acknowledgment gate.
- **2b-iii** — multi-scenario trade-off matrix + recommended-option output, plus the experimental→stable confirmatory eval flip.

## Problem Statement (from DTP, scoped to 2b-ii)

- **User**: Director/VP at days 60+ in an `/onboard <org>` workspace; can now model the four non-destructive structural moves (2b-i).
- **Problem (2b-ii slice)**: The highest-stakes, least-reversible reorg move — cutting people — has no model. Modeling a layoff means persisting named individuals and a cut decision in an NDA workspace. Two distinct risks: (a) the structural after-effects of a cut (orphaned reports, stranded on-call, a critical system left with no owner) are invisible until they bite; (b) the act of casually generating a named-cut artifact normalizes layoff planning — "the artifact existing at all is the risk" (systems-analysis).
- **Impact**: A cut planned on memory/whiteboard hides exactly the second-order effects that do the most damage. And a too-easy "model a layoff" path invites careless cut-planning.
- **Evidence**: 2a/2b-i specs enumerate `reduce-headcount` as deferred; user explicitly required layoffs get special review (2026-06-09 session); breadcrumb systems-analysis item 1 flags this as the highest-sensitivity item and demands "a REAL gate, not prose."
- **Constraints**: Build on the 2b-i scorer (discriminated union + `applyMutation` dispatch). Reuse mode wall, NDA guard, section fences, atomic write, the universal review gate. No HRIS; manual `org/structure.md`; filesystem only. Do not regress 2a/2b-i tests.

## Systems Analysis (from breadcrumb, confirmed)

**Reused substrate (2b-i, shipped):** `ScenarioSpec` discriminated union, `applyMutation` dispatch in `run()`, `KNOWN_SCENARIO_TYPES` + `isScenarioType`, the four validity rules, `computeMetrics`, the generic team-delta branch, CLI dispatch. Universal review gate + machine validity gate (2a). NDA `onboard-guard`, section fences, atomic write.

**New in 2b-ii + risk:**
1. **Layoff acknowledgment must be a real gate, not prose** (highest sensitivity). Resolved: a **machine pre-ack flag** enforced in the deterministic scorer (below), not orchestrator prose alone.
2. **Reports of cut people**: resolved as orphan-unless-explicitly-reassigned — no silent roll-up.
3. **A critical system whose sole owner is cut becomes owned by zero people.** The existing SPOF metric (`owned by exactly 1`) does not catch a 1→0 system — worse, the system silently *leaves* the after-SPOF list, making the most dangerous outcome look resolved. Resolved with a new `unownedAfter` metric field (loud report), NOT a validity rule.
4. **No new validity rule.** The four shipped rules cover reduce's structural failures: unreassigned reports → `orphaned_report`; cutting all of a manager's reports → `zero_report_manager`; cutting a rotation member to ≤1 → `subviable_oncall`.

## Decisions (this session's brainstorming)

1. **Branch** — merge #471 to main, branch `feature/org-design-phase-2b-ii` off the updated main. DONE (main at 48e3d56).
2. **Layoff ack shape** — machine pre-ack flag + post-render universal review gate (Approach A).
3. **Cut's reports** — orphan unless explicitly reassigned (optional `reassign` map).
4. **Unowned system** — new `metrics.unownedAfter: string[]`, loud report, not a validity failure.

## Scope

**In scope (Phase 2b-ii)**:
- `ReduceHeadcountSpec` added to the `ScenarioSpec` union; `"reduce-headcount"` added to `KNOWN_SCENARIO_TYPES`.
- `applyReduce(people, spec)` pure mutation; `reduce-headcount` case in `applyMutation`.
- Machine ack gate: the dispatch refuses (`throw`) unless `spec.acknowledged === true`.
- `metrics.unownedAfter` computed in `run()` and added to `ScenarioResult`.
- CLI accepts `reduce-headcount`; flip the 2b-i `isScenarioType("reduce-headcount")` test expectation false → true.
- SKILL.md routes `reduce-headcount` with the gather + ack step; render surfaces `unownedAfter`. Version `0.3.0 → 0.4.0`.
- scenario-checks.md: reduce-headcount spec block + ack-gate doc + unownedAfter render rule.
- Co-located unit tests (below); existing 2a/2b-i tests unchanged except the one `isScenarioType` flip.

**Out of scope (Phase 2b-iii)**:
- Multi-scenario trade-off matrix + recommended-option output.
- The experimental→stable confirmatory eval flip (folds into 2b-iii).
- Excalidraw rendering (Mermaid only). `/strategy-doc` hand-off. HRIS import.

## Approach

Same hybrid: deterministic scorer owns mutation + recompute + validity + the ack gate; SKILL.md orchestrates gather / ack / branch / render / review / persist. 2b-ii adds one mutation function, one machine gate in the dispatch, and one metric field. No new layer, no new validity rule.

### Spec type (union extension)

```ts
export interface ReduceHeadcountSpec {
  type: "reduce-headcount";
  cut: string[];                       // people to remove
  reassign?: Record<string, string>;  // displaced report -> new manager
  acknowledged: boolean;               // machine layoff-ack gate
}

export type ScenarioSpec =
  | SplitTeamSpec | AddHeadcountSpec | MergeTeamsSpec | ChangeReportingSpec
  | ReduceHeadcountSpec;

export const KNOWN_SCENARIO_TYPES =
  ["split-team", "add-headcount", "merge-teams", "change-reporting", "reduce-headcount"] as const;
```

### Machine ack gate

In `applyMutation`'s `reduce-headcount` case, BEFORE any mutation:

```ts
case "reduce-headcount":
  if (!spec.acknowledged) {
    throw new Error("reduce-headcount requires acknowledged:true (layoff acknowledgment gate)");
  }
  return applyReduce(people, spec);
```

- A throw (not `valid:false`) — it is a precondition refusal, consistent with the existing `applySplit` "member not in target team" spec-error throw; the CLI catches it and exits 65.
- **What the machine guarantees vs what it cannot**: the deterministic layer guarantees a layoff projection is impossible without a deliberate `acknowledged:true` flag-flip — no silent or accidental layoff modeling, the exact failure systems-analysis named. The machine cannot verify a human actually confirmed; SKILL.md prose binds the flag-flip to an explicit user confirmation after gravity is surfaced. Machine-enforced deliberateness + prose-enforced human-confirm ≫ pure prose. This is the strongest gate the filesystem/LLM architecture supports, and it is documented as such (no false claim of full enforcement).

### Mutation — `applyReduce`

```ts
export function applyReduce(people: Person[], spec: ReduceHeadcountSpec): Person[] {
  const cut = new Set(spec.cut);
  const reassigned = people.map((p) =>
    spec.reassign && spec.reassign[p.person] !== undefined
      ? { ...p, reportsTo: spec.reassign[p.person] }
      : p);
  return reassigned.filter((p) => !cut.has(p.person));
}
```

Apply `reassign` first (re-home displaced reports onto surviving managers), then drop `cut` rows. A report of a cut person who is NOT reassigned still points at the now-removed manager → `orphaned_report` → the projection is invalid and the user must re-home them. No silent roll-up.

### Unowned-system metric

In `run()` (which holds both `before` and `after`):

```ts
const ownedBefore = new Set(before.flatMap((p) => p.systems));
const ownedAfter = new Set(after.flatMap((p) => p.systems));
const unownedAfter = [...ownedBefore].filter((s) => !ownedAfter.has(s)).sort();
```

`unownedAfter` = systems that had ≥1 owner before and 0 owners after — i.e. lost all owners. Added to `ScenarioResult.metrics`. Additive and mode-agnostic: for non-removing modes (split/add/merge/change-reporting) `ownedAfter ⊇ ownedBefore`, so it is always `[]` — backward-compatible with 2b-i (no existing test asserts the field). Rendered loudly ("systems left UNOWNED: …"), distinct from a SPOF that was genuinely resolved. `valid` is unaffected — layoffs legitimately drop scope; the user decides at the review gate.

### Validity — no new rule

| Reduce failure surface | Covered by |
|---|---|
| unreassigned report of a cut person | `orphaned_report` |
| manager whose every report was cut | `zero_report_manager` |
| rotation shrunk to ≤1 by a cut | `subviable_oncall` |
| critical system left unowned (1→0) | NOT a failure — `metrics.unownedAfter` loud report |

## SKILL.md changes

- Route `reduce-headcount` (today refuses with a Phase-2b-ii message).
- **Gather + ack step** (reduce-headcount only): gather the `cut` list and any `reassign`; THEN surface gravity — this models a real layoff, naming specific people, persisting to an NDA workspace — and require an explicit user confirmation. Only on confirm, set `acknowledged: true` in the serialized spec. Without confirmation, do not set the flag; the scorer will refuse.
- Score → on the ack-gate throw, surface the refusal (no projection produced). On validity failure, the existing machine gate. On valid, render — surfacing `unownedAfter` prominently in the delta narrative.
- Universal review gate unchanged at persist (the post-render confirm).
- Slug: `<first-cut-person>-reduce` (kebab-cased). Same coexist / mutate-in-place / 2+-refuse rules.
- Mode wall, NDA guard, fences, atomic write unchanged. Version `0.3.0 → 0.4.0`.

## Tests

Extend `skills/org-design/scripts/scenario-scorer.test.ts`:

- **applyReduce** — happy (cut an IC; survivor metrics recomputed); reassign (cut a manager + re-home their reports → valid); orphan trip (cut a manager, do not reassign → `orphaned_report`); subviable trip (cut a rotation member down to ≤1 → `subviable_oncall`).
- **ack gate** — `run(FIXTURE, { type:"reduce-headcount", cut:[…], acknowledged:false })` throws; with `acknowledged:true` it returns a result.
- **unownedAfter** — cutting the sole owner of `billing-service` puts it in `metrics.unownedAfter`; a non-removing mode leaves `unownedAfter` empty.
- **isScenarioType flip** — update the 2b-i assertion from `isScenarioType("reduce-headcount") === false` to `=== true`.
- **Regression** — all 2a + 2b-i tests pass unchanged (except the one flip).
- CLI: `reduce-headcount` dispatches; an unknown type still errors with `EX_DATAERR`.

## File layout

```
skills/org-design/
├── SKILL.md                       # route reduce-headcount + ack step, render unownedAfter, version 0.4.0
├── scenario-checks.md             # reduce-headcount spec block + ack-gate doc + unownedAfter render rule
├── scripts/
│   ├── scenario-scorer.ts         # ReduceHeadcountSpec + applyReduce + ack gate + unownedAfter metric + CLI
│   └── scenario-scorer.test.ts    # reduce tests + isScenarioType flip
├── analysis-checks.md             # unchanged
└── structure-template.md          # unchanged
```

## Verification

- `cd skills/org-design/scripts && bun test scenario-scorer.test.ts` — all pass (reduce happy/trips, ack gate, unownedAfter, isScenarioType flip, 2a+2b-i regression).
- `bunx tsc --noEmit` from repo root (project tsconfig) — clean; `ScenarioSpec` switch in `applyMutation` exhaustive across five arms.
- CLI smoke: a reduce spec with `acknowledged:false` exits 65 with the ack message; with `acknowledged:true` emits a `ScenarioResult` whose `metrics.unownedAfter` lists any system whose sole owner was cut.

## Notes

- Keep `Re #35` (not `Closes`) in commits so #35 survives until 2b-iii ships.
- The experimental→stable confirmatory eval flip (2a PR follow-up) folds into 2b-iii, the final 2b phase.
- Pre-existing uncommitted `docs/catalog.md` + `tests/sycophancy/client.ts` edits are unrelated — leave them.
