# /risk-register Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `/risk-register` skill — a bun CLI helper plus SKILL.md routing — that maintains a lightweight technical risk register in any initiative workspace.

**Architecture:** One bun TypeScript script (`scripts/risk-register.ts`) owns all file I/O and the six actions (add/review/ack/escalate/resolve/list). SKILL.md routes natural language to the script. The register is a single markdown file at `<ws>/risks/register.md` with three sentinel states (active/escalated/resolved). Severity is computed at render time only.

**Tech Stack:** Bun, TypeScript, `node:fs` sync APIs, `bun:test`, fish (`validate.fish` gate).

**Spec:** `docs/superpowers/specs/2026-06-16-risk-register-design.md`. Branch: `feature/risk-register-skill` (already created).

**Arg-order contract (load-bearing):** the script is **action-first** — `risk-register.ts <action> <ws> [<R-N>] [flags]`. Mirrors `onboard-status.ts`.

---

## File Structure

- Create: `skills/risk-register/SKILL.md` — routing, six actions, status banner, substring resolution
- Create: `skills/risk-register/scripts/risk-register.ts` — all logic
- Create: `skills/risk-register/evals/evals.json` — six evals
- Create: `tests/risk-register.test.ts` — bun unit tests (repo root, per house convention)
- Create: `tests/fixtures/risk-register/register-active.md` — fixture: fresh active risks
- Create: `tests/fixtures/risk-register/register-stale.md` — fixture: one stale risk
- Create: `tests/fixtures/risk-register/register-escalated.md` — fixture: active + escalated + resolved

All file mutation lives in `risk-register.ts`. SKILL.md never edits the register directly.

---

## Task 1: Scaffold skill dir + minimal SKILL.md

**Files:**
- Create: `skills/risk-register/SKILL.md`
- Create: `skills/risk-register/scripts/risk-register.ts` (stub)

- [ ] **Step 1: Create the directory and a minimal valid SKILL.md**

`skills/risk-register/SKILL.md` (full body comes in Task 9; this minimal version must pass `validate.fish` frontmatter checks now):

```markdown
---
name: risk-register
description: >
  Use when the user says /risk-register, "add a risk", "review risks",
  "escalate R-N", "ack R-N", "resolve R-N", or "show my risk register"
  during a 90-day ramp or any initiative. Tracks org-level technical
  risks in any initiative workspace. Six actions: add, review, ack,
  escalate, resolve, list.
status: experimental
version: 0.1.0
---

# /risk-register — Lightweight Technical Risk Register

Maintains a single durable risk register at `<workspace>/risks/register.md`.

**Announce at start:** "I'm using the risk-register skill to track your technical risks."

(Full action routing documented below — see Task 9.)
```

- [ ] **Step 2: Create an executable stub script**

`skills/risk-register/scripts/risk-register.ts`:

```ts
#!/usr/bin/env bun
const main = (): number => {
  process.stdout.write("risk-register stub\n");
  return 0;
};
if (import.meta.main) process.exit(main());
```

- [ ] **Step 3: Verify the script runs**

Run: `bun run skills/risk-register/scripts/risk-register.ts`
Expected: prints `risk-register stub`, exit 0.

- [ ] **Step 4: Verify validate.fish still passes**

Run: `fish validate.fish`
Expected: `VALIDATION PASSED` (warnings OK), 0 failed.

- [ ] **Step 5: Commit**

```bash
git add skills/risk-register/
git commit -m "feat(risk-register): scaffold skill dir + frontmatter (#21)"
```

---

## Task 2: Core types + parse/serialize

**Files:**
- Modify: `skills/risk-register/scripts/risk-register.ts`
- Create: `tests/risk-register.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/risk-register.test.ts`:

```ts
import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REPO = resolve(import.meta.dir, "..");
const SCRIPT = join(REPO, "skills/risk-register/scripts/risk-register.ts");

const run = (args: string[]) => {
  const r = spawnSync("bun", ["run", SCRIPT, ...args], { encoding: "utf8" });
  return { code: r.status ?? -1, out: r.stdout ?? "", err: r.stderr ?? "" };
};

const mkWs = (): string => mkdtempSync(join(tmpdir(), "rr-"));
const regOf = (ws: string): string => readFileSync(join(ws, "risks", "register.md"), "utf8");

let wsDirs: string[] = [];
const freshWs = (): string => { const w = mkWs(); wsDirs.push(w); return w; };
afterEach(() => { for (const w of wsDirs) rmSync(w, { recursive: true, force: true }); wsDirs = []; });

describe("add", () => {
  test("one-liner add applies all defaults and writes a block", () => {
    const ws = freshWs();
    const r = run(["add", ws, "--desc", "API auth not rotated", "--today", "2026-06-16"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("Added R-1 (med/med, owner TBD)");
    const text = regOf(ws);
    expect(text).toContain("### R-1: API auth not rotated   <!-- risk:active -->");
    expect(text).toContain("**Likelihood**: med  **Impact**: med");
    expect(text).toContain("**Owner**: TBD");
    expect(text).toContain("**Last reviewed**: 2026-06-16");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/risk-register.test.ts`
