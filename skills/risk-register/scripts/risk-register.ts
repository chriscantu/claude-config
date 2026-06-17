#!/usr/bin/env bun
// /risk-register helper — lightweight technical risk register.
// Actions: add | review | ack | escalate | resolve | list | --help
// Arg order: <action> <ws> [<R-N>] [flags]

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

type Level = "low" | "med" | "high";
type Status = "active" | "escalated" | "resolved";

const SEV: Record<Level, number> = { low: 1, med: 2, high: 3 };
const SENTINEL = "<!-- risk-register:auto -->";

interface Risk {
  id: number;
  desc: string;
  likelihood: Level;
  impact: Level;
  owner: string;
  mitigation: string;
  lastReviewed: string;
  status: Status;
}

interface Flags {
  desc?: string;
  likelihood?: string;
  impact?: string;
  owner?: string;
  mitigation?: string;
  today?: string;
  staleDays?: number;
}

const die = (msg: string, code: number): never => {
  process.stderr.write(msg + "\n");
  process.exit(code);
};

const isLevel = (s: string): s is Level => s === "low" || s === "med" || s === "high";

const today = (flag?: string): string => {
  if (flag !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(flag)) die(`bad --today: ${flag} (want YYYY-MM-DD)`, 2);
    return flag;
  }
  return new Date().toISOString().slice(0, 10);
};

const regPath = (ws: string): string => join(ws, "risks", "register.md");

const orgFromWs = (ws: string): string => {
  const base = ws.replace(/\/+$/, "").split("/").pop() || "register";
  return base.replace(/^onboard-/, "");
};

