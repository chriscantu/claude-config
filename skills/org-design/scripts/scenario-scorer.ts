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

export interface SplitTeamSpec {
  type: "split-team";
  targetTeam: string;
  into: { name: string; lead: string; members: string[] }[];
  newReporting?: Record<string, string>;
}

export function applySplit(people: Person[], spec: SplitTeamSpec): Person[] {
  const inTarget = new Set(people.filter((p) => p.team === spec.targetTeam).map((p) => p.person));
  // The split's new sub-team leads report to the target team's existing manager
  // (the M-role person in that team) by default; newReporting overrides per team.
  // Fallback: if the team has no M-role person, use the first member's reportsTo.
  const formerManager =
    people.find((p) => p.team === spec.targetTeam && p.role === "M")?.person
    ?? people.find((p) => p.team === spec.targetTeam)?.reportsTo
    ?? "";

  const teamOf = new Map<string, string>();   // person -> new team
  const leadOf = new Map<string, string>();   // new team -> lead
  for (const grp of spec.into) {
    leadOf.set(grp.name, grp.lead);
    for (const m of grp.members) {
      if (!inTarget.has(m)) throw new Error(`member ${m} is not in target team ${spec.targetTeam}`);
      // last-write-wins if a member is listed in multiple groups; Task 4 validity
      // (orphaned_report / reporting_cycle) catches the resulting structural breakage.
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

export interface ReduceHeadcountSpec {
  type: "reduce-headcount";
  cut: string[];                       // people to remove
  reassign?: Record<string, string>;   // displaced report -> new manager
  acknowledged: boolean;               // machine layoff-acknowledgment gate
}

export type ScenarioSpec =
  | SplitTeamSpec
  | AddHeadcountSpec
  | MergeTeamsSpec
  | ChangeReportingSpec
  | ReduceHeadcountSpec;

export const KNOWN_SCENARIO_TYPES = ["split-team", "add-headcount", "merge-teams", "change-reporting", "reduce-headcount"] as const;
export function isScenarioType(t: string): t is ScenarioSpec["type"] {
  return (KNOWN_SCENARIO_TYPES as readonly string[]).includes(t);
}

export function applyReporting(people: Person[], spec: ChangeReportingSpec): Person[] {
  return people.map((p) =>
    spec.reassign[p.person] !== undefined ? { ...p, reportsTo: spec.reassign[p.person] } : p);
}

export function applyAdd(people: Person[], spec: AddHeadcountSpec): Person[] {
  const reassigned = people.map((p) =>
    spec.reassign && spec.reassign[p.person] !== undefined
      ? { ...p, reportsTo: spec.reassign[p.person] }
      : p);
  return [...reassigned, ...spec.hires];
}

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

export function applyReduce(people: Person[], spec: ReduceHeadcountSpec): Person[] {
  // Machine layoff-acknowledgment gate, at the OPERATION (not the dispatch) so
  // every caller of applyReduce inherits it — closes the surface where a future
  // in-repo caller importing applyReduce directly would skip a dispatch-level
  // gate. Precondition throw, consistent with applySplit's "member not in target
  // team"; the CLI catches it and exits 65. Strict `!== true` fails closed on a
  // field-absent or non-boolean-truthy ("true"/1) spec and resists a future
  // refactor to `=== false`. The machine guarantees no accidental layoff
  // modeling; SKILL.md prose binds the flag-flip to an explicit user confirmation
  // after gravity is surfaced. See ADR #0024 for the accepted residual risk.
  if (spec.acknowledged !== true) {
    throw new Error("reduce-headcount requires acknowledged:true (layoff acknowledgment gate)");
  }
  const cut = new Set(spec.cut);
  // Re-home displaced reports onto surviving managers FIRST, then drop cut rows.
  // A report of a cut person who is NOT reassigned still points at the now-removed
  // manager -> orphaned_report -> the projection is invalid (no silent roll-up).
  const reassigned = people.map((p) =>
    spec.reassign && spec.reassign[p.person] !== undefined
      ? { ...p, reportsTo: spec.reassign[p.person] }
      : p);
  return reassigned.filter((p) => !cut.has(p.person));
}

function applyMutation(people: Person[], spec: ScenarioSpec): Person[] {
  switch (spec.type) {
    case "split-team":
      return applySplit(people, spec);
    case "merge-teams":
      return applyMerge(people, spec);
    case "add-headcount":
      return applyAdd(people, spec);
    case "change-reporting":
      return applyReporting(people, spec);
    case "reduce-headcount":
      // The layoff-acknowledgment gate lives in applyReduce (operation-level),
      // so it cannot be skipped by any caller that bypasses this dispatch.
      return applyReduce(people, spec);
    default:
      throw new Error(`unsupported scenario type: ${(spec as { type: string }).type}`);
  }
}

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
        const cycleNodes: string[] = [];
        let c: string | undefined = cur;
        do { cycleNodes.push(c!); c = mgr.get(c!); } while (c && c !== cur);
        failures.push({ kind: "reporting_cycle", detail: `cycle through ${cycleNodes.join(" -> ")}`, involved: cycleNodes });
        break;
      }
      seen.add(cur);
      cur = mgr.get(cur);
    }
  }

  // 3. zero_report_manager — a role-M person nobody reports to. (New-team leads
  //    default-report to the former manager, so they are never stranded zero-report
  //    in the split-team model; a single-person new team is a valid thin team.)
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
      failures.push({ kind: "subviable_oncall", detail: `rotation ${r} staffed by ${members.size} ${members.size === 1 ? "person" : "people"}`, involved: [...members] });
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
    // systems with >=1 owner before and 0 owners after (lost ALL owners).
    // Distinct from a resolved SPOF: a 1->0 system silently leaves spof.after,
    // so the most dangerous reduce outcome needs its own loud field. Additive
    // and mode-agnostic: non-removing modes never drop a system, so always [].
    unownedAfter: string[];
  };
}

