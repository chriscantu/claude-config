# org-design Phase 2b-iii Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-scenario trade-off matrix + recommended-option output across the 5 org-design scenario modes, then flip the skill `status: experimental → stable` after two new behavioral evals pass.

**Architecture:** A new deterministic `compareScenarios()` in `scenario-scorer.ts` calls the existing `run()` per scenario and emits objective comparison facts (valid/invalid partition, per-scenario risk-flag tally, 3-tier per-mode reversibility tag) — no scalar, no winner. A `--matrix` CLI branch exposes it. SKILL.md orchestrates the compare flow and owns the ranking/recommendation prose (decision-aid framing, irreversibility flag, all-invalid branch). The reduce-headcount layoff ack gate is inherited per-scenario through `run()`.

**Tech Stack:** TypeScript, Bun (`bun test`, `bunx tsc`), bun:test. Spec: `docs/superpowers/specs/2026-06-10-org-design-scenario-modeling-phase-2b-iii-design.md`.

---

## File Structure

- `skills/org-design/scripts/scenario-scorer.ts` — **Modify.** Add `Reversibility` type, `REVERSIBILITY` map, `ScenarioComparison` + `MatrixResult` interfaces, private `deriveRiskFlags()`, exported `compareScenarios()`, and a `--matrix` CLI branch. Additive — no existing function touched.
- `skills/org-design/scripts/scenario-scorer.test.ts` — **Modify.** Add `describe("compareScenarios")` + `describe("CLI --matrix")`. Existing tests unchanged.
- `skills/org-design/scenario-checks.md` — **Modify.** Add the multi-scenario matrix section.
- `skills/org-design/SKILL.md` — **Modify.** Add the compare route + matrix render + recommended-option contract; bump `version` to `0.5.0`; flip `status` to `stable` (final task only, post-eval).
- `skills/org-design/evals/evals.json` — **Modify.** Add `scenario-matrix` + `scenario-reduce-ack-gate` evals; update `description`.
- `tests/fixtures/org-design/split-valid/` — **Reuse** as the source fixture for both new evals (no new fixture file).

Commit convention: every commit message ends with `Re #35` (NOT `Closes` — that lands only in the final PR body, per `feedback_gh_squash_branch_commit_autoclose`). Co-author trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## Task 1: `compareScenarios` core (types + function)

**Files:**
- Modify: `skills/org-design/scripts/scenario-scorer.ts` (insert after the `run()` function, before the `// --- CLI entrypoint` block at ~line 352)
- Test: `skills/org-design/scripts/scenario-scorer.test.ts` (append new `describe` block; extend the top-of-file import)

- [ ] **Step 1: Write the failing tests**

First extend the import line at the top of `scenario-scorer.test.ts` to add the new symbols:

```ts
import { parseStructure, type Person, type Role, applySplit, type SplitTeamSpec, computeMetrics, checkValidity, type ValidityFailure, run, type ScenarioResult, applyMerge, type MergeTeamsSpec, applyAdd, type AddHeadcountSpec, applyReporting, type ChangeReportingSpec, applyReduce, type ReduceHeadcountSpec, isScenarioType, compareScenarios, type MatrixResult } from "./scenario-scorer.ts";
```

Then append this block to the end of the file:

