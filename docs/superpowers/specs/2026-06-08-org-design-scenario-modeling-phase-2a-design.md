# /org-design — Scenario Modeling (Phase 2a: `split-team`)

**Date**: 2026-06-08
**Issue**: #35 (Phase 2 — scenario modeling; this spec scopes **Phase 2a**, the `split-team` vertical slice)
**Status**: Design approved
**Predecessor**: [Phase 1 — Inherited-Org Analysis](2026-06-08-org-design-analyze-inherited-design.md) (shipped #468)

## Problem Statement

**User**: Newly-hired senior engineering leader (Director / VP), days 60+ of a new role, inside an `/onboard <org>` workspace. Has completed the Phase-1 descriptive read (`--mode=analyze`) and has now earned the context to propose reorg responsibly.

**Problem**: After reading the inherited org, the leader must *model* concrete change options — and compare a projected structure against the current one — before proposing. No structured way exists; options get weighed from memory, so the leader proposes a reorg without seeing the second-order effects (span shifts, new SPOFs, on-call rebalance) side by side. The Phase-1 artifact flags *what is* but offers no path to *what could be*, dead-ending exactly where the decision happens.

**Impact**: High-stakes, hard-to-reverse decisions made on incomplete comparison → a wrong reorg ships, damaging the org and the leader's credibility. Worse, a structurally broken proposal (orphaned reports, an unstaffed on-call rotation) that nobody caught on a whiteboard.

**Evidence**: Issue #35's original scope was scenario-first; the Phase-1 spec (Scope §"Out of scope", Phases §"Phase 2") explicitly deferred scenario modeling, the trade-off matrix, recommended-option output, and before/after chart comparison to "Phase 2, separate spec." Phase 1 shipped #468. #35 is priority 1-high, plugged into the days-60+ onboarding arc, and feeds `/strategy-doc`.

**Constraints**:
- Lives in the `/onboard <org>` workspace; NDA boundary inherited (`interviews/raw/` refused via `onboard-guard.ts`).
- Sole structural source = manual `org/structure.md` (no HRIS). Reuse the Phase-1 input schema unchanged.
- Reuse Phase-1 section-fence idempotency, atomic write-temp-rename, and Mermaid machinery — do not fork them.
- Filesystem artifacts only; no new memory entity (consistent with Phase 1).
- Prescriptive output must not leak into Phase-1 `analyze` mode (the Phase-1 backtracking guardrail must not fire on Phase-2 output, and must still fire on `analyze`).

**Known Unknowns**:
- On-call "sub-viable" floor: this spec sets ≤1 person = invalid, 2 = valid-but-warned. Revisit if real orgs use 2-person rotations as a steady state.
- Whether `new_reporting` overrides in the scenario spec are needed for `split-team` in practice, or whether the new leads always report to the target team's former manager by default.

## Scope

**In scope (Phase 2a — `split-team`)**:
- Activate `--mode=scenario` for the `split-team` operation only (Phase-1 currently refuses all scenario modes).
- A deterministic TS scorer (`scripts/scenario-scorer.ts`, bun) that applies the split, recomputes span / system-ownership-SPOF / on-call / manager:IC ratio, and runs a structural validity check.
- A machine **validity gate** (refuse + no-write on structural failure) and a human **review gate** (print full artifact, require explicit confirm before any write).
- Before/after Mermaid `graph TD` comparison + a delta summary table.
- New artifact namespace `decisions/<date>-org-scenario-<slug>.md`, separate from Phase-1 `*-org-analysis.md`.

**Out of scope (Phase 2b+)**:
- Other scenario modes: `add-headcount`, `reduce-headcount`, `merge-teams`, `change-reporting`.
- Multi-scenario trade-off matrix + recommended-option output.
- The **heightened layoff acknowledgment** for `reduce-headcount` — the review-gate hook is designed here (universal "review before persist"); the layoff-specific pre-acknowledgment lands with `reduce-headcount` in 2b.
- Excalidraw rendering (Mermaid only).
- Automated hand-off into `/strategy-doc`.
- HRIS / directory auto-import.

## Approach

**Hybrid: deterministic TS scorer + markdown orchestration.** The Phase-1 layer choice (pure Pattern C / LLM counting) held for one small table read descriptively. Phase 2a recomputes metrics across a mutation *and* must guarantee the projected org is structurally valid — the [`onboard_fish_vs_ts_inflection`] memory's "switch to TS when work shifts to logic-heavy parse/transform" inflection, and the global TS-for-logic default. An LLM self-check on validity is the exact silent-failure shape the rules guard against; the highest systems-analysis risk (invalid org ships silently) demands a deterministic gate.

Division of responsibility:
- **`scenario-scorer.ts` (deterministic, pure)** — owns mutation, metric recompute, and the structural validity check. No MCP, no filesystem writes; reads inputs via argv, emits JSON to stdout.
- **`SKILL.md` (orchestrator, judgment)** — gathers split intent conversationally, transcribes it into a scenario-spec block, invokes the scorer, branches on validity, renders the before/after charts + narrative, runs the review gate, and persists on confirm. Authority-SPOF (memory power tags) stays here, keeping the scorer MCP-free.

## Invocation

```
/org-design <org> --mode=scenario [--workspace <path>]
```

- `<org>` → resolves `~/repos/onboard-<org>/` (same resolution + refusal as Phase 1; `--workspace` override supported for evals).
- `--mode=scenario` — Phase 2a routes the `split-team` operation. The specific operation (`split-team`) is gathered conversationally; non-`split-team` operations refuse with a Phase-2b message (see Modes).

## Mode wall

`analyze` and `scenario` are disjoint routes writing disjoint file namespaces:

| Mode | Namespace | Backtracking guardrail |
|---|---|---|
| `analyze` (Phase 1) | `decisions/<date>-org-analysis.md` | **ON** — any recommendation rewritten to a descriptive flag |
| `scenario` (Phase 2a) | `decisions/<date>-org-scenario-<slug>.md` | **OFF** — output is prescriptive by design |

SKILL.md states explicitly that the backtracking rule applies to `analyze` output only. The two routes never co-mutate a file (different namespaces), so prescription cannot leak into an analysis artifact.

## Scenario spec (`split-team`)

The orchestrator builds this fenced block from conversation, then hands it to the scorer:

```markdown
<!-- org-design:scenario -->
type: split-team
target_team: <team being split>
into:
  - name: <new team A>
    lead: <person>
    members: [<person>, <person>, ...]
  - name: <new team B>
    lead: <person>
    members: [<person>, ...]
new_reporting:            # optional; default = both leads report to target_team's former manager
  <new team A>: <manager>
  <new team B>: <manager>
<!-- /org-design:scenario -->
```

Validation of the spec itself (every member belongs to `target_team`, every member assigned to exactly one new team, leads ∈ members) is part of the scorer's parse step; a malformed spec is a usage error (non-zero exit), distinct from a structurally-invalid *result*.

## Scorer contract

`scripts/scenario-scorer.ts`, run via bun. Input: path to `org/structure.md` + path to the scenario-spec block (or both as stdin JSON). Output: JSON to stdout.

```ts
type ValidityFailure = {
  kind: 'orphaned_report' | 'reporting_cycle' | 'zero_report_manager' | 'subviable_oncall';
  detail: string;
  involved: string[];        // person/team names
};

interface ScenarioResult {
  valid: boolean;
  failures: ValidityFailure[];          // empty iff valid
  deltas: {
    teamsBefore: string[];
    teamsAfter: string[];
    movedReports: { person: string; from: string; to: string }[];
    addedTeams: string[];
    removedTeams: string[];
  };
  metrics: {
    span: Record<string, { before: number; after: number }>;     // by manager
    spof: { before: string[]; after: string[] };                 // SYSTEM-ownership SPOF only
    oncall: Record<string, { before: number; after: number }>;   // rotations per person
    ratio: Record<string, { m: number; ic: number }>;            // after-state, by team
  };
}
```

**Exit code**: 0 whenever the scorer ran to completion — `valid: false` is a *result*, not an error, and travels in the payload. Non-zero only for usage/parse failures (missing file, malformed structure table, malformed scenario spec).

**SPOF scope**: the scorer computes **system-ownership SPOF** (a `Critical systems owned` entry held by exactly one person — deterministic from the table). **Authority-SPOF** (memory power tags) is NOT in the scorer; the orchestrator overlays it during render with the Phase-1 degradation caveat when memory is unavailable.

## Validity rules (deterministic)

The projected org is **invalid** if any hold. Each produces a `ValidityFailure`:

1. **orphaned_report** — a person's `Reports to` references a manager not present in the projected structure.
2. **reporting_cycle** — following `Reports to` edges produces a cycle.
3. **zero_report_manager** — a row marked `M`, or a designated new-team `lead`, has zero direct reports after the mutation.
4. **subviable_oncall** — an on-call rotation is left with ≤1 person. Exactly 2 is valid-but-warned (surfaced in the delta table, not a failure), matching Phase-1's "thin rotation 1–2" observation.

Thresholds reused from `analysis-checks.md`: span >~7 wide / 1–2 narrow (reported, not a validity failure); manager:IC band ~1:5–1:8 (reported).

## Rendering

On `valid: true`, the orchestrator renders an in-memory artifact:

1. **Before/after charts** — two Mermaid `graph TD` org charts. BEFORE = current (reuse Phase-1 §1 styling). AFTER = projected; delta annotation: new teams/leads drawn with a heavier node style, moved reports labeled, removed reporting edges dropped.
2. **Delta summary table** — `metric | before | after | note`, covering span changes, system-SPOF before/after, on-call shifts, and after-state ratios. Authority-SPOF caveat appended if memory was unavailable.
3. **Narrative** — a short plain-language read of what the split changes and the residual risks the scorer flagged (e.g., a 2-person rotation warning).

## Gates

1. **Validity gate (machine)** — `result.valid === false` → orchestrator refuses, prints each `ValidityFailure` (kind + detail + involved), writes nothing. Idempotent: re-running the same broken spec reproduces the same refusal.
2. **Review gate (human, universal)** — `result.valid === true` → orchestrator prints the full rendered artifact + a "validity: passed" line, then **stops and requires an explicit user confirmation** before any write. No auto-persist. On confirm → atomic write. On decline → discard, nothing written. (Phase 2b's `reduce-headcount` inserts a heightened layoff acknowledgment ahead of this confirm.)

## Persistence

- Artifact: `<workspace>/decisions/<creation-date>-org-scenario-<slug>.md`. `<slug>` = `<target_team>-split` (kebab-cased).
- **Namespace invariant (distinct from analyze)**: multiple scenario files coexist (different slugs = different scenarios). A glob of `*-org-scenario-<slug>.md` with the same slug:
  - 0 files → create.
  - 1 file → mutate in place (idempotent re-run; same-slug regenerates the `<!-- org-design:auto -->` blocks, preserves user prose below the fence).
  - 2+ files same slug → refuse + list, same as Phase-1's consolidation refusal.
- Atomic write-temp-rename + `<!-- org-design:auto -->` fences (reuse Phase-1 machinery verbatim).

## Confidentiality

Unchanged from Phase 1: every workspace read passes `onboard-guard.ts refuse-raw <path>`; `interviews/raw/` and `notes/raw/` refuse. Scenario mode reads only `org/structure.md` and the stakeholder memory graph (for authority-SPOF overlay) — same surface as `analyze`.

## File layout

```
skills/org-design/
├── SKILL.md                       # extend: activate scenario route, mode-wall statement, version 0.2.0
├── scenario-checks.md             # NEW — scenario-spec format, split semantics, validity rules, chart-annotation rules
├── scripts/
│   ├── scenario-scorer.ts         # NEW — deterministic mutation + recompute + validity (bun)
│   └── scenario-scorer.test.ts    # NEW — co-located bun unit tests
├── analysis-checks.md             # unchanged (thresholds reused by the scorer)
├── structure-template.md          # unchanged (input schema reused)
└── evals/                         # extend with the 3 NEW behavioral evals (see Testing)

tests/fixtures/org-design/         # scenario fixtures + README (fixture↔eval matrix)
```

Writes into the per-org workspace only:
```
~/repos/onboard-<org>/decisions/<date>-org-scenario-<slug>.md
```

## Testing

**TS unit tests** (`scenario-scorer.test.ts`, bun test — TDD, written first):
- A valid `split-team` produces the correct `deltas` (moved reports, added/removed teams) and `metrics` (span/oncall/ratio before-after).
- Each validity failure triggers in isolation: orphaned_report, reporting_cycle, zero_report_manager, subviable_oncall (≤1) — and the 2-person rotation is valid-but-warned, not a failure.
- Malformed structure table / malformed scenario spec → non-zero exit (usage error), distinct from `valid: false`.

**Behavioral evals** (skill-level, mirror Phase-1's single-eval pattern):
1. `scenario-split-valid` — a valid split renders before/after + reaches the review gate and does **not** auto-persist (no file written without confirmation).
2. `scenario-invalid-refusal` — a split that orphans a report → REFUSE, no write, failure surfaced.
3. `scenario-mode-wall` — a scenario run does not read or mutate any `*-org-analysis.md`; analyze's backtracking guardrail is not invoked.

**Conformance**:
- `validate.fish` frontmatter phase (skill already passes; description updated, version bumped).
- Fixture↔eval README contract (the Phase-1 fixture-README requirement, `tests/fixtures/org-design/README.md`) — extend for scenario fixtures.
- `docs/catalog.md` mode list updated.

## Acceptance Criteria

Maps the Phase-2 subset that #35 + the Phase-1 spec deferred, scoped to `split-team`:

- [ ] `--mode=scenario` routes a `split-team` operation; non-`split-team` operations refuse with a Phase-2b message.
- [ ] Split intent is gathered conversationally and transcribed into the `org-design:scenario` spec block.
- [ ] `scenario-scorer.ts` deterministically applies the split, recomputes span / system-SPOF / on-call / ratio, and returns the `ScenarioResult` contract (validity in payload, exit 0 on completion).
- [ ] Validity gate refuses + writes nothing on any of the four structural failures; failures are surfaced with kind + involved names.
- [ ] Review gate prints the full artifact and requires explicit user confirmation before any write; decline writes nothing.
- [ ] Before/after Mermaid charts render; AFTER annotates new teams/leads + moved reports; delta table reports metric before/after.
- [ ] Artifact persists to `decisions/<date>-org-scenario-<slug>.md`; same-slug re-run mutates in place preserving user prose; 2+ same-slug refuses.
- [ ] Mode wall holds: scenario output never touches `*-org-analysis.md`; analyze's backtracking guardrail unaffected.
- [ ] NDA refusal inherited (`interviews/raw/` refused); authority-SPOF degrades (announced) when memory unavailable.
- [ ] `scenario-scorer.test.ts` covers happy path + each validity failure + usage errors; three behavioral evals pass.

## Phases

- **Phase 2a (this spec)** — `split-team` end-to-end: scorer, both gates, before/after charts, new namespace. Proves the engine, the mode wall, and the gate machinery on one operation.
- **Phase 2b** — remaining operations (`add-headcount`, `reduce-headcount`, `merge-teams`, `change-reporting`), the multi-scenario trade-off matrix, recommended-option output, and the heightened layoff acknowledgment for `reduce-headcount`. Separate spec.

## Out-of-Scope Notes

- The review gate is built universal in 2a (every scenario requires explicit confirm before persist) so it is not dead scaffolding pending 2b — it guards `split-team` today. The layoff-specific *heightened* acknowledgment is the only review-gate addition 2b makes.
- Authority-SPOF stays in the orchestrator (not the scorer) to keep the scorer pure and MCP-free; this mirrors Phase-1's memory-degradation handling.
- TS scorer scope is deliberately the math + validity only; rendering stays in the orchestrator (LLM) — promoting rendering to TS buys nothing and costs flexibility on chart annotation.
