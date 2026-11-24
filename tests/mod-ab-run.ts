#!/usr/bin/env bun
/**
 * A/B the tool-diet mod over eval suites.
 *
 * Usage: bun run tests/mod-ab-run.ts <repoDir> <modDir> <runs> <suite>... > ab.json
 *
 * <modDir> is the mod's folder. The mod is not in the repo; the study doc
 * (docs/research/2026-11-24-mods-token-study.md, Step 4) holds its files.
 * Set AB_DEFAULT_CONFIG=1 to run both arms on the default config. The study
 * needed it because the eval config folder's login had expired.
 *
 * Arms alternate within each round so drift (time of day, server-side cache)
 * hits both equally. Usage comes from every `result` event in the transcripts
 * the run wrote; pass counts from the runner's "N/M evals passed" line.
 */
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const [repoDir, modDir, runsArg, ...suites] = process.argv.slice(2);
if (!repoDir || !modDir || !runsArg || suites.length === 0) throw new Error("usage: bun run tests/mod-ab-run.ts <repoDir> <modDir> <runs> <suite>...");
const resultsDir = join(repoDir, "tests", "results");
const extraEnv: Record<string, string> = process.env.AB_DEFAULT_CONFIG === "1" ? { EVAL_ALLOW_DEFAULT_CONFIG: "1" } : {};

type Row = { suite: string; arm: "off" | "on"; run: number; passed: number; total: number; sessions: number; fresh: number; cacheWrite: number; cacheRead: number; output: number };
const rows: Row[] = [];

function usageFrom(files: string[]) {
  const u = { sessions: 0, fresh: 0, cacheWrite: 0, cacheRead: 0, output: 0 };
  for (const f of files) {
    for (const line of readFileSync(join(resultsDir, f), "utf8").split("\n")) {
      // Key order in the stream varies, so parse and check `type`.
      if (!line.startsWith("{") || !line.includes('"type":"result"')) continue;
      let ev: { type?: string; usage?: Record<string, number> };
      try { ev = JSON.parse(line); } catch { continue; }
      if (ev.type !== "result") continue;
      const r = ev.usage ?? {};
      u.sessions++;
      u.fresh += r.input_tokens ?? 0;
      u.cacheWrite += r.cache_creation_input_tokens ?? 0;
      u.cacheRead += r.cache_read_input_tokens ?? 0;
      u.output += r.output_tokens ?? 0;
    }
  }
  return u;
}

for (let run = 1; run <= Number(runsArg); run++) {
  for (const suite of suites) {
    const arms: ("off" | "on")[] = run % 2 ? ["off", "on"] : ["on", "off"];
    for (const arm of arms) {
      const before = new Set(readdirSync(resultsDir));
      const env: Record<string, string | undefined> = { ...process.env, ...extraEnv };
      delete env.ANTHROPIC_API_KEY;
      if (arm === "on") env.CLAUDE_CODE_PLUGIN_DIRS = modDir;
      else delete env.CLAUDE_CODE_PLUGIN_DIRS;
      const p = spawnSync("bun", ["run", "tests/eval-runner-v2.ts", suite, "--concurrency", "3"], { cwd: repoDir, env, encoding: "utf8", maxBuffer: 64 << 20 });
      const out = (p.stdout ?? "") + (p.stderr ?? "");
      const m = /(\d+)\/(\d+) evals passed/.exec(out.replace(/\x1b\[[0-9;]*m/g, ""));
      const fresh = readdirSync(resultsDir).filter((f) => !before.has(f) && f.startsWith(`${suite}-`));
      const row: Row = { suite, arm, run, passed: m ? Number(m[1]) : 0, total: m ? Number(m[2]) : -1, ...usageFrom(fresh) };
      rows.push(row);
      console.error(JSON.stringify(row));
    }
  }
}
console.log(JSON.stringify(rows, null, 2));