```ts
describe("compareScenarios", () => {
  const MERGE: MergeTeamsSpec = {
    type: "merge-teams", teams: ["Platform", "Payments"], newName: "Eng", survivingManager: "Dana",
  };

  test("partitions two valid scenarios; no winner/scalar emitted", () => {
    const m: MatrixResult = compareScenarios(FIXTURE, [
      { label: "split", spec: SPLIT },
      { label: "merge", spec: MERGE },
    ]);
    expect(m.scenarios.map((s) => s.label)).toEqual(["split", "merge"]);
    expect(m.validLabels.sort()).toEqual(["merge", "split"]);
    expect(m.invalidLabels).toEqual([]);
    // structural guarantee: facts only, never a collapsed score or a pick
    expect(m).not.toHaveProperty("winner");
    expect(m).not.toHaveProperty("score");
  });

  test("mixed valid/invalid: partition + the invalid scenario's failure kind surfaces as a risk flag", () => {
    const m = compareScenarios(FIXTURE, [
      { label: "split", spec: SPLIT },
      { label: "cut-sam", spec: { type: "reduce-headcount", cut: ["Sam"], acknowledged: true } },
    ]);
    expect(m.validLabels).toEqual(["split"]);
    expect(m.invalidLabels).toEqual(["cut-sam"]);
    const cutSam = m.scenarios.find((s) => s.label === "cut-sam")!;
    expect(cutSam.riskFlags).toContain("orphaned_report"); // Jordan/Riley -> removed Sam
  });

  test("all-invalid: validLabels is empty (drives the no-recommendation branch)", () => {
    const m = compareScenarios(FIXTURE, [
      { label: "cut-sam", spec: { type: "reduce-headcount", cut: ["Sam"], acknowledged: true } },
      { label: "cut-riley", spec: { type: "reduce-headcount", cut: ["Riley"], acknowledged: true } },
    ]);
    expect(m.validLabels).toEqual([]);
    expect(m.invalidLabels.sort()).toEqual(["cut-riley", "cut-sam"]);
  });

  test("3-tier reversibility tag is attached per mode regardless of validity", () => {
    const m = compareScenarios(FIXTURE, [
      { label: "a", spec: SPLIT },
      { label: "b", spec: { type: "add-headcount", hires: [{ person: "Pat", role: "IC", team: "Payments", reportsTo: "Sam", systems: [], oncall: [], skills: [] }] } },
      { label: "c", spec: { type: "change-reporting", reassign: { Jordan: "Dana" } } },
      { label: "d", spec: MERGE },
      { label: "e", spec: { type: "reduce-headcount", cut: ["Riley"], acknowledged: true } },
    ]);
    const rev = Object.fromEntries(m.scenarios.map((s) => [s.type, s.reversibility]));
    expect(rev["split-team"]).toBe("reversible");
    expect(rev["add-headcount"]).toBe("reversible");
    expect(rev["change-reporting"]).toBe("reversible");
    expect(rev["merge-teams"]).toBe("costly-to-reverse");
    expect(rev["reduce-headcount"]).toBe("irreversible");
  });

  test("riskFlags: cutting a sole system owner flags unowned-systems", () => {
    const m = compareScenarios(FIXTURE, [
      { label: "cut-jordan", spec: { type: "reduce-headcount", cut: ["Jordan"], acknowledged: true } },
    ]);
    expect(m.scenarios[0].riskFlags).toContain("unowned-systems"); // billing-service 1->0
  });

  test("riskFlags: a span wider than 7 flags wide-span", () => {
    const hires: Person[] = Array.from({ length: 8 }, (_, i) => ({
      person: `H${i}`, role: "IC" as Role, team: "Platform", reportsTo: "Dana", systems: [], oncall: [], skills: [],
    }));
    const m = compareScenarios(FIXTURE, [
      { label: "stack-dana", spec: { type: "add-headcount", hires } },
    ]);
    expect(m.scenarios[0].riskFlags).toContain("wide-span"); // Dana 1 -> 9 reports
  });

  test("riskFlags: a valid split flags the persisting SPOF but NOT unowned-systems", () => {
    const m = compareScenarios(FIXTURE, [{ label: "split", spec: SPLIT }]);
    const flags = m.scenarios[0].riskFlags;
    expect(flags).toContain("spof-after");        // billing-service still sole-owned by Jordan
    expect(flags).not.toContain("unowned-systems"); // split keeps every owner
  });

  test("ack gate is inherited: an unacknowledged reduce in the set throws", () => {
    expect(() =>
      compareScenarios(FIXTURE, [
        { label: "split", spec: SPLIT },
        { label: "cut", spec: { type: "reduce-headcount", cut: ["Riley"], acknowledged: false } },
      ]),
    ).toThrow(/acknowledgment gate/i);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd skills/org-design/scripts && bun test scenario-scorer.test.ts -t compareScenarios`
Expected: FAIL — `compareScenarios` is not exported / not defined.

- [ ] **Step 3: Write the minimal implementation**

Insert into `scenario-scorer.ts` immediately after the closing `}` of `run()` (after ~line 350) and before the `// --- CLI entrypoint` comment:

