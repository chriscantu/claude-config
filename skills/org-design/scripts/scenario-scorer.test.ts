import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseStructure, type Person, type Role, applySplit, type SplitTeamSpec, computeMetrics, checkValidity, type ValidityFailure, run, type ScenarioResult, applyMerge, type MergeTeamsSpec, applyAdd, type AddHeadcountSpec, applyReporting, type ChangeReportingSpec, applyReduce, type ReduceHeadcountSpec, isScenarioType, compareScenarios, type MatrixResult } from "./scenario-scorer.ts";

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

  test("reporting_cycle involved excludes non-cycle prefix nodes and dedupes to one record", () => {
    // Jordan -> Sam (prefix) into a Sam <-> Riley 2-cycle
    const people = acme().map((p) => {
      if (p.person === "Sam") return { ...p, reportsTo: "Riley" };
      if (p.person === "Riley") return { ...p, reportsTo: "Sam" };
      return p; // Jordan still reports to Sam — a prefix INTO the cycle
    });
    const cyc = checkValidity(people).filter((f) => f.kind === "reporting_cycle");
    expect(cyc.length).toBe(1);                              // one cycle, not duplicated by entry point
    expect([...cyc[0].involved].sort()).toEqual(["Riley", "Sam"]); // Jordan (prefix) excluded
  });
});

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
      reassign: { Jordan: "Alex" }, // Sam keeps Riley, so Sam is not stranded
    };
    const after = applyAdd(acme(), spec);
    expect(after.find((r) => r.person === "Jordan")!.reportsTo).toBe("Alex");
    expect(computeMetrics(after).span["Alex"]).toBe(1);
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

describe("applyReduce", () => {
  test("cuts an IC and recomputes survivor metrics", () => {
    const spec: ReduceHeadcountSpec = { type: "reduce-headcount", cut: ["Riley"], acknowledged: true };
    const after = applyReduce(acme(), spec);
    expect(after.find((p) => p.person === "Riley")).toBeUndefined();
    expect(after.length).toBe(3);
    expect(computeMetrics(after).span["Sam"]).toBe(1); // only Jordan left under Sam
  });

  test("reassign re-homes displaced reports before dropping cut rows (valid)", () => {
    const spec: ReduceHeadcountSpec = {
      type: "reduce-headcount", cut: ["Sam"], reassign: { Jordan: "Dana", Riley: "Dana" }, acknowledged: true,
    };
    const after = applyReduce(acme(), spec);
    expect(after.find((p) => p.person === "Sam")).toBeUndefined();
    expect(after.find((p) => p.person === "Jordan")!.reportsTo).toBe("Dana");
    expect(after.find((p) => p.person === "Riley")!.reportsTo).toBe("Dana");
    expect(checkValidity(after).length).toBe(0); // reports re-homed, rotation intact
  });

  test("cutting a manager without reassigning their reports trips orphaned_report", () => {
    const res = run(FIXTURE, { type: "reduce-headcount", cut: ["Sam"], acknowledged: true });
    expect(res.valid).toBe(false);
    expect(res.failures.map((f) => f.kind)).toContain("orphaned_report"); // Jordan/Riley -> missing Sam
  });

  test("cutting a rotation member down to <=1 trips subviable_oncall", () => {
    const res = run(FIXTURE, { type: "reduce-headcount", cut: ["Riley"], acknowledged: true });
    expect(res.valid).toBe(false);
    expect(res.failures.map((f) => f.kind)).toContain("subviable_oncall"); // payments-primary -> Jordan only
  });

  test("cutting a non-existent person is a silent no-op (pinned behavior)", () => {
    // Set membership matches nothing; nobody is removed. Pinned so a future
    // "throw on unknown cut" change is a conscious break, not a silent regression.
    const after = applyReduce(acme(), { type: "reduce-headcount", cut: ["Ghost"], acknowledged: true });
    expect(after).toEqual(parseStructure(FIXTURE)); // true deep no-op, not just row count
  });

  test("partial reassign: listed report re-homed, unlisted left orphaned", () => {
    const spec: ReduceHeadcountSpec = {
      type: "reduce-headcount", cut: ["Sam"], reassign: { Jordan: "Dana" }, acknowledged: true,
    };
    const after = applyReduce(acme(), spec);
    expect(after.find((p) => p.person === "Jordan")!.reportsTo).toBe("Dana"); // re-homed
    expect(after.find((p) => p.person === "Riley")!.reportsTo).toBe("Sam");   // unchanged -> now orphaned
    expect(checkValidity(after).map((f) => f.kind)).toContain("orphaned_report");
  });
});

describe("reduce-headcount ack gate", () => {
  test("run refuses (throws) without acknowledged:true", () => {
    expect(() =>
      run(FIXTURE, { type: "reduce-headcount", cut: ["Riley"], acknowledged: false }),
    ).toThrow(/acknowledgment gate/i);
  });

  test("run proceeds with acknowledged:true and returns a result", () => {
    const res: ScenarioResult = run(FIXTURE, { type: "reduce-headcount", cut: ["Riley"], acknowledged: true });
    expect(res.deltas.teamsAfter).toBeDefined();
    expect(res.metrics.unownedAfter).toBeDefined();
  });

  test("gate lives in applyReduce: a direct call bypassing applyMutation still refuses", () => {
    // Defense-in-depth — the gate is a property of the operation, not the
    // dispatch, so an in-repo caller importing applyReduce directly cannot skip it.
    expect(() =>
      applyReduce(acme(), { type: "reduce-headcount", cut: ["Riley"], acknowledged: false }),
    ).toThrow(/acknowledgment gate/i);
  });
});

