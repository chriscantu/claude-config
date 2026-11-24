#!/usr/bin/env bun
/**
 * Token baseline over recent Claude Code session transcripts.
 *
 * Usage: bun run token-baseline.ts [--n 30] [--root ~/.claude/projects] [--json]
 *
 * Two outputs:
 *   1. Billed usage by class, summed from each API call's `usage` block
 *      (deduplicated by message id, because one streamed message spans
 *      several transcript records).
 *   2. Attribution by source. The API reports only totals, so each content
 *      block is sized by characters, then scaled so the attributed sum equals
 *      the billed input. A block is charged once per API call made while it
 *      sits in context — that is what makes always-loaded content expensive.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

export type Usage = { fresh: number; cacheWrite: number; cacheRead: number; output: number };
export type SourceStat = { sends: number; estTokens: number; weighted: number; costUnits: number };

const CHARS_PER_TOKEN = 4;
// 1h-TTL cache write bills 2x base input; cache read bills 0.1x.
const WRITE_MULT = 2;
const READ_MULT = 0.1;

type Block = { source: string; est: number; sent: number };

const est = (s: string) => Math.ceil(s.length / CHARS_PER_TOKEN);
const text = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v ?? ""));

export function classifyInstructionPath(p: string): string {
  if (/\/rules\/[^/]+\.md$/.test(p)) return `rule:${basename(p)}`;
  if (p.endsWith("MEMORY.md")) return "memory-index";
  if (p.endsWith("CLAUDE.md") || p.endsWith("AGENTS.md")) return `instructions:${basename(p)}`;
  return `instructions:other`;
}

/** Group a fine-grained source key into the categories the report ranks. */
export function category(source: string): string {
  if (source.startsWith("rule:") || source.startsWith("instructions:") || source === "memory-index")
    return "always-loaded rules/instructions";
  if (source.startsWith("skill-body:")) return "skill bodies";
  if (source.startsWith("tool-output:")) return source;
  if (source === "repeat-read") return "repeated file reads";
  if (source.startsWith("reminder:")) return "system-reminders/attachments";
  return source;
}

export function analyzeSession(lines: string[]) {
  const usage: Usage = { fresh: 0, cacheWrite: 0, cacheRead: 0, output: 0 };
  const stats = new Map<string, SourceStat>();
  let fixed: Block[] = []; // system prompt + tool defs, replaced per request shape
  let convo: Block[] = [];
  const seenMsg = new Set<string>();
  const toolNames = new Map<string, { name: string; path?: string }>();
  const readPaths = new Set<string>();
  let calls = 0;

  const add = (source: string, s: string) => {
    const t = est(s);
    if (t > 0) convo.push({ source, est: t, sent: 0 });
  };

  for (const line of lines) {
    let r: any;
    try { r = JSON.parse(line); } catch { continue; }
    if (r.isSidechain) continue;

    if (r.type === "api-request-shape" && r.shape) {
      fixed = [];
      for (const b of r.shape.system ?? []) fixed.push({ source: "system-prompt(harness)", est: est(text(b.text)), sent: 0 });
      for (const t of r.shape.tools ?? []) {
        const src = String(t.name ?? "").startsWith("mcp__") ? "tool-defs:mcp" : "tool-defs:builtin";
        fixed.push({ source: src, est: est(JSON.stringify(t)), sent: 0 });
      }
      continue;
    }
    if (r.type === "system" && r.subtype === "compact_boundary") { convo = []; continue; }

    if (r.type === "attachment" && r.attachment) {
      const a = r.attachment;
      if (a.type === "instructions") for (const f of a.files ?? []) add(classifyInstructionPath(f.path ?? ""), text(f.content));
      else if (a.type === "skill_listing") add("skill-listing", text(a.content));
      else if (a.type === "hook_additional_context") add("hook-context", text(a.content));
      // prompt_snapshot is a resume-only copy of system+tools; counting it double-counts.
      else if (a.type !== "hook_success" && a.type !== "prompt_snapshot") add(`reminder:${a.type}`, JSON.stringify(a));
      continue;
    }

    if (r.type === "user" && r.message) {
      const c = r.message.content;
      if (typeof c === "string") { add(r.isCompactSummary ? "compact-summary" : "user-prompt", c); continue; }
      for (const part of c ?? []) {
        if (part.type === "tool_result") {
          const tool = toolNames.get(part.tool_use_id) ?? { name: "unknown" };
          let src = `tool-output:${tool.name}`;
          if (tool.name === "Read" && tool.path) {
            if (readPaths.has(tool.path)) src = "repeat-read";
            readPaths.add(tool.path);
          }
          add(src, text(part.content));
        } else if (part.type === "text") {
          const t: string = part.text ?? "";
          const m = /^Base directory for this skill: .*\/([^/\n]+)\n/.exec(t);
          if (m) add(`skill-body:${m[1]}`, t);
          else add(r.isMeta ? "meta-text" : r.isCompactSummary ? "compact-summary" : "user-prompt", t);
        } else add("user-other", JSON.stringify(part));
      }
      continue;
    }

    if (r.type === "assistant" && r.message) {
      const id = r.message.id;
      if (id && !seenMsg.has(id)) {
        seenMsg.add(id);
        calls++;
        const u = r.message.usage ?? {};
        usage.fresh += u.input_tokens ?? 0;
        usage.cacheWrite += u.cache_creation_input_tokens ?? 0;
        usage.cacheRead += u.cache_read_input_tokens ?? 0;
        usage.output += u.output_tokens ?? 0;
        // Everything in context before this message was sent on this call.
        for (const b of [...fixed, ...convo]) {
          const s = stats.get(b.source) ?? { sends: 0, estTokens: 0, weighted: 0, costUnits: 0 };
          if (b.sent === 0) s.estTokens += b.est;
          s.weighted += b.est;
          s.costUnits += b.est * (b.sent === 0 ? WRITE_MULT : READ_MULT);
          s.sends++;
          b.sent++;
          stats.set(b.source, s);
        }
      }
      for (const part of r.message.content ?? []) {
        if (part.type === "tool_use") {
          toolNames.set(part.id, { name: part.name, path: part.input?.file_path });
          add("assistant-history", JSON.stringify(part.input ?? {}));
        } else if (part.type === "text") add("assistant-history", part.text ?? "");
        else if (part.type === "thinking") add("assistant-history", part.thinking ?? "");
      }
    }
  }
  return { usage, stats, calls };
}

