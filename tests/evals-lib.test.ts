/**
 * Tests for the shared eval library — assertion evaluator, schema loader,
 * stream-json parser, and signal extractor.
 *
 * The pilot-skill responses themselves are not tested here; those are exercised
 * by running the runners against real evals. These tests cover the
 * deterministic bits: does `evaluate()` produce the right pass/fail for each
 * assertion type, does `loadEvalFile()` reject malformed schemas at load time,
 * and do `parseStreamJson()` / `extractSignals()` correctly lift structured
 * signals out of an NDJSON transcript.
 */

import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type Assertion,
  type Signals,
  evaluate,
  extractSignals,
  loadEvalFile,
  parseStreamJson,
} from "./evals-lib.ts";

function sig(finalText: string, extra?: Partial<Signals>): Signals {
  return {
    finalText,
    toolUses: extra?.toolUses ?? [],
    skillInvocations: extra?.skillInvocations ?? [],
  };
}

describe("evaluate()", () => {
  test("contains — matches substring", () => {
    const a: Assertion = { type: "contains", value: "red flag", description: "finds red flag" };
    expect(evaluate(a, sig("this has a red flag in it")).ok).toBe(true);
    expect(evaluate(a, sig("no match here")).ok).toBe(false);
  });

  test("not_contains — fails when substring present", () => {
    const a: Assertion = { type: "not_contains", value: "schema:", description: "no schema" };
    expect(evaluate(a, sig("schema: users")).ok).toBe(false);
    expect(evaluate(a, sig("no forbidden text")).ok).toBe(true);
  });

  test("regex — case-insensitive flag", () => {
    const a: Assertion = { type: "regex", pattern: "Red.?Flag", flags: "i", description: "" };
    expect(evaluate(a, sig("RED FLAG detected")).ok).toBe(true);
    expect(evaluate(a, sig("no flags here")).ok).toBe(false);
  });

  test("not_regex — fails when pattern matches", () => {
    const a: Assertion = { type: "not_regex", pattern: "^question 1", flags: "im", description: "" };
    expect(evaluate(a, sig("Question 1: who has this problem?")).ok).toBe(false);
    expect(evaluate(a, sig("just prose, no numbered questions")).ok).toBe(true);
  });

  test("skill_invoked — matches invocation by skill name", () => {
    const a: Assertion = { type: "skill_invoked", skill: "define-the-problem", description: "d" };
    const signals = sig("", {
      skillInvocations: [
        { skill: "define-the-problem", raw: { name: "Skill", input: { skill: "define-the-problem" } } },
      ],
    });
    expect(evaluate(a, signals).ok).toBe(true);
    expect(evaluate(a, sig("")).ok).toBe(false);
  });

  test("skill_invoked — detail lists skills seen on failure", () => {
    const a: Assertion = { type: "skill_invoked", skill: "target-skill", description: "d" };
    const signals = sig("", {
      skillInvocations: [
        { skill: "other-skill", raw: { name: "Skill", input: { skill: "other-skill" } } },
      ],
    });
    const r = evaluate(a, signals);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("other-skill");
  });

  test("not_skill_invoked — fails when forbidden skill was invoked", () => {
    const a: Assertion = { type: "not_skill_invoked", skill: "forbidden", description: "d" };
    const signals = sig("", {
      skillInvocations: [
        { skill: "forbidden", raw: { name: "Skill", input: { skill: "forbidden" } } },
      ],
    });
    expect(evaluate(a, signals).ok).toBe(false);
    expect(evaluate(a, sig("")).ok).toBe(true);
  });

  test("failing assertion surfaces detail", () => {
    const a: Assertion = { type: "contains", value: "missing", description: "d" };
    const r = evaluate(a, sig("not present"));
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("missing");
  });
});

