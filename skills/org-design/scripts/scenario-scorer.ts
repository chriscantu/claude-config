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
