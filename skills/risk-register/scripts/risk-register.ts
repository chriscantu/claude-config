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

const sevKey = (r: Risk): number => SEV[r.likelihood] + SEV[r.impact];
const cmpSev = (a: Risk, b: Risk): number =>
  sevKey(b) - sevKey(a) || SEV[b.impact] - SEV[a.impact] || a.id - b.id;
const tag = (r: Risk): string =>
  `${r.likelihood[0].toUpperCase()}${r.impact[0].toUpperCase()}`;

const cmdList = (ws: string): number => {
  const p = regPath(ws);
  if (!existsSync(p)) { process.stdout.write("No risks tracked.\n"); return 0; }
  const { risks } = parseRegister(readFileSync(p, "utf8"));
  if (!risks.length) { process.stdout.write("No risks tracked.\n"); return 0; }
  for (const r of risks) {
    process.stdout.write(`[${tag(r)}] R-${r.id}  ${r.desc}  (${r.status}) — owner: ${r.owner} · reviewed ${r.lastReviewed}\n`);
  }
  return 0;
};

const daysBetween = (from: string, to: string): number => {
  const a = Date.parse(from + "T00:00:00Z");
  const b = Date.parse(to + "T00:00:00Z");
  return Math.round((b - a) / 86400000);
};

const cmdReview = (ws: string, flags: Flags): number => {
  const p = regPath(ws);
  if (!existsSync(p)) { process.stdout.write("No risks tracked.\n"); return 0; }
  const { org, risks } = parseRegister(readFileSync(p, "utf8"));
  if (!risks.length) { process.stdout.write("No risks tracked.\n"); return 0; }
  const staleDays = flags.staleDays ?? 14;
  const date = today(flags.today);

  const resolved = risks.filter((r) => r.status === "resolved");
  const escalated = risks.filter((r) => r.status === "escalated");
  const active = risks.filter((r) => r.status === "active");
  const isStale = (r: Risk): boolean =>
    r.lastReviewed !== "" && daysBetween(r.lastReviewed, date) > staleDays;
  const staleActive = active.filter(isStale);
  const freshActive = active.filter((r) => !isStale(r));
  const topActive = [...freshActive].sort(cmpSev).slice(0, 3);

  const line2 = (r: Risk): string => {
    const tail = isStale(r)
      ? `last seen ${r.lastReviewed}  (${daysBetween(r.lastReviewed, date)} days)`
      : `reviewed ${r.lastReviewed}`;
    return `            owner: ${r.owner} · ${tail}`;
  };
  const render = (r: Risk): string[] => [`  [${tag(r)}] R-${r.id}  ${r.desc}`, line2(r)];

  const out: string[] = [];
  out.push(`RISK REVIEW — ${org}          ${active.length} active (${staleActive.length} stale) · ${escalated.length} escalated · ${resolved.length} resolved`);
  out.push("================================================================");

  const escSorted = [...escalated].sort(cmpSev);
  if (escSorted.length) {
    out.push("");
    out.push(`ESCALATED (${escSorted.length})`);
    for (const r of escSorted) out.push(...render(r));
  }
  const staleSorted = [...staleActive].sort(cmpSev);
  if (staleSorted.length) {
    out.push("");
    out.push(`NEEDS REVIEW — stale >${staleDays}d (${staleSorted.length})`);
    for (const r of staleSorted) out.push(...render(r));
  }
  if (topActive.length) {
    out.push("");
    out.push(`TOP ACTIVE (${topActive.length} of ${freshActive.length})`);
    for (const r of topActive) out.push(...render(r));
  }

  if (!escSorted.length && !staleSorted.length && !topActive.length) {
    process.stdout.write("No risks require attention.\n");
    return 0;
  }
  process.stdout.write(out.join("\n") + "\n");
  return 0;
};

const HELP = `Usage: risk-register <action> <ws> [options]

Actions:
  add       Add a new risk (--desc required; --likelihood/--impact default to med)
  review    Show stale, escalated, and top active risks (read-only; default action)
  ack       Acknowledge a risk without changing status: ack <ws> <R-N>
  escalate  Escalate a risk: escalate <ws> <R-N>
  resolve   Mark a risk resolved: resolve <ws> <R-N>
  list      List all risks including resolved

Example: risk-register add ~/ramps/cloudera --desc "Vendor SSO contract expires Q3"
`;

const parseFlags = (rest: string[]): { positionals: string[]; flags: Flags } => {
  const flags: Flags = {};
  const positionals: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    switch (a) {
      case "--desc": flags.desc = rest[++i]; break;
      case "--likelihood": flags.likelihood = rest[++i]; break;
      case "--impact": flags.impact = rest[++i]; break;
      case "--owner": flags.owner = rest[++i]; break;
      case "--mitigation": flags.mitigation = rest[++i]; break;
      case "--today": flags.today = rest[++i]; break;
      case "--stale-days": flags.staleDays = Number(rest[++i]); break;
      default:
        if (a.startsWith("--")) die(`unknown flag: ${a}`, 2);
        positionals.push(a);
    }
  }
  return { positionals, flags };
};

const ACTIONS = new Set(["add", "review", "ack", "escalate", "resolve", "list"]);

const main = (): number => {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    process.stdout.write(HELP);
    return 0;
  }
  banner();
  const action = argv[0];
  if (!ACTIONS.has(action)) die(`unknown action: ${action}`, 2);
  const { positionals, flags } = parseFlags(argv.slice(1));
  const ws = positionals[0];
  if (!ws) die(`${action} requires a workspace path`, 2);
  if (!existsSync(ws)) {
    die(`workspace not found: ${ws}. Pass your initiative workspace path, e.g. ~/ramps/cloudera.`, 1);
  }
  const idArg = positionals[1];
  if ((action === "ack" || action === "escalate" || action === "resolve") && !idArg) {
    die(`${action} requires an R-N id`, 2);
  }
  switch (action) {
    case "add": return cmdAdd(ws, flags);
    case "review": return cmdReview(ws, flags);
    case "ack": return cmdAck(ws, idArg, flags);
    case "escalate": return cmdEscalate(ws, idArg, flags);
    case "resolve": return cmdResolve(ws, idArg, flags);
    case "list": return cmdList(ws);
  }
  return 0;
};

if (import.meta.main) process.exit(main());