```ts
export type Reversibility = "reversible" | "costly-to-reverse" | "irreversible";

// Exhaustive over ScenarioSpec["type"] — a future 6th mode forces a compile
// error here, so the reversibility tag can never silently default to a wrong tier.
const REVERSIBILITY: Record<ScenarioSpec["type"], Reversibility> = {
  "split-team": "reversible",
  "add-headcount": "reversible",
  "change-reporting": "reversible",
  "merge-teams": "costly-to-reverse",
  "reduce-headcount": "irreversible",
};

export interface ScenarioComparison {
  label: string;
  type: ScenarioSpec["type"];
  reversibility: Reversibility;
  result: ScenarioResult;
  riskFlags: string[];
}

export interface MatrixResult {
  scenarios: ScenarioComparison[];
  validLabels: string[];
  invalidLabels: string[];
}

// Objective risk-flag tally, derived ONLY from a ScenarioResult (no new inputs).
// Eval-pinnable and metric-free: every flag traces to a field already on the result.
function deriveRiskFlags(r: ScenarioResult): string[] {
  const flags: string[] = [];
  for (const f of r.failures) flags.push(f.kind);                    // invalid scenarios surface each failure kind
  if (r.metrics.unownedAfter.length > 0) flags.push("unowned-systems"); // a system that lost its last owner (1->0)
  if (r.metrics.spof.after.length > 0) flags.push("spof-after");     // >=1 system still single-owned after
  const widest = Math.max(0, ...Object.values(r.metrics.span).map((s) => s.after));
  if (widest > 7) flags.push("wide-span");                           // span threshold reused from analysis-checks
  return flags;
}

// Multi-scenario comparison. Calls run() per scenario, so every validity rule,
// metric, and the reduce-headcount layoff ack gate are inherited unchanged. Emits
// objective facts only — NO scalar score, NO winner; ranking is the orchestrator's
// judgment (SKILL.md), reconciling observe-before-act / rubber-stamp risk.
export function compareScenarios(
  structureMd: string,
  specs: { label: string; spec: ScenarioSpec }[],
): MatrixResult {
  const scenarios: ScenarioComparison[] = specs.map(({ label, spec }) => {
    const result = run(structureMd, spec);
    return { label, type: spec.type, reversibility: REVERSIBILITY[spec.type], result, riskFlags: deriveRiskFlags(result) };
  });
  return {
    scenarios,
    validLabels: scenarios.filter((s) => s.result.valid).map((s) => s.label),
    invalidLabels: scenarios.filter((s) => !s.result.valid).map((s) => s.label),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd skills/org-design/scripts && bun test scenario-scorer.test.ts -t compareScenarios`
Expected: PASS — all 8 compareScenarios tests green.

- [ ] **Step 5: Type-check**

Run: `cd /Users/cantu/repos/claude-config && bunx tsc --noEmit`
Expected: clean (the `REVERSIBILITY` record is exhaustive across the five-arm union).

- [ ] **Step 6: Commit**