Expected: FAIL (stub prints `risk-register stub`, no register written).

- [ ] **Step 3: Replace the stub with types, parse, serialize, and the add path**

Replace the entire contents of `skills/risk-register/scripts/risk-register.ts`:

```ts
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
  if (action === "add") {
    if (!ws) die(`add requires a workspace path`, 2);
    if (!existsSync(ws)) die(`workspace not found: ${ws}. Pass your initiative workspace path, e.g. ~/ramps/cloudera.`, 1);
    return cmdAdd(ws, flags);
  }
  die(`unknown action: ${action}`, 2);
  return 0;
};

if (import.meta.main) process.exit(main());
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/risk-register.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add skills/risk-register/scripts/risk-register.ts tests/risk-register.test.ts
git commit -m "feat(risk-register): core parse/serialize + add action (#21)"
```

---

## Task 3: add — directory creation, multi-add IDs, non-default values

**Files:**
- Modify: `tests/risk-register.test.ts`

- [ ] **Step 1: Add failing tests**

Append to the `describe("add", ...)` block in `tests/risk-register.test.ts`:

```ts
  test("creates risks/ dir and register.md when missing", () => {
    const ws = freshWs();
    run(["add", ws, "--desc", "first risk", "--today", "2026-06-16"]);
    expect(existsSync(join(ws, "risks", "register.md"))).toBe(true);
  });

  test("second add increments the ID", () => {
    const ws = freshWs();
    run(["add", ws, "--desc", "one", "--today", "2026-06-16"]);
    run(["add", ws, "--desc", "two", "--today", "2026-06-16"]);
    const text = regOf(ws);
    expect(text).toContain("### R-1: one");
    expect(text).toContain("### R-2: two");
  });

  test("non-default values are stored and echoed", () => {
    const ws = freshWs();
    const r = run(["add", ws, "--desc", "billing", "--likelihood", "high", "--impact", "high", "--owner", "Dana", "--today", "2026-06-16"]);
    expect(r.out).toContain("Added R-1 (high/high, owner Dana)");
    expect(regOf(ws)).toContain("**Likelihood**: high  **Impact**: high");
  });

  test("missing --desc exits nonzero", () => {
    const ws = freshWs();
    const r = run(["add", ws, "--today", "2026-06-16"]);
    expect(r.code).not.toBe(0);
    expect(r.err).toContain("--desc");
  });
```

- [ ] **Step 2: Run tests**

Run: `bun test tests/risk-register.test.ts`
Expected: PASS (all add tests — the Task 2 implementation already covers these).

- [ ] **Step 3: Commit**

```bash
git add tests/risk-register.test.ts
git commit -m "test(risk-register): add-action edge cases (#21)"
```

---

## Task 4: ack, escalate, resolve

**Files:**
- Modify: `skills/risk-register/scripts/risk-register.ts`
- Modify: `tests/risk-register.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `tests/risk-register.test.ts`:

```ts
const seed = (ws: string): void => {
  run(["add", ws, "--desc", "seed risk", "--today", "2026-05-01"]);
};

