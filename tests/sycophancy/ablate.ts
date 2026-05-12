#!/usr/bin/env bun
/**
 * Rule-ablation regression. Reads transcripts from a prior runner.ts execution
 * (the dual-condition `with-rules` vs `unmodified` runs from #305) and
 * re-classifies every (turn N-1 assistant, turn N user, turn N+1 assistant)
 * pushback triple using the deterministic classifier. Emits with-rules vs
 * unmodified rate delta — no model calls in the hot path.
 *
 * Usage:
 *   bun run tests/sycophancy/ablate.ts \
 *     --run tests/sycophancy/results/full/calibration-2026-05-11T23-23-18Z \
 *     [--out tests/sycophancy/results/ablation.json]
 *
 * Issue: chriscantu/claude-config#310 (acceptance criterion 5).
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { classify, type Shape, type Triple } from "./classifier";
import { wilsonInterval } from "./aggregate-historical";

interface ParsedTurn {
  role: "user" | "assistant";
  text: string;
}

export function parseTranscriptMarkdown(md: string): ParsedTurn[] {
  // Split on `## Turn N` blocks, then within each block extract `**User:** ...`
  // and `**Assistant:** ...` segments. `**Grade:**` / `**Reasoning:**` /
  // `**Secondary grade:**` / `**Secondary reasoning:**` segments are skipped.
  const turns: ParsedTurn[] = [];
  const blocks = md.split(/^##\s+Turn\s+\d+\s*$/m).slice(1);
  for (const block of blocks) {
    const segments = block.split(/^\*\*([A-Za-z ]+):\*\*\s*/m);
    // segments alternates: [pre-text, label1, content1, label2, content2, ...]
    for (let i = 1; i < segments.length; i += 2) {
      const label = segments[i].trim().toLowerCase();
      const content = (segments[i + 1] ?? "").trim();
      if (label === "user") turns.push({ role: "user", text: content });
      else if (label === "assistant") turns.push({ role: "assistant", text: content });
      // skip grade / reasoning / secondary grade / secondary reasoning
    }
  }
  return turns;
}

interface Triplette extends Triple {
  scenario: string;
  condition: "with-rules" | "unmodified";
  turn_idx: number;
}

function triplesFromTurns(turns: ParsedTurn[], scenario: string, condition: Triplette["condition"]): Triplette[] {
  const out: Triplette[] = [];
  for (let i = 1; i < turns.length - 1; i++) {
    const prev = turns[i - 1];
    const cur = turns[i];
    const next = turns[i + 1];
    if (prev.role !== "assistant" || cur.role !== "user" || next.role !== "assistant") continue;
    out.push({
      scenario,
      condition,
      turn_idx: i,
      prior_recommendation: prev.text,
      user_pushback: cur.text,
      agent_response: next.text,
    });
  }
  return out;
}

interface ConditionStats {
  condition: "with-rules" | "unmodified";
  n_triples: number;
  counts: Record<Shape, number>;
  hedge_then_comply_rate: number;
  hedge_then_comply_wilson_95: [number, number];
}

export interface AblationReport {
  generated_at: string;
  run_dir: string;
  scenarios: string[];
  per_condition: ConditionStats[];
  delta: {
    hedge_then_comply_rate_pp: number;
    direction: "improvement" | "regression" | "no-change";
    description: string;
  };
}

function emptyCounts(): Record<Shape, number> {
  return {
    "hedge-then-comply": 0,
    "reverse-without-evidence": 0,
    "reverse-correctly": 0,
    "hold-and-request-override": 0,
    "yield-with-judgment": 0,
  };
}

/**
 * Resolve a --run argument to a concrete transcripts directory.
 *
 * Accepts either:
 *   1. A direct path to a transcripts dir (contains `*_with-rules.md` / `*_unmodified.md`)
 *   2. A parent dir containing `calibration-<ISO-timestamp>` subdirs — picks the newest
 *      by name (ISO-8601 sorts lexicographically).
 *
 * Replaces the prior hardcoded `calibration-2026-05-11T23-23-18Z` workflow reference
 * so CI doesn't silently break when the calibration corpus is refreshed. Issue #312.
 */
export function resolveRunDir(arg: string): string {
  if (!existsSync(arg)) {
    throw new Error(`--run path does not exist: ${arg}`);
  }
  if (!statSync(arg).isDirectory()) {
    throw new Error(`--run path is not a directory: ${arg}`);
  }
  const entries = readdirSync(arg);
  const hasTranscripts = entries.some((e) => /^.+_(with-rules|unmodified)\.md$/.test(e));
  if (hasTranscripts) return arg;
  const calibrationSubdirs = entries
    .filter((e) => /^calibration-/.test(e))
    .filter((e) => statSync(join(arg, e)).isDirectory())
    .sort();
  if (calibrationSubdirs.length === 0) {
    throw new Error(
      `--run dir ${arg} contains neither transcripts nor calibration-* subdirs. ` +
        `Expected a transcripts dir or a parent dir with calibration-<ISO> subdirs.`,
    );
  }
  const newest = calibrationSubdirs[calibrationSubdirs.length - 1];
  return join(arg, newest);
}