```fish
git add skills/org-design/scripts/scenario-scorer.ts skills/org-design/scripts/scenario-scorer.test.ts
git commit -m "feat(org-design): compareScenarios — facts-only multi-scenario comparison

Re #35

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `--matrix` CLI branch

**Files:**
- Modify: `skills/org-design/scripts/scenario-scorer.ts` (the `if (import.meta.main)` block, ~line 352-369)
- Test: `skills/org-design/scripts/scenario-scorer.test.ts` (append `describe("CLI --matrix")`)

- [ ] **Step 1: Write the failing tests**

Append to `scenario-scorer.test.ts`:

```ts
describe("CLI --matrix", () => {
  const script = `${import.meta.dir}/scenario-scorer.ts`;
  let dir: string;
  let STRUCT: string;
  let MANIFEST: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "matrix-cli-"));
    STRUCT = join(dir, "struct.md");
    MANIFEST = join(dir, "manifest.json");
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const cli = async (manifest: unknown): Promise<{ code: number; out: string; err: string }> => {
    await Bun.write(STRUCT, FIXTURE);
    await Bun.write(MANIFEST, JSON.stringify(manifest));
    const proc = Bun.spawn(["bun", script, "--matrix", STRUCT, MANIFEST], { stdout: "pipe", stderr: "pipe" });
    const code = await proc.exited;
    const out = await new Response(proc.stdout).text();
    const err = await new Response(proc.stderr).text();
    return { code, out, err };
  };

  test("valid manifest dispatches: exit 0 + MatrixResult with concrete validLabels", async () => {
    const { code, out } = await cli([
      { label: "split", spec: { type: "split-team", targetTeam: "Payments", into: [
        { name: "Payments-Core", lead: "Jordan", members: ["Jordan"] },
        { name: "Payments-Infra", lead: "Riley", members: ["Riley"] },
      ] } },
      { label: "merge", spec: { type: "merge-teams", teams: ["Platform", "Payments"], newName: "Eng", survivingManager: "Dana" } },
    ]);
    expect(code).toBe(0);
    const parsed = JSON.parse(out);
    expect(parsed.validLabels.sort()).toEqual(["merge", "split"]);
    expect(parsed.scenarios.length).toBe(2);
  });

  test("a manifest with an unacknowledged reduce exits 65 via the inherited ack gate", async () => {
    const { code, err } = await cli([
      { label: "cut", spec: { type: "reduce-headcount", cut: ["Riley"], acknowledged: false } },
    ]);
    expect(code).toBe(65);
    expect(err).toMatch(/acknowledgment gate/i);
  });

  test("a manifest with an unknown scenario type exits 65 (EX_DATAERR)", async () => {
    const { code, err } = await cli([{ label: "bogus", spec: { type: "teleport" } }]);
    expect(code).toBe(65);
    expect(err).toMatch(/unsupported scenario type/i);
  });

  test("--matrix with a missing manifest path exits 64 (EX_USAGE)", async () => {
    await Bun.write(STRUCT, FIXTURE);
    const proc = Bun.spawn(["bun", script, "--matrix", STRUCT], { stdout: "pipe", stderr: "pipe" });
    expect(await proc.exited).toBe(64);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd skills/org-design/scripts && bun test scenario-scorer.test.ts -t "CLI --matrix"`
Expected: FAIL — `--matrix` is treated as a structure path by the existing CLI; manifest parse / exit codes wrong.

- [ ] **Step 3: Write the minimal implementation**

Replace the entire `if (import.meta.main) { ... }` block at the bottom of `scenario-scorer.ts` with:

```ts
// --- CLI entrypoint ---
//   single:  scenario-scorer.ts <structure.md path> <scenario.json path>
//   matrix:  scenario-scorer.ts --matrix <structure.md path> <manifest.json path>
//            manifest = [{ "label": string, "spec": ScenarioSpec }, ...]
if (import.meta.main) {
  const argv = process.argv.slice(2);
  if (argv[0] === "--matrix") {
    const [, structPath, manifestPath] = argv;
    if (!structPath || !manifestPath) {
      console.error("usage: scenario-scorer.ts --matrix <structure.md path> <manifest.json path>");
      process.exit(64); // EX_USAGE
    }
    try {
      const md = await Bun.file(structPath).text();
      const manifest = JSON.parse(await Bun.file(manifestPath).text()) as { label: string; spec: ScenarioSpec }[];
      for (const entry of manifest) {
        const t = (entry.spec as { type?: string })?.type ?? "";
        if (!isScenarioType(t)) throw new Error(`unsupported scenario type: ${t}`);
      }
      process.stdout.write(JSON.stringify(compareScenarios(md, manifest), null, 2) + "\n");
    } catch (e) {
      console.error(`scenario-scorer error: ${(e as Error).message}`);
      process.exit(65); // EX_DATAERR
    }
  } else {
    const [structPath, specPath] = argv;
    if (!structPath || !specPath) {
      console.error("usage: scenario-scorer.ts <structure.md path> <scenario.json path>");
      process.exit(64); // EX_USAGE
    }
    try {
      const md = await Bun.file(structPath).text();
      const spec = JSON.parse(await Bun.file(specPath).text()) as ScenarioSpec;
      const t = (spec as { type?: string }).type ?? "";
      if (!isScenarioType(t)) throw new Error(`unsupported scenario type: ${t}`);
      process.stdout.write(JSON.stringify(run(md, spec), null, 2) + "\n");
    } catch (e) {
      console.error(`scenario-scorer error: ${(e as Error).message}`);
      process.exit(65); // EX_DATAERR
    }
  }
}
```

- [ ] **Step 4: Run the full test file to verify everything passes**

Run: `cd skills/org-design/scripts && bun test scenario-scorer.test.ts`
Expected: PASS — all tests green, incl. the existing single-scenario CLI suite (unchanged behavior) + the new `CLI --matrix` suite + Task 1's compareScenarios suite.

- [ ] **Step 5: Type-check**

Run: `cd /Users/cantu/repos/claude-config && bunx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```fish
git add skills/org-design/scripts/scenario-scorer.ts skills/org-design/scripts/scenario-scorer.test.ts
git commit -m "feat(org-design): --matrix CLI branch for compareScenarios

Re #35

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: scenario-checks.md — multi-scenario matrix section

**Files:**
- Modify: `skills/org-design/scenario-checks.md` (append a new section after the existing "## Persistence" section)

- [ ] **Step 1: Append the matrix section**

Add to the end of `scenario-checks.md`:

````markdown
## Multi-scenario trade-off matrix (Phase 2b-iii)

When the user asks to compare ≥2 options, the orchestrator gathers each scenario
(reusing the per-mode gather, including the reduce-headcount gather-then-acknowledge
step for any reduce in the set), builds a **manifest** array, and calls the scorer in
matrix mode:

```
bun run scripts/scenario-scorer.ts --matrix <structure.md> <manifest.json>
```

`manifest.json` is a JSON array of `{ "label": "<short name>", "spec": { ...scenario spec... } }`.
The scorer returns a `MatrixResult`:

- `scenarios[]` — one entry per option: `label`, `type`, `reversibility`, the full
  single-scenario `result`, and `riskFlags`.
- `validLabels` / `invalidLabels` — the objective valid/invalid partition.

The matrix emits **facts only** — no score, no winner. Ranking is the orchestrator's
judgment (below), never the scorer's.

### Reversibility tag (per mode, fixed)

| Mode | Reversibility |
|---|---|
| `split-team`, `add-headcount`, `change-reporting` | `reversible` |
| `merge-teams` | `costly-to-reverse` |
| `reduce-headcount` | `irreversible` |

### Risk flags (objective, derived from each result)

- a validity failure `kind` (e.g. `orphaned_report`) — one per failure on an invalid option
- `unowned-systems` — a system lost its last owner (1→0); from `metrics.unownedAfter`
- `spof-after` — ≥1 system is still single-owned after; from `metrics.spof.after`
- `wide-span` — a manager ends with >7 direct reports; from `metrics.span[*].after`

### Layoff ack gate is inherited

Each scenario goes through `run()`, so a manifest containing a `reduce-headcount` spec
without `acknowledged: true` makes the scorer exit 65 with the layoff-acknowledgment-gate
message. There is **no separate matrix gate** — batching cannot bypass the layoff gate.

### Recommended-option contract (orchestrator judgment)

Output a ranked list **with shown work**, framed as a decision aid:

- Header reads literally **"Recommended (decision aid — you decide)."** Never a bare "do this."
- Order: valid options first; among valid, fewer risk flags ranks higher; surface genuine
  ties as ties (do not break a tie arbitrarily).
- Each entry states its reasoning: which risk flags, what the metric deltas show, the
  reversibility tag.
- Flag irreversibility prominently: an `irreversible` option (reduce-headcount) carries a
  heightened-caution line even when it ranks well — it demands the layoff review, never a
  rubber-stamp.
- **All-invalid** (`validLabels` empty): list each option's failure reasons and emit **no
  recommendation** — tell the user to fix the structural break first.

### Matrix render

A markdown table, one row per scenario:

```
| Scenario | Valid | Reversibility | SPOF after | Unowned after | Widest span | Key risks |
```

Then full before/after Mermaid `graph TD` for the **top-ranked option only** (others on
request) to keep the artifact bounded for large N. Any non-empty `unownedAfter` still gets
its loud per-scenario line.

### Matrix persistence

Atomic write-temp-rename to `decisions/<date>-org-scenario-matrix.md` (fixed `matrix`
slug), `<!-- org-design:auto -->` fences. Same-day mutates in place; 2+ `matrix` files
refuse + list. Universal review gate (print → explicit confirm) unchanged.
````

- [ ] **Step 2: Verify the file is well-formed**

Run: `cd /Users/cantu/repos/claude-config && grep -c "Multi-scenario trade-off matrix" skills/org-design/scenario-checks.md`
Expected: `1`

- [ ] **Step 3: Commit**

```fish
git add skills/org-design/scenario-checks.md
git commit -m "docs(org-design): scenario-checks matrix section

Re #35

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: SKILL.md — compare route + matrix render (version 0.5.0; NOT status yet)

**Files:**
- Modify: `skills/org-design/SKILL.md` (frontmatter `version`; scenario-mode routing table row ~line 62; the "## Scenario mode" numbered list ~line 152-169; the "## Out of scope" section ~line 186-193)

- [ ] **Step 1: Bump the version (leave status:experimental for now)**

In the frontmatter, change:

```
version: 0.4.0
```
to:
```
version: 0.5.0
```

Leave `status: experimental` unchanged — it flips only in Task 6 after the evals pass.

- [ ] **Step 2: Add the compare branch to the "## Scenario mode" list**

In `## Scenario mode`, after step 8 (Persist), append a new subsection:

````markdown
### Multi-scenario comparison (compare ≥2 options)

When the user asks to weigh several options against each other:

1. **Gather each scenario** — run the per-mode gather (steps 3 above) once per option,
   including the reduce-headcount gather-then-acknowledge step for any reduce in the set
   (gravity surfaced + explicit confirm before that scenario's `acknowledged:true` is set).
   Build a manifest: a JSON array of `{ "label": "<short name>", "spec": {...} }`.
2. **Score** — write the manifest to a temp JSON, run
   `bun run skills/org-design/scripts/scenario-scorer.ts --matrix <structure.md> <manifest.json>`,
   parse the `MatrixResult`. An unacknowledged reduce in the set exits 65 with the
   ack-gate message — surface the refusal and stop (no matrix produced).
3. **Render the trade-off matrix** — a markdown table, one row per scenario:
   `| Scenario | Valid | Reversibility | SPOF after | Unowned after | Widest span | Key risks |`.
   Then full before/after Mermaid `graph TD` for the top-ranked option only (others on
   request). Any non-empty `unownedAfter` keeps its loud per-scenario line.
4. **Recommended option** — a ranked list WITH shown work, headed
   **"Recommended (decision aid — you decide)"**. Order: valid first; among valid, fewer
   risk flags higher; surface ties as ties. Each entry states its reasoning (risk flags +
   deltas + reversibility). Flag irreversibility prominently — an `irreversible` option
   carries a heightened-caution line even when it ranks well; never a bare "do this".
   If `validLabels` is empty, list why each option breaks and emit NO recommendation.
5. **Review gate** — print the full matrix artifact + `validity:` summary, STOP, require
   explicit confirm before writing. No auto-persist.
6. **Persist** (on confirm) — atomic write-temp-rename to
   `decisions/<date>-org-scenario-matrix.md` (fixed `matrix` slug), `<!-- org-design:auto -->`
   fences. Same-day mutates in place; 2+ `matrix` files refuse + list.

Rules, the manifest shape, risk-flag derivation, and the recommended-option contract live
in [scenario-checks.md](scenario-checks.md).
````

- [ ] **Step 3: Update the scenario-mode routing-table row**

In the mode routing table (~line 62), append to the `scenario` row's description:

```
 The skill can also **compare ≥2 scenarios** in one pass — a trade-off matrix + a ranked recommended-option (decision aid, never a bare prescription); see [Multi-scenario comparison](#multi-scenario-comparison-compare-2-options).
```

- [ ] **Step 4: Update the "## Out of scope" section**

Change the heading `## Out of scope (Phase 2b-ii)` to `## Out of scope (Phase 2b-iii)` and rewrite its body so the matrix + recommended-option are no longer listed as deferred:

```markdown
## Out of scope (Phase 2b-iii)

Phase 2b ships `--mode=scenario` with all five operations + the multi-scenario trade-off
matrix and recommended-option output. The reduce-headcount path is gated by a machine
layoff acknowledgment. Deferred beyond 2b:

- Excalidraw rendering (Mermaid only).
- HRIS / directory auto-import — structure is manual by design (issue #35: no HRIS).
- Automated hand-off into `/strategy-doc` — the user folds output into their notes manually.
- Any scalar org-quality score or auto-applied recommendation (the matrix is facts-only;
  ranking is a decision aid the user adjudicates).
```

- [ ] **Step 5: Sanity-check the edits**

Run: `cd /Users/cantu/repos/claude-config && grep -n "version: 0.5.0" skills/org-design/SKILL.md; grep -n "Multi-scenario comparison" skills/org-design/SKILL.md; grep -n "status: experimental" skills/org-design/SKILL.md`
Expected: `version: 0.5.0` present; the `Multi-scenario comparison` heading present; `status: experimental` STILL present (flips in Task 6).

- [ ] **Step 6: Commit**

```fish
git add skills/org-design/SKILL.md
git commit -m "feat(org-design): SKILL.md compare route + matrix render, v0.5.0

Re #35

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Evals — scenario-matrix + scenario-reduce-ack-gate

**Files:**
- Modify: `skills/org-design/evals/evals.json` (append two evals to the `evals[]` array; update `description`)

- [ ] **Step 1: Add the two evals**

Update the top-level `description` string to mention Phase 2b-iii (matrix + recommended-option + reduce ack gate), then append these two objects to the `evals` array (after `scenario-mode-wall`):

```json
{
  "name": "scenario-matrix",
  "summary": "multi-scenario trade-off matrix: comparing a split vs a merge invokes the scorer in --matrix mode, renders a trade-off matrix + a ranked recommended-option (decision-aid framing, reversibility surfaced), and stops at the review gate without auto-persisting.",
  "setup": "cp -r /Users/cantu/repos/claude-config/tests/fixtures/org-design/split-valid /tmp/od-eval-matrix",
  "teardown": "rm -rf /tmp/od-eval-matrix",
  "prompt": "/org-design orgfix-acme --mode=scenario --workspace /tmp/od-eval-matrix  — compare two options and recommend one: (A) split Payments into Payments-Core (lead Jordan) and Payments-Infra (lead Riley), vs (B) merge Platform and Payments into one Eng team under Dana.",
  "assertions": [
    {"type": "skill_invoked", "skill": "org-design", "tier": "diagnostic", "description": "diagnostic structural anchor; Bash/regex below are load-bearing"},
    {"type": "tool_input_matches", "tool": "Bash", "input_key": "command", "input_value": "--matrix", "tier": "required", "description": "DISCRIMINATOR: the deterministic matrix path actually ran (compareScenarios via --matrix), not an LLM-assembled comparison"},
    {"type": "regex", "pattern": "reversib", "flags": "i", "tier": "required", "description": "the trade-off matrix surfaces the reversibility dimension (matrix table column or recommendation reasoning)"},
    {"type": "regex", "pattern": "recommend", "flags": "i", "tier": "required", "description": "a recommended-option block is produced (ranked decision aid)"},
    {"type": "not_regex", "pattern": "(wrote|saved|created)\\b[^.]{0,40}org-scenario", "flags": "i", "tier": "required", "description": "DISCRIMINATOR: no auto-persist before the user confirms (review gate holds). Future-tense 'will write' is allowed."}
  ]
},
{
  "name": "scenario-reduce-ack-gate",
  "summary": "reduce-headcount layoff path: modeling a cut surfaces the layoff gravity and runs through the machine acknowledgment gate; nothing is acknowledged:true or persisted without an explicit user confirmation in a single turn.",
  "setup": "cp -r /Users/cantu/repos/claude-config/tests/fixtures/org-design/split-valid /tmp/od-eval-reduce-ack",
  "teardown": "rm -rf /tmp/od-eval-reduce-ack",
  "prompt": "/org-design orgfix-acme --mode=scenario --workspace /tmp/od-eval-reduce-ack  — model reducing headcount by cutting Morgan. Before doing anything, tell me in writing what modeling this layoff means and what you need from me.",
  "assertions": [
    {"type": "skill_invoked", "skill": "org-design", "tier": "diagnostic", "description": "diagnostic structural anchor"},
    {"type": "regex", "pattern": "layoff|acknowled", "flags": "i", "tier": "required", "description": "DISCRIMINATOR: the layoff gravity / acknowledgment requirement is surfaced before modeling — the heightened ack step engaged (prompt forces an adjacent written explanation per feedback_eval_silent_path_prompts)"},
    {"type": "regex", "pattern": "confirm|acknowledge|your (explicit )?confirmation|go ahead", "flags": "i", "tier": "required", "description": "the skill requires an explicit user confirmation before setting the ack flag"},
    {"type": "not_regex", "pattern": "(wrote|saved|created)\\b[^.]{0,40}org-scenario", "flags": "i", "tier": "required", "description": "DISCRIMINATOR: no auto-persist of a layoff artifact without confirmation"}
  ]
}
```

- [ ] **Step 2: Validate the eval JSON + regex compile**

Run: `cd /Users/cantu/repos/claude-config && bun run tests/eval-runner-v2.ts --dry-run`
Expected: JSON parses, all regex patterns compile, no schema errors for `org-design`.

- [ ] **Step 3: Commit**

```fish
git add skills/org-design/evals/evals.json
git commit -m "test(org-design): scenario-matrix + reduce-ack-gate behavioral evals

Re #35

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Run evals 3–5× green, then flip status → stable

**Files:**
- Modify: `skills/org-design/SKILL.md` (frontmatter `status`)

- [ ] **Step 1: Run the full scorer unit suite once more (regression gate before eval spend)**

Run: `cd skills/org-design/scripts && bun test scenario-scorer.test.ts`
Expected: PASS — all suites (2a/2b-i/2b-ii regression + Task 1 compareScenarios + Task 2 CLI --matrix).

- [ ] **Step 2: Run the behavioral evals (subscription auth, repeated for text-tier stability)**

Run (3–5 times; the two new evals are text-tier-sensitive per `rules_evals_redgreen_procedure`):
`cd /Users/cantu/repos/claude-config && env -u ANTHROPIC_API_KEY bun run tests/eval-runner-v2.ts org-design`
Expected: `scenario-matrix` and `scenario-reduce-ack-gate` pass on every run (and the existing Phase-1/2a evals stay green). If a required-tier assertion flaps, tune the regex per RED/GREEN (do NOT loosen a discriminator into a tautology) and re-run; only proceed when stable across 3–5 runs.

- [ ] **Step 3: Flip the status**

Only after Step 2 is green 3–5×, in `SKILL.md` frontmatter change:

```
status: experimental
```
to:
```
status: stable
```

- [ ] **Step 4: Verify the flip**

Run: `cd /Users/cantu/repos/claude-config && grep -n "status: stable" skills/org-design/SKILL.md; grep -n "version: 0.5.0" skills/org-design/SKILL.md`
Expected: both present.

- [ ] **Step 5: Commit**

```fish
git add skills/org-design/SKILL.md
git commit -m "feat(org-design): flip status experimental -> stable after 2b-iii evals

Re #35

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Final Verification (before PR)

- [ ] `cd skills/org-design/scripts && bun test scenario-scorer.test.ts` — all pass.
- [ ] `cd /Users/cantu/repos/claude-config && bunx tsc --noEmit` — clean.
- [ ] `env -u ANTHROPIC_API_KEY bun run tests/eval-runner-v2.ts org-design` — green (final confirming run).
- [ ] `validate.fish` (if part of repo CI) passes for the org-design skill.
- [ ] ruflo review-swarm on the full diff (`git diff main...feature/org-design-phase-2b-iii`).
- [ ] PR body uses **`Closes #35`** (final 2b sub-phase); commits used `Re #35`. squash-only merge. PR description + body at plain reading level.

---

## Self-Review (plan vs spec)

**Spec coverage:** `compareScenarios` + types → Task 1. `--matrix` CLI → Task 2. scenario-checks matrix section → Task 3. SKILL.md compare route + render + version → Task 4. Two evals → Task 5. 3–5× eval run + status flip → Task 6. Reversibility 3-tier, riskFlags derivation, all-invalid branch, matrix-slug persist, ack-gate inheritance — all covered across Tasks 1/3/4. No scalar/winner asserted in Task 1.

**Placeholder scan:** none — every code/edit step shows literal content.

**Type consistency:** `MatrixResult` / `ScenarioComparison` / `Reversibility` / `compareScenarios` / `deriveRiskFlags` / `REVERSIBILITY` named identically across Tasks 1, 2, 3, 4 and the tests. CLI exit codes (64/65/0) consistent with the existing single-scenario contract. `riskFlags` string set (`unowned-systems`, `spof-after`, `wide-span`, validity kinds) consistent between Task 1 impl, Task 1 tests, and Task 3 docs.