describe("loadEvalFile()", () => {
  function scratch(): string {
    return mkdtempSync(join(tmpdir(), "evals-lib-test-"));
  }

  function writeEval(root: string, skill: string, json: unknown): void {
    const dir = join(root, skill, "evals");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "evals.json"), JSON.stringify(json));
  }

  test("returns null when evals.json absent", () => {
    const root = scratch();
    mkdirSync(join(root, "skill-a"), { recursive: true });
    expect(loadEvalFile(root, "skill-a")).toBeNull();
  });

  test("valid file loads", () => {
    const root = scratch();
    writeEval(root, "skill-a", {
      skill: "skill-a",
      evals: [
        {
          name: "e1",
          prompt: "hello",
          assertions: [{ type: "contains", value: "x", description: "d" }],
        },
      ],
    });
    const file = loadEvalFile(root, "skill-a");
    expect(file?.evals.length).toBe(1);
  });

  test("skill_invoked assertion validates at load", () => {
    const root = scratch();
    writeEval(root, "skill-a", {
      skill: "skill-a",
      evals: [
        {
          name: "e1",
          prompt: "p",
          assertions: [{ type: "skill_invoked", skill: "target", description: "d" }],
        },
      ],
    });
    expect(loadEvalFile(root, "skill-a")?.evals[0]?.assertions[0]?.type).toBe("skill_invoked");
  });

  test("rejects skill_invoked with empty skill", () => {
    const root = scratch();
    writeEval(root, "skill-a", {
      skill: "skill-a",
      evals: [
        {
          name: "e1",
          prompt: "p",
          assertions: [{ type: "skill_invoked", skill: "", description: "d" }],
        },
      ],
    });
    expect(() => loadEvalFile(root, "skill-a")).toThrow(/non-empty 'skill'/);
  });

  test("rejects mismatched skill field", () => {
    const root = scratch();
    writeEval(root, "skill-a", {
      skill: "wrong-name",
      evals: [{ name: "e1", prompt: "p", assertions: [{ type: "contains", value: "x", description: "d" }] }],
    });
    expect(() => loadEvalFile(root, "skill-a")).toThrow(/doesn't match directory/);
  });

  test("rejects empty evals array", () => {
    const root = scratch();
    writeEval(root, "skill-a", { skill: "skill-a", evals: [] });
    expect(() => loadEvalFile(root, "skill-a")).toThrow(/non-empty array/);
  });

  test("rejects bad regex pattern at load time", () => {
    const root = scratch();
    writeEval(root, "skill-a", {
      skill: "skill-a",
      evals: [
        {
          name: "e1",
          prompt: "p",
          assertions: [{ type: "regex", pattern: "(unclosed", description: "d" }],
        },
      ],
    });
    expect(() => loadEvalFile(root, "skill-a")).toThrow();
  });

  test("rejects contains assertion with empty value", () => {
    const root = scratch();
    writeEval(root, "skill-a", {
      skill: "skill-a",
      evals: [
        {
          name: "e1",
          prompt: "p",
          assertions: [{ type: "contains", value: "", description: "d" }],
        },
      ],
    });
    expect(() => loadEvalFile(root, "skill-a")).toThrow(/non-empty 'value'/);
  });

  test("rejects assertion missing description", () => {
    const root = scratch();
    writeEval(root, "skill-a", {
      skill: "skill-a",
      evals: [
        {
          name: "e1",
          prompt: "p",
          assertions: [{ type: "contains", value: "x" }],
        },
      ],
    });
    expect(() => loadEvalFile(root, "skill-a")).toThrow(/missing 'type' or 'description'/);
  });
});

describe("parseStreamJson()", () => {
  test("parses one event per line", () => {
    const raw = `{"type":"system","subtype":"init"}\n{"type":"result","result":"ok"}\n`;
    const events = parseStreamJson(raw);
    expect(events.length).toBe(2);
    expect(events[0]?.type).toBe("system");
    expect(events[1]?.result).toBe("ok");
  });

  test("skips blank lines and malformed JSON", () => {
    const raw = [
      `{"type":"system"}`,
      "",
      "   ",
      "this is not json",
      `{"type":"result","result":"r"}`,
    ].join("\n");
    const events = parseStreamJson(raw);
    expect(events.length).toBe(2);
    expect(events[1]?.result).toBe("r");
  });

  test("handles CRLF line endings", () => {
    const raw = `{"type":"a"}\r\n{"type":"b"}\r\n`;
    expect(parseStreamJson(raw).length).toBe(2);
  });

  test("empty input returns empty array", () => {
    expect(parseStreamJson("")).toEqual([]);
  });
});

describe("extractSignals()", () => {
  test("pulls finalText from result event", () => {
    const events = parseStreamJson(
      [
        `{"type":"assistant","message":{"content":[{"type":"text","text":"hello"}]}}`,
        `{"type":"result","result":"final answer"}`,
      ].join("\n"),
    );
    const s = extractSignals(events);
    expect(s.finalText).toBe("final answer");
  });

  test("falls back to concatenated assistant text when no result event", () => {
    const events = parseStreamJson(
      [
        `{"type":"assistant","message":{"content":[{"type":"text","text":"part one"}]}}`,
        `{"type":"assistant","message":{"content":[{"type":"text","text":"part two"}]}}`,
      ].join("\n"),
    );
    const s = extractSignals(events);
    expect(s.finalText).toBe("part one\npart two");
  });

  test("collects tool_use blocks across assistant messages", () => {
    const events = parseStreamJson(
      [
        `{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Read","input":{"file_path":"/x"}}]}}`,
        `{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Edit","input":{"file_path":"/y"}}]}}`,
      ].join("\n"),
    );
    const s = extractSignals(events);
    expect(s.toolUses.map((t) => t.name)).toEqual(["Read", "Edit"]);
    expect(s.toolUses[0]?.input.file_path).toBe("/x");
  });

  test("extracts skill invocations via input.skill", () => {
    const events = parseStreamJson(
      `{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Skill","input":{"skill":"define-the-problem"}}]}}`,
    );
    const s = extractSignals(events);
    expect(s.skillInvocations.length).toBe(1);
    expect(s.skillInvocations[0]?.skill).toBe("define-the-problem");
  });

  test("extracts skill invocations via input.name fallback", () => {
    const events = parseStreamJson(
      `{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Skill","input":{"name":"fat-marker-sketch"}}]}}`,
    );
    const s = extractSignals(events);
    expect(s.skillInvocations[0]?.skill).toBe("fat-marker-sketch");
  });

  test("non-Skill tool uses do not become skill invocations", () => {
    const events = parseStreamJson(
      `{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Bash","input":{"command":"ls"}}]}}`,
    );
    const s = extractSignals(events);
    expect(s.toolUses.length).toBe(1);
    expect(s.skillInvocations.length).toBe(0);
  });
});