function recentTranscripts(root: string, n: number): string[] {
  const files: { p: string; m: number }[] = [];
  for (const d of readdirSync(root)) {
    const dir = join(root, d);
    if (!statSync(dir).isDirectory()) continue;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".jsonl")) continue;
      const p = join(dir, f);
      files.push({ p, m: statSync(p).mtimeMs });
    }
  }
  return files.sort((a, b) => b.m - a.m).slice(0, n).map((f) => f.p);
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const flag = (k: string, d: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
  const n = Number(flag("--n", "30"));
  const root = flag("--root", join(homedir(), ".claude", "projects"));
  const exclude = flag("--exclude", "");

  const total: Usage = { fresh: 0, cacheWrite: 0, cacheRead: 0, output: 0 };
  const all = new Map<string, SourceStat>();
  let calls = 0, sessions = 0;
  for (const p of recentTranscripts(root, n + (exclude ? 1 : 0))) {
    if (exclude && p.includes(exclude)) continue;
    if (sessions >= n) break;
    const res = analyzeSession(readFileSync(p, "utf8").split("\n"));
    if (res.calls === 0) continue;
    sessions++; calls += res.calls;
    for (const k of Object.keys(total) as (keyof Usage)[]) total[k] += res.usage[k];
    for (const [k, v] of res.stats) {
      const s = all.get(k) ?? { sends: 0, estTokens: 0, weighted: 0, costUnits: 0 };
      s.sends += v.sends; s.estTokens += v.estTokens; s.weighted += v.weighted; s.costUnits += v.costUnits;
      all.set(k, s);
    }
  }

  const billedInput = total.fresh + total.cacheWrite + total.cacheRead;
  const estInput = [...all.values()].reduce((a, s) => a + s.weighted, 0);
  const scale = estInput ? billedInput / estInput : 1;
  const costTotal = [...all.values()].reduce((a, s) => a + s.costUnits, 0);
  const fmt = (x: number) => Math.round(x).toLocaleString("en-US");
  const pct = (x: number, t: number) => `${((100 * x) / t).toFixed(1)}%`;

  if (argv.includes("--json")) {
    console.log(JSON.stringify({ sessions, calls, total, scale, sources: Object.fromEntries(all) }, null, 2));
    process.exit(0);
  }

  console.log(`Sessions: ${sessions}   API calls: ${fmt(calls)}   calibration scale (billed/estimated): ${scale.toFixed(2)}\n`);
  console.log("| Class | Tokens | Share of all tokens |\n|---|---:|---:|");
  const grand = billedInput + total.output;
  for (const [k, v] of Object.entries({ "fresh input": total.fresh, "cache write": total.cacheWrite, "cache read": total.cacheRead, output: total.output }))
    console.log(`| ${k} | ${fmt(v)} | ${pct(v, grand)} |`);
  console.log(`\nCache-read ratio (cache read / all input): ${pct(total.cacheRead, billedInput)}\n`);

  const byCat = new Map<string, SourceStat>();
  for (const [k, v] of all) {
    const c = category(k);
    const s = byCat.get(c) ?? { sends: 0, estTokens: 0, weighted: 0, costUnits: 0 };
    s.sends += v.sends; s.estTokens += v.estTokens; s.weighted += v.weighted; s.costUnits += v.costUnits;
    byCat.set(c, s);
  }
  const table = (title: string, m: Map<string, SourceStat>, top: number) => {
    console.log(`### ${title}\n\n| # | Source | Unique tokens | Context-weighted tokens | Share of input | Cost-weighted share |\n|---|---|---:|---:|---:|---:|`);
    [...m.entries()].sort((a, b) => b[1].weighted - a[1].weighted).slice(0, top).forEach(([k, v], i) =>
      console.log(`| ${i + 1} | ${k} | ${fmt(v.estTokens * scale)} | ${fmt(v.weighted * scale)} | ${pct(v.weighted, estInput)} | ${pct(v.costUnits, costTotal)} |`));
    console.log();
  };
  table("Top 10 source categories", byCat, 10);
  table("Top 15 individual sources", all, 15);
}