describe("mutators", () => {
  test("ack bumps last-reviewed without changing status", () => {
    const ws = freshWs(); seed(ws);
    const r = run(["ack", ws, "R-1", "--today", "2026-06-16"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("R-1 acked.");
    const text = regOf(ws);
    expect(text).toContain("<!-- risk:active -->");
    expect(text).toContain("**Last reviewed**: 2026-06-16");
  });

  test("escalate flips sentinel and bumps date", () => {
    const ws = freshWs(); seed(ws);
    const r = run(["escalate", ws, "R-1", "--today", "2026-06-16"]);
    expect(r.out).toContain("R-1 escalated.");
    const text = regOf(ws);
    expect(text).toContain("<!-- risk:escalated -->");
    expect(text).toContain("**Last reviewed**: 2026-06-16");
  });

  test("resolve flips sentinel to resolved", () => {
    const ws = freshWs(); seed(ws);
    const r = run(["resolve", ws, "R-1", "--today", "2026-06-16"]);
    expect(r.out).toContain("R-1 resolved.");
    expect(regOf(ws)).toContain("<!-- risk:resolved -->");
  });

  test("escalate bad ID exits nonzero with list hint, file unchanged", () => {
    const ws = freshWs(); seed(ws);
    const before = regOf(ws);
    const r = run(["escalate", ws, "R-99", "--today", "2026-06-16"]);
    expect(r.code).not.toBe(0);
    expect(r.err).toContain("not found");
    expect(r.err).toContain("list");
    expect(r.err).toContain("R-1"); // highest existing
    expect(regOf(ws)).toBe(before);
  });

  test("escalate on missing register exits nonzero", () => {
    const ws = freshWs();
    const r = run(["escalate", ws, "R-1"]);
    expect(r.code).not.toBe(0);
    expect(r.err).toContain("no register");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/risk-register.test.ts`
Expected: FAIL (`unknown action: ack`).

- [ ] **Step 3: Add the three mutator commands**

In `skills/risk-register/scripts/risk-register.ts`, add these functions after `cmdAdd`:

```ts
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
```

Then extend the `main()` switch. Replace the `if (action === "add") {...}` / `die("unknown action")` tail with:

```ts
  if (!ws) die(`${action} requires a workspace path`, 2);
  if (action !== "add" && !existsSync(ws)) {
    die(`workspace not found: ${ws}. Pass your initiative workspace path, e.g. ~/ramps/cloudera.`, 1);
  }
  if (action === "add" && !existsSync(ws)) {
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
```

(Note: the flag-parse loop starting at `i = 2` already skips the `R-N` positional since it does not match a `--flag`. The full robust parser lands in Task 7.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/risk-register.test.ts`
Expected: PASS (all mutator tests).

- [ ] **Step 5: Commit**

```bash
git add skills/risk-register/scripts/risk-register.ts tests/risk-register.test.ts
git commit -m "feat(risk-register): ack/escalate/resolve actions (#21)"
```

---

## Task 5: list

**Files:**
- Modify: `skills/risk-register/scripts/risk-register.ts`
- Modify: `tests/risk-register.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `tests/risk-register.test.ts`:

```ts
describe("list", () => {
  test("empty register prints No risks tracked", () => {
    const ws = freshWs();
    const r = run(["list", ws]);
    expect(r.out).toContain("No risks tracked.");
  });

  test("list includes resolved entries with R-N IDs", () => {
    const ws = freshWs(); seed(ws);
    run(["resolve", ws, "R-1", "--today", "2026-06-16"]);
    const r = run(["list", ws]);
    expect(r.out).toContain("R-1");
    expect(r.out).toContain("resolved");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/risk-register.test.ts`
Expected: FAIL (`unknown action: list`).

- [ ] **Step 3: Add severity helpers + cmdList**

Add after the mutator commands in `risk-register.ts`:

```ts
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
```

Add `case "list": return cmdList(ws);` to the `main()` switch.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/risk-register.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add skills/risk-register/scripts/risk-register.ts tests/risk-register.test.ts
git commit -m "feat(risk-register): list action + severity helpers (#21)"
```

---

## Task 6: review (header, sections, severity sort, stale, overlap)

**Files:**
- Modify: `skills/risk-register/scripts/risk-register.ts`
- Modify: `tests/risk-register.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `tests/risk-register.test.ts`:

```ts
describe("review", () => {
  const build = (ws: string): void => {
    // R-1 fresh high/high active; R-2 stale (old date) med/high; R-3 escalated; R-4 resolved; R-5 fresh low/low
    run(["add", ws, "--desc", "fresh hh", "--likelihood", "high", "--impact", "high", "--today", "2026-06-15"]);
    run(["add", ws, "--desc", "stale mh", "--likelihood", "med", "--impact", "high", "--today", "2026-05-01"]);
    run(["add", ws, "--desc", "to escalate", "--likelihood", "high", "--impact", "high", "--today", "2026-06-15"]);
    run(["escalate", ws, "R-3", "--today", "2026-06-15"]);
    run(["add", ws, "--desc", "to resolve", "--today", "2026-06-15"]);
    run(["resolve", ws, "R-4", "--today", "2026-06-15"]);
    run(["add", ws, "--desc", "fresh ll", "--likelihood", "low", "--impact", "low", "--today", "2026-06-15"]);
  };

  test("header counts: active(stale) · escalated · resolved", () => {
    const ws = freshWs(); build(ws);
    const r = run(["review", ws, "--today", "2026-06-16", "--stale-days", "14"]);
    // active = R-1, R-2, R-5 (3); stale subset = R-2 (1); escalated = R-3 (1); resolved = R-4 (1)
    expect(r.out).toContain("3 active (1 stale) · 1 escalated · 1 resolved");
  });

  test("resolved excluded from all sections", () => {
    const ws = freshWs(); build(ws);
    const r = run(["review", ws, "--today", "2026-06-16"]);
    expect(r.out).not.toContain("to resolve");
  });

  test("stale section shows age annotation; escalated section present", () => {
    const ws = freshWs(); build(ws);
    const r = run(["review", ws, "--today", "2026-06-16"]);
    expect(r.out).toContain("ESCALATED (1)");
    expect(r.out).toContain("NEEDS REVIEW — stale >14d (1)");
    expect(r.out).toMatch(/\(\d+ days\)/);
  });

  test("two-letter severity tag rendered; no numeric sum", () => {
    const ws = freshWs(); build(ws);
    const r = run(["review", ws, "--today", "2026-06-16"]);
    expect(r.out).toContain("[HH]");
    expect(r.out).not.toMatch(/\bsum\b/i);
  });

  test("top active surfaces fresh high-severity risk", () => {
    const ws = freshWs(); build(ws);
    const r = run(["review", ws, "--today", "2026-06-16"]);
    expect(r.out).toContain("TOP ACTIVE");
    expect(r.out).toContain("fresh hh");
  });

  test("empty register prints No risks tracked", () => {
    const ws = freshWs();
    expect(run(["review", ws]).out).toContain("No risks tracked.");
  });

  test("all-fresh-no-escalated still lists top active", () => {
    const ws = freshWs();
    run(["add", ws, "--desc", "only one", "--today", "2026-06-16"]);
    const r = run(["review", ws, "--today", "2026-06-16"]);
    expect(r.out).toContain("TOP ACTIVE (1 of 1)");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/risk-register.test.ts`
Expected: FAIL (`unknown action: review`).

- [ ] **Step 3: Implement cmdReview**

Add after `cmdList` in `risk-register.ts`:

```ts
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
```

Add `case "review": return cmdReview(ws, flags);` to the `main()` switch.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/risk-register.test.ts`
Expected: PASS (all review tests).

- [ ] **Step 5: Commit**

```bash
git add skills/risk-register/scripts/risk-register.ts tests/risk-register.test.ts
git commit -m "feat(risk-register): meeting-ready review action (#21)"
```

---

## Task 7: robust arg parsing, --stale-days, help, bare default, malformed handling

**Files:**
- Modify: `skills/risk-register/scripts/risk-register.ts`
- Modify: `tests/risk-register.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `tests/risk-register.test.ts`:

```ts
describe("cli surface", () => {
  test("--help lists six actions, reads no register", () => {
    const r = run(["--help"]);
    expect(r.out).toContain("add");
    expect(r.out).toContain("review");
    expect(r.out).toContain("ack");
    expect(r.out).toContain("escalate");
    expect(r.out).toContain("resolve");
    expect(r.out).toContain("list");
  });

  test("no args prints help", () => {
    const r = run([]);
    expect(r.out).toContain("Usage:");
  });

  test("--stale-days override changes stale cutoff", () => {
    const ws = freshWs();
    run(["add", ws, "--desc", "five days old", "--today", "2026-06-11"]);
    const tight = run(["review", ws, "--today", "2026-06-16", "--stale-days", "3"]);
    expect(tight.out).toContain("NEEDS REVIEW");
    const loose = run(["review", ws, "--today", "2026-06-16", "--stale-days", "30"]);
    expect(loose.out).not.toContain("NEEDS REVIEW");
  });

  test("workspace not found gives example-path hint", () => {
    const r = run(["review", "/no/such/ws/here"]);
    expect(r.code).not.toBe(0);
    expect(r.err).toContain("workspace not found");
    expect(r.err).toContain("~/ramps/cloudera");
  });

  test("malformed register names a fix path", () => {
    const ws = freshWs();
    mkdirSync(join(ws, "risks"), { recursive: true });
    writeFileSync(join(ws, "risks", "register.md"), "# Risk Register — x\n<!-- risk-register:auto -->\n\n### garbage line with no id\n");
    const r = run(["list", ws]);
    expect(r.code).not.toBe(0);
    expect(r.err).toContain("malformed");
    expect(r.err).toContain("restore from git");
  });

  test("unknown action exits nonzero", () => {
    const ws = freshWs();
    const r = run(["frobnicate", ws]);
    expect(r.code).not.toBe(0);
    expect(r.err).toContain("unknown action");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/risk-register.test.ts`
Expected: FAIL (`--help` falls through to `unknown action`, `--stale-days` not parsed, etc.).

- [ ] **Step 3: Replace `main()` with the full parser**

Replace the entire `main()` function (and keep `if (import.meta.main) process.exit(main());` at the end) with:

```ts
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
```

Note: `add` creates the workspace's `risks/` subdir but still requires the workspace dir itself to exist — the `existsSync(ws)` check applies to all actions including `add`.

- [ ] **Step 4: Run all unit tests**

Run: `bun test tests/risk-register.test.ts`
Expected: PASS (every test across Tasks 2–7).

- [ ] **Step 5: Type-check**

Run: `bunx tsc --noEmit skills/risk-register/scripts/risk-register.ts`
Expected: no errors. (If the repo has no per-file tsconfig, run the repo's standard type-check command instead.)

- [ ] **Step 6: Commit**

```bash
git add skills/risk-register/scripts/risk-register.ts tests/risk-register.test.ts
git commit -m "feat(risk-register): full arg parser, help, stale-days, error surfaces (#21)"
```

---

## Task 8: Fixtures + evals.json

**Files:**
- Create: `tests/fixtures/risk-register/register-active.md`
- Create: `tests/fixtures/risk-register/register-stale.md`
- Create: `tests/fixtures/risk-register/register-escalated.md`
- Create: `skills/risk-register/evals/evals.json`

- [ ] **Step 1: Create fixtures**

`tests/fixtures/risk-register/register-active.md`:

```markdown
# Risk Register — acme
<!-- risk-register:auto -->

### R-1: API auth keys not rotated   <!-- risk:active -->
- **Likelihood**: high  **Impact**: high
- **Owner**: TBD
- **Mitigation**: TBD
- **Last reviewed**: 2026-05-01
```

`tests/fixtures/risk-register/register-stale.md`:

```markdown
# Risk Register — acme
<!-- risk-register:auto -->

### R-1: API auth keys not rotated in 90 days   <!-- risk:active -->
- **Likelihood**: high  **Impact**: high
- **Owner**: TBD
- **Mitigation**: TBD
- **Last reviewed**: 2026-05-01
```

`tests/fixtures/risk-register/register-escalated.md`:

```markdown
# Risk Register — acme
<!-- risk-register:auto -->

### R-1: Single SRE owns all prod deploy access   <!-- risk:active -->
- **Likelihood**: high  **Impact**: high
- **Owner**: Marco
- **Mitigation**: cross-train second SRE
- **Last reviewed**: 2026-06-15

### R-2: Vendor contract lapses   <!-- risk:escalated -->
- **Likelihood**: med  **Impact**: high
- **Owner**: TBD
- **Mitigation**: TBD
- **Last reviewed**: 2026-05-20

### R-3: Old onboarding docs   <!-- risk:resolved -->
- **Likelihood**: low  **Impact**: low
- **Owner**: Dana
- **Mitigation**: rewritten
- **Last reviewed**: 2026-06-10
```

- [ ] **Step 2: Create evals.json**

`skills/risk-register/evals/evals.json`:

```json
{
  "skill": "risk-register",
  "description": "Guards the six-action /risk-register helper. Discriminators are required-tier Bash invocation of scripts/risk-register.ts plus stdout regex — file-mutation correctness is proven by tests/risk-register.test.ts, not here (the helper writes via writeFileSync in a Bash subprocess, so no Write tool call exists in the transcript). Skill-invocation assertions are diagnostic-tier per strategy-doc/#157.",
  "evals": [
    {
      "name": "add-writes-block",
      "summary": "One-liner add with all defaults: invokes the helper and confirms applied defaults in stdout.",
      "setup": "mkdir -p /tmp/rr-eval-add",
      "teardown": "rm -rf /tmp/rr-eval-add",
      "prompt": "/risk-register /tmp/rr-eval-add add \"API auth not rotated in 90 days\"",
      "assertions": [
        {"type": "skill_invoked", "skill": "risk-register", "tier": "diagnostic", "description": "diagnostic anchor; Bash + stdout regex are load-bearing"},
        {"type": "tool_input_matches", "tool": "Bash", "input_key": "command", "input_value": "risk-register.ts add", "tier": "required", "description": "DISCRIMINATOR: helper actually invoked with add action"},
        {"type": "regex", "pattern": "Added R-1", "flags": "", "tier": "required", "description": "new entry ID confirmed in stdout"},
        {"type": "regex", "pattern": "med/med", "flags": "", "tier": "required", "description": "applied likelihood/impact defaults surfaced"},
        {"type": "regex", "pattern": "owner TBD", "flags": "i", "tier": "required", "description": "owner default surfaced"}
      ]
    },
    {
      "name": "review-surfaces-stale",
      "summary": "Stale fixture + fixed --today: stale entry surfaces in review.",
      "setup": "mkdir -p /tmp/rr-eval-review/risks && cp /Users/cantu/repos/claude-config/tests/fixtures/risk-register/register-stale.md /tmp/rr-eval-review/risks/register.md",
      "teardown": "rm -rf /tmp/rr-eval-review",
      "prompt": "/risk-register /tmp/rr-eval-review review --today 2026-06-16",
      "assertions": [
        {"type": "skill_invoked", "skill": "risk-register", "tier": "diagnostic", "description": "diagnostic anchor"},
        {"type": "tool_input_matches", "tool": "Bash", "input_key": "command", "input_value": "risk-register.ts review", "tier": "required", "description": "DISCRIMINATOR: review action invoked"},
        {"type": "regex", "pattern": "stale", "flags": "i", "tier": "required", "description": "stale section heading present"},
        {"type": "regex", "pattern": "R-1", "flags": "", "tier": "required", "description": "stale entry ID surfaces — proves a real file read"}
      ]
    },
    {
      "name": "escalate-flips-sentinel",
      "summary": "Escalate R-1 on the active fixture: confirms escalation in stdout.",
      "setup": "mkdir -p /tmp/rr-eval-esc/risks && cp /Users/cantu/repos/claude-config/tests/fixtures/risk-register/register-active.md /tmp/rr-eval-esc/risks/register.md",
      "teardown": "rm -rf /tmp/rr-eval-esc",
      "prompt": "/risk-register /tmp/rr-eval-esc escalate R-1 --today 2026-06-16",
      "assertions": [
        {"type": "skill_invoked", "skill": "risk-register", "tier": "diagnostic", "description": "diagnostic anchor"},
        {"type": "tool_input_matches", "tool": "Bash", "input_key": "command", "input_value": "risk-register.ts escalate", "tier": "required", "description": "DISCRIMINATOR: escalate action invoked"},
        {"type": "regex", "pattern": "R-1 escalated", "flags": "", "tier": "required", "description": "escalation confirmed in stdout"}
      ]
    },
    {
      "name": "escalate-bad-id-refuses",
      "summary": "Escalate R-99 (absent): refuses with a list hint, no success output.",
      "setup": "mkdir -p /tmp/rr-eval-bad/risks && cp /Users/cantu/repos/claude-config/tests/fixtures/risk-register/register-active.md /tmp/rr-eval-bad/risks/register.md",
      "teardown": "rm -rf /tmp/rr-eval-bad",
      "prompt": "/risk-register /tmp/rr-eval-bad escalate R-99",
      "assertions": [
        {"type": "skill_invoked", "skill": "risk-register", "tier": "diagnostic", "description": "diagnostic anchor"},
        {"type": "tool_input_matches", "tool": "Bash", "input_key": "command", "input_value": "R-99", "tier": "required", "description": "DISCRIMINATOR: helper invoked with the bad id"},
        {"type": "not_regex", "pattern": "R-99 escalated", "flags": "", "tier": "required", "description": "no false success"},
        {"type": "regex", "pattern": "not found", "flags": "i", "tier": "required", "description": "error surfaced"},
        {"type": "regex", "pattern": "list", "flags": "i", "tier": "required", "description": "recovery hint references list action"}
      ]
    },
    {
      "name": "ack-bumps-date",
      "summary": "Ack R-1 on the active fixture: confirms ack in stdout without status change.",
      "setup": "mkdir -p /tmp/rr-eval-ack/risks && cp /Users/cantu/repos/claude-config/tests/fixtures/risk-register/register-active.md /tmp/rr-eval-ack/risks/register.md",
      "teardown": "rm -rf /tmp/rr-eval-ack",
      "prompt": "/risk-register /tmp/rr-eval-ack ack R-1 --today 2026-06-16",
      "assertions": [
        {"type": "skill_invoked", "skill": "risk-register", "tier": "diagnostic", "description": "diagnostic anchor"},
        {"type": "tool_input_matches", "tool": "Bash", "input_key": "command", "input_value": "risk-register.ts ack", "tier": "required", "description": "DISCRIMINATOR: ack action invoked"},
        {"type": "regex", "pattern": "R-1 acked", "flags": "", "tier": "required", "description": "ack confirmed in stdout"}
      ]
    },
    {
      "name": "resolve-drops-from-review",
      "summary": "Resolve R-1 then review: resolved risk no longer appears in review output.",
      "setup": "mkdir -p /tmp/rr-eval-res/risks && cp /Users/cantu/repos/claude-config/tests/fixtures/risk-register/register-active.md /tmp/rr-eval-res/risks/register.md",
      "teardown": "rm -rf /tmp/rr-eval-res",
      "prompt": "/risk-register /tmp/rr-eval-res resolve R-1 --today 2026-06-16, then /risk-register /tmp/rr-eval-res review --today 2026-06-16",
      "assertions": [
        {"type": "skill_invoked", "skill": "risk-register", "tier": "diagnostic", "description": "diagnostic anchor"},
        {"type": "tool_input_matches", "tool": "Bash", "input_key": "command", "input_value": "risk-register.ts resolve", "tier": "required", "description": "DISCRIMINATOR: resolve action invoked"},
        {"type": "regex", "pattern": "R-1 resolved", "flags": "", "tier": "required", "description": "resolve confirmed in stdout"},
        {"type": "not_regex", "pattern": "R-1  API auth", "flags": "", "tier": "required", "description": "resolved risk absent from the review render"}
      ]
    }
  ]
}
```

- [ ] **Step 3: Sanity-check fixtures against the parser**

Run: `bun run skills/risk-register/scripts/risk-register.ts review tests/fixtures/risk-register/.. --today 2026-06-16` is NOT valid (fixtures are not a workspace). Instead verify parse via a temp copy:

```bash
mkdir -p /tmp/rr-fix/risks && cp tests/fixtures/risk-register/register-escalated.md /tmp/rr-fix/risks/register.md && bun run skills/risk-register/scripts/risk-register.ts review /tmp/rr-fix --today 2026-06-16; rm -rf /tmp/rr-fix
```
Expected: header `2 active (1 stale) · 1 escalated · 1 resolved`, R-2 in ESCALATED, R-3 absent.

- [ ] **Step 4: Validate evals.json parses**

Run: `bun -e "JSON.parse(require('fs').readFileSync('skills/risk-register/evals/evals.json','utf8')); console.log('ok')"`
Expected: `ok`.

- [ ] **Step 5: Commit**

```bash
git add tests/fixtures/risk-register/ skills/risk-register/evals/
git commit -m "test(risk-register): fixtures + six evals (#21)"
```

---

## Task 9: Full SKILL.md body

**Files:**
- Modify: `skills/risk-register/SKILL.md`

- [ ] **Step 1: Replace the minimal body with the full routing spec**

Append below the frontmatter + title in `skills/risk-register/SKILL.md` (keep the frontmatter from Task 1):

````markdown
Maintains a single durable risk register at `<workspace>/risks/register.md` for
a senior leader tracking org-level technical risk. Manual-first: no live
integrations. Six actions, all backed by one bun helper.

**Announce at start:** "I'm using the risk-register skill to track your technical risks."

## Helper invocation

All state changes go through the script. Never edit `register.md` by hand.

```fish
bun run "$CLAUDE_PROJECT_DIR/skills/risk-register/scripts/risk-register.ts" <action> <ws> [<R-N>] [flags]
```

(`CLAUDE_PROJECT_DIR` is harness-provided. If unset, walk up from CWD until a
`.git` directory is found.) The script is **action-first**. When the user phrases
it workspace-first ("/risk-register ~/ramps/cloudera review"), reorder to
action-first before calling.

## Actions

| Action | Invocation | Effect |
|--------|-----------|--------|
| add | `add <ws> --desc "<text>" [--likelihood low\|med\|high] [--impact …] [--owner …] [--mitigation …]` | Append a risk. Only `--desc` required; likelihood/impact default to `med`, owner/mitigation to `TBD`. |
| review | `review <ws> [--stale-days N]` | Read-only meeting glance: summary header, escalated, stale, top-3 active. Default action. |
| ack | `ack <ws> <R-N>` | Bump last-reviewed; no status change. |
| escalate | `escalate <ws> <R-N>` | Flip to escalated; bump last-reviewed. |
| resolve | `resolve <ws> <R-N>` | Flip to resolved; drops out of `review`, stays in `list`. |
| list | `list <ws>` | All risks including resolved, with IDs. |

If the user gives no action, default to `review` (highest-frequency, read-only).

## ID acquisition and substring resolution

`review` and `list` always show the `R-N` ID next to each description. For
mutating actions the user may name a risk by description substring instead of an
ID — resolve it to the `R-N` from the latest `list`/`review`, then CONFIRM before
calling the script:

> Escalate R-7 "API auth keys not rotated"?

The script accepts `R-N` only. Substring resolution lives here, not in the script,
so evals stay deterministic.

## Status banner

The helper prints `Status: ready (risk-register)` to stderr on every run.

## Storage

Register lives at `<ws>/risks/register.md`. The skill takes any directory path;
it does not require an `/onboard` workspace. See
`docs/superpowers/specs/2026-06-16-risk-register-design.md` for the full design.
````

- [ ] **Step 2: Verify internal links resolve**

Run: `test -f docs/superpowers/specs/2026-06-16-risk-register-design.md && echo ok`
Expected: `ok` (the only referenced path).

- [ ] **Step 3: Commit**

```bash
git add skills/risk-register/SKILL.md
git commit -m "docs(risk-register): full SKILL.md routing body (#21)"
```

---

## Task 10: Final verification + validate.fish

**Files:** none (verification only)

- [ ] **Step 1: Run the full unit suite**

Run: `bun test tests/risk-register.test.ts`
Expected: all tests pass, 0 fail.

- [ ] **Step 2: Type-check the script**

Run: the repo's standard type-check (e.g. `bunx tsc --noEmit` against the project config).
Expected: no errors.

- [ ] **Step 3: Run validate.fish**

Run: `fish validate.fish`
Expected: `VALIDATION PASSED` (warnings OK), 0 failed. If a new skill triggers a frontmatter/link/slug failure, fix it before proceeding.

- [ ] **Step 4: Smoke-test the end-to-end flow**

```bash
W=/tmp/rr-smoke; rm -rf $W; mkdir -p $W
bun run skills/risk-register/scripts/risk-register.ts add $W --desc "auth keys stale" --likelihood high --impact high --today 2026-06-16
bun run skills/risk-register/scripts/risk-register.ts add $W --desc "low thing" --today 2026-06-16
bun run skills/risk-register/scripts/risk-register.ts escalate $W R-1 --today 2026-06-16
bun run skills/risk-register/scripts/risk-register.ts review $W --today 2026-06-16
bun run skills/risk-register/scripts/risk-register.ts list $W
rm -rf $W
```
Expected: add confirmations, escalate confirmation, a rendered review with `ESCALATED (1)` and a `[HH]` tag, and a list with both IDs.

- [ ] **Step 5: Final commit (if any fixes were needed)**

```bash
git add -A
git commit -m "chore(risk-register): final verification fixes (#21)"
```

- [ ] **Step 6: Update issue #21**

Note in issue #21 that storage path deviates to `<workspace>/risks/register.md` (D-1) and that `ack` + `resolve` were added beyond the literal add/review/escalate scope per PM/UX review. Do NOT auto-close — the PR closes it.

---

## Self-Review (plan author)

- **Spec coverage:** all six actions (add/review/ack/escalate/resolve/list) → Tasks 2–7. Three states → Tasks 4, 6. Meeting-ready review (header/sort/tag/top-3/overlap) → Task 6. Low-friction add defaults → Tasks 2–3. Error surfaces → Tasks 4, 7. Help/bare-default → Task 7. Evals (6) + fixtures → Task 8. SKILL.md routing + substring resolution → Task 9. validate.fish + AC#2 behavioral check (ack/escalate date) → Tasks 4, 10. Covered.
- **Placeholder scan:** none — every code step shows complete code.
- **Type consistency:** `Risk`, `Flags`, `Level`, `Status`, `cmpSev`, `sevKey`, `tag`, `parseRegister`, `serializeRegister`, `findRisk`, `loadOrDie`, `save`, `regPath`, `today`, `banner` are defined once and referenced consistently. `cmdAdd/cmdAck/cmdEscalate/cmdResolve/cmdList/cmdReview` signatures match their call sites in `main()`.
- **Known follow-up:** the description-substring → R-N resolution is SKILL.md-layer only (not unit-tested at the script level by design — the script takes R-N only).
````
