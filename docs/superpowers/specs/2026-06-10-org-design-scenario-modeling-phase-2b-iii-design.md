# /org-design Phase 2b-iii — multi-scenario trade-off matrix + recommended-option + eval flip

**Date**: 2026-06-10
**Issue**: #35 (Phase 2b, sub-phase iii of iii — the FINAL 2b slice; #35 closes when this ships)
**Predecessors**: [Phase 1 spec](2026-06-08-org-design-analyze-inherited-design.md) (#468) · [Phase 2a spec](2026-06-08-org-design-scenario-modeling-phase-2a-design.md) (`split-team`, #470) · [Phase 2b-i spec](2026-06-09-org-design-scenario-modeling-phase-2b-i-design.md) (`add`/`merge`/`change-reporting`, #471) · [Phase 2b-ii spec](2026-06-09-org-design-scenario-modeling-phase-2b-ii-design.md) (`reduce-headcount` + layoff ack, MERGED #474, main 8e51323) · [2b breadcrumb](../decisions/2026-06-09-org-design-phase-2b.md).
**Pipeline state**: DTP ✅ + systems-analysis ✅ (breadcrumb, covers all of 2b incl. matrix + recommended-option) → brainstorming ✅ (this spec, 2026-06-10 session). Resume at `writing-plans`.

## Phase 2b decomposition (recap)

- **2b-i** — discriminated-union scorer refactor + `add-headcount` / `merge-teams` / `change-reporting`. SHIPPED (#471).
- **2b-ii** — `reduce-headcount` (5th mode) + machine layoff acknowledgment gate. SHIPPED (#474).
- **2b-iii (THIS SPEC)** — multi-scenario trade-off matrix + recommended-option output across the 5 modes, plus the experimental→stable confirmatory eval flip. Closes #35.

## Problem Statement (from DTP/breadcrumb, scoped to 2b-iii)

- **User**: Director/VP at days 60+ in an `/onboard <org>` workspace; can model all five structural moves one at a time (2a + 2b-i + 2b-ii).
- **Problem (2b-iii slice)**: A real reorg weighs *several* options against each other, then picks one. Today the skill scores one scenario per run — the comparison happens in the user's head, off the artifact, where the second-order trade-offs that matter most are invisible. And there is no prescriptive output: the skill stops at "here is what this one move does." The missing piece is side-by-side comparison + a recommended option.
- **Impact**: Comparison-in-the-head means the highest-stakes, least-reversible call (which of N moves to make) is made without the structural facts laid side by side. A bad recommendation shape is its own risk: a bare machine "do this" rubber-stamps an irreversible org decision.
- **Evidence**: #35 acceptance criteria explicitly list "trade-off matrix comparing options" and "recommended option with rationale"; 2a/2b specs enumerate both as the final deferred 2b items; breadcrumb systems-analysis item 2 flags `recommended-option` as the first place the skill prescribes and demands "rank + show work + flag irreversibility, NEVER a bare 'do this.'"
- **Constraints**: Build on the shipped scorer (discriminated-union `ScenarioSpec`, `run()` → `ScenarioResult`, the four validity rules, the reduce ack gate). Reuse mode wall, NDA guard, section fences, atomic write, the universal review gate. No HRIS; manual `org/structure.md`; filesystem only. Do not regress 2a/2b-i/2b-ii tests.

## Systems Analysis (from breadcrumb, confirmed)

**Reused substrate (shipped):** `compareScenarios` is built ON TOP of `run()` — per-scenario it calls the existing `run(structureMd, spec)` verbatim, so every validity rule, metric (incl. `unownedAfter`), delta, and the reduce ack gate are inherited unchanged. No mutation function, validity rule, or metric is touched.

**New in 2b-iii + risk:**
1. **First prescriptive output (`recommended-option`).** Resolved per breadcrumb SA item 2 and the 2026-06-10 brainstorming: ranking lives in the **orchestrator as judgment prose** ("Ranking locus B"), fed by **objective comparison facts the deterministic scorer owns**. The scorer emits NO scalar score and NO winner field — only a fact partition (valid/invalid) + per-scenario risk-flag tally + a per-mode reversibility tag. The orchestrator ranks WITH shown work, frames the output as a decision aid, and flags irreversibility. This keeps the deterministic/judgment split the whole skill is built on, and dodges the false-precision org-quality scalar that a machine "winner" would require.
2. **All-invalid edge case.** A matrix where every option is invalid must say "no valid option + why each breaks" and emit NO recommendation — not a broken pick. The scorer's `validLabels`/`invalidLabels` partition makes this a structural fact; SKILL.md keys the no-recommendation branch off `validLabels.length === 0`.
3. **Output size with N scenarios.** N before/after Mermaid pairs blow up the artifact. Resolved: the matrix table covers all N; full before/after Mermaid renders for the **top-ranked option only** by default, the rest on explicit request.
4. **No new validity rule, no new metric.** Comparison is a pure read over the existing `ScenarioResult[]`.

## Decisions (this session's brainstorming)

1. **Ranking locus** — comparison FACTS in the scorer (`compareScenarios` → `MatrixResult`); RANKING in orchestrator prose. No scalar, no winner field. (Approach B.)
2. **Irreversibility** — a fixed 3-tier per-mode tag in the scorer: `reduce-headcount` = `irreversible`, `merge-teams` = `costly-to-reverse`, `split-team`/`add-headcount`/`change-reporting` = `reversible`. Magnitude stays in the metric deltas (YAGNI on per-headcount scaling).
3. **Eval scope for the stable flip** — add a multi-scenario matrix eval + a reduce-headcount ack-gate eval (the two genuinely-new / highest-stakes 2b behaviors; add/merge/change are lower-stakes structural variants of the already-eval'd split path). Run 3–5×, then flip `status: experimental → stable`.
4. **Matrix slug** — fixed `matrix` slug → `decisions/<date>-org-scenario-matrix.md`; same-day mutate-in-place; 2+ refuse+list. Per-comparison slugs get unwieldy; YAGNI on multi-matrix-per-day.
5. **Mermaid bound** — full before/after charts for the top-ranked option only by default; others on request.

## Scope

**In scope (Phase 2b-iii)**:
- `Reversibility` type + exhaustive `REVERSIBILITY` per-mode map.
- `ScenarioComparison` + `MatrixResult` interfaces.
- `compareScenarios(structureMd, specs[])` pure function — calls `run()` per scenario, derives `riskFlags` from each `ScenarioResult`, partitions valid/invalid. NO scalar, NO winner.
- `--matrix` CLI branch: `scenario-scorer.ts --matrix <struct.md> <manifest.json>` → `MatrixResult` JSON. Same exit contract (64/65/0).
- SKILL.md: new multi-scenario route — gather N scenarios → manifest → `--matrix` → render trade-off matrix table + ranked recommended-option (decision-aid framing, irreversibility flag, all-invalid branch) → review gate → persist to `matrix` slug. Version `0.4.0 → 0.5.0`. `status: experimental → stable` (AFTER the eval flip passes).
- scenario-checks.md: matrix section — compare flow, risk-flag derivation, reversibility tags, recommended-option contract, all-invalid rule, matrix render + persist.
- Co-located scorer unit tests + two behavioral evals. Existing 2a/2b-i/2b-ii tests unchanged.

**Out of scope (deferred past 2b)**:
- Excalidraw rendering (Mermaid only).
- Automated `/strategy-doc` hand-off (user folds output into notes manually).
- HRIS / directory auto-import (structure is manual by design).
- Any scalar org-quality score or auto-applied recommendation.

## Approach

Same hybrid: the deterministic scorer owns mutation + recompute + validity + the ack gate + (new) the comparison facts; SKILL.md orchestrates gather / score / render / rank / review / persist. 2b-iii adds one pure read-over-results function, one CLI branch, one metric-free fact struct. No new layer, no new validity rule, no new metric, no scalar.

### Reversibility tag + comparison structs

```ts
export type Reversibility = "reversible" | "costly-to-reverse" | "irreversible";

// Exhaustive over ScenarioSpec["type"] — a future 6th mode forces a compile
// error here, so the reversibility tag can never silently default.
const REVERSIBILITY: Record<ScenarioSpec["type"], Reversibility> = {
  "split-team": "reversible",
  "add-headcount": "reversible",
  "change-reporting": "reversible",
  "merge-teams": "costly-to-reverse",
  "reduce-headcount": "irreversible",
};

export interface ScenarioComparison {
  label: string;                  // caller-supplied scenario label
  type: ScenarioSpec["type"];
  reversibility: Reversibility;
  result: ScenarioResult;         // full single-scenario result, reused verbatim
  riskFlags: string[];            // objective, derived ONLY from `result`
}

export interface MatrixResult {
  scenarios: ScenarioComparison[];
  validLabels: string[];          // objective partition — fuels the all-invalid branch
  invalidLabels: string[];        // NO winner, NO scalar score
}
```

### `compareScenarios`

```ts
export function compareScenarios(
  structureMd: string,
  specs: { label: string; spec: ScenarioSpec }[],
): MatrixResult {
  const scenarios = specs.map(({ label, spec }) => {
    const result = run(structureMd, spec);   // inherits validity + metrics + reduce ack gate
    return {
      label,
      type: spec.type,
      reversibility: REVERSIBILITY[spec.type],
      result,
      riskFlags: deriveRiskFlags(result),
    };
  });
  return {
    scenarios,
    validLabels: scenarios.filter((s) => s.result.valid).map((s) => s.label),
    invalidLabels: scenarios.filter((s) => !s.result.valid).map((s) => s.label),
  };
}
```

- **Ack-gate inheritance**: because each scenario goes through `run()`, a manifest carrying an unacknowledged `reduce-headcount` (`acknowledged !== true`) throws inside `applyReduce` — `compareScenarios` propagates the throw; the CLI catches it and exits 65. No separate gate in the matrix path; the layoff gate cannot be bypassed by batching.

### `deriveRiskFlags` — objective, results-only

```ts
function deriveRiskFlags(r: ScenarioResult): string[] {
  const flags: string[] = [];
  for (const f of r.failures) flags.push(f.kind);                 // invalid scenarios surface every failure kind
  if (r.metrics.unownedAfter.length) flags.push("unowned-systems"); // 1->0 owner — distinct from SPOF
  if (r.metrics.spof.after.length) flags.push("spof-after");      // ≥1 system still single-owned
  const widest = Math.max(0, ...Object.values(r.metrics.span).map((s) => s.after));
  if (widest > 7) flags.push("wide-span");                        // span threshold reused from analysis-checks
  return flags;
}
```

Strictly a read over fields already in `ScenarioResult`; no new inputs, no new metric, eval-pinnable. (Thin-rotation / 2-person warning stays a render-time concern, not a `ScenarioResult.metrics` field — out of scope for the deterministic flag tally.)

### CLI — additive `--matrix` branch

```
scenario-scorer.ts <struct.md> <spec.json>                 # single, unchanged
scenario-scorer.ts --matrix <struct.md> <manifest.json>    # manifest = [{ "label": str, "spec": {...} }, ...]
```

- Manifest is a JSON array of `{ label, spec }`. Each `spec.type` validated with `isScenarioType` (unknown → exit 65, same as single mode).
- Output: `MatrixResult` JSON on stdout, exit 0.
- Exit contract preserved: missing args → 64 (EX_USAGE); parse / unknown-type / unack-reduce throw → 65 (EX_DATAERR).

### SKILL.md — multi-scenario route

A new branch of `--mode=scenario` (triggered when the user asks to compare ≥2 options):

1. **Confidentiality / structure gate** — unchanged.
2. **Gather each scenario** — reuse the existing per-mode gather (incl. the reduce-headcount gather-then-acknowledge step for any reduce scenario in the set; gravity is surfaced and confirmed per scenario before its `acknowledged:true` is set). Build a manifest array of `{ label, spec }`.
3. **Score** — write the manifest to a temp JSON, run `bun run skills/org-design/scripts/scenario-scorer.ts --matrix <struct.md> <manifest.json>`, parse `MatrixResult`. An unacknowledged reduce in the set exits 65 with the ack-gate message — surface the refusal, stop.
4. **Render the trade-off matrix** — a markdown table, one row per scenario:

   ```
   | Scenario | Valid | Reversibility | SPOF after | Unowned after | Widest span | Key risks |
   |---|---|---|---|---|---|---|
   ```

   Then full before/after Mermaid `graph TD` for the **top-ranked** option only (others on request). `unownedAfter` still gets its loud per-scenario line where non-empty.
5. **Recommended option** — ranked list WITH shown work:
   - Order: valid options first; among valid, fewer risk flags ranks higher; surface ties as ties (do not break a genuine tie arbitrarily).
   - Each entry states the reasoning (which risk flags, what the deltas show, the reversibility tag).
   - Irreversibility flagged prominently: an `irreversible` option (reduce-headcount) carries a heightened-caution line even when it ranks well — it demands the layoff review, never a rubber-stamp.
   - Header frames it literally as a decision aid: *"Recommended (decision aid — you decide)."* Never a bare "do this."
   - **All-invalid branch** (`validLabels.length === 0`): list each scenario's failure reasons; emit NO recommendation; tell the user to fix the structural break first.
6. **Review gate** — print the full matrix artifact + `validity:` summary, STOP, require explicit confirm before write. No auto-persist.
7. **Persist** (on confirm) — atomic write-temp-rename to `decisions/<date>-org-scenario-matrix.md` (fixed `matrix` slug), `<!-- org-design:auto -->` fences. Same-day mutate-in-place; 2+ `matrix` files refuse + list.

The single-scenario route is unchanged; the matrix route is additive.

## scenario-checks.md changes

- New "Multi-scenario trade-off matrix (Phase 2b-iii)" section: the compare flow, the manifest shape, `deriveRiskFlags` rules, the 3-tier reversibility table, the recommended-option contract (decision-aid framing, rank order, irreversibility flag, all-invalid → no recommendation), the matrix render columns, and the `matrix`-slug persistence rule.
- Note that the reduce ack gate is inherited per-scenario through `run()` — no separate matrix gate.

## SKILL.md changes (summary)

- Route the compare-≥2 branch (above).
- Version `0.4.0 → 0.5.0`.
- `status: experimental → stable` — applied ONLY after the two new evals pass 3–5× green.
- Update "Out of scope" heading from Phase 2b-ii to reflect 2b-iii shipped (matrix + recommended-option now in scope; Excalidraw / strategy-doc / HRIS remain deferred).
- Description: add the matrix + recommended-option capability to the scenario-mode sentence.

## Tests (scorer — TDD, extend `scenario-scorer.test.ts`)

- **compareScenarios partition** — two valid scenarios → both in `scenarios[]`, `validLabels` has both, `invalidLabels` empty.
- **mixed valid/invalid** — one valid split + one invalid reduce (orphaned_report) → correct partition; the invalid one's `riskFlags` includes `orphaned_report`.
- **all-invalid** — every spec invalid → `validLabels` empty (drives the orchestrator no-recommendation branch).
- **reversibility tag** — one assertion per mode (or a table test) that `reversibility` matches the `REVERSIBILITY` map.
- **riskFlags derivation** — a reduce that unowns `billing-service` → `unowned-systems` flag; a scenario with a >7 span → `wide-span`; a clean reversible split → `[]`.
- **ack-gate inheritance** — a manifest containing a `reduce-headcount` with `acknowledged:false` → `compareScenarios` throws `/acknowledgment gate/i`.
- **CLI `--matrix`** — valid manifest → exit 0 + `MatrixResult` with concrete `validLabels`; manifest with an unack reduce → exit 65 + ack message; malformed manifest / unknown type → 65; `--matrix` with missing paths → 64.
- **Regression** — all 2a + 2b-i + 2b-ii tests pass unchanged.

## Evals (behavioral — `evals/evals.json`) → then flip

Reuse the `split-valid` fixture (6-person orgfix-acme) as the source for both new evals (`cp -r` to distinct tmp dirs in setup).

1. **`scenario-matrix`** — prompt: compare two scenarios (split Payments into Core/Infra vs merge Platform+Payments under Dana) on `orgfix-acme`.
   - `tool_input_matches` Bash `command` contains `--matrix` (required) — the deterministic matrix path actually ran, not an LLM-assembled comparison.
   - `regex` matrix table header shape (e.g. `Reversibility`) (required).
   - `regex` recommended-option / decision-aid framing (required).
   - `regex` irreversibility surfaced (diagnostic or required per RED/GREEN).
   - `not_regex` no auto-persist before confirm (required) — `(wrote|saved|created)\b[^.]{0,40}org-scenario` absent.
2. **`scenario-reduce-ack-gate`** — prompt: model cutting a named person (a real layoff) on `orgfix-acme`.
   - `regex` layoff gravity surfaced (acknowledgment / layoff language) (required) — engineer the prompt to force adjacent verbal output per `feedback_eval_silent_path_prompts` so a correctly-gated single turn still emits the gravity line.
   - `not_regex` no `acknowledged:true` auto-persist without confirmation (required).
   - skill-invocation / scorer-invocation tiers per the 2a diagnostic precedent (slash-prefix Skill re-emit unreliable under single-turn `claude --print`).
   - RED/GREEN tune text-tier assertions; re-run 3–5× per `rules_evals_redgreen_procedure`. Subscription auth: `env -u ANTHROPIC_API_KEY bun run tests/eval-runner-v2.ts org-design`.
3. **Flip** — once both evals are green 3–5×, set `status: stable` + `version: 0.5.0` in SKILL.md.

## File layout

```
skills/org-design/
├── SKILL.md                       # compare route, matrix render, recommended-option, version 0.5.0, status stable (post-eval)
├── scenario-checks.md             # multi-scenario matrix section
├── scripts/
│   ├── scenario-scorer.ts         # Reversibility + REVERSIBILITY + ScenarioComparison + MatrixResult + compareScenarios + deriveRiskFlags + --matrix CLI
│   └── scenario-scorer.test.ts    # compareScenarios + matrix + CLI tests
├── evals/
│   └── evals.json                 # + scenario-matrix + scenario-reduce-ack-gate; description updated
├── analysis-checks.md             # unchanged
└── structure-template.md          # unchanged
tests/fixtures/org-design/
└── split-valid/                   # reused as source for both new evals (no new fixture)
```

## Verification

- `cd skills/org-design/scripts && bun test scenario-scorer.test.ts` — all pass (compareScenarios partition/mixed/all-invalid, reversibility, riskFlags, ack-gate inheritance, `--matrix` CLI, 2a+2b-i+2b-ii regression).
- `bunx tsc --noEmit` from repo root — clean; `REVERSIBILITY` record exhaustive across the five-arm union.
- CLI smoke: a 2-scenario manifest emits a `MatrixResult` with populated `validLabels`; a manifest with an unacknowledged reduce exits 65 with the ack message.
- `env -u ANTHROPIC_API_KEY bun run tests/eval-runner-v2.ts org-design` — green; the two new evals re-run 3–5× for text-tier stability.
- Only after evals pass: flip `status: stable`.

## Notes

- **Final 2b sub-phase**: keep `Re #35` in commits; the FINAL PR body uses `Closes #35` (squash-merge auto-close from a branch commit would close #35 early — per `feedback_gh_squash_branch_commit_autoclose`, use `Re #35` in commits and `Closes #35` only in the PR body).
- The experimental→stable flip was deferred from the 2a PR test plan through 2b-i and 2b-ii; it lands here as the last 2b act.
- Execution: single-implementer TDD (≤6 tasks, scorer primary, ~250–300 LOC); final review = ruflo review-swarm on the diff. squash-only merges; docs/issues at plain reading level.
- Build on a clean `feature/org-design-phase-2b-iii` branch off `main` (done). #473 (F3 slug-convention) is independent, not a blocker.