// ---------- parse ----------
const parseRegister = (text: string): { org: string; risks: Risk[] } => {
  const orgM = text.match(/^#\s*Risk Register\s*—\s*(.+?)\s*$/m);
  const org = orgM ? orgM[1].trim() : "";
  const sIdx = text.indexOf(SENTINEL);
  if (sIdx < 0) {
    die(`malformed register: missing '${SENTINEL}'. Open the register to fix, or restore from git.`, 1);
  }
  const body = text.slice(sIdx + SENTINEL.length);
  const blocks = body.split(/^(?=###\s)/m).filter((b) => b.trim().startsWith("###"));
  const risks: Risk[] = [];
  for (const block of blocks) {
    const head = block.match(/^###\s+R-(\d+):\s*(.*?)\s*<!--\s*risk:(active|escalated|resolved)\s*-->/);
    if (!head) {
      const near = block.split("\n")[0].slice(0, 40);
      die(`malformed entry near '${near}': expected '### R-N: <desc> <!-- risk:STATUS -->'. Open the register to fix, or restore from git.`, 1);
    }
    const li = block.match(/^- \*\*Likelihood\*\*:\s*(low|med|high)\s+\*\*Impact\*\*:\s*(low|med|high)/m);
    if (!li) {
      die(`malformed entry R-${head[1]}: bad Likelihood/Impact line. Open the register to fix, or restore from git.`, 1);
    }
    const field = (label: string): string => {
      const m = block.match(new RegExp(`^- \\*\\*${label}\\*\\*:\\s*(.*)$`, "m"));
      return m ? m[1].trim() : "";
    };
    risks.push({
      id: Number(head[1]),
      desc: head[2].trim(),
      likelihood: li[1] as Level,
      impact: li[2] as Level,
      owner: field("Owner") || "TBD",
      mitigation: field("Mitigation") || "TBD",
      lastReviewed: field("Last reviewed"),
      status: head[3] as Status,
    });
  }
  return { org, risks };
};

// ---------- serialize ----------
const serializeRisk = (r: Risk): string =>
  `### R-${r.id}: ${r.desc}   <!-- risk:${r.status} -->\n` +
  `- **Likelihood**: ${r.likelihood}  **Impact**: ${r.impact}\n` +
  `- **Owner**: ${r.owner}\n` +
  `- **Mitigation**: ${r.mitigation}\n` +
  `- **Last reviewed**: ${r.lastReviewed}\n`;

const serializeRegister = (org: string, risks: Risk[]): string =>
  `# Risk Register — ${org}\n${SENTINEL}\n\n` + risks.map(serializeRisk).join("\n");

const save = (ws: string, org: string, risks: Risk[]): void => {
  writeFileSync(regPath(ws), serializeRegister(org, risks));
};

const loadOrDie = (ws: string): { org: string; risks: Risk[] } => {
  const p = regPath(ws);
  if (!existsSync(p)) die(`no register at ${p}`, 1);
  return parseRegister(readFileSync(p, "utf8"));
};

const findRisk = (risks: Risk[], idArg: string | undefined): Risk => {
  if (!idArg) die(`this action requires an R-N id`, 2);
  const m = idArg.match(/^R-(\d+)$/);
  if (!m) die(`bad id: ${idArg} (want R-N)`, 2);
  const id = Number(m[1]);
  const r = risks.find((x) => x.id === id);
  if (!r) {
    const max = risks.length ? Math.max(...risks.map((x) => x.id)) : 0;
    die(`R-${id} not found. Run 'list' to see current IDs (highest is R-${max}).`, 1);
  }
  return r;
};

// ---------- actions ----------
const banner = (): void => process.stderr.write("Status: ready (risk-register)\n");

const cmdAdd = (ws: string, flags: Flags): number => {
  if (!flags.desc) die(`add requires --desc "<text>"`, 2);
  const likelihood = flags.likelihood ?? "med";
  const impact = flags.impact ?? "med";
  if (!isLevel(likelihood)) die(`bad --likelihood: ${likelihood} (low|med|high)`, 2);
  if (!isLevel(impact)) die(`bad --impact: ${impact} (low|med|high)`, 2);
  const owner = flags.owner ?? "TBD";
  const mitigation = flags.mitigation ?? "TBD";
  const date = today(flags.today);

  const dir = join(ws, "risks");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const p = regPath(ws);
  let org: string;
  let risks: Risk[];
  if (existsSync(p)) {
    ({ org, risks } = parseRegister(readFileSync(p, "utf8")));
  } else {
    org = orgFromWs(ws);
    risks = [];
  }
  const id = risks.length ? Math.max(...risks.map((r) => r.id)) + 1 : 1;
  risks.push({ id, desc: flags.desc, likelihood, impact, owner, mitigation, lastReviewed: date, status: "active" });
  save(ws, org, risks);
  process.stdout.write(`Added R-${id} (${likelihood}/${impact}, owner ${owner}) — refine with escalate/ack or re-add\n`);
  return 0;
};

const cmdAck = (ws: string, idArg: string | undefined, flags: Flags): number => {
  const { org, risks } = loadOrDie(ws);
  const r = findRisk(risks, idArg);
  r.lastReviewed = today(flags.today);
  save(ws, org, risks);
  process.stdout.write(`R-${r.id} acked.\n`);
  return 0;
};

const cmdEscalate = (ws: string, idArg: string | undefined, flags: Flags): number => {
  const { org, risks } = loadOrDie(ws);
  const r = findRisk(risks, idArg);
  r.status = "escalated";
  r.lastReviewed = today(flags.today);
  save(ws, org, risks);
  process.stdout.write(`R-${r.id} escalated.\n`);
  return 0;
};

const cmdResolve = (ws: string, idArg: string | undefined, flags: Flags): number => {
  const { org, risks } = loadOrDie(ws);
  const r = findRisk(risks, idArg);
  r.status = "resolved";
  r.lastReviewed = today(flags.today);
  save(ws, org, risks);
  process.stdout.write(`R-${r.id} resolved.\n`);
  return 0;
};

const main = (): number => {
  const argv = process.argv.slice(2);
  banner();
  const action = argv[0];
  const ws = argv[1];
  // minimal arg handling — extended in Task 7
  const flags: Flags = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--desc") flags.desc = argv[++i];
    else if (a === "--likelihood") flags.likelihood = argv[++i];
    else if (a === "--impact") flags.impact = argv[++i];
    else if (a === "--owner") flags.owner = argv[++i];
    else if (a === "--mitigation") flags.mitigation = argv[++i];
    else if (a === "--today") flags.today = argv[++i];
  }
  if (!ws) die(`${action} requires a workspace path`, 2);
  if (!existsSync(ws)) {
    die(`workspace not found: ${ws}. Pass your initiative workspace path, e.g. ~/ramps/cloudera.`, 1);
  }
  const idArg = argv[2] && !argv[2].startsWith("--") ? argv[2] : undefined;
  switch (action) {
    case "add": return cmdAdd(ws, flags);
    case "ack": return cmdAck(ws, idArg, flags);
    case "escalate": return cmdEscalate(ws, idArg, flags);
    case "resolve": return cmdResolve(ws, idArg, flags);
    default: die(`unknown action: ${action}`, 2);
  }
  return 0;
};

if (import.meta.main) process.exit(main());
