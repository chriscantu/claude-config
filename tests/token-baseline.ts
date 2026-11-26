#!/usr/bin/env bun
/**
 * Token baseline over recent Claude Code session transcripts.
 *
 * Usage: bun run token-baseline.ts [--n 30] [--root ~/.claude/projects] [--exclude <path-substring>] [--json]
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
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { listTranscripts, selectTranscripts, transcriptSetLabel } from "./transcripts.ts";

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

// The harness opens every injected SKILL.md with this line, so the folder name
// it ends with identifies which skill the body belongs to.
const SKILL_BODY_HEADER = /^Base directory for this skill: .*\/([^/\n]+)\n/;

type ToolCall = { name: string; path?: string };

/** What one transcript has built up so far as its records are replayed in order. */
type SessionState = {
  usage: Usage;
  stats: Map<string, SourceStat>;
  requestPrefix: Block[]; // system prompt + tool defs; replaced whenever the request shape changes
  conversation: Block[];
  seenMessageIds: Set<string>;
  toolCalls: Map<string, ToolCall>;
  readPaths: Set<string>;
  calls: number;
};

export function analyzeSession(lines: string[]) {
  const state: SessionState = {
    usage: { fresh: 0, cacheWrite: 0, cacheRead: 0, output: 0 },
    stats: new Map(),
    requestPrefix: [],
    conversation: [],
    seenMessageIds: new Set(),
    toolCalls: new Map(),
    readPaths: new Set(),
    calls: 0,
  };
  for (const line of lines) {
    let record: any;
    try { record = JSON.parse(line); } catch { continue; }
    if (!record.isSidechain) applyRecord(state, record);
  }
  return { usage: state.usage, stats: state.stats, calls: state.calls };
}

function applyRecord(state: SessionState, record: any) {
  if (record.type === "api-request-shape" && record.shape) return replaceRequestPrefix(state, record.shape);
  if (record.type === "system" && record.subtype === "compact_boundary") { state.conversation = []; return; }
  if (record.type === "attachment" && record.attachment) return addAttachment(state, record.attachment);
  if (record.type === "user" && record.message) return addUserMessage(state, record);
  if (record.type === "assistant" && record.message) return addAssistantMessage(state, record.message);
}

function addBlock(state: SessionState, source: string, s: string) {
  const t = est(s);
  if (t > 0) state.conversation.push({ source, est: t, sent: 0 });
}

function replaceRequestPrefix(state: SessionState, shape: any) {
  state.requestPrefix = [];
  for (const b of shape.system ?? []) state.requestPrefix.push({ source: "system-prompt(harness)", est: est(text(b.text)), sent: 0 });
  for (const t of shape.tools ?? []) {
    const source = String(t.name ?? "").startsWith("mcp__") ? "tool-defs:mcp" : "tool-defs:builtin";
    state.requestPrefix.push({ source, est: est(JSON.stringify(t)), sent: 0 });
  }
}

function addAttachment(state: SessionState, a: any) {
  if (a.type === "instructions") {
    for (const f of a.files ?? []) addBlock(state, classifyInstructionPath(f.path ?? ""), text(f.content));
    return;
  }
  if (a.type === "skill_listing") return addBlock(state, "skill-listing", text(a.content));
  if (a.type === "hook_additional_context") return addBlock(state, "hook-context", text(a.content));
  // prompt_snapshot is a resume-only copy of system+tools; counting it double-counts.
  if (a.type === "hook_success" || a.type === "prompt_snapshot") return;
  addBlock(state, `reminder:${a.type}`, JSON.stringify(a));
}

function addUserMessage(state: SessionState, record: any) {
  const content = record.message.content;
  if (typeof content === "string") return addBlock(state, record.isCompactSummary ? "compact-summary" : "user-prompt", content);
  for (const part of content ?? []) addUserPart(state, record, part);
}

function addUserPart(state: SessionState, record: any, part: any) {
  if (part.type === "tool_result") return addBlock(state, toolResultSource(state, part.tool_use_id), text(part.content));
  if (part.type !== "text") return addBlock(state, "user-other", JSON.stringify(part));
  const t: string = part.text ?? "";
  const skill = SKILL_BODY_HEADER.exec(t);
  if (skill) return addBlock(state, `skill-body:${skill[1]}`, t);
  addBlock(state, record.isMeta ? "meta-text" : record.isCompactSummary ? "compact-summary" : "user-prompt", t);
}

/** Names the source of a tool result; a second Read of the same path counts as a repeat read. */
function toolResultSource(state: SessionState, toolUseId: string): string {
  const tool = state.toolCalls.get(toolUseId) ?? { name: "unknown" };
  if (tool.name !== "Read" || !tool.path) return `tool-output:${tool.name}`;
  const isRepeat = state.readPaths.has(tool.path);
  state.readPaths.add(tool.path);
  return isRepeat ? "repeat-read" : "tool-output:Read";
}

function addAssistantMessage(state: SessionState, message: any) {
  // One streamed message spans several records; only its first record is a new API call.
  const id = message.id;
  if (id && !state.seenMessageIds.has(id)) {
    state.seenMessageIds.add(id);
    state.calls++;
    addUsage(state.usage, message.usage ?? {});
    chargeContext(state);
  }
  for (const part of message.content ?? []) addAssistantPart(state, part);
}

