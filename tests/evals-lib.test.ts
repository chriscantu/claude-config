/**
 * Tests for the shared eval library — assertion evaluator, schema loader,
 * stream-json parser, and signal extractor.
 *
 * Skill response behaviour is exercised by running the runners against real
 * evals; this file covers the deterministic pieces.
 */

import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type Assertion,
  type Signals,
  brandForTest as v,
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
    terminalState: extra?.terminalState ?? (finalText === "" ? "empty" : "assistant"),
  };
}

describe("evaluate()", () => {
  test("contains — matches substring", () => {
    const a = v({ type: "contains", value: "red flag", description: "finds red flag" });
    expect(evaluate(a, sig("this has a red flag in it")).ok).toBe(true);
    expect(evaluate(a, sig("no match here")).ok).toBe(false);
  });

  test("contains — treats value as literal, not regex", () => {
    const a = v({ type: "contains", value: ".*", description: "literal dot-star" });
    expect(evaluate(a, sig("has a .* substring")).ok).toBe(true);
    expect(evaluate(a, sig("anything else")).ok).toBe(false);
  });

  test("not_contains — fails when substring present", () => {
    const a = v({ type: "not_contains", value: "schema:", description: "no schema" });
    expect(evaluate(a, sig("schema: users")).ok).toBe(false);
    expect(evaluate(a, sig("no forbidden text")).ok).toBe(true);
  });

  test("regex — case-insensitive flag", () => {
    const a = v({ type: "regex", pattern: "Red.?Flag", flags: "i", description: "red flag i-flag" });
    expect(evaluate(a, sig("RED FLAG detected")).ok).toBe(true);
    expect(evaluate(a, sig("no flags here")).ok).toBe(false);
  });

  test("regex — no flags falls back to empty", () => {
    const a = v({ type: "regex", pattern: "^exact$", description: "exact match, no flags" });
    expect(evaluate(a, sig("exact")).ok).toBe(true);
    expect(evaluate(a, sig("Exact")).ok).toBe(false);
  });

  test("not_regex — fails when pattern matches", () => {
    const a = v({ type: "not_regex", pattern: "^question 1", flags: "im", description: "no Q1 header" });
    expect(evaluate(a, sig("Question 1: who has this problem?")).ok).toBe(false);
    expect(evaluate(a, sig("just prose, no numbered questions")).ok).toBe(true);
  });

  test("skill_invoked — matches invocation by skill name", () => {
    const a = v({ type: "skill_invoked", skill: "define-the-problem", description: "d" });
    const signals = sig("", {
      skillInvocations: [
        { skill: "define-the-problem", raw: { name: "Skill", input: { skill: "define-the-problem" } } },
      ],
    });
    expect(evaluate(a, signals).ok).toBe(true);
    expect(evaluate(a, sig("")).ok).toBe(false);
  });

  test("skill_invoked — failure detail lists skills seen", () => {
    const a = v({ type: "skill_invoked", skill: "target-skill", description: "d" });
    const signals = sig("", {
      skillInvocations: [
        { skill: "other-skill", raw: { name: "Skill", input: { skill: "other-skill" } } },
      ],
    });
    const r = evaluate(a, signals);
    expect(r.ok).toBe(false);
    // Discriminated union: detail is guaranteed on failure.
    if (!r.ok) expect(r.detail).toContain("other-skill");
  });

  test("not_skill_invoked — fails when forbidden skill was invoked", () => {
    const a = v({ type: "not_skill_invoked", skill: "forbidden", description: "d" });
    const signals = sig("", {
      skillInvocations: [
        { skill: "forbidden", raw: { name: "Skill", input: { skill: "forbidden" } } },
      ],
    });
    expect(evaluate(a, signals).ok).toBe(false);
    expect(evaluate(a, sig("")).ok).toBe(true);
  });

  test("contains against empty finalText fails cleanly", () => {
    const a = v({ type: "contains", value: "anything", description: "d" });
    const r = evaluate(a, sig(""));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail).toContain("anything");
  });

  test("failing assertion surfaces detail", () => {
    const a = v({ type: "contains", value: "missing", description: "d" });
    const r = evaluate(a, sig("not present"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail).toContain("missing");
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

  function writeRaw(root: string, skill: string, raw: string): void {
    const dir = join(root, skill, "evals");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "evals.json"), raw);
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

  test("rejects not_skill_invoked with empty skill", () => {
    const root = scratch();
    writeEval(root, "skill-a", {
      skill: "skill-a",
      evals: [
        {
          name: "e1",
          prompt: "p",
          assertions: [{ type: "not_skill_invoked", skill: "", description: "d" }],
        },
      ],
    });
    expect(() => loadEvalFile(root, "skill-a")).toThrow(/non-empty 'skill'/);
  });

  test("rejects not_contains with empty value", () => {
    const root = scratch();
    writeEval(root, "skill-a", {
      skill: "skill-a",
      evals: [
        {
          name: "e1",
          prompt: "p",
          assertions: [{ type: "not_contains", value: "", description: "d" }],
        },
      ],
    });
    expect(() => loadEvalFile(root, "skill-a")).toThrow(/non-empty 'value'/);
  });

  test("rejects unknown assertion type", () => {
    const root = scratch();
    writeEval(root, "skill-a", {
      skill: "skill-a",
      evals: [
        {
          name: "e1",
          prompt: "p",
          assertions: [{ type: "bogus", description: "d" } as unknown as Assertion],
        },
      ],
    });
    expect(() => loadEvalFile(root, "skill-a")).toThrow(/unknown assertion type/);
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

  test("rejects eval missing name", () => {
    const root = scratch();
    writeEval(root, "skill-a", {
      skill: "skill-a",
      evals: [{ prompt: "p", assertions: [{ type: "contains", value: "x", description: "d" }] }],
    });
    expect(() => loadEvalFile(root, "skill-a")).toThrow(/missing name\/prompt\/assertions/);
  });

  test("rejects eval missing prompt", () => {
    const root = scratch();
    writeEval(root, "skill-a", {
      skill: "skill-a",
      evals: [{ name: "e1", assertions: [{ type: "contains", value: "x", description: "d" }] }],
    });
    expect(() => loadEvalFile(root, "skill-a")).toThrow(/missing name\/prompt\/assertions/);
  });

  test("rejects eval missing assertions array", () => {
    const root = scratch();
    writeEval(root, "skill-a", { skill: "skill-a", evals: [{ name: "e1", prompt: "p" }] });
    expect(() => loadEvalFile(root, "skill-a")).toThrow(/missing name\/prompt\/assertions/);
  });

  test("rejects invalid JSON with file path in error", () => {
    const root = scratch();
    writeRaw(root, "skill-a", "not json at all");
    expect(() => loadEvalFile(root, "skill-a")).toThrow(/skill-a.*invalid JSON/);
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
  test("parses one event per line, reports zero skipped", () => {
    const raw = `{"type":"system","subtype":"init"}\n{"type":"result","result":"ok"}\n`;
    const { events, skipped } = parseStreamJson(raw);
    expect(events.length).toBe(2);
    expect(skipped).toBe(0);
    expect(events[0]?.type).toBe("system");
    expect(events[1]?.result).toBe("ok");
  });

  test("counts skipped non-JSON lines", () => {
    const raw = [
      `{"type":"system"}`,
      "this is not json",
      `{"type":"result","result":"r"}`,
    ].join("\n");
    const { events, skipped } = parseStreamJson(raw);
    expect(events.length).toBe(2);
    expect(skipped).toBe(1);
  });

  test("blank lines do not count toward skipped", () => {
    const raw = `{"type":"a"}\n\n   \n{"type":"b"}\n`;
    const { events, skipped } = parseStreamJson(raw);
    expect(events.length).toBe(2);
    expect(skipped).toBe(0);
  });

  test("concatenated JSON on one line is counted as a skip, not silently accepted", () => {
    // Two JSON objects on a single line — pins the contract: the parser does
    // NOT try to recover; it reports the line as unparseable.
    const raw = `{"type":"a"}{"type":"b"}\n`;
    const { events, skipped } = parseStreamJson(raw);
    expect(events.length).toBe(0);
    expect(skipped).toBe(1);
  });

  test("handles CRLF line endings", () => {
    const { events, skipped } = parseStreamJson(`{"type":"a"}\r\n{"type":"b"}\r\n`);
    expect(events.length).toBe(2);
    expect(skipped).toBe(0);
  });

  test("empty input returns zero of both", () => {
    expect(parseStreamJson("")).toEqual({ events: [], skipped: 0 });
  });
});

describe("extractSignals()", () => {
  test("pulls finalText from result event and records terminalState=result", () => {
    const { events } = parseStreamJson(
      [
        `{"type":"assistant","message":{"content":[{"type":"text","text":"hello"}]}}`,
        `{"type":"result","result":"final answer"}`,
      ].join("\n"),
    );
    const s = extractSignals(events);
    expect(s.finalText).toBe("final answer");
    expect(s.terminalState).toBe("result");
  });

  test("falls back to concatenated assistant text with terminalState=assistant", () => {
    const { events } = parseStreamJson(
      [
        `{"type":"assistant","message":{"content":[{"type":"text","text":"part one"}]}}`,
        `{"type":"assistant","message":{"content":[{"type":"text","text":"part two"}]}}`,
      ].join("\n"),
    );
    const s = extractSignals(events);
    expect(s.finalText).toBe("part one\npart two");
    expect(s.terminalState).toBe("assistant");
  });

  test("no text and no result yields terminalState=empty", () => {
    const { events } = parseStreamJson(
      `{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Read","input":{"file_path":"/x"}}]}}`,
    );
    const s = extractSignals(events);
    expect(s.finalText).toBe("");
    expect(s.terminalState).toBe("empty");
    expect(s.toolUses.length).toBe(1);
  });

  test("collects tool_use blocks across assistant messages", () => {
    const { events } = parseStreamJson(
      [
        `{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Read","input":{"file_path":"/x"}}]}}`,
        `{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Edit","input":{"file_path":"/y"}}]}}`,
      ].join("\n"),
    );
    const s = extractSignals(events);
    expect(s.toolUses.map((t) => t.name)).toEqual(["Read", "Edit"]);
    expect(s.toolUses[0]?.input.file_path).toBe("/x");
  });

  test("tool_use with missing input does not throw and yields empty input object", () => {
    const { events } = parseStreamJson(
      `{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Skill"}]}}`,
    );
    const s = extractSignals(events);
    expect(s.toolUses[0]?.input).toEqual({});
    expect(s.skillInvocations.length).toBe(0);
  });

  test("extracts skill invocations via input.skill", () => {
    const { events } = parseStreamJson(
      `{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Skill","input":{"skill":"define-the-problem"}}]}}`,
    );
    const s = extractSignals(events);
    expect(s.skillInvocations.length).toBe(1);
    expect(s.skillInvocations[0]?.skill).toBe("define-the-problem");
  });

  test("extracts skill invocations via input.name fallback", () => {
    const { events } = parseStreamJson(
      `{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Skill","input":{"name":"fat-marker-sketch"}}]}}`,
    );
    const s = extractSignals(events);
    expect(s.skillInvocations[0]?.skill).toBe("fat-marker-sketch");
  });

  test("Skill tool_use with neither skill nor name key yields no invocation", () => {
    // Guards the fallback-chain: a future refactor that drops the dual-key
    // lookup would start silently losing skill invocations without this test.
    const { events } = parseStreamJson(
      `{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Skill","input":{"other":"x"}}]}}`,
    );
    const s = extractSignals(events);
    expect(s.toolUses.length).toBe(1);
    expect(s.skillInvocations.length).toBe(0);
  });

  test("non-Skill tool uses do not become skill invocations", () => {
    const { events } = parseStreamJson(
      `{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Bash","input":{"command":"ls"}}]}}`,
    );
    const s = extractSignals(events);
    expect(s.toolUses.length).toBe(1);
    expect(s.skillInvocations.length).toBe(0);
  });

  test("no events at all yields terminalState=empty", () => {
    const s = extractSignals([]);
    expect(s.finalText).toBe("");
    expect(s.terminalState).toBe("empty");
    expect(s.toolUses.length).toBe(0);
    expect(s.skillInvocations.length).toBe(0);
  });
});
