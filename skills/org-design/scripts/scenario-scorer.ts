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
