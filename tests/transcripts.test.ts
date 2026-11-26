import { expect, test } from "bun:test";
import { selectTranscripts, type TranscriptFile } from "./transcripts.ts";

const file = (path: string, mtimeMs: number): TranscriptFile => ({ path, mtimeMs, subagent: path.includes("/subagents/") });

const files = [
  file("p/old.jsonl", 1),
  file("p/new.jsonl", 3),
  file("p/s1/subagents/agent-a.jsonl", 4),
  file("q/tie-b.jsonl", 2),
  file("q/tie-a.jsonl", 2),
];

test("main sessions only: subagent transcripts are left out, newest first", () => {
  expect(selectTranscripts(files, { includeSubagents: false })).toEqual(["p/new.jsonl", "q/tie-a.jsonl", "q/tie-b.jsonl", "p/old.jsonl"]);
});

test("including subagents keeps their transcripts in the set", () => {
  expect(selectTranscripts(files, { includeSubagents: true })[0]).toBe("p/s1/subagents/agent-a.jsonl");
});

test("files with the same modified time sort by path, whatever order they were listed in", () => {
  const reversed = [...files].reverse();
  expect(selectTranscripts(reversed, { includeSubagents: false })).toEqual(selectTranscripts(files, { includeSubagents: false }));
});

test("exclude filters before the limit, so the limit still counts kept files", () => {
  expect(selectTranscripts(files, { includeSubagents: false, exclude: "tie", limit: 2 })).toEqual(["p/new.jsonl", "p/old.jsonl"]);
});