const teams = (people: Person[]): string[] => [...new Set(people.map((p) => p.team).filter(Boolean))].sort();
const mergeKeys = <T>(a: Record<string, T>, b: Record<string, T>): string[] =>
  [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();

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

  const ownedBefore = new Set(before.flatMap((p) => p.systems));
  const ownedAfter = new Set(after.flatMap((p) => p.systems));
  const unownedAfter = [...ownedBefore].filter((s) => !ownedAfter.has(s)).sort();

  const beforeByPerson = new Map(before.map((p) => [p.person, p]));
  const movedReports = after
    // new hires (absent from `before`) are additions, not moved reports
    .filter((p) => beforeByPerson.has(p.person) && beforeByPerson.get(p.person)!.reportsTo !== p.reportsTo)
    .map((p) => ({ person: p.person, from: beforeByPerson.get(p.person)!.reportsTo, to: p.reportsTo }));

  const tb = teams(before), ta = teams(after);
  let addedTeams: string[], removedTeams: string[];
  if (spec.type === "split-team") {
    // split: the targetTeam is always treated as removed (even if the former manager
    // still carries the old team label), and the new sub-teams are added.
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
    deltas: {
      teamsBefore: tb, teamsAfter: ta,
      movedReports,
      addedTeams,
      removedTeams,
    },
    metrics: { span, spof: { before: mb.spof, after: ma.spof }, oncall, ratio: ma.ratio, unownedAfter },
  };
}

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
  for (const f of r.failures) flags.push(f.kind);                       // invalid scenarios surface each failure kind
  if (r.metrics.unownedAfter.length > 0) flags.push("unowned-systems"); // a system that lost its last owner (1->0)
  if (r.metrics.spof.after.length > 0) flags.push("spof-after");        // >=1 system still single-owned after
  const widest = Math.max(0, ...Object.values(r.metrics.span).map((s) => s.after));
  if (widest > 7) flags.push("wide-span");                              // span threshold reused from analysis-checks
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
