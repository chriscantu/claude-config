# org-design Phase 2b-i — structural scenario modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three structural scenario modes — `add-headcount`, `merge-teams`, `change-reporting` — to the org-design scorer behind a discriminated-union dispatch, without touching the shipped `applySplit`.

**Architecture:** Refactor `ScenarioSpec` from the bare `SplitTeamSpec` into a four-arm discriminated union. `run()` dispatches on `spec.type` via an internal `applyMutation` switch; `checkValidity` / `computeMetrics` / `movedReports` stay mode-agnostic. Each new mode is a pure `(people, spec) → Person[]` function. The only edit to shipped `run()` logic is generalizing the team-delta for non-split modes (split keeps its existing branch). No new validity rule — the four shipped rules cover every new mutation's failure surface.

**Tech Stack:** TypeScript on Bun. Tests via `bun:test`. Files: `skills/org-design/scripts/scenario-scorer.ts` (+ co-located `.test.ts`), `skills/org-design/scenario-checks.md`, `skills/org-design/SKILL.md`.

**Spec:** [`docs/superpowers/specs/2026-06-09-org-design-scenario-modeling-phase-2b-i-design.md`](../specs/2026-06-09-org-design-scenario-modeling-phase-2b-i-design.md)

**Conventions for every commit in this plan:**
- Run from repo root `~/repos/claude-config`. Shell is **fish** — no bash heredocs; use single-line `git commit -m`.
- Every commit body references the issue as `Re #35` (NOT `Closes`) — #35 must survive until 2b-iii ships.
- Do NOT pass `--no-verify` (a hook forbids it).
- Do NOT stage the pre-existing unrelated edits (`docs/catalog.md`, `tests/sycophancy/client.ts`). Stage only the files each task names.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `skills/org-design/scripts/scenario-scorer.ts` | Deterministic mutation + recompute + validity | Modify — union + 3 apply fns + dispatch + delta generalization + CLI guard |
| `skills/org-design/scripts/scenario-scorer.test.ts` | Unit tests | Modify — 3 new modes (happy + trip each), type-guard test, regression intact |
| `skills/org-design/scenario-checks.md` | Scenario-spec formats + semantics doc | Modify — 3 new spec blocks + mutation semantics |
| `skills/org-design/SKILL.md` | Orchestrator | Modify — route 3 ops, version 0.3.0, description + out-of-scope update |

---

## Task 1: Discriminated-union refactor + dispatch (no behavior change)

Pure refactor. The existing split tests are the regression guard — they must stay green.

**Files:**
- Modify: `skills/org-design/scripts/scenario-scorer.ts:37-42` (spec types), `:194-228` (`run`)

- [ ] **Step 1: Add the three new spec interfaces + the union, after `SplitTeamSpec`**

In `scenario-scorer.ts`, immediately after the `applySplit` function (ends line 76), add:

```ts
export interface AddHeadcountSpec {
  type: "add-headcount";
  hires: Person[];
  reassign?: Record<string, string>; // existing person -> new manager
}

export interface MergeTeamsSpec {
  type: "merge-teams";
  teams: string[];
  newName: string;
  survivingManager: string;
}

export interface ChangeReportingSpec {
  type: "change-reporting";
  reassign: Record<string, string>; // person -> new manager
}

export type ScenarioSpec =
  | SplitTeamSpec
  | AddHeadcountSpec
  | MergeTeamsSpec
  | ChangeReportingSpec;

function applyMutation(people: Person[], spec: ScenarioSpec): Person[] {
  switch (spec.type) {
    case "split-team":
      return applySplit(people, spec);
    default:
      throw new Error(`unsupported scenario type: ${(spec as { type: string }).type}`);
  }
}
```

- [ ] **Step 2: Change `run()` to accept `ScenarioSpec`, dispatch via `applyMutation`, and generalize the team-delta**

Replace the body of `run` (lines 194-228). The two edits: `applySplit(before, spec)` → `applyMutation(before, spec)`, and the split-specific `addedTeams`/`removedTeams` block → a branch.