function addUsage(usage: Usage, u: any) {
  usage.fresh += u.input_tokens ?? 0;
  usage.cacheWrite += u.cache_creation_input_tokens ?? 0;
  usage.cacheRead += u.cache_read_input_tokens ?? 0;
  usage.output += u.output_tokens ?? 0;
}

/** Everything in context before a message was sent on that message's API call. */
function chargeContext(state: SessionState) {
  for (const b of [...state.requestPrefix, ...state.conversation]) {
    const s = state.stats.get(b.source) ?? { sends: 0, estTokens: 0, weighted: 0, costUnits: 0 };
    if (b.sent === 0) s.estTokens += b.est;
    s.weighted += b.est;
    s.costUnits += b.est * (b.sent === 0 ? WRITE_MULT : READ_MULT);
    s.sends++;
    b.sent++;
    state.stats.set(b.source, s);
  }
}

function addAssistantPart(state: SessionState, part: any) {
  if (part.type === "tool_use") {
    state.toolCalls.set(part.id, { name: part.name, path: part.input?.file_path });
    return addBlock(state, "assistant-history", JSON.stringify(part.input ?? {}));
  }
  if (part.type === "text") return addBlock(state, "assistant-history", part.text ?? "");
  if (part.type === "thinking") addBlock(state, "assistant-history", part.thinking ?? "");
}

type SessionResult = ReturnType<typeof analyzeSession>;

/**
 * Analyzes transcripts in the given order until `n` of them contain API calls.
 * A transcript with no calls does not count toward `n`. `shortfall` is how many
 * sessions short of `n` the run ended when the transcripts ran out.
 */
export function collectSessions(paths: string[], n: number, analyze: (path: string) => SessionResult) {
  const total: Usage = { fresh: 0, cacheWrite: 0, cacheRead: 0, output: 0 };
  const all = new Map<string, SourceStat>();
  let calls = 0, sessions = 0;
  for (const p of paths) {
    if (sessions >= n) break;
    const res = analyze(p);
    if (res.calls === 0) continue;
    sessions++; calls += res.calls;
    for (const k of Object.keys(total) as (keyof Usage)[]) total[k] += res.usage[k];
    for (const [k, v] of res.stats) {
      const s = all.get(k) ?? { sends: 0, estTokens: 0, weighted: 0, costUnits: 0 };
      s.sends += v.sends; s.estTokens += v.estTokens; s.weighted += v.weighted; s.costUnits += v.costUnits;
      all.set(k, s);
    }
  }
  return { sessions, calls, total, all, shortfall: Math.max(0, n - sessions) };
}

/** Billed input over estimated input: the factor that turns character estimates into billed tokens. */
export function calibrationScale(total: Usage, sources: Map<string, SourceStat>): number {
  const billedInput = total.fresh + total.cacheWrite + total.cacheRead;
  const estInput = [...sources.values()].reduce((a, s) => a + s.weighted, 0);
  return estInput ? billedInput / estInput : 1;
}

/** Heaviest first; equal weights sort by source name so the table order is stable. */
export const rankSources = (m: Map<string, SourceStat>) =>
  [...m.entries()].sort((a, b) => b[1].weighted - a[1].weighted || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const flag = (k: string, d: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
  const n = Number(flag("--n", "30"));
  const root = flag("--root", join(homedir(), ".claude", "projects"));
  const exclude = flag("--exclude", "");

  // Subagent records are all sidechain records, which analyzeSession skips, so
  // reading those files would add nothing.
  const transcriptSet = transcriptSetLabel(false);
  const paths = selectTranscripts(listTranscripts(root), { includeSubagents: false, exclude });
  const { sessions, calls, total, all, shortfall } = collectSessions(paths, n, (p) => analyzeSession(readFileSync(p, "utf8").split("\n")));
  if (shortfall > 0)
    console.error(`warning: found ${sessions} of ${n} requested sessions with API calls${exclude ? ` after excluding "${exclude}"` : ""}`);

  const billedInput = total.fresh + total.cacheWrite + total.cacheRead;
  const estInput = [...all.values()].reduce((a, s) => a + s.weighted, 0);
  const scale = calibrationScale(total, all);
  const costTotal = [...all.values()].reduce((a, s) => a + s.costUnits, 0);
  const fmt = (x: number) => Math.round(x).toLocaleString("en-US");
  const pct = (x: number, t: number) => `${((100 * x) / t).toFixed(1)}%`;

  if (argv.includes("--json")) {
    console.log(JSON.stringify({ transcriptSet, sessions, calls, total, scale, sources: Object.fromEntries(all) }, null, 2));
    process.exit(0);
  }

  console.log(`Sessions: ${sessions} (${transcriptSet})   API calls: ${fmt(calls)}   calibration scale (billed/estimated): ${scale.toFixed(2)}\n`);
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
    rankSources(m).slice(0, top).forEach(([k, v], i) =>
      console.log(`| ${i + 1} | ${k} | ${fmt(v.estTokens * scale)} | ${fmt(v.weighted * scale)} | ${pct(v.weighted, estInput)} | ${pct(v.costUnits, costTotal)} |`));
    console.log();
  };
  table("Top 10 source categories", byCat, 10);
  table("Top 15 individual sources", all, 15);
}