describe("metrics.unownedAfter", () => {
  test("cutting the sole owner of a system lists it as unowned", () => {
    const res = run(FIXTURE, { type: "reduce-headcount", cut: ["Jordan"], acknowledged: true });
    expect(res.metrics.unownedAfter).toContain("billing-service"); // Jordan was its only owner
  });

  test("a non-removing mode leaves unownedAfter empty", () => {
    const res = run(FIXTURE, SPLIT);
    expect(res.metrics.unownedAfter).toEqual([]); // split keeps every owner
  });

  test("a system that keeps another owner is NOT unowned (2->1, the core discriminator)", () => {
    // billing-service co-owned by Jordan AND Riley; cutting Jordan leaves Riley.
    const coOwned = FIXTURE.replace(
      "| Riley  | IC | Payments | Sam | | payments-primary | Go |",
      "| Riley  | IC | Payments | Sam | billing-service | payments-primary | Go |",
    );
    const res = run(coOwned, { type: "reduce-headcount", cut: ["Jordan"], acknowledged: true });
    expect(res.metrics.unownedAfter).not.toContain("billing-service"); // Riley still owns it
    expect(res.metrics.spof.after).toContain("billing-service");        // now sole-owned by Riley
  });
});

describe("CLI dispatch", () => {
  const script = `${import.meta.dir}/scenario-scorer.ts`;
  let dir: string;
  let STRUCT: string;
  let SPEC: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "scenario-cli-")); // hermetic, unique per run
    STRUCT = join(dir, "struct.md");
    SPEC = join(dir, "spec.json");
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const cli = async (specObj: unknown): Promise<{ code: number; out: string; err: string }> => {
    await Bun.write(STRUCT, FIXTURE);
    await Bun.write(SPEC, JSON.stringify(specObj));
    const proc = Bun.spawn(["bun", script, STRUCT, SPEC], { stdout: "pipe", stderr: "pipe" });
    const code = await proc.exited;
    const out = await new Response(proc.stdout).text();
    const err = await new Response(proc.stderr).text();
    return { code, out, err };
  };

  const exitForArgs = async (...args: string[]): Promise<number> => {
    const proc = Bun.spawn(["bun", script, ...args], { stdout: "pipe", stderr: "pipe" });
    return await proc.exited;
  };

  test("valid reduce-headcount dispatches: exit 0 + concrete ScenarioResult values", async () => {
    // Cut Jordan (sole owner of billing-service) so unownedAfter pins a real value,
    // not an always-defined []; valid:false (subviable_oncall) proves exit code is
    // decoupled from scenario validity. A broken scorer can't false-green this.
    const { code, out } = await cli({ type: "reduce-headcount", cut: ["Jordan"], acknowledged: true });
    expect(code).toBe(0);
    const parsed = JSON.parse(out);
    expect(parsed.metrics.unownedAfter).toEqual(["billing-service"]);
    expect(parsed.valid).toBe(false);
    expect(parsed.deltas).toBeDefined();
  });

  test("acknowledged:false exits 65 AND the ack gate is the named cause", async () => {
    const { code, err } = await cli({ type: "reduce-headcount", cut: ["Riley"], acknowledged: false });
    expect(code).toBe(65);
    expect(err).toMatch(/acknowledgment gate/i); // not just "something threw"
  });

  test("acknowledged absent exits 65 via the ack gate (fail-closed, not a bypass)", async () => {
    const { code, err } = await cli({ type: "reduce-headcount", cut: ["Riley"] });
    expect(code).toBe(65);
    expect(err).toMatch(/acknowledgment gate/i);
  });

  test("acknowledged non-boolean-truthy ('true' / 1) still exits 65 (strict !== true)", async () => {
    // The entire reason the guard is `!== true` not `!spec.acknowledged`: a JSON
    // spec with "true" or 1 is truthy but must still refuse. Pins the hardening.
    const asString = await cli({ type: "reduce-headcount", cut: ["Riley"], acknowledged: "true" });
    expect(asString.code).toBe(65);
    expect(asString.err).toMatch(/acknowledgment gate/i);
    const asNumber = await cli({ type: "reduce-headcount", cut: ["Riley"], acknowledged: 1 });
    expect(asNumber.code).toBe(65);
    expect(asNumber.err).toMatch(/acknowledgment gate/i);
  });

  test("unknown scenario type exits 65 with the unsupported-type cause (EX_DATAERR)", async () => {
    const { code, err } = await cli({ type: "bogus" });
    expect(code).toBe(65);
    expect(err).toMatch(/unsupported scenario type/i);
  });

  test("missing args exits 64 (EX_USAGE), distinct from data errors", async () => {
    expect(await exitForArgs()).toBe(64);        // no paths at all
    expect(await exitForArgs(STRUCT)).toBe(64);  // only the structure path
  });
});

describe("isScenarioType", () => {
  test("accepts all five scenario modes, rejects unknown", () => {
    expect(isScenarioType("split-team")).toBe(true);
    expect(isScenarioType("add-headcount")).toBe(true);
    expect(isScenarioType("merge-teams")).toBe(true);
    expect(isScenarioType("change-reporting")).toBe(true);
    expect(isScenarioType("reduce-headcount")).toBe(true); // Phase 2b-ii
    expect(isScenarioType("bogus")).toBe(false);
  });
});

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