```ts
export function run(structureMd: string, spec: ScenarioSpec): ScenarioResult {
  const before = parseStructure(structureMd);
  const after = applyMutation(before, spec);
  const failures = checkValidity(after);
  const mb = computeMetrics(before);
  const ma = computeMetrics(after);

  const span: ScenarioResult["metrics"]["span"] = {};
  for (const k of mergeKeys(mb.span, ma.span)) span[k] = { before: mb.span[k] ?? 0, after: ma.span[k] ?? 0 };
  const oncall: ScenarioResult["metrics"]["oncall"] = {};
  for (const k of mergeKeys(mb.oncall, ma.oncall)) oncall[k] = { before: mb.oncall[k] ?? 0, after: ma.oncall[k] ?? 0 };

  const beforeByPerson = new Map(before.map((p) => [p.person, p]));
  const movedReports = after
    .filter((p) => beforeByPerson.get(p.person)?.reportsTo !== p.reportsTo)
    .map((p) => ({ person: p.person, from: beforeByPerson.get(p.person)!.reportsTo, to: p.reportsTo }));

  const tb = teams(before), ta = teams(after);
  let addedTeams: string[], removedTeams: string[];
  if (spec.type === "split-team") {
    // split: targetTeam always treated as removed (former manager may keep the old
    // label); new sub-teams added.
    const splitTeams = new Set(spec.into.map((g) => g.name));
    addedTeams = ta.filter((t) => !tb.includes(t) || splitTeams.has(t));
    removedTeams = tb.filter((t) => !ta.includes(t) || t === spec.targetTeam);
  } else {
    addedTeams = ta.filter((t) => !tb.includes(t));
    removedTeams = tb.filter((t) => !ta.includes(t));
  }

  return {
    valid: failures.length === 0,
    failures,
    deltas: { teamsBefore: tb, teamsAfter: ta, movedReports, addedTeams, removedTeams },
    metrics: { span, spof: { before: mb.spof, after: ma.spof }, oncall, ratio: ma.ratio },
  };
}
```

- [ ] **Step 3: Run the existing suite + type-check to confirm zero regression**

Run: `cd skills/org-design/scripts && bun test scenario-scorer.test.ts && bunx tsc --noEmit scenario-scorer.ts`
Expected: all existing tests PASS, tsc clean. (No new test in this task — the refactor is behavior-preserving and guarded by the shipped split tests.)

- [ ] **Step 4: Commit**

```
git add skills/org-design/scripts/scenario-scorer.ts
git commit -m "refactor(org-design): discriminated-union ScenarioSpec + run() dispatch (Re #35)"
```

---

## Task 2: `merge-teams` mode

