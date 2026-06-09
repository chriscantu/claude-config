# /org-design Phase 2a — split-team Scenario Modeling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic `split-team` scenario mode to `/org-design` that projects a reorg, validates it structurally, and gates persistence behind machine-validity + human-review.

**Architecture:** A pure TS scorer (`scenario-scorer.ts`, bun) parses `org/structure.md`, applies a split-team mutation, recomputes span / system-SPOF / on-call / manager:IC ratio, and runs four structural validity checks — returning a `ScenarioResult` JSON (validity in payload, not exit code). `SKILL.md` orchestrates: gathers intent, builds the scenario JSON, invokes the scorer, refuses on invalid, renders before/after Mermaid + delta table on valid, and requires explicit confirm before an atomic write to a new `*-org-scenario-<slug>.md` namespace.

**Tech Stack:** TypeScript on bun (`bun test`, `bun run`), markdown skill (Pattern C), Mermaid charts. Reuses Phase-1 `onboard-guard.ts` NDA contract, section-fence sentinels, atomic write-temp-rename.

**Spec:** `docs/superpowers/specs/2026-06-08-org-design-scenario-modeling-phase-2a-design.md`

---

## File Structure

| File | Responsibility | Create/Modify |
|---|---|---|
| `skills/org-design/scripts/scenario-scorer.ts` | Pure deterministic engine: parse structure, mutate, recompute, validate | Create |
| `skills/org-design/scripts/scenario-scorer.test.ts` | Co-located bun unit tests | Create |
| `skills/org-design/scenario-checks.md` | Scenario-spec format, split semantics, validity rules, chart-annotation rules | Create |
| `skills/org-design/SKILL.md` | Activate scenario route, mode wall, render, gates, version bump | Modify |
| `tests/fixtures/org-design/split-valid/` | Valid split workspace fixture | Create |
| `tests/fixtures/org-design/split-invalid/` | Invalid (0-report manager) split workspace fixture | Create |
| `tests/fixtures/org-design/README.md` | Eval↔fixture matrix | Modify |
| `skills/org-design/evals/evals.json` | 3 behavioral evals | Modify |
| `docs/catalog.md` | Mode list update | Modify |

**Scorer module boundary** (the contract every task depends on):

```ts
export type Role = "M" | "IC" | "";
export interface Person {
  person: string; role: Role; team: string; reportsTo: string;
  systems: string[]; oncall: string[]; skills: string[];
}
export interface SplitTeamSpec {
  type: "split-team";
  targetTeam: string;
  into: { name: string; lead: string; members: string[] }[];
  newReporting?: Record<string, string>; // newTeamName -> manager; default = targetTeam's former manager
}
export type ValidityFailure = {
  kind: "orphaned_report" | "reporting_cycle" | "zero_report_manager" | "subviable_oncall";
  detail: string; involved: string[];
};
export interface ScenarioResult {
  valid: boolean;
  failures: ValidityFailure[];
  deltas: {
    teamsBefore: string[]; teamsAfter: string[];
    movedReports: { person: string; from: string; to: string }[];
    addedTeams: string[]; removedTeams: string[];
  };
  metrics: {
    span: Record<string, { before: number; after: number }>;
    spof: { before: string[]; after: string[] };
    oncall: Record<string, { before: number; after: number }>;
    ratio: Record<string, { m: number; ic: number }>;
  };
}
```

Scorer input: `scenario-scorer.ts <structure.md path> <scenario.json path>`. Output: `ScenarioResult` JSON to stdout. Exit 0 on completion (valid:false is a result); exit non-zero on usage/parse error.

---

## Task 1: Scorer — parse `org/structure.md`

**Files:**
- Create: `skills/org-design/scripts/scenario-scorer.ts`
- Test: `skills/org-design/scripts/scenario-scorer.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// skills/org-design/scripts/scenario-scorer.test.ts
import { describe, expect, test } from "bun:test";
import { parseStructure, type Person } from "./scenario-scorer.ts";

const FIXTURE = `# Org structure — orgfix-acme
<!-- org-design:structure -->
| Person | Role (M/IC) | Team | Reports to | Critical systems owned | On-call rotation | Key skills |
|--------|-------------|------|------------|------------------------|------------------|-----------|
| Dana   | M  | Platform | | | | leadership |
| Sam    | M  | Payments | Dana | | | leadership |
| Jordan | IC | Payments | Sam | billing-service | payments-primary | Kafka, Go |
| Riley  | IC | Payments | Sam | | payments-primary | Go |
<!-- /org-design:structure -->`;

describe("parseStructure", () => {
  test("reads fenced rows into Person[], splitting list columns on comma", () => {
    const rows = parseStructure(FIXTURE);
    expect(rows.length).toBe(4);
    const jordan = rows.find((r) => r.person === "Jordan")!;
    expect(jordan.role).toBe("IC");
    expect(jordan.team).toBe("Payments");
    expect(jordan.reportsTo).toBe("Sam");
    expect(jordan.systems).toEqual(["billing-service"]);
    expect(jordan.skills).toEqual(["Kafka", "Go"]);
    const dana = rows.find((r) => r.person === "Dana")!;
    expect(dana.reportsTo).toBe("");
    expect(dana.systems).toEqual([]);
  });

  test("skips blank-person rows and the header/separator", () => {
    const withBlank = FIXTURE.replace("| Riley", "|        |    |          | |  | | |\n| Riley");
    expect(parseStructure(withBlank).length).toBe(4);
  });

  test("throws on missing structure fence (usage error)", () => {
    expect(() => parseStructure("no fence here")).toThrow(/structure fence/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test skills/org-design/scripts/scenario-scorer.test.ts`
Expected: FAIL — `parseStructure` not exported / module missing.

