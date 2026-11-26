// Lists saved Claude Code transcripts so every token report reads the same files
// and can say which set it read.
import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/** One transcript on disk. `subagent` marks files under a session's `subagents/` folder. */
export type TranscriptFile = { path: string; mtimeMs: number; subagent: boolean };

export type Selection = { includeSubagents: boolean; exclude?: string };

/** True when the file sits under a `subagents` folder somewhere below `root`. */
export const isSubagentPath = (root: string, path: string) => relative(root, path).split(sep).includes("subagents");

/** Every `.jsonl` file under `root`, at any depth. */
export function listTranscripts(root: string): TranscriptFile[] {
  const out: TranscriptFile[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      const s = statSync(path);
      if (s.isDirectory()) walk(path);
      else if (name.endsWith(".jsonl"))
        out.push({ path, mtimeMs: s.mtimeMs, subagent: isSubagentPath(root, path) });
    }
  };
  walk(root);
  return out;
}

/**
 * Newest first. Ties on modified time sort by path, so two runs over the same
 * files give the same order. Callers take their first n from this list, so
 * excluded files never use up a place.
 */
export function selectTranscripts(files: TranscriptFile[], { includeSubagents, exclude }: Selection): string[] {
  return files
    .filter((f) => includeSubagents || !f.subagent)
    .filter((f) => !exclude || !f.path.includes(exclude))
    .sort((a, b) => b.mtimeMs - a.mtimeMs || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((f) => f.path);
}

/** The phrase each report prints so readers know which files it covers. */
export const transcriptSetLabel = (includeSubagents: boolean) =>
  includeSubagents ? "main sessions and subagents" : "main sessions only";
