// Per-plugin usage (skills, slash commands, agents, MCP tools) across all saved
// sessions, plus each plugin's per-request footprint in the skill listing and
// agent listing. Usage: bun run tests/plugin-usage.ts [projectsRoot]
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type NewestListing, recordListing } from "./plugin-listing.ts";
import { listTranscripts, transcriptSetLabel } from "./transcripts.ts";

const root = process.argv[2] ?? join(process.env.HOME ?? "", ".claude", "projects");
const PLUGINS = ["design", "product-management", "engineering", "productivity", "cowork-plugin-management",
  "commit-commands", "superpowers", "skill-creator", "claude-md-management", "pr-review-toolkit", "frontend-slides", "warp"];

type U = { sessions: Set<string>; skill: number; command: number; agent: number; mcp: number; last: string };
const use = new Map<string, U>(PLUGINS.map((p) => [p, { sessions: new Set(), skill: 0, command: 0, agent: 0, mcp: 0, last: "" }]));
const listingChars = new Map<string, number>();
const skillListingByPlugin: NewestListing = new Map();
const agentListingByPlugin: NewestListing = new Map();
let latestListing = "", latestListingTs = "";
let files = 0, firstTs = "9999";

// Subagent transcripts stay in: a skill or tool a subagent calls is still a use,
// and each subagent request carries its own skill listing.
const transcriptSet = transcriptSetLabel(true);
// Files are read in path order, so when two listings share a timestamp the
// later path wins on every run, not whichever file readdir returned last.
const all = listTranscripts(root).map((f) => f.path).sort();

const hit = (plugin: string, kind: keyof Omit<U, "sessions" | "last">, sid: string, ts: string) => {
  const u = use.get(plugin);
  if (!u) return;
  u[kind]++;
  u.sessions.add(sid);
  if (ts > u.last) u.last = ts;
};
const pluginOf = (name: string) => (name.includes(":") ? name.split(":")[0]! : "");

for (const f of all) {
  files++;
  for (const line of readFileSync(f, "utf8").split("\n")) {
    if (!line) continue;
    let r: any;
    try { r = JSON.parse(line); } catch { continue; }
    const ts: string = r.timestamp ?? "";
    if (ts && ts < firstTs) firstTs = ts;
    const sid: string = r.sessionId ?? f;
    if (r.type === "attachment" && r.attachment?.type === "skill_listing") {
      const content = String(r.attachment.content ?? "");
      recordListing(skillListingByPlugin, ts, content.split("\n"));
      if (ts >= latestListingTs) { latestListing = content; latestListingTs = ts; }
    }
    if (r.type === "attachment" && r.attachment?.type === "agent_listing_delta") {
      recordListing(agentListingByPlugin, ts, r.attachment.addedLines ?? []);
    }
    if (r.type === "assistant") {
      for (const c of r.message?.content ?? []) {
        if (c.type !== "tool_use") continue;
        if (c.name === "Skill") hit(pluginOf(String(c.input?.skill ?? "")), "skill", sid, ts);
        if (c.name === "Agent" || c.name === "Task") hit(pluginOf(String(c.input?.subagent_type ?? "")), "agent", sid, ts);
        const m = /^mcp__plugin_([^_]+(?:-[^_]+)*)_/.exec(c.name);
        if (m) hit(m[1]!, "mcp", sid, ts);
      }
    }
    if (r.type === "user" && !r.isMeta) {
      const t = typeof r.message?.content === "string" ? r.message.content : JSON.stringify(r.message?.content ?? "");
      for (const m of t.matchAll(/<command-name>\/?([a-z0-9-]+):[^<]+<\/command-name>/g)) hit(m[1]!, "command", sid, ts);
    }
  }
}

for (const l of latestListing.split("\n")) {
  const m = /^- ([a-z0-9-]+):/.exec(l);
  if (m) listingChars.set(m[1]!, (listingChars.get(m[1]!) ?? 0) + l.length);
}

console.log(`Transcripts scanned: ${files} (${transcriptSet}, since ${firstTs.slice(0, 10)})\n`);
console.log("| Plugin | Sessions used | Skill calls | Slash commands | Agent calls | MCP calls | Last used | Listing tokens/request (est.) |\n|---|---:|---:|---:|---:|---:|---|---:|");
for (const p of PLUGINS) {
  const u = use.get(p)!;
  const chars = (skillListingByPlugin.get(p)?.chars ?? 0) + (agentListingByPlugin.get(p)?.chars ?? 0);
  const tok = Math.round(chars / 4);
  console.log(`| ${p} | ${u.sessions.size} | ${u.skill} | ${u.command} | ${u.agent} | ${u.mcp} | ${u.last.slice(0, 10) || "never"} | ${tok} |`);
}
const totalListing = [...listingChars.values()].reduce((a, b) => a + b, 0) / 4;
console.log(`\nWhole skill listing: ~${Math.round(totalListing)} tokens/request (est., 4 chars/token, unscaled).`);