- [ ] **Step 3: Write minimal implementation**

```ts
// skills/org-design/scripts/scenario-scorer.ts
export type Role = "M" | "IC" | "";
export interface Person {
  person: string; role: Role; team: string; reportsTo: string;
  systems: string[]; oncall: string[]; skills: string[];
}

const OPEN = "<!-- org-design:structure -->";
const CLOSE = "<!-- /org-design:structure -->";
const splitList = (cell: string): string[] =>
  cell.split(",").map((s) => s.trim()).filter((s) => s.length > 0);

export function parseStructure(md: string): Person[] {
  const start = md.indexOf(OPEN);
  const end = md.indexOf(CLOSE);
  if (start === -1 || end === -1 || end < start) {
    throw new Error("structure fence not found or malformed");
  }
  const block = md.slice(start + OPEN.length, end);
  const rows: Person[] = [];
  for (const line of block.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("|")) continue;
    if (/^\|[\s|:-]+\|?$/.test(t)) continue; // separator row
    const cells = t.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 7) continue;
    if (cells[0].toLowerCase() === "person") continue; // header
    if (cells[0] === "") continue; // blank-person row
    const role = (cells[1] === "M" || cells[1] === "IC" ? cells[1] : "") as Role;
    rows.push({
      person: cells[0], role, team: cells[2], reportsTo: cells[3],
      systems: splitList(cells[4]), oncall: splitList(cells[5]), skills: splitList(cells[6]),
    });
  }
  return rows;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test skills/org-design/scripts/scenario-scorer.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```fish
git add skills/org-design/scripts/scenario-scorer.ts skills/org-design/scripts/scenario-scorer.test.ts
git commit -F /tmp/commit-t1
```
(commit subject: `feat(org-design): scenario-scorer structure parser (Phase 2a)`)

---

## Task 2: Scorer — apply the split-team mutation

**Files:**
- Modify: `skills/org-design/scripts/scenario-scorer.ts`
- Test: `skills/org-design/scripts/scenario-scorer.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { applySplit, type SplitTeamSpec } from "./scenario-scorer.ts";

const acme = (): Person[] => parseStructure(FIXTURE);
const SPLIT: SplitTeamSpec = {
  type: "split-team",
  targetTeam: "Payments",
  into: [
    { name: "Payments-Core", lead: "Jordan", members: ["Jordan"] },
    { name: "Payments-Infra", lead: "Riley", members: ["Riley"] },
  ],
};

