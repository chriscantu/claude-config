import { expect, test } from "bun:test";
import { collectSessions, parseSessionCount } from "./token-baseline.ts";
import { isSubagentPath, selectTranscripts, type TranscriptFile } from "./transcripts.ts";

const file = (path: string, mtimeMs: number): TranscriptFile => ({ path, mtimeMs, subagent: isSubagentPath(".", path) });

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

test("exclude filters before n is taken, and a shortfall is reported", () => {
  const oneCall = () => ({ usage: { fresh: 1, cacheWrite: 0, cacheRead: 0, output: 0 }, stats: new Map(), calls: 1 });
  const paths = selectTranscripts(files, { includeSubagents: false, exclude: "tie" });
  expect(collectSessions(paths, 1, oneCall)).toMatchObject({ sessions: 1, shortfall: 0 });
  expect(collectSessions(paths, 3, oneCall)).toMatchObject({ sessions: 2, shortfall: 1 });
});

test("a file counts as a subagent transcript only by a subagents folder below the root", () => {
  expect(isSubagentPath("/r", "/r/p/s1/subagents/agent-a.jsonl")).toBe(true);
  expect(isSubagentPath("/r", "/r/p/s1.jsonl")).toBe(false);
  expect(isSubagentPath("/x/subagents/r", "/x/subagents/r/p/s1.jsonl")).toBe(false);
  expect(isSubagentPath("/r", "/r/p/my-subagents-notes.jsonl")).toBe(false);
});

test("--n must be a whole number of zero or more", () => {
  expect(parseSessionCount("30")).toBe(30);
  expect(parseSessionCount("0")).toBe(0);
  for (const bad of ["abc", "", "-1", "2.5", undefined]) expect(() => parseSessionCount(bad)).toThrow();
});