**Files:**
- Modify: `skills/org-design/scripts/scenario-scorer.ts` (add `applyMerge`, add switch case)
- Test: `skills/org-design/scripts/scenario-scorer.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `scenario-scorer.test.ts`. First extend the import on line 2 to include the new symbols:

```ts
import { parseStructure, type Person, applySplit, type SplitTeamSpec, computeMetrics, checkValidity, type ValidityFailure, run, type ScenarioResult, applyMerge, type MergeTeamsSpec, applyAdd, type AddHeadcountSpec, applyReporting, type ChangeReportingSpec, isScenarioType } from "./scenario-scorer.ts";
```

Then add this describe block at the end of the file:

```ts
describe("applyMerge", () => {
  test("folds teams under surviving manager; non-surviving manager stays M as sub-manager", () => {
    const spec: MergeTeamsSpec = {
      type: "merge-teams", teams: ["Platform", "Payments"], newName: "Eng", survivingManager: "Dana",
    };
    const after = applyMerge(acme(), spec);
    const sam = after.find((r) => r.person === "Sam")!;
    expect(sam.team).toBe("Eng");
    expect(sam.role).toBe("M");          // non-surviving manager keeps M
    expect(sam.reportsTo).toBe("Dana");  // now reports to surviving manager
    expect(after.find((r) => r.person === "Jordan")!.reportsTo).toBe("Sam"); // sub-hierarchy intact
    expect(after.find((r) => r.person === "Jordan")!.team).toBe("Eng");
    expect(checkValidity(after).length).toBe(0);
  });

  test("merge that loops a surviving/non-surviving pair trips reporting_cycle", () => {
    // survivingManager Sam; Dana (non-surviving M) -> Sam, but Sam still -> Dana = cycle
    const spec: MergeTeamsSpec = {
      type: "merge-teams", teams: ["Platform", "Payments"], newName: "Eng", survivingManager: "Sam",
    };
    const res = run(FIXTURE, spec);
    expect(res.valid).toBe(false);
    expect(res.failures.map((f) => f.kind)).toContain("reporting_cycle");
  });

  test("run deltas: merged teams removed, new team added", () => {
    const spec: MergeTeamsSpec = {
      type: "merge-teams", teams: ["Platform", "Payments"], newName: "Eng", survivingManager: "Dana",
    };
    const res = run(FIXTURE, spec);
    expect(res.deltas.addedTeams).toEqual(["Eng"]);
    expect(res.deltas.removedTeams.sort()).toEqual(["Payments", "Platform"]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd skills/org-design/scripts && bun test scenario-scorer.test.ts -t applyMerge`
Expected: FAIL — `applyMerge is not a function` / import error.

- [ ] **Step 3: Implement `applyMerge` and wire the switch case**

Add the function after `applySplit` (and before `applyMutation`, or anywhere among the apply fns):

```ts
export function applyMerge(people: Person[], spec: MergeTeamsSpec): Person[] {
  const inMerge = new Set(spec.teams);
  return people.map((p) => {
    if (!inMerge.has(p.team)) return p;
    const nonSurvivingManager = p.role === "M" && p.person !== spec.survivingManager;
    return {
      ...p,
      team: spec.newName,
      reportsTo: nonSurvivingManager ? spec.survivingManager : p.reportsTo,
    };
  });
}
```

In `applyMutation`, add the case above `default`:

```ts
    case "merge-teams":
      return applyMerge(people, spec);
```

- [ ] **Step 4: Run to verify pass**

Run: `cd skills/org-design/scripts && bun test scenario-scorer.test.ts && bunx tsc --noEmit scenario-scorer.ts`
Expected: all PASS, tsc clean.

- [ ] **Step 5: Commit**

```
git add skills/org-design/scripts/scenario-scorer.ts skills/org-design/scripts/scenario-scorer.test.ts
git commit -m "feat(org-design): merge-teams scenario mode (Re #35)"
```

---

## Task 3: `add-headcount` mode

**Files:**
- Modify: `skills/org-design/scripts/scenario-scorer.ts` (add `applyAdd`, add switch case)
- Test: `skills/org-design/scripts/scenario-scorer.test.ts`

- [ ] **Step 1: Write failing tests**

Add this describe block at the end of `scenario-scorer.test.ts`:

```ts
describe("applyAdd", () => {
  test("appends a hire and recomputes span on their manager", () => {
    const spec: AddHeadcountSpec = {
      type: "add-headcount",
      hires: [{ person: "Pat", role: "IC", team: "Payments", reportsTo: "Sam", systems: [], oncall: [], skills: ["Go"] }],
    };
    const after = applyAdd(acme(), spec);
    expect(after.length).toBe(5);
    expect(after.find((r) => r.person === "Pat")!.team).toBe("Payments");
    expect(computeMetrics(after).span["Sam"]).toBe(3); // Jordan + Riley + Pat
    expect(checkValidity(after).length).toBe(0);
  });

  test("reassign gives a new manager hire reports (no zero_report_manager)", () => {
    const spec: AddHeadcountSpec = {
      type: "add-headcount",
      hires: [{ person: "Alex", role: "M", team: "Payments", reportsTo: "Dana", systems: [], oncall: [], skills: ["leadership"] }],
      reassign: { Jordan: "Alex", Riley: "Alex" },
    };
    const after = applyAdd(acme(), spec);
    expect(after.find((r) => r.person === "Jordan")!.reportsTo).toBe("Alex");
    expect(computeMetrics(after).span["Alex"]).toBe(2);
    expect(checkValidity(after).filter((f) => f.kind === "zero_report_manager").length).toBe(0);
  });

  test("hire reporting to a missing manager trips orphaned_report", () => {
    const spec: AddHeadcountSpec = {
      type: "add-headcount",
      hires: [{ person: "Pat", role: "IC", team: "Payments", reportsTo: "Ghost", systems: [], oncall: [], skills: [] }],
    };
    const res = run(FIXTURE, spec);
    expect(res.valid).toBe(false);
    expect(res.failures.map((f) => f.kind)).toContain("orphaned_report");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd skills/org-design/scripts && bun test scenario-scorer.test.ts -t applyAdd`
Expected: FAIL — `applyAdd is not a function`.

- [ ] **Step 3: Implement `applyAdd` and wire the switch case**

```ts
export function applyAdd(people: Person[], spec: AddHeadcountSpec): Person[] {
  const reassigned = people.map((p) =>
    spec.reassign && spec.reassign[p.person] !== undefined
      ? { ...p, reportsTo: spec.reassign[p.person] }
      : p);
  return [...reassigned, ...spec.hires];
}
```

In `applyMutation`, add above `default`:

```ts
    case "add-headcount":
      return applyAdd(people, spec);
```

- [ ] **Step 4: Run to verify pass**

Run: `cd skills/org-design/scripts && bun test scenario-scorer.test.ts && bunx tsc --noEmit scenario-scorer.ts`
Expected: all PASS, tsc clean.

- [ ] **Step 5: Commit**

```
git add skills/org-design/scripts/scenario-scorer.ts skills/org-design/scripts/scenario-scorer.test.ts
git commit -m "feat(org-design): add-headcount scenario mode (Re #35)"
```

---

## Task 4: `change-reporting` mode

**Files:**
- Modify: `skills/org-design/scripts/scenario-scorer.ts` (add `applyReporting`, add switch case)
- Test: `skills/org-design/scripts/scenario-scorer.test.ts`

- [ ] **Step 1: Write failing tests**

Add this describe block at the end of `scenario-scorer.test.ts`:

```ts
describe("applyReporting", () => {
  test("reparents a person without changing their team", () => {
    const spec: ChangeReportingSpec = { type: "change-reporting", reassign: { Jordan: "Dana" } };
    const after = applyReporting(acme(), spec);
    const jordan = after.find((r) => r.person === "Jordan")!;
    expect(jordan.reportsTo).toBe("Dana");
    expect(jordan.team).toBe("Payments"); // team unchanged
    expect(computeMetrics(after).span["Sam"]).toBe(1); // only Riley left under Sam
    expect(checkValidity(after).length).toBe(0);
  });

  test("a reassignment that loops the chain trips reporting_cycle", () => {
    // Sam -> Jordan, but Jordan -> Sam = cycle
    const spec: ChangeReportingSpec = { type: "change-reporting", reassign: { Sam: "Jordan" } };
    const res = run(FIXTURE, spec);
    expect(res.valid).toBe(false);
    expect(res.failures.map((f) => f.kind)).toContain("reporting_cycle");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd skills/org-design/scripts && bun test scenario-scorer.test.ts -t applyReporting`
Expected: FAIL — `applyReporting is not a function`.

- [ ] **Step 3: Implement `applyReporting` and wire the switch case**

```ts
export function applyReporting(people: Person[], spec: ChangeReportingSpec): Person[] {
  return people.map((p) =>
    spec.reassign[p.person] !== undefined ? { ...p, reportsTo: spec.reassign[p.person] } : p);
}
```

In `applyMutation`, add above `default`:

```ts
    case "change-reporting":
      return applyReporting(people, spec);
```

The switch now has all four cases. The `default` arm stays as the runtime guard for malformed input from the CLI (JSON with an unknown `type`).

- [ ] **Step 4: Run to verify pass**

Run: `cd skills/org-design/scripts && bun test scenario-scorer.test.ts && bunx tsc --noEmit scenario-scorer.ts`
Expected: all PASS, tsc clean.

- [ ] **Step 5: Commit**

```
git add skills/org-design/scripts/scenario-scorer.ts skills/org-design/scripts/scenario-scorer.test.ts
git commit -m "feat(org-design): change-reporting scenario mode (Re #35)"
```

---

## Task 5: CLI accepts all four scenario types

The CLI currently casts parsed JSON to `SplitTeamSpec` and rejects any `type !== "split-team"`. Generalize via an exported, unit-tested type guard.

**Files:**
- Modify: `skills/org-design/scripts/scenario-scorer.ts:230-246` (CLI entrypoint)
- Test: `skills/org-design/scripts/scenario-scorer.test.ts`

- [ ] **Step 1: Write failing test for the guard**

Add this describe block at the end of `scenario-scorer.test.ts`:

```ts
describe("isScenarioType", () => {
  test("accepts the four 2b-i modes, rejects unknown and the deferred reduce-headcount", () => {
    expect(isScenarioType("split-team")).toBe(true);
    expect(isScenarioType("add-headcount")).toBe(true);
    expect(isScenarioType("merge-teams")).toBe(true);
    expect(isScenarioType("change-reporting")).toBe(true);
    expect(isScenarioType("reduce-headcount")).toBe(false); // Phase 2b-ii, not yet
    expect(isScenarioType("bogus")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd skills/org-design/scripts && bun test scenario-scorer.test.ts -t isScenarioType`
Expected: FAIL — `isScenarioType is not a function`.

- [ ] **Step 3: Add the guard and use it in the CLI**

Add near the `ScenarioSpec` union (top-level export):

```ts
export const KNOWN_SCENARIO_TYPES = ["split-team", "add-headcount", "merge-teams", "change-reporting"] as const;
export function isScenarioType(t: string): t is ScenarioSpec["type"] {
  return (KNOWN_SCENARIO_TYPES as readonly string[]).includes(t);
}
```

Replace the CLI parse/guard (currently lines ~238-241) with:

```ts
    const md = await Bun.file(structPath).text();
    const spec = JSON.parse(await Bun.file(specPath).text()) as ScenarioSpec;
    const t = (spec as { type?: string }).type ?? "";
    if (!isScenarioType(t)) throw new Error(`unsupported scenario type: ${t}`);
    process.stdout.write(JSON.stringify(run(md, spec), null, 2) + "\n");
```

- [ ] **Step 4: Run to verify pass + CLI smoke per mode**

Run: `cd skills/org-design/scripts && bun test scenario-scorer.test.ts && bunx tsc --noEmit scenario-scorer.ts`
Expected: all PASS, tsc clean.

Then smoke each new mode against a real fixture file. Create a throwaway structure + three scenario JSONs and run the CLI (fish-safe, no heredocs — write files with `printf`):

```fish
cd skills/org-design/scripts
printf '%s\n' '# fix' '<!-- org-design:structure -->' '| Person | Role | Team | Reports to | Systems | On-call | Skills |' '|--|--|--|--|--|--|--|' '| Dana | M | Platform | | | | |' '| Sam | M | Payments | Dana | | | |' '| Jordan | IC | Payments | Sam | billing | rota-a | Go |' '| Riley | IC | Payments | Sam | | rota-a | Go |' '<!-- /org-design:structure -->' > /tmp/struct.md
echo '{"type":"merge-teams","teams":["Platform","Payments"],"newName":"Eng","survivingManager":"Dana"}' > /tmp/merge.json
echo '{"type":"add-headcount","hires":[{"person":"Pat","role":"IC","team":"Payments","reportsTo":"Sam","systems":[],"oncall":[],"skills":[]}]}' > /tmp/add.json
echo '{"type":"change-reporting","reassign":{"Jordan":"Dana"}}' > /tmp/reporting.json
for f in merge add reporting; bun run scenario-scorer.ts /tmp/struct.md /tmp/$f.json | head -3; end
```
Expected: each prints a JSON `ScenarioResult` with a `"valid"` field (merge/add/reporting all valid here). No `unsupported scenario type` error.

- [ ] **Step 5: Commit**

```
git add skills/org-design/scripts/scenario-scorer.ts skills/org-design/scripts/scenario-scorer.test.ts
git commit -m "feat(org-design): CLI dispatch for all four scenario types (Re #35)"
```

---

## Task 6: Document the three new spec formats in scenario-checks.md

**Files:**
- Modify: `skills/org-design/scenario-checks.md`

- [ ] **Step 1: Add the new spec-block formats + semantics**

After the existing `## Scenario spec block` section (ends ~line 33), insert a new section documenting the three modes. Add:

````markdown
## Phase 2b-i spec blocks (add-headcount / merge-teams / change-reporting)

`--mode=scenario` routes four operations. The orchestrator gathers intent
conversationally, transcribes it into one of these blocks, then serializes to JSON
for the scorer. `reduce-headcount` is NOT yet supported (Phase 2b-ii).

**add-headcount** — append new hires; optionally reparent existing people onto a new
hire (so a new-manager hire is not an instant `zero_report_manager`).

```markdown
<!-- org-design:scenario -->
type: add-headcount
hires:
  - person: <name>
    role: <M|IC>
    team: <team>
    reports_to: <manager>
    systems: [<system>, ...]
    oncall: [<rotation>, ...]
    skills: [<skill>, ...]
reassign:            # optional; existing person -> new manager (e.g. give a new EM reports)
  <existing person>: <new hire>
<!-- /org-design:scenario -->
```

**merge-teams** — fold ≥2 teams into one under a surviving manager. Each non-surviving
manager keeps role `M` and reports to the surviving manager (sub-hierarchy preserved);
their reports are unchanged. Span on the surviving manager grows — reported, not a
validity failure.

```markdown
<!-- org-design:scenario -->
type: merge-teams
teams: [<team A>, <team B>, ...]
new_name: <merged team name>
surviving_manager: <person who leads the merged team>
<!-- /org-design:scenario -->
```

**change-reporting** — re-wire reporting lines only (no team relabel).

```markdown
<!-- org-design:scenario -->
type: change-reporting
reassign:
  <person>: <new manager>
<!-- /org-design:scenario -->
```

Spec rules (orchestrator validates BEFORE scoring):
- add-headcount: each hire has all seven columns; a `reassign` key must be an existing
  person and its value an existing person or one of the new hires.
- merge-teams: `teams` lists ≥2 existing teams; `surviving_manager` is an existing
  role-`M` person in one of those teams.
- change-reporting: every `reassign` key is an existing person; values should be
  existing people (a missing target surfaces as `orphaned_report` from the scorer).

A malformed spec is a usage error — fix it with the user, do not call the scorer.
The validity rules below are unchanged and apply to all four modes.
````

- [ ] **Step 2: Verify the doc renders + cross-checks the code**

Run: `grep -c "type: " skills/org-design/scenario-checks.md`
Expected: ≥4 (split + three new blocks). Visually confirm each block's field names match the TS interfaces (`new_name`↔`newName`, `surviving_manager`↔`survivingManager`, `reports_to`↔`reportsTo` — the orchestrator maps snake_case prose to camelCase JSON, consistent with the 2a `target_team`↔`targetTeam` precedent).

- [ ] **Step 3: Commit**

```
git add skills/org-design/scenario-checks.md
git commit -m "docs(org-design): scenario-checks spec formats for 2b-i modes (Re #35)"
```

---

## Task 7: Route the three modes in SKILL.md + version bump

**Files:**
- Modify: `skills/org-design/SKILL.md` (line 6 version, line 3 description, line 29 limitation note, line 62 router cell, the `## Scenario mode` section ~152-164, out-of-scope ~183-188)

- [ ] **Step 1: Bump version**

`skills/org-design/SKILL.md:6` — change `version: 0.2.0` to `version: 0.3.0`.

- [ ] **Step 2: Update the router cell (line 62) to route the three ops**

Replace the trailing sentence of the `scenario` router cell — currently:
> Non-`split-team` operations refuse: "Phase 2a supports `split-team` only; add/reduce-headcount, merge, reporting-change are Phase 2b."

with:
> Routes four operations: `split-team`, `add-headcount`, `merge-teams`, `change-reporting` (gather → score → validity gate → render → review gate → persist, identical flow). `reduce-headcount` still refuses: "reduce-headcount + its layoff acknowledgment are Phase 2b-ii."

- [ ] **Step 3: Generalize the `## Scenario mode` section header + gather step**

Change the heading `## Scenario mode (split-team)` (line 152) to `## Scenario mode`.

Replace step 3 (`**Gather intent**`, line 159) with a per-mode gather:

```markdown
3. **Gather intent** — conversationally determine the operation and its fields, build the `org-design:scenario` block (formats in [scenario-checks.md](scenario-checks.md)), and validate it BEFORE scoring:
   - **split-team** — team to split, new teams, members, leads, optional lead reporting. (members ∈ target team; each member in exactly one team; lead ∈ members.)
   - **add-headcount** — each hire's seven columns; optional reassignments of existing people onto a new hire.
   - **merge-teams** — which teams (≥2), the new name, the surviving manager (an existing role-M person in one of the teams).
   - **change-reporting** — which person(s) and their new manager(s).
   - **reduce-headcount** — refuse: Phase 2b-ii.
```

Update step 8 (`**Persist**`, line 164) slug note — replace `(`<slug>` = `<target_team>-split`, kebab-cased)` with:
```markdown
(`<slug>` per mode, kebab-cased: `<target_team>-split`, `<new_name>-merge`, `<hire>-add`, `<person>-reporting`)
```

- [ ] **Step 4: Update the description (line 3) and limitation note (line 29)**

Line 3 (`description:` frontmatter) — change the sentence "Phase 2a adds --mode=scenario split-team: projects a reorg... Other scenario modes (merge/headcount/reporting) are Phase 2b." to:
> The scenario mode projects a reorg (split-team, add-headcount, merge-teams, change-reporting), validates it structurally, and gates on explicit user review before writing. reduce-headcount + layoff modeling is Phase 2b-ii.

Line 29 — change "Proposing team merges, headcount moves, or reporting-line changes — those are Phase 2b scenario modes, not yet implemented. (Team *splits* are supported now via `--mode=scenario`.)" to:
> Modeling layoffs / headcount reduction — that is Phase 2b-ii (`reduce-headcount`), not yet implemented. (Splits, additive hires, team merges, and reporting-line changes are supported now via `--mode=scenario`.)

- [ ] **Step 5: Update the out-of-scope list (lines 181-188)**

Change the heading `## Out of scope (Phase 2a)` → `## Out of scope (Phase 2b-i)`. Replace the first bullet "Other scenario operations — `add-headcount`, `reduce-headcount`, `merge-teams`, `change-reporting`." with:
> - `reduce-headcount` + the heightened layoff acknowledgment (Phase 2b-ii).
> - Multi-scenario trade-off matrix + recommended-option output (Phase 2b-iii).

Remove the now-shipped "Multi-scenario trade-off matrix" and "Before/after comparison for non-split operations" bullets if duplicated, and the standalone `reduce-headcount` ack bullet (folded above). Leave Excalidraw / HRIS / strategy-doc bullets.

- [ ] **Step 6: Verify SKILL.md is internally consistent**

Run: `grep -n "0.3.0\|add-headcount\|merge-teams\|change-reporting\|reduce-headcount\|Phase 2b-i" skills/org-design/SKILL.md`
Expected: version 0.3.0 present; all four 2b-i modes appear in router + gather; `reduce-headcount` appears only as a Phase-2b-ii refusal; no remaining "Phase 2a supports split-team only" prose.

- [ ] **Step 7: Commit**

```
git add skills/org-design/SKILL.md
git commit -m "feat(org-design): route add/merge/change-reporting in scenario mode, v0.3.0 (Re #35)"
```

---

## Final verification (end-of-plan gate)

- [ ] **Full suite + type-check**

Run: `cd skills/org-design/scripts && bun test scenario-scorer.test.ts && bunx tsc --noEmit scenario-scorer.ts`
Expected: every test passes (3 new modes × happy+trip, type-guard, all 2a regression tests), tsc clean.

- [ ] **Goal verification** — restate intent, confirm delta direction:
  - Intent: add three structural scenario modes without touching `applySplit`.
  - Confirm: `git diff main -- skills/org-design/scripts/scenario-scorer.ts` shows `applySplit` body unchanged; three new `applyX` fns added; `run()` dispatch + delta-branch only edits. Net functional add well under 300 LOC.

---

## Self-Review (completed by plan author)

**Spec coverage:** union refactor (T1) · merge (T2) · add (T3) · change-reporting (T4) · CLI (T5) · scenario-checks doc (T6) · SKILL.md route + version (T7) · no-new-validity-rule (asserted via trips reusing the 4 rules in T2-T4) · regression guard (T1 step 3 + final gate). All spec sections mapped.

**Placeholder scan:** no TBD/TODO; every code step shows full code; every test shows assertions; every command shows expected output.

**Type consistency:** `ScenarioSpec`, `AddHeadcountSpec`/`MergeTeamsSpec`/`ChangeReportingSpec`, `applyAdd`/`applyMerge`/`applyReporting`, `isScenarioType`, `KNOWN_SCENARIO_TYPES`, `applyMutation` used identically across tasks and tests. `Person` schema fields (person/role/team/reportsTo/systems/oncall/skills) match the shipped interface. snake_case (doc) ↔ camelCase (TS) mapping noted in T6.