describe("applySplit", () => {
  test("reassigns members to new teams and points them at their new lead", () => {
    const after = applySplit(acme(), SPLIT);
    const jordan = after.find((r) => r.person === "Jordan")!;
    const riley = after.find((r) => r.person === "Riley")!;
    expect(jordan.team).toBe("Payments-Core");
    expect(riley.team).toBe("Payments-Infra");
    // a lead reports to the targetTeam's former manager (Sam) by default
    expect(jordan.reportsTo).toBe("Sam");
    expect(riley.reportsTo).toBe("Sam");
  });

  test("non-lead members report to their new team lead", () => {
    const spec: SplitTeamSpec = {
      type: "split-team", targetTeam: "Payments",
      into: [
        { name: "Payments-Core", lead: "Jordan", members: ["Jordan", "Riley"] },
        { name: "Payments-Infra", lead: "Sam", members: ["Sam"] },
      ],
    };
    const after = applySplit(acme(), spec);
    expect(after.find((r) => r.person === "Riley")!.reportsTo).toBe("Jordan");
  });

  test("newReporting overrides the default lead manager", () => {
    const after = applySplit(acme(), { ...SPLIT, newReporting: { "Payments-Core": "Dana" } });
    expect(after.find((r) => r.person === "Jordan")!.reportsTo).toBe("Dana");
  });

  test("throws when a member is not in the target team (spec usage error)", () => {
    const bad: SplitTeamSpec = {
      type: "split-team", targetTeam: "Payments",
      into: [{ name: "X", lead: "Alex", members: ["Alex"] }],
    };
    expect(() => applySplit(acme(), bad)).toThrow(/not in target team/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test skills/org-design/scripts/scenario-scorer.test.ts`
Expected: FAIL — `applySplit` not exported.

- [ ] **Step 3: Write minimal implementation** (append to `scenario-scorer.ts`)

```ts
export interface SplitTeamSpec {
  type: "split-team";
  targetTeam: string;
  into: { name: string; lead: string; members: string[] }[];
  newReporting?: Record<string, string>;
}

export function applySplit(people: Person[], spec: SplitTeamSpec): Person[] {
  const inTarget = new Set(people.filter((p) => p.team === spec.targetTeam).map((p) => p.person));
  // former manager of the target team = the manager its members reported to (most common)
  const formerManager =
    people.find((p) => p.team === spec.targetTeam && p.role === "M")?.reportsTo
    ?? people.find((p) => p.team === spec.targetTeam)?.reportsTo
    ?? "";

  const teamOf = new Map<string, string>();   // person -> new team
  const leadOf = new Map<string, string>();   // new team -> lead
  for (const grp of spec.into) {
    leadOf.set(grp.name, grp.lead);
    for (const m of grp.members) {
      if (!inTarget.has(m)) throw new Error(`member ${m} is not in target team ${spec.targetTeam}`);
      teamOf.set(m, grp.name);
    }
  }

  return people.map((p) => {
    const newTeam = teamOf.get(p.person);
    if (newTeam === undefined) return p;
    const lead = leadOf.get(newTeam)!;
    const reportsTo =
      p.person === lead
        ? (spec.newReporting?.[newTeam] ?? formerManager)
        : lead;
    return { ...p, team: newTeam, reportsTo };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test skills/org-design/scripts/scenario-scorer.test.ts`
Expected: PASS (all Task 1 + Task 2 tests).

- [ ] **Step 5: Commit**

```fish
git add skills/org-design/scripts/scenario-scorer.ts skills/org-design/scripts/scenario-scorer.test.ts
git commit -F /tmp/commit-t2
```
(subject: `feat(org-design): scenario-scorer split-team mutation`)

---

## Task 3: Scorer — recompute metrics (span / system-SPOF / on-call / ratio)

**Files:**
- Modify: `skills/org-design/scripts/scenario-scorer.ts`
- Test: `skills/org-design/scripts/scenario-scorer.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { computeMetrics } from "./scenario-scorer.ts";

describe("computeMetrics", () => {
  test("span counts direct reports per manager", () => {
    const m = computeMetrics(acme());
    expect(m.span["Dana"]).toBe(1);  // only Sam reports to Dana in this 4-row fixture
    expect(m.span["Sam"]).toBe(2);   // Jordan + Riley
  });

  test("system-SPOF = systems owned by exactly one person", () => {
    const m = computeMetrics(acme());
    expect(m.spof).toContain("billing-service"); // only Jordan owns it
  });

  test("oncall counts rotations per person", () => {
    const m = computeMetrics(acme());
    expect(m.oncall["Jordan"]).toBe(1);
  });

  test("ratio counts M vs IC per team", () => {
    const m = computeMetrics(acme());
    expect(m.ratio["Payments"]).toEqual({ m: 1, ic: 2 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test skills/org-design/scripts/scenario-scorer.test.ts`
Expected: FAIL — `computeMetrics` not exported.

- [ ] **Step 3: Write minimal implementation** (append)

```ts
export interface Metrics {
  span: Record<string, number>;
  spof: string[];
  oncall: Record<string, number>;
  ratio: Record<string, { m: number; ic: number }>;
}

export function computeMetrics(people: Person[]): Metrics {
  const span: Record<string, number> = {};
  for (const p of people) {
    if (p.reportsTo) span[p.reportsTo] = (span[p.reportsTo] ?? 0) + 1;
  }
  const sysOwners = new Map<string, Set<string>>();
  for (const p of people) {
    for (const s of p.systems) {
      (sysOwners.get(s) ?? sysOwners.set(s, new Set()).get(s)!).add(p.person);
    }
  }
  const spof = [...sysOwners.entries()].filter(([, owners]) => owners.size === 1).map(([s]) => s).sort();
  const oncall: Record<string, number> = {};
  for (const p of people) oncall[p.person] = p.oncall.length;
  const ratio: Record<string, { m: number; ic: number }> = {};
  for (const p of people) {
    if (!p.team) continue;
    const r = (ratio[p.team] ??= { m: 0, ic: 0 });
    if (p.role === "M") r.m += 1;
    else if (p.role === "IC") r.ic += 1;
  }
  return { span, spof, oncall, ratio };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test skills/org-design/scripts/scenario-scorer.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```fish
git add skills/org-design/scripts/scenario-scorer.ts skills/org-design/scripts/scenario-scorer.test.ts
git commit -F /tmp/commit-t3
```
(subject: `feat(org-design): scenario-scorer metric recompute`)

---

## Task 4: Scorer — four structural validity rules

**Files:**
- Modify: `skills/org-design/scripts/scenario-scorer.ts`
- Test: `skills/org-design/scripts/scenario-scorer.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { checkValidity, type ValidityFailure } from "./scenario-scorer.ts";

const kinds = (f: ValidityFailure[]) => f.map((x) => x.kind).sort();

describe("checkValidity", () => {
  test("clean split is valid", () => {
    expect(checkValidity(applySplit(acme(), SPLIT)).length).toBe(0);
  });

  test("orphaned_report: report points at a manager not present", () => {
    const people = acme().map((p) => p.person === "Jordan" ? { ...p, reportsTo: "Ghost" } : p);
    expect(kinds(checkValidity(people))).toContain("orphaned_report");
  });

  test("reporting_cycle: A->B->A", () => {
    const people = acme().map((p) =>
      p.person === "Dana" ? { ...p, reportsTo: "Sam" } : p); // Dana->Sam->Dana
    expect(kinds(checkValidity(people))).toContain("reporting_cycle");
  });

  test("zero_report_manager: an M with no direct reports", () => {
    // move Jordan + Riley off Sam, leaving Sam (M) with 0 reports
    const people = acme().map((p) =>
      (p.person === "Jordan" || p.person === "Riley") ? { ...p, reportsTo: "Dana" } : p);
    expect(kinds(checkValidity(people))).toContain("zero_report_manager");
  });

  test("subviable_oncall: rotation with <=1 person is invalid; exactly 2 is valid", () => {
    const one = acme().map((p) => p.person === "Riley" ? { ...p, oncall: [] } : p);
    expect(kinds(checkValidity(one))).toContain("subviable_oncall"); // payments-primary down to Jordan only
    expect(checkValidity(acme()).filter((f) => f.kind === "subviable_oncall").length).toBe(0); // 2 people = ok
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test skills/org-design/scripts/scenario-scorer.test.ts`
Expected: FAIL — `checkValidity` not exported.

- [ ] **Step 3: Write minimal implementation** (append)

```ts
export type ValidityFailure = {
  kind: "orphaned_report" | "reporting_cycle" | "zero_report_manager" | "subviable_oncall";
  detail: string; involved: string[];
};

export function checkValidity(people: Person[]): ValidityFailure[] {
  const names = new Set(people.map((p) => p.person));
  const failures: ValidityFailure[] = [];

  // 1. orphaned_report
  for (const p of people) {
    if (p.reportsTo && !names.has(p.reportsTo)) {
      failures.push({ kind: "orphaned_report", detail: `${p.person} reports to missing ${p.reportsTo}`, involved: [p.person, p.reportsTo] });
    }
  }

  // 2. reporting_cycle (walk each chain, detect revisit)
  const mgr = new Map(people.map((p) => [p.person, p.reportsTo]));
  for (const p of people) {
    const seen = new Set<string>();
    let cur: string | undefined = p.person;
    while (cur && mgr.get(cur)) {
      if (seen.has(cur)) {
        failures.push({ kind: "reporting_cycle", detail: `cycle through ${[...seen].join(" -> ")}`, involved: [...seen] });
        break;
      }
      seen.add(cur);
      cur = mgr.get(cur);
    }
  }

  // 3. zero_report_manager (role M, or appears as a lead, but nobody reports to them)
  const hasReports = new Set(people.filter((p) => p.reportsTo).map((p) => p.reportsTo));
  for (const p of people) {
    if (p.role === "M" && !hasReports.has(p.person)) {
      failures.push({ kind: "zero_report_manager", detail: `${p.person} is a manager with zero reports`, involved: [p.person] });
    }
  }

  // 4. subviable_oncall (rotation staffed by <=1 person)
  const rota = new Map<string, Set<string>>();
  for (const p of people) for (const r of p.oncall) {
    (rota.get(r) ?? rota.set(r, new Set()).get(r)!).add(p.person);
  }
  for (const [r, members] of rota) {
    if (members.size <= 1) {
      failures.push({ kind: "subviable_oncall", detail: `rotation ${r} staffed by ${members.size} person`, involved: [...members] });
    }
  }

  // dedupe reporting_cycle (same cycle found from multiple entry points)
  const seenCycle = new Set<string>();
  return failures.filter((f) => {
    if (f.kind !== "reporting_cycle") return true;
    const key = [...f.involved].sort().join(",");
    if (seenCycle.has(key)) return false;
    seenCycle.add(key); return true;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test skills/org-design/scripts/scenario-scorer.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```fish
git add skills/org-design/scripts/scenario-scorer.ts skills/org-design/scripts/scenario-scorer.test.ts
git commit -F /tmp/commit-t4
```
(subject: `feat(org-design): scenario-scorer validity rules`)

---

## Task 5: Scorer — `run()` assembler + CLI entrypoint

**Files:**
- Modify: `skills/org-design/scripts/scenario-scorer.ts`
- Test: `skills/org-design/scripts/scenario-scorer.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { run, type ScenarioResult } from "./scenario-scorer.ts";

describe("run", () => {
  test("valid split returns valid result with before/after metrics and deltas", () => {
    const res: ScenarioResult = run(FIXTURE, SPLIT);
    expect(res.valid).toBe(true);
    expect(res.failures).toEqual([]);
    expect(res.deltas.addedTeams.sort()).toEqual(["Payments-Core", "Payments-Infra"]);
    expect(res.deltas.removedTeams).toEqual(["Payments"]);
    expect(res.metrics.span["Sam"]).toEqual({ before: 2, after: 2 });
    expect(res.metrics.spof.before).toContain("billing-service");
  });

  test("invalid split (0-report manager) returns valid:false with the failure", () => {
    const spec: SplitTeamSpec = {
      type: "split-team", targetTeam: "Payments",
      into: [
        { name: "Pay-A", lead: "Jordan", members: ["Jordan"] },
        { name: "Pay-B", lead: "Riley", members: ["Riley"] },
      ],
      newReporting: { "Pay-A": "Dana", "Pay-B": "Dana" }, // Sam keeps team Payments, loses both reports
    };
    const res = run(FIXTURE, spec);
    expect(res.valid).toBe(false);
    expect(res.failures.map((f) => f.kind)).toContain("zero_report_manager");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test skills/org-design/scripts/scenario-scorer.test.ts`
Expected: FAIL — `run` not exported.

- [ ] **Step 3: Write minimal implementation** (append; the CLI block goes at the END of the file)

```ts
export interface ScenarioResult {
  valid: boolean;
  failures: ValidityFailure[];
  deltas: {
    teamsBefore: string[]; teamsAfter: string[];
    movedReports: { person: string; from: string; to: string }[];
    addedTeams: string[]; removedTeams: string[];
  };
  metrics: {
    span: Record<string, { before: number; after: number }>;
    spof: { before: string[]; after: string[] };
    oncall: Record<string, { before: number; after: number }>;
    ratio: Record<string, { m: number; ic: number }>;
  };
}

const teams = (people: Person[]): string[] => [...new Set(people.map((p) => p.team).filter(Boolean))].sort();
const mergeKeys = <T>(a: Record<string, T>, b: Record<string, T>): string[] =>
  [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();

export function run(structureMd: string, spec: SplitTeamSpec): ScenarioResult {
  const before = parseStructure(structureMd);
  const after = applySplit(before, spec);
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
  return {
    valid: failures.length === 0,
    failures,
    deltas: {
      teamsBefore: tb, teamsAfter: ta,
      movedReports,
      addedTeams: ta.filter((t) => !tb.includes(t)),
      removedTeams: tb.filter((t) => !ta.includes(t)),
    },
    metrics: { span, spof: { before: mb.spof, after: ma.spof }, oncall, ratio: ma.ratio },
  };
}

// --- CLI entrypoint: scenario-scorer.ts <structure.md path> <scenario.json path> ---
if (import.meta.main) {
  const [structPath, specPath] = process.argv.slice(2);
  if (!structPath || !specPath) {
    console.error("usage: scenario-scorer.ts <structure.md path> <scenario.json path>");
    process.exit(64); // EX_USAGE
  }
  try {
    const md = await Bun.file(structPath).text();
    const spec = JSON.parse(await Bun.file(specPath).text()) as SplitTeamSpec;
    if (spec.type !== "split-team") throw new Error(`unsupported scenario type: ${spec.type}`);
    process.stdout.write(JSON.stringify(run(md, spec), null, 2) + "\n");
  } catch (e) {
    console.error(`scenario-scorer error: ${(e as Error).message}`);
    process.exit(65); // EX_DATAERR
  }
}
```

- [ ] **Step 4: Run test + a live CLI smoke**

Run: `bun test skills/org-design/scripts/scenario-scorer.test.ts`
Expected: PASS (all tasks).

Then smoke the CLI:
```fish
echo '{"type":"split-team","targetTeam":"Payments","into":[{"name":"Pay-Core","lead":"Jordan","members":["Jordan"]},{"name":"Pay-Infra","lead":"Riley","members":["Riley"]}]}' > /tmp/spec.json
bun run skills/org-design/scripts/scenario-scorer.ts tests/fixtures/org-design/structure-only/org/structure.md /tmp/spec.json
```
Expected: JSON with `"valid": true` and `addedTeams` listing the two new teams. (Exit 0.)

- [ ] **Step 5: Type-check + commit**

Run: `bunx tsc --noEmit skills/org-design/scripts/scenario-scorer.ts`
Expected: no errors.

```fish
git add skills/org-design/scripts/scenario-scorer.ts skills/org-design/scripts/scenario-scorer.test.ts
git commit -F /tmp/commit-t5
```
(subject: `feat(org-design): scenario-scorer run() + CLI entrypoint`)

---

## Task 6: `scenario-checks.md` reference

**Files:**
- Create: `skills/org-design/scenario-checks.md`

- [ ] **Step 1: Write the reference file**

Write `skills/org-design/scenario-checks.md` with these sections (full content — mirror `analysis-checks.md` tone):

````markdown
# scenario-checks.md — split-team scenario modeling (Phase 2a)

Rules for `--mode=scenario`, `split-team` operation. Phase 2a is **prescriptive**:
it projects a reorg and compares it to the current org. The Phase-1 backtracking
guardrail (rewrite recommendation → flag) does NOT apply here — see SKILL.md mode wall.

## Scenario spec block

The orchestrator gathers split intent conversationally and transcribes it into this
block, then serializes it to JSON for the scorer:

```markdown
<!-- org-design:scenario -->
type: split-team
target_team: <team being split>
into:
  - name: <new team A>
    lead: <person>
    members: [<person>, ...]
  - name: <new team B>
    lead: <person>
    members: [<person>, ...]
new_reporting:            # optional; default = both leads report to target_team's former manager
  <new team A>: <manager>
<!-- /org-design:scenario -->
```

Spec rules (the orchestrator validates BEFORE calling the scorer):
- Every `members` entry must currently be in `target_team`.
- Every member of `target_team` should be assigned to exactly one new team.
- Each `lead` must be in its group's `members`.

A malformed spec is a usage error — fix it with the user, do not call the scorer.

## Scorer

`scripts/scenario-scorer.ts <structure.md path> <scenario.json path>` → `ScenarioResult` JSON on stdout.
Exit 0 on completion (`valid:false` is a result); non-zero on usage/parse error.

The scorer computes **system-ownership SPOF only** (deterministic from `Critical
systems owned`). **Authority-SPOF** (memory power tags) is overlaid by the
orchestrator during render, with the Phase-1 degradation caveat when memory is down.

## Validity rules (deterministic)

Projected org is INVALID if any hold; each is a `ValidityFailure`:

1. `orphaned_report` — a `Reports to` references a person not in the projected org.
2. `reporting_cycle` — the `Reports to` chain loops.
3. `zero_report_manager` — a row marked `M` (or a new-team lead) ends with zero reports.
4. `subviable_oncall` — a rotation is left with ≤1 person. Exactly 2 = valid-but-warned.

Span (>~7 wide / 1–2 narrow) and manager:IC ratio (~1:5–1:8) are REPORTED in the
delta table, not validity failures — thresholds reused from `analysis-checks.md`.

## Render (on valid)

1. Before/after Mermaid `graph TD`. AFTER annotates new teams/leads (heavier node),
   moved reports (labeled), dropped reporting edges.
2. Delta table: `metric | before | after | note` — span changes, system-SPOF
   before/after, on-call shifts (flag any 2-person rotation), after-state ratios.
3. Short narrative of what the split changes + residual risks.

## Gates

1. **Validity (machine)** — `valid:false` → refuse, print failures, write nothing.
2. **Review (human, universal)** — `valid:true` → print full artifact + "validity:
   passed", STOP, require explicit user confirm before the atomic write. Decline →
   discard. (2b `reduce-headcount` adds a heightened layoff ack ahead of this confirm.)

## Persistence

Atomic write-temp-rename to `decisions/<date>-org-scenario-<slug>.md`
(`<slug>` = `<target_team>-split`, kebab-cased), with `<!-- org-design:auto -->`
fences. Multiple scenario files coexist (different slugs); same-slug-same-day
mutates in place; 2+ same-slug refuses + lists.
````

- [ ] **Step 2: Verify file renders + no broken fence**

Run: `grep -c "org-design:scenario" skills/org-design/scenario-checks.md`
Expected: `2` (open + close in the example block).

- [ ] **Step 3: Commit**

```fish
git add skills/org-design/scenario-checks.md
git commit -F /tmp/commit-t6
```
(subject: `docs(org-design): scenario-checks reference`)

---

## Task 7: SKILL.md — activate scenario route + mode wall

**Files:**
- Modify: `skills/org-design/SKILL.md`

- [ ] **Step 1: Bump frontmatter version + description**

In the frontmatter, change `version: 0.1.0` → `version: 0.2.0` and append to the `description` (after the Phase-1 sentence): ` Phase 2a adds --mode=scenario split-team (projects a reorg, validates structurally, gates on user review).`

- [ ] **Step 2: Replace the Mode routing `scenario` refusal row**

Find in the `## Mode routing` table:
```
| `scenario` (and any named scenario flag) | Refuse: "Scenario modeling is Phase 2 — not yet implemented. Phase 1 supports `--mode=analyze` (descriptive read of the inherited org) only." |
```
Replace with:
```
| `scenario` (Phase 2a) | Route the `split-team` operation per [scenario-checks.md](scenario-checks.md): gather split intent conversationally → build the `org-design:scenario` spec → call `scripts/scenario-scorer.ts` → **validity gate** (refuse on invalid, no write) → render before/after charts + delta table → **review gate** (print, require explicit confirm) → atomic write to `decisions/<date>-org-scenario-<slug>.md`. Non-`split-team` operations refuse: "Phase 2a supports `split-team` only; add/reduce-headcount, merge, reporting-change are Phase 2b." |
```

- [ ] **Step 3: Add the mode-wall statement** (new subsection after `## Mode routing`)

```markdown
## Mode wall (analyze vs scenario)

`analyze` (Phase 1) and `scenario` (Phase 2a) are disjoint routes writing disjoint
namespaces:

| Mode | Namespace | Backtracking guardrail |
|---|---|---|
| `analyze` | `decisions/<date>-org-analysis.md` | **ON** — any recommendation rewritten to a flag |
| `scenario` | `decisions/<date>-org-scenario-<slug>.md` | **OFF** — output is prescriptive by design |

The `## Backtracking` rule below applies to **`analyze` output only**. Scenario
output prescribes by design; never rewrite a scenario recommendation into a flag.
The two routes never co-mutate a file (different namespaces), so prescription
cannot leak into an analysis artifact.
```

- [ ] **Step 4: Scope the existing Backtracking section to analyze**

In `## Backtracking`, change the opening to read: `If the rendered **analyze** artifact proposes a change anywhere (§§3–7 contain a recommendation...` (insert "analyze" so the rule is explicitly analyze-only).

- [ ] **Step 5: Verify**

Run: `grep -n "Mode wall" skills/org-design/SKILL.md; grep -n "version: 0.2.0" skills/org-design/SKILL.md`
Expected: both match.

Run the frontmatter validator: `fish validate.fish --skill org-design`
Expected: pass (no frontmatter errors).

- [ ] **Step 6: Commit**

```fish
git add skills/org-design/SKILL.md
git commit -F /tmp/commit-t7
```
(subject: `feat(org-design): activate scenario route + mode wall`)

---

## Task 8: SKILL.md — render + gates + persistence prose

**Files:**
- Modify: `skills/org-design/SKILL.md`

- [ ] **Step 1: Add a `## Scenario mode (split-team)` section** (after the mode wall), with the step-by-step orchestration:

```markdown
## Scenario mode (split-team)

1. **Confidentiality** — same as analyze: `bun run "$CLAUDE_PROJECT_DIR/skills/onboard/scripts/onboard-guard.ts" refuse-raw <path>` before any workspace read.
2. **Structure gate** — resolve `<workspace>/org/structure.md`; same absent/empty handling as analyze (scaffold-or-refuse). Scenario needs a populated structure.
3. **Gather intent** — conversationally determine: which team to split, the new teams, their members, leads, and (optionally) where the leads report. Build the `org-design:scenario` block (see [scenario-checks.md](scenario-checks.md)). Validate the spec (members ∈ target team; each member in one team; lead ∈ members) BEFORE scoring.
4. **Score** — write the spec to a temp JSON, run `bun run skills/org-design/scripts/scenario-scorer.ts <structure.md> <spec.json>`, parse the `ScenarioResult`.
5. **Validity gate** — if `valid:false`: print each failure (`kind` + `detail` + `involved`), state no file was written, STOP. Do not render, do not persist.
6. **Render** (valid only) — emit two Mermaid `graph TD` charts (before = current; after = projected with new teams/leads heavier, moved reports labeled) + the delta table (`metric | before | after | note`, flag any 2-person rotation) + a short narrative. Overlay authority-SPOF from the stakeholder memory graph; if memory is down, add the Phase-1 degradation caveat.
7. **Review gate** — print the full rendered artifact + a `validity: passed` line, then STOP and ask the user to confirm explicitly before writing. No auto-persist.
8. **Persist** (on confirm) — atomic write-temp-rename to `decisions/<date>-org-scenario-<slug>.md` (`<slug>` = `<target_team>-split`), `<!-- org-design:auto -->` fences. Same-slug-same-day mutates in place; 2+ same-slug refuses + lists. On decline, discard — nothing written.
```

- [ ] **Step 2: Update `## Out of scope (Phase 1)` → note Phase 2a now in, 2b out**

Change the heading to `## Out of scope (Phase 2a)` and replace the list body with the 2b deferrals: other 4 modes, trade-off matrix, recommended-option, before/after for non-split ops, Excalidraw, HRIS, automated strategy-doc hand-off, the heightened layoff ack.

- [ ] **Step 3: Verify**

Run: `grep -n "Scenario mode (split-team)" skills/org-design/SKILL.md`
Expected: matches.

- [ ] **Step 4: Commit**

```fish
git add skills/org-design/SKILL.md
git commit -F /tmp/commit-t8
```
(subject: `feat(org-design): scenario render + gates orchestration`)

---

## Task 9: Fixtures — valid + invalid split workspaces

**Files:**
- Create: `tests/fixtures/org-design/split-valid/org/structure.md`
- Create: `tests/fixtures/org-design/split-valid/decisions/.gitkeep`
- Create: `tests/fixtures/org-design/split-invalid/org/structure.md`
- Create: `tests/fixtures/org-design/split-invalid/decisions/.gitkeep`
- Modify: `tests/fixtures/org-design/README.md`

- [ ] **Step 1: Create the `split-valid` fixture** — reuse the `structure-only` org verbatim (6 rows: Dana, Sam, Jordan, Riley, Alex, Morgan). Copy `tests/fixtures/org-design/structure-only/org/structure.md` to `tests/fixtures/org-design/split-valid/org/structure.md`, and `touch tests/fixtures/org-design/split-valid/decisions/.gitkeep`.

```fish
mkdir -p tests/fixtures/org-design/split-valid/org tests/fixtures/org-design/split-valid/decisions
cp tests/fixtures/org-design/structure-only/org/structure.md tests/fixtures/org-design/split-valid/org/structure.md
touch tests/fixtures/org-design/split-valid/decisions/.gitkeep
```

- [ ] **Step 2: Create the `split-invalid` fixture** — same org. The eval's prompt will request a split that strands Sam (a manager) with 0 reports.

```fish
mkdir -p tests/fixtures/org-design/split-invalid/org tests/fixtures/org-design/split-invalid/decisions
cp tests/fixtures/org-design/structure-only/org/structure.md tests/fixtures/org-design/split-invalid/org/structure.md
touch tests/fixtures/org-design/split-invalid/decisions/.gitkeep
```

- [ ] **Step 3: Add both to the fixture↔eval matrix** in `tests/fixtures/org-design/README.md`:

```markdown
| `scenario-split-valid` | `split-valid/` | Same 6-row org as `structure-only`. Splitting Payments into two staffed teams is structurally valid → exercises the render + review gate (no auto-persist). |
| `scenario-invalid-refusal` | `split-invalid/` | Same org. A split that moves Jordan+Riley off Sam leaves Sam (M) with zero reports → `zero_report_manager`; exercises the validity-gate refusal. |
| `scenario-mode-wall` | `split-valid/` | Reuses `split-valid/`; asserts a scenario run never writes `*-org-analysis.md`. |
```

- [ ] **Step 4: Verify**

Run: `fish validate.fish --skill org-design` (or the fixture-integrity phase)
Expected: no orphaned-fixture warning (every fixture has an eval consumer once Task 10 lands; if run before Task 10, expect the orphan warning — acceptable until then).

- [ ] **Step 5: Commit**

```fish
git add tests/fixtures/org-design/split-valid tests/fixtures/org-design/split-invalid tests/fixtures/org-design/README.md
git commit -F /tmp/commit-t9
```
(subject: `test(org-design): split-valid + split-invalid fixtures`)

---

## Task 10: Evals — three behavioral evals

**Files:**
- Modify: `skills/org-design/evals/evals.json`

- [ ] **Step 1: Add three evals** to the `evals` array (after `analyze-structure-only`). Update the top-level `description` to mention Phase 2a. Each uses `--workspace` against its fixture (copied to /tmp first, per the existing setup/teardown pattern):

```json
{
  "name": "scenario-split-valid",
  "summary": "split-team valid path: splitting Payments into two staffed teams renders before/after charts and reaches the review gate WITHOUT auto-persisting.",
  "setup": "cp -r /Users/cantu/repos/claude-config/tests/fixtures/org-design/split-valid /tmp/od-eval-split-valid",
  "teardown": "rm -rf /tmp/od-eval-split-valid",
  "prompt": "/org-design orgfix-acme --mode=scenario --workspace /tmp/od-eval-split-valid  — split the Payments team into Payments-Core (lead Jordan) and Payments-Infra (lead Riley).",
  "assertions": [
    {"type": "skill_invoked", "skill": "org-design", "tier": "diagnostic", "description": "diagnostic structural anchor; Write/Bash regexes below are load-bearing"},
    {"type": "tool_input_matches", "tool": "Bash", "input_key": "command", "input_value": "scenario-scorer.ts", "tier": "required", "description": "DISCRIMINATOR: the deterministic scorer is actually invoked (not an LLM hand-wave)"},
    {"type": "regex", "pattern": "validity:?\\s*passed", "flags": "i", "tier": "required", "description": "validity gate passed before render"},
    {"type": "regex", "pattern": "before|after", "flags": "i", "tier": "required", "description": "before/after comparison rendered"},
    {"type": "not_regex", "pattern": "Write\\(.*org-scenario.*\\)", "flags": "i", "tier": "required", "description": "DISCRIMINATOR: no auto-persist — the artifact is NOT written before an explicit user confirm (review gate holds)"}
  ]
},
{
  "name": "scenario-invalid-refusal",
  "summary": "split-team invalid path: a split that strands manager Sam with zero reports is refused by the validity gate; nothing is written.",
  "setup": "cp -r /Users/cantu/repos/claude-config/tests/fixtures/org-design/split-invalid /tmp/od-eval-split-invalid",
  "teardown": "rm -rf /tmp/od-eval-split-invalid",
  "prompt": "/org-design orgfix-acme --mode=scenario --workspace /tmp/od-eval-split-invalid  — split Payments so Jordan and Riley both move under Dana on new teams, leaving Sam as Payments manager.",
  "assertions": [
    {"type": "skill_invoked", "skill": "org-design", "tier": "diagnostic", "description": "diagnostic structural anchor"},
    {"type": "tool_input_matches", "tool": "Bash", "input_key": "command", "input_value": "scenario-scorer.ts", "tier": "required", "description": "scorer invoked"},
    {"type": "regex", "pattern": "zero[_ -]?report", "flags": "i", "tier": "required", "description": "DISCRIMINATOR: the specific structural failure (0-report manager) is surfaced — proves the deterministic gate ran, not a vibe-check"},
    {"type": "not_regex", "pattern": "validity:?\\s*passed", "flags": "i", "tier": "required", "description": "validity did NOT pass"}
  ]
},
{
  "name": "scenario-mode-wall",
  "summary": "mode wall: a scenario run writes only the org-scenario namespace and never touches *-org-analysis.md.",
  "setup": "cp -r /Users/cantu/repos/claude-config/tests/fixtures/org-design/split-valid /tmp/od-eval-mode-wall",
  "teardown": "rm -rf /tmp/od-eval-mode-wall",
  "prompt": "/org-design orgfix-acme --mode=scenario --workspace /tmp/od-eval-mode-wall  — split Payments into Payments-Core (lead Jordan) and Payments-Infra (lead Riley). After I confirm, write it.",
  "assertions": [
    {"type": "skill_invoked", "skill": "org-design", "tier": "diagnostic", "description": "diagnostic structural anchor"},
    {"type": "not_regex", "pattern": "org-analysis\\.md", "flags": "i", "tier": "required", "description": "DISCRIMINATOR: scenario route never writes the analyze namespace (mode wall holds)"},
    {"type": "regex", "pattern": "org-scenario", "flags": "i", "tier": "required", "description": "scenario artifact targets the new namespace"}
  ]
}
```

- [ ] **Step 2: Validate JSON + regex compile**

Run: `bun run tests/eval-runner-v2.ts --dry-run`
Expected: JSON parses, all regexes compile, no schema error.

- [ ] **Step 3: Run the new evals** (subscription auth to avoid billing, per `eval_runner_subscription_auth`)

Run: `env -u ANTHROPIC_API_KEY bun run tests/eval-runner-v2.ts org-design`
Expected: `analyze-structure-only` still passes; the 3 new evals pass. Text-tier flakiness → re-run 3–5× per `rules_evals_redgreen_procedure`.

- [ ] **Step 4: Commit**

```fish
git add skills/org-design/evals/evals.json
git commit -F /tmp/commit-t10
```
(subject: `test(org-design): scenario behavioral evals (valid/invalid/mode-wall)`)

---

## Task 11: Catalog + full validate.fish conformance

**Files:**
- Modify: `docs/catalog.md`

- [ ] **Step 1: Update the catalog entry** for org-design (currently line ~79). Replace the trailing sentence `Describes and flags only; scenario modeling (splits/merges/headcount) is Phase 2.` with:

```
Phase 2a adds `--mode=scenario` (`split-team`): projects a reorg, validates it structurally (orphan / reporting cycle / 0-report manager / sub-viable on-call), and gates on explicit user review before writing a `*-org-scenario-<slug>.md` artifact. Other scenario modes (merge / headcount / reporting-change), the trade-off matrix, and recommended-option are Phase 2b.
```

> **Caution:** `docs/catalog.md` may carry unrelated pre-existing uncommitted edits (e.g. `/present`, `/frontend-slides` rows). Before `git add`, run `git diff docs/catalog.md` — if unrelated changes are present, stage only your hunk with `git add -p docs/catalog.md` so Task 11's commit stays scoped to the org-design line.

- [ ] **Step 2: Full validate**

Run: `fish validate.fish`
Expected: all phases pass — frontmatter, fixture↔eval integrity (all 3 new fixtures now have eval consumers), asset link integrity (scenario-checks.md linked from SKILL.md).

- [ ] **Step 3: Full scorer test + type-check (final gate)**

Run: `bun test skills/org-design/scripts/scenario-scorer.test.ts; bunx tsc --noEmit skills/org-design/scripts/scenario-scorer.ts`
Expected: all tests PASS; no type errors.

- [ ] **Step 4: Commit**

```fish
git add docs/catalog.md
git commit -F /tmp/commit-t11
```
(subject: `docs(org-design): catalog scenario mode`)

---

## Acceptance Criteria (end-state gate — from the spec)

Verify each is satisfied before declaring Phase 2a done:

- [ ] `--mode=scenario` routes `split-team`; non-split operations refuse with a 2b message.
- [ ] Split intent gathered conversationally → `org-design:scenario` spec block.
- [ ] `scenario-scorer.ts` returns the `ScenarioResult` contract; exit 0 on completion, non-zero on usage error (verified by Task 5 CLI smoke + tests).
- [ ] Validity gate refuses + writes nothing on any of the four failures (Task 4 tests + `scenario-invalid-refusal` eval).
- [ ] Review gate prints the artifact + requires explicit confirm before write; decline writes nothing (`scenario-split-valid` eval `not_regex` auto-persist).
- [ ] Before/after Mermaid + delta table render (Task 8 + eval `before|after`).
- [ ] Artifact persists to `decisions/<date>-org-scenario-<slug>.md`; same-slug idempotent; 2+ same-slug refuses.
- [ ] Mode wall holds (`scenario-mode-wall` eval: no `org-analysis.md` write; backtracking scoped to analyze).
- [ ] NDA refusal inherited; authority-SPOF degrades (announced) when memory down.
- [ ] `scenario-scorer.test.ts` covers happy path + each validity failure + usage errors; 3 behavioral evals pass.

## Notes for the Implementer

- **Runtime is bun, not node** — use `bun test`, `bun run`, `bunx`. Node is not installed.
- **fish shell** — no bash heredocs; write commit messages to `/tmp/commit-tN` first (`git commit -F`). The plan references `/tmp/commit-tN` files — author each with the subject line given.
- **Don't fork Phase-1 machinery** — onboard-guard NDA, section fences, atomic write are reused as-is; if you find yourself copying their logic, reference instead.
- **Scorer stays pure** — no MCP, no fs writes inside `scenario-scorer.ts` beyond reading argv-named files. Authority-SPOF and persistence live in the orchestrator (SKILL.md).
