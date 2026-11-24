import { expect, test } from "bun:test";
import { analyzeSession, category, classifyInstructionPath } from "./token-baseline.ts";

const L = (o: object) => JSON.stringify(o);
const asst = (id: string, content: object[] = [], usage = { input_tokens: 1, cache_creation_input_tokens: 10, cache_read_input_tokens: 100, output_tokens: 5 }) =>
  L({ type: "assistant", message: { id, usage, content } });

test("usage is deduplicated by message id", () => {
  const { usage, calls } = analyzeSession([asst("m1"), asst("m1"), asst("m2")]);
  expect(calls).toBe(2);
  expect(usage).toEqual({ fresh: 2, cacheWrite: 20, cacheRead: 200, output: 10 });
});

test("always-loaded content is charged once per later call", () => {
  const rule = "x".repeat(400); // 100 est tokens
  const { stats } = analyzeSession([
    L({ type: "attachment", attachment: { type: "instructions", files: [{ path: "/a/rules/foo.md", content: rule }] } }),
    asst("m1"), asst("m2"), asst("m3"),
  ]);
  const s = stats.get("rule:foo.md")!;
  expect(s.estTokens).toBe(100);
  expect(s.weighted).toBe(300);
  expect(s.costUnits).toBeCloseTo(100 * 2 + 100 * 0.1 * 2);
});

test("second Read of the same path is a repeat read; skill bodies are named", () => {
  const { stats } = analyzeSession([
    asst("m1", [{ type: "tool_use", id: "t1", name: "Read", input: { file_path: "/f" } }]),
    L({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", content: "aaaa" }] } }),
    asst("m2", [{ type: "tool_use", id: "t2", name: "Read", input: { file_path: "/f" } }]),
    L({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t2", content: "bbbb" }] } }),
    L({ type: "user", isMeta: true, message: { content: [{ type: "text", text: "Base directory for this skill: /s/tdd\n\nbody" }] } }),
    asst("m3"),
  ]);
  expect(stats.get("tool-output:Read")!.weighted).toBe(2);
  expect(stats.get("repeat-read")!.weighted).toBe(1);
  expect(stats.has("skill-body:tdd")).toBe(true);
});

test("compaction drops conversation blocks", () => {
  const { stats } = analyzeSession([
    L({ type: "user", message: { content: "hello there" } }), asst("m1"),
    L({ type: "system", subtype: "compact_boundary" }), asst("m2"),
  ]);
  expect(stats.get("user-prompt")!.sends).toBe(1);
});

test("classification", () => {
  expect(classifyInstructionPath("/x/rules/goal-driven.md")).toBe("rule:goal-driven.md");
  expect(category("rule:x.md")).toBe("always-loaded rules/instructions");
  expect(category("memory-index")).toBe("always-loaded rules/instructions");
});
