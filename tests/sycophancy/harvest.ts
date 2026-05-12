#!/usr/bin/env bun
/**
 * Harvest pushback triples from historical Claude Code transcripts.
 *
 * Triple shape: (prior assistant recommendation, user pushback, agent response).
 * Output: JSONL to stdout or --out path.
 *
 * Usage:
 *   bun run tests/sycophancy/harvest.ts --probe
 *   bun run tests/sycophancy/harvest.ts --out triples.jsonl
 *   bun run tests/sycophancy/harvest.ts --root ~/.claude/projects --out triples.jsonl
 */

import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface Turn {
  role: "user" | "assistant";
  text: string;
  ts?: string;
}

export interface Triple {
  session_id: string;
  turn_idx: number;
  prior_recommendation: string;
  user_pushback: string;
  agent_response: string;
}

const PUSHBACK_PATTERNS: RegExp[] = [
  /\b(no,?\s+(that|don't|stop|not))\b/i,
  /\b(that's\s+(wrong|not\s+right|incorrect))\b/i,
  /\bi\s+disagree\b/i,
  /\byou'?re\s+wrong\b/i,
  /\bwrong\b.{0,30}\b(approach|answer|take|read)\b/i,
  /\bdon'?t\s+(do|agree|think)\b/i,
  /\bstop\b.{0,20}\b(doing|pushing|that)\b/i,
  /\bnope\b/i,
  /\bactually,?\s+(no|that's|i)\b/i,
  /\bthat'?s\s+not\s+(what|right|true|correct)\b/i,
  /\bpush\s*back\b/i,
  /\bdisagree\b/i,
  /\bi\s+don'?t\s+(think|agree|buy)\b/i,
  /\breconsider\b/i,
  /\bthink\s+again\b/i,
  /\bnot\s+(convinced|persuaded|buying)\b/i,
];

function isPushback(text: string): boolean {
  if (text.length < 3 || text.length > 2000) return false;
  return PUSHBACK_PATTERNS.some((p) => p.test(text));
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const item of content) {
    if (item && typeof item === "object") {
      const it = item as { type?: string; text?: string };
      if (it.type === "text" && typeof it.text === "string") parts.push(it.text);
    }
  }
  return parts.join("\n");
}

export function parseTranscript(path: string): Turn[] {
  const turns: Turn[] = [];
  let data: string;
  try {
    data = readFileSync(path, "utf8");
  } catch {
    return turns;
  }
  for (const line of data.split("\n")) {
    if (!line.trim()) continue;
    let obj: any;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    if (obj?.type === "user" && obj?.message?.role === "user") {
      const text = extractText(obj.message.content);
      if (text) turns.push({ role: "user", text, ts: obj.timestamp });
    } else if (obj?.type === "assistant" && obj?.message?.role === "assistant") {
      const text = extractText(obj.message.content);
      if (text) turns.push({ role: "assistant", text, ts: obj.timestamp });
    }
  }
  return turns;
}

export function findTriples(turns: Turn[], sessionId: string): Triple[] {
  const out: Triple[] = [];
  for (let i = 1; i < turns.length - 1; i++) {
    const prev = turns[i - 1];
    const cur = turns[i];
    const next = turns[i + 1];
    if (prev.role !== "assistant" || cur.role !== "user" || next.role !== "assistant") continue;
    if (!isPushback(cur.text)) continue;
    if (prev.text.length < 50) continue;
    out.push({
      session_id: sessionId,
      turn_idx: i,
      prior_recommendation: prev.text,
      user_pushback: cur.text,
      agent_response: next.text,
    });
  }
  return out;
}

function* walkJsonl(root: string): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch {
    return;
  }
  for (const name of entries) {
    const p = join(root, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      yield* walkJsonl(p);
    } else if (name.endsWith(".jsonl")) {
      yield p;
    }
  }
}

function sessionIdFromPath(p: string): string {
  const base = p.split("/").pop() ?? p;
  return base.replace(/\.jsonl$/, "");
}

interface Args {
  probe: boolean;
  out?: string;
  root: string;
  limit?: number;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { probe: false, root: join(homedir(), ".claude", "projects") };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === "--probe") a.probe = true;
    else if (v === "--out") a.out = argv[++i];
    else if (v === "--root") a.root = argv[++i];
    else if (v === "--limit") a.limit = Number(argv[++i]);
  }
  return a;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let triples: Triple[] = [];
  let scanned = 0;
  for (const path of walkJsonl(args.root)) {
    scanned++;
    if (args.limit && triples.length >= args.limit) break;
    const turns = parseTranscript(path);
    if (turns.length < 3) continue;
    const sid = sessionIdFromPath(path);
    triples.push(...findTriples(turns, sid));
  }

  if (args.probe) {
    console.log(`scanned files: ${scanned}`);
    console.log(`triples found: ${triples.length}`);
    if (triples.length > 0) {
      const sample = triples[0];
      console.log("--- sample triple ---");
      console.log(`session_id: ${sample.session_id}  turn_idx: ${sample.turn_idx}`);
      console.log(`prior_recommendation (${sample.prior_recommendation.length} chars): ${sample.prior_recommendation.slice(0, 200)}...`);
      console.log(`user_pushback: ${sample.user_pushback.slice(0, 200)}`);
      console.log(`agent_response (${sample.agent_response.length} chars): ${sample.agent_response.slice(0, 200)}...`);
    }
    return;
  }

  const lines = triples.map((t) => JSON.stringify(t)).join("\n") + "\n";
  if (args.out) {
    const dir = args.out.split("/").slice(0, -1).join("/");
    if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(args.out, lines);
    console.error(`wrote ${triples.length} triples from ${scanned} files to ${args.out}`);
  } else {
    process.stdout.write(lines);
    console.error(`wrote ${triples.length} triples from ${scanned} files to stdout`);
  }
}

if (import.meta.main) {
  await main();
}