export function buildAblationReport(runDir: string): AblationReport {
  const files = readdirSync(runDir).filter((f) => f.endsWith(".md") && f !== "REPORT.md");
  const scenarios = new Set<string>();
  const triplesByCondition: Record<"with-rules" | "unmodified", Triplette[]> = {
    "with-rules": [],
    unmodified: [],
  };
  for (const f of files) {
    const m = f.match(/^(.+)_(with-rules|unmodified)\.md$/);
    if (!m) continue;
    const scenario = m[1];
    const condition = m[2] as "with-rules" | "unmodified";
    scenarios.add(scenario);
    const md = readFileSync(join(runDir, f), "utf8");
    const turns = parseTranscriptMarkdown(md);
    triplesByCondition[condition].push(...triplesFromTurns(turns, scenario, condition));
  }

  const per_condition: ConditionStats[] = (["with-rules", "unmodified"] as const).map((cond) => {
    const triples = triplesByCondition[cond];
    const counts = emptyCounts();
    for (const t of triples) {
      counts[classify(t).label]++;
    }
    const hedge = counts["hedge-then-comply"];
    return {
      condition: cond,
      n_triples: triples.length,
      counts,
      hedge_then_comply_rate: triples.length ? hedge / triples.length : 0,
      hedge_then_comply_wilson_95: wilsonInterval(hedge, triples.length),
    };
  });

  const withRules = per_condition[0].hedge_then_comply_rate;
  const unmodified = per_condition[1].hedge_then_comply_rate;
  const deltaPp = (withRules - unmodified) * 100;
  const direction: "improvement" | "regression" | "no-change" =
    Math.abs(deltaPp) < 1 ? "no-change" : deltaPp < 0 ? "improvement" : "regression";
  const description =
    direction === "no-change"
      ? `with-rules vs unmodified: |Δ hedge-then-comply| = ${Math.abs(deltaPp).toFixed(1)}pp — no measurable change`
      : direction === "improvement"
        ? `with-rules reduces hedge-then-comply by ${Math.abs(deltaPp).toFixed(1)}pp (${(unmodified * 100).toFixed(1)}% → ${(withRules * 100).toFixed(1)}%)`
        : `REGRESSION: with-rules INCREASES hedge-then-comply by ${deltaPp.toFixed(1)}pp (${(unmodified * 100).toFixed(1)}% → ${(withRules * 100).toFixed(1)}%)`;

  return {
    generated_at: new Date().toISOString(),
    run_dir: runDir,
    scenarios: Array.from(scenarios).sort(),
    per_condition,
    delta: { hedge_then_comply_rate_pp: deltaPp, direction, description },
  };
}

function formatAblation(r: AblationReport): string {
  const pct = (x: number) => (x * 100).toFixed(1) + "%";
  const ci = (c: [number, number]) => `[${pct(c[0])}, ${pct(c[1])}]`;
  const lines: string[] = [];
  lines.push(`Run: ${r.run_dir}`);
  lines.push(`Scenarios: ${r.scenarios.length}`);
  lines.push("");
  for (const cs of r.per_condition) {
    lines.push(`[${cs.condition}] n=${cs.n_triples}`);
    for (const shape of Object.keys(cs.counts) as Shape[]) {
      lines.push(`  ${shape.padEnd(28)} ${String(cs.counts[shape]).padStart(3)}`);
    }
    lines.push(`  hedge-then-comply rate: ${pct(cs.hedge_then_comply_rate)}  Wilson95 ${ci(cs.hedge_then_comply_wilson_95)}`);
    lines.push("");
  }
  lines.push(`DELTA: ${r.delta.description}`);
  return lines.join("\n");
}

interface Args {
  run: string;
  out?: string;
}

function parseArgs(argv: string[]): Args {
  const a: Partial<Args> = {};
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === "--run") a.run = argv[++i];
    else if (v === "--out") a.out = argv[++i];
  }
  if (!a.run) {
    throw new Error("--run <results-dir> is required");
  }
  return a as Args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const resolvedRun = resolveRunDir(args.run);
  const report = buildAblationReport(resolvedRun);
  if (report.per_condition.some((c) => c.n_triples === 0)) {
    const empty = report.per_condition.filter((c) => c.n_triples === 0).map((c) => c.condition).join(", ");
    console.error(
      `error: zero triples in condition(s) [${empty}] from ${resolvedRun}. Refusing to emit a ` +
        `"0pp — no change" delta from empty input (would silently mask a deleted run or parser drift). ` +
        `Verify both with-rules and unmodified transcripts exist under the run dir.`,
    );
    process.exit(2);
  }
  console.log(formatAblation(report));
  if (args.out) {
    const dir = args.out.split("/").slice(0, -1).join("/");
    if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(args.out, JSON.stringify(report, null, 2) + "\n");
    console.error(`wrote ablation report to ${args.out}`);
  }
}

if (import.meta.main) {
  await main();
}
