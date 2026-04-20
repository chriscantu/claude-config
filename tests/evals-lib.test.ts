/**
 * Tests for the shared eval library — assertion evaluator, schema loader,
 * stream-json parser, and signal extractor.
 *
 * Skill response behaviour is exercised by running the runners against real
 * evals; this file covers the deterministic pieces.
 */

import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type Assertion,
  type Signals,
  type ChainSignals,
  type SkillInvocation,
  aggregateChainSignals,
  brandForTest as v,
  evaluate,
  evaluateChain,
  extractSessionId,
  extractSignals,
  loadEvalFile,
  metaCheck,
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
    const ev = loadEvalFile(root, "skill-a")?.evals[0];
    expect(ev?.kind).toBe("single");
    if (ev?.kind === "single") expect(ev.assertions[0]?.type).toBe("skill_invoked");
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

describe("validateAssertion() — multi-turn variants", () => {
  test("skill_invoked_in_turn — requires positive integer turn and non-empty skill", () => {
    expect(() => v({ type: "skill_invoked_in_turn", turn: 1, skill: "foo", description: "d" } as Assertion)).not.toThrow();
    expect(() => v({ type: "skill_invoked_in_turn", turn: 0, skill: "foo", description: "d" } as Assertion)).toThrow(/turn/);
    expect(() => v({ type: "skill_invoked_in_turn", turn: 1.5, skill: "foo", description: "d" } as Assertion)).toThrow(/turn/);
    expect(() => v({ type: "skill_invoked_in_turn", turn: -1, skill: "foo", description: "d" } as Assertion)).toThrow(/turn/);
    expect(() => v({ type: "skill_invoked_in_turn", turn: 1, skill: "", description: "d" } as Assertion)).toThrow(/skill/);
  });

  test("chain_order — requires non-empty array of non-empty skill names", () => {
    expect(() => v({ type: "chain_order", skills: ["a", "b", "c"], description: "d" } as Assertion)).not.toThrow();
    expect(() => v({ type: "chain_order", skills: [], description: "d" } as Assertion)).toThrow(/skills/);
    expect(() => v({ type: "chain_order", skills: ["a", ""], description: "d" } as Assertion)).toThrow(/skills/);
    expect(() => v({ type: "chain_order", skills: "a,b,c", description: "d" } as unknown as Assertion)).toThrow(/skills/);
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

describe("extractSessionId()", () => {
  test("returns session_id from the first system/init event", () => {
    const events = [
      { type: "system", subtype: "hook_started", session_id: "will-be-ignored" },
      { type: "system", subtype: "init", session_id: "abc-123", model: "claude-opus-4-6" },
      { type: "assistant", session_id: "abc-123", message: { content: [] } },
    ];
    expect(extractSessionId(events)).toBe("abc-123");
  });

  test("returns null when no init event exists", () => {
    const events = [{ type: "assistant", message: { content: [] } }];
    expect(extractSessionId(events)).toBeNull();
  });

  test("returns null when init event lacks a session_id", () => {
    const events = [{ type: "system", subtype: "init" }];
    expect(extractSessionId(events)).toBeNull();
  });

  test("init session_id takes precedence over earlier hook session_ids", () => {
    // Regression: the CLI emits hook_started/hook_response system events with
    // session_id BEFORE the canonical init event. The extractor must skip past
    // those to the init event, not return the first system session_id it sees.
    const events = [
      { type: "system", subtype: "hook_started", session_id: "hook-sid" },
      { type: "system", subtype: "hook_response", session_id: "hook-sid" },
      { type: "system", subtype: "init", session_id: "real-sid" },
    ];
    expect(extractSessionId(events)).toBe("real-sid");
  });
});

describe("loadEvalFile() — multi-turn schema", () => {
  function writeEval(body: unknown): string {
    const dir = mkdtempSync(join(tmpdir(), "evals-schema-"));
    const skillDir = join(dir, "my-skill", "evals");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "evals.json"), JSON.stringify(body));
    return dir;
  }

  test("loads a valid multi-turn eval with final_assertions", () => {
    const skillsDir = writeEval({
      skill: "my-skill",
      evals: [{
        name: "chained",
        turns: [
          { prompt: "t1", assertions: [{ type: "contains", value: "hi", description: "t1 ok" }] },
          { prompt: "t2", assertions: [{ type: "contains", value: "bye", description: "t2 ok" }] },
        ],
        final_assertions: [
          { type: "chain_order", skills: ["a", "b"], description: "chain order" },
        ],
      }],
    });
    const file = loadEvalFile(skillsDir, "my-skill");
    expect(file).not.toBeNull();
    const ev = file!.evals[0];
    expect(ev.kind).toBe("multi");
    if (ev.kind !== "multi") throw new Error("expected multi-turn eval");
    expect(ev.turns).toHaveLength(2);
    expect(ev.final_assertions).toHaveLength(1);
  });

  test("loads a single-turn eval (backward compat)", () => {
    const skillsDir = writeEval({
      skill: "my-skill",
      evals: [{
        name: "simple",
        prompt: "hello",
        assertions: [{ type: "contains", value: "hi", description: "ok" }],
      }],
    });
    const file = loadEvalFile(skillsDir, "my-skill");
    const ev = file!.evals[0];
    expect(ev.kind).toBe("single");
    if (ev.kind !== "single") throw new Error("expected single-turn eval");
    expect(ev.prompt).toBe("hello");
  });

  test("rejects an eval with both prompt and turns", () => {
    const skillsDir = writeEval({
      skill: "my-skill",
      evals: [{
        name: "ambiguous",
        prompt: "x",
        turns: [{ prompt: "y", assertions: [{ type: "contains", value: "z", description: "d" }] }],
        assertions: [{ type: "contains", value: "z", description: "d" }],
      }],
    });
    expect(() => loadEvalFile(skillsDir, "my-skill")).toThrow(/prompt.*turns|turns.*prompt/i);
  });

  test("rejects a multi-turn eval with an empty turns array", () => {
    const skillsDir = writeEval({
      skill: "my-skill",
      evals: [{ name: "empty-turns", turns: [] }],
    });
    expect(() => loadEvalFile(skillsDir, "my-skill")).toThrow(/turns/i);
  });

  test("rejects a multi-turn eval where a turn lacks prompt or assertions", () => {
    const skillsDir = writeEval({
      skill: "my-skill",
      evals: [{
        name: "bad-turn",
        turns: [{ prompt: "t1" }],
      }],
    });
    expect(() => loadEvalFile(skillsDir, "my-skill")).toThrow(/turn|assertions/i);
  });

  test("allows multi-turn eval with no final_assertions", () => {
    const skillsDir = writeEval({
      skill: "my-skill",
      evals: [{
        name: "no-final",
        turns: [
          { prompt: "t1", assertions: [{ type: "contains", value: "a", description: "d" }] },
        ],
      }],
    });
    const file = loadEvalFile(skillsDir, "my-skill");
    const ev = file!.evals[0];
    expect(ev.kind).toBe("multi");
    if (ev.kind !== "multi") throw new Error("expected multi-turn eval");
    expect(ev.final_assertions ?? []).toEqual([]);
  });

  test("rejects chain_order inside a per-turn assertions array", () => {
    // chain_order is a final-level assertion — it operates on the whole chain,
    // not a single turn. Putting it on a per-turn assertion is a user error.
    const skillsDir = writeEval({
      skill: "my-skill",
      evals: [{
        name: "misplaced-chain-order",
        turns: [{
          prompt: "t1",
          assertions: [{ type: "chain_order", skills: ["a"], description: "d" }],
        }],
      }],
    });
    expect(() => loadEvalFile(skillsDir, "my-skill")).toThrow(/chain_order|per-turn/i);
  });

  test("rejects skill_invoked_in_turn inside a per-turn assertions array", () => {
    // skill_invoked_in_turn targets a specific turn by index — using it inside
    // a turn's own assertions is redundant and wrong; use skill_invoked instead.
    const skillsDir = writeEval({
      skill: "my-skill",
      evals: [{
        name: "misplaced-in-turn",
        turns: [{
          prompt: "t1",
          assertions: [{ type: "skill_invoked_in_turn", turn: 1, skill: "x", description: "d" }],
        }],
      }],
    });
    expect(() => loadEvalFile(skillsDir, "my-skill")).toThrow(/skill_invoked_in_turn|per-turn/i);
  });

  test("rejects skill_invoked_in_turn with turn index > number of turns", () => {
    const skillsDir = writeEval({
      skill: "my-skill",
      evals: [{
        name: "oob-turn",
        turns: [
          { prompt: "t1", assertions: [{ type: "contains", value: "a", description: "d" }] },
        ],
        final_assertions: [
          { type: "skill_invoked_in_turn", turn: 3, skill: "x", description: "d" },
        ],
      }],
    });
    expect(() => loadEvalFile(skillsDir, "my-skill")).toThrow(/turn.*3|out of range/i);
  });

  test("rejects tool_input_matches inside final_assertions (it is a per-turn assertion)", () => {
    const skillsDir = writeEval({
      skill: "my-skill",
      evals: [{
        name: "misplaced-tool-input",
        turns: [
          { prompt: "t1", assertions: [{ type: "contains", value: "a", description: "d" }] },
        ],
        final_assertions: [
          { type: "tool_input_matches", tool: "Skill", input_key: "skill", input_value: "x", description: "d" },
        ],
      }],
    });
    expect(() => loadEvalFile(skillsDir, "my-skill")).toThrow(/tool_input_matches|per-turn/i);
  });

  // Regression guard: final_assertions must reject ALL per-turn assertion
  // variants, not just the one the reviewer happened to catch. Each case below
  // proves the guard fires for a distinct assertion type — a future refactor
  // that adds a new per-turn variant must extend the guard AND this test, or
  // the rejection regresses silently.
  test.each([
    ["contains",           { type: "contains",           value: "x",   description: "d" }],
    ["not_contains",       { type: "not_contains",       value: "x",   description: "d" }],
    ["regex",              { type: "regex",              pattern: "x", description: "d" }],
    ["not_regex",          { type: "not_regex",          pattern: "x", description: "d" }],
    ["skill_invoked",      { type: "skill_invoked",      skill: "x",   description: "d" }],
    ["not_skill_invoked",  { type: "not_skill_invoked",  skill: "x",   description: "d" }],
  ])("rejects %s inside final_assertions (per-turn assertion)", (typeName, bad) => {
    const skillsDir = writeEval({
      skill: "my-skill",
      evals: [{
        name: `misplaced-${typeName}`,
        turns: [
          { prompt: "t1", assertions: [{ type: "contains", value: "a", description: "d" }] },
        ],
        final_assertions: [bad],
      }],
    });
    expect(() => loadEvalFile(skillsDir, "my-skill")).toThrow(new RegExp(`${typeName}|per-turn`, "i"));
  });
});

describe("aggregateChainSignals()", () => {
  function inv(skill: string): SkillInvocation {
    return { skill, raw: { name: "Skill" as const, input: { skill } } };
  }

  test("per_turn preserves the full signal for each turn", () => {
    const t1: Signals = { finalText: "one", toolUses: [], skillInvocations: [inv("a")], terminalState: "result" };
    const t2: Signals = { finalText: "two", toolUses: [], skillInvocations: [inv("b"), inv("c")], terminalState: "result" };
    const chain = aggregateChainSignals([t1, t2]);
    expect(chain.per_turn).toHaveLength(2);
    expect(chain.per_turn[0]).toBe(t1);
  });

  test("per_turn_winner returns the first skill invocation per turn, or undefined if none fired", () => {
    const t1: Signals = { finalText: "", toolUses: [], skillInvocations: [inv("a"), inv("b")], terminalState: "result" };
    const t2: Signals = { finalText: "", toolUses: [], skillInvocations: [], terminalState: "result" };
    const t3: Signals = { finalText: "", toolUses: [], skillInvocations: [inv("c")], terminalState: "result" };
    const chain = aggregateChainSignals([t1, t2, t3]);
    expect(chain.per_turn_winner).toEqual(["a", undefined, "c"]);
  });

  test("empty chain returns empty per_turn and per_turn_winner", () => {
    // Edge case: aggregateChainSignals([]) must not throw and must produce a
    // well-formed ChainSignals with two empty arrays. evaluateChain relies on
    // this for chain_order expected-vs-actual length comparisons.
    const chain = aggregateChainSignals([]);
    expect(chain.per_turn).toEqual([]);
    expect(chain.per_turn_winner).toEqual([]);
  });
});

describe("evaluateChain()", () => {
  function inv(skill: string) { return { skill, raw: { name: "Skill" as const, input: { skill } } }; }
  function chainOf(winners: (string | undefined)[]): ChainSignals {
    return {
      per_turn: winners.map((w) => ({
        finalText: "",
        toolUses: [],
        skillInvocations: w ? [inv(w)] : [],
        terminalState: "result" as const,
      })),
      per_turn_winner: winners,
    };
  }

  test("skill_invoked_in_turn — passes when the turn's winner matches", () => {
    const a = v({ type: "skill_invoked_in_turn", turn: 2, skill: "systems-analysis", description: "d" });
    expect(evaluateChain(a, chainOf(["define-the-problem", "systems-analysis", "superpowers:brainstorming"])).ok).toBe(true);
  });

  test("skill_invoked_in_turn — also passes when the skill appears as a non-winner in the turn", () => {
    // A turn may invoke helpers besides the winner. If the target skill fired
    // in that turn at all, the assertion passes — the "in_turn" contract is
    // membership, not winnership. (chain_order uses winners; this does not.)
    const a = v({ type: "skill_invoked_in_turn", turn: 1, skill: "helper", description: "d" });
    const cs: ChainSignals = {
      per_turn: [{
        finalText: "",
        toolUses: [],
        skillInvocations: [inv("winner"), inv("helper")],
        terminalState: "result" as const,
      }],
      per_turn_winner: ["winner"],
    };
    expect(evaluateChain(a, cs).ok).toBe(true);
  });

  test("skill_invoked_in_turn — fails when the skill did not fire in that turn", () => {
    const a = v({ type: "skill_invoked_in_turn", turn: 2, skill: "fat-marker-sketch", description: "d" });
    const r = evaluateChain(a, chainOf(["define-the-problem", "systems-analysis"]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail).toMatch(/turn 2|systems-analysis/);
  });

  test("skill_invoked_in_turn — turn index beyond chain length reports distinct error", () => {
    const a = v({ type: "skill_invoked_in_turn", turn: 5, skill: "x", description: "d" });
    const r = evaluateChain(a, chainOf(["a", "b"]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail).toMatch(/out of range|only 2 turns/i);
  });

  test("chain_order — passes when per-turn winners match exactly", () => {
    const a = v({ type: "chain_order", skills: ["define-the-problem", "systems-analysis", "superpowers:brainstorming"], description: "d" });
    expect(evaluateChain(a, chainOf(["define-the-problem", "systems-analysis", "superpowers:brainstorming"])).ok).toBe(true);
  });

  test("chain_order — fails when order differs", () => {
    const a = v({ type: "chain_order", skills: ["define-the-problem", "systems-analysis"], description: "d" });
    const r = evaluateChain(a, chainOf(["systems-analysis", "define-the-problem"]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail).toMatch(/expected|actual/i);
  });

  test("chain_order — fails when a turn has no winner", () => {
    const a = v({ type: "chain_order", skills: ["a", "b"], description: "d" });
    const r = evaluateChain(a, chainOf(["a", undefined]));
    expect(r.ok).toBe(false);
  });

  test("chain_order — fails when chain length differs from expected length", () => {
    const a = v({ type: "chain_order", skills: ["a", "b", "c"], description: "d" });
    const r = evaluateChain(a, chainOf(["a", "b"]));
    expect(r.ok).toBe(false);
  });

  test("routing bug: called with per-turn assertion returns a runner-bug failure, not silent pass", () => {
    // Per-turn assertion types (e.g. skill_invoked) should go through
    // evaluate(), not evaluateChain(). If the runner ever routes them wrong,
    // we want an explicit failure that surfaces the bug rather than a
    // silently-passing chain. Guards against a future default-case relaxation.
    const a = v({ type: "skill_invoked", skill: "x", description: "d" });
    const r = evaluateChain(a, chainOf(["x"]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail).toMatch(/runner bug|non-chain/i);
  });
});

describe("evaluate() — routing guard", () => {
  test("called with chain-level assertion type returns a runner-bug failure", () => {
    // chain_order / skill_invoked_in_turn must be routed to evaluateChain, not
    // evaluate(). Guards against the single-turn runner accidentally consuming
    // a chain-level assertion if a schema validator bug ever let one through.
    const a = v({ type: "chain_order", skills: ["a"], description: "d" });
    const r = evaluate(a, { finalText: "", toolUses: [], skillInvocations: [], terminalState: "empty" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail).toMatch(/runner bug|chain-level/i);
  });
});

describe("assertion tier metadata", () => {
  function scratch(): string {
    return mkdtempSync(join(tmpdir(), "evals-tier-"));
  }
  function writeEval(root: string, skill: string, json: unknown): void {
    const dir = join(root, skill, "evals");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "evals.json"), JSON.stringify(json));
  }

  test("default tier is 'required' when omitted", () => {
    const root = scratch();
    writeEval(root, "skill-a", {
      skill: "skill-a",
      evals: [{
        name: "e1",
        prompt: "p",
        assertions: [{ type: "contains", value: "x", description: "d" }],
      }],
    });
    const ev = loadEvalFile(root, "skill-a")!.evals[0];
    if (ev.kind !== "single") throw new Error("expected single");
    expect(ev.assertions[0].tier).toBe("required");
  });

  test("explicit tier='diagnostic' is preserved", () => {
    const root = scratch();
    writeEval(root, "skill-a", {
      skill: "skill-a",
      evals: [{
        name: "e1",
        prompt: "p",
        assertions: [{ type: "contains", value: "x", description: "d", tier: "diagnostic" }],
      }],
    });
    const ev = loadEvalFile(root, "skill-a")!.evals[0];
    if (ev.kind !== "single") throw new Error("expected single");
    expect(ev.assertions[0].tier).toBe("diagnostic");
  });

  test("rejects unknown tier value", () => {
    const root = scratch();
    writeEval(root, "skill-a", {
      skill: "skill-a",
      evals: [{
        name: "e1",
        prompt: "p",
        assertions: [{ type: "contains", value: "x", description: "d", tier: "advisory" }],
      }],
    });
    expect(() => loadEvalFile(root, "skill-a")).toThrow(/tier/);
  });
});

describe("validateAssertion() — tool_input_matches", () => {
  test("accepts a well-formed tool_input_matches assertion", () => {
    expect(() => v({
      type: "tool_input_matches",
      tool: "Skill",
      input_key: "skill",
      input_value: "define-the-problem",
      description: "d",
    } as Assertion)).not.toThrow();
  });

  test("rejects empty tool", () => {
    expect(() => v({
      type: "tool_input_matches",
      tool: "",
      input_key: "skill",
      input_value: "x",
      description: "d",
    } as Assertion)).toThrow(/tool/);
  });

  test("rejects empty input_key", () => {
    expect(() => v({
      type: "tool_input_matches",
      tool: "Skill",
      input_key: "",
      input_value: "x",
      description: "d",
    } as Assertion)).toThrow(/input_key/);
  });

  test("rejects empty input_value", () => {
    expect(() => v({
      type: "tool_input_matches",
      tool: "Skill",
      input_key: "skill",
      input_value: "",
      description: "d",
    } as Assertion)).toThrow(/input_value/);
  });
});

describe("evaluate() — tool_input_matches", () => {
  function sigWithTools(tools: Array<{ name: string; input: Record<string, unknown> }>): Signals {
    return { finalText: "", toolUses: tools, skillInvocations: [], terminalState: "result" };
  }

  test("passes when a tool_use has the matching tool name + input key/value", () => {
    const a = v({
      type: "tool_input_matches",
      tool: "Skill",
      input_key: "skill",
      input_value: "define-the-problem",
      description: "d",
    } as Assertion);
    const s = sigWithTools([{ name: "Skill", input: { skill: "define-the-problem" } }]);
    expect(evaluate(a, s).ok).toBe(true);
  });

  test("fails when tool name matches but input_value differs", () => {
    const a = v({
      type: "tool_input_matches",
      tool: "Skill",
      input_key: "skill",
      input_value: "define-the-problem",
      description: "d",
    } as Assertion);
    const s = sigWithTools([{ name: "Skill", input: { skill: "systems-analysis" } }]);
    const r = evaluate(a, s);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail).toContain("define-the-problem");
  });

  test("fails when no tool_use has the matching tool name", () => {
    const a = v({
      type: "tool_input_matches",
      tool: "Skill",
      input_key: "skill",
      input_value: "x",
      description: "d",
    } as Assertion);
    const s = sigWithTools([{ name: "Bash", input: { command: "ls" } }]);
    expect(evaluate(a, s).ok).toBe(false);
  });

  test("passes when ANY of multiple tool_uses matches (membership, not uniqueness)", () => {
    const a = v({
      type: "tool_input_matches",
      tool: "Skill",
      input_key: "skill",
      input_value: "define-the-problem",
      description: "d",
    } as Assertion);
    const s = sigWithTools([
      { name: "Skill", input: { skill: "other" } },
      { name: "Skill", input: { skill: "define-the-problem" } },
    ]);
    expect(evaluate(a, s).ok).toBe(true);
  });

  test("fails when the input_key is present but not a string", () => {
    // Defensive: if the CLI ever emits input.skill as a non-string (e.g., null),
    // we must NOT coerce silently. Treat it as a mismatch.
    const a = v({
      type: "tool_input_matches",
      tool: "Skill",
      input_key: "skill",
      input_value: "x",
      description: "d",
    } as Assertion);
    const s = sigWithTools([{ name: "Skill", input: { skill: null as unknown as string } }]);
    expect(evaluate(a, s).ok).toBe(false);
  });
});

describe("metaCheck()", () => {
  function emptySig(): Signals {
    return { finalText: "", toolUses: [], skillInvocations: [], terminalState: "empty" };
  }
  function nonEmptySig(text = "hello"): Signals {
    return { finalText: text, toolUses: [], skillInvocations: [], terminalState: "result" };
  }

  test("required-tier positive pass → decisions=[pass], requiredOk=true", () => {
    const a = v({ type: "contains", value: "hi", description: "d" } as Assertion);
    const out = metaCheck({
      perTurn: [{ assertion: a, result: { ok: true, description: "d" }, signals: nonEmptySig("hi there"), turnIndex: 0 }],
      final: [],
    });
    expect(out.requiredOk).toBe(true);
    expect(out.silentFireCount).toBe(0);
    expect(out.decisions[0].kind).toBe("pass");
  });

  test("required-tier fail → decisions=[fail], requiredOk=false", () => {
    const a = v({ type: "contains", value: "hi", description: "d" } as Assertion);
    const out = metaCheck({
      perTurn: [{ assertion: a, result: { ok: false, description: "d", detail: "missed" }, signals: nonEmptySig("bye"), turnIndex: 0 }],
      final: [],
    });
    expect(out.requiredOk).toBe(false);
    expect(out.decisions[0].kind).toBe("fail");
  });

  test("required-tier not_contains that passes against EMPTY signals → silent_fire", () => {
    const a = v({ type: "not_contains", value: "forbidden", description: "d" } as Assertion);
    const out = metaCheck({
      perTurn: [{ assertion: a, result: { ok: true, description: "d" }, signals: emptySig(), turnIndex: 0 }],
      final: [],
    });
    expect(out.requiredOk).toBe(false);
    expect(out.silentFireCount).toBe(1);
    expect(out.decisions[0].kind).toBe("silent_fire");
  });

  test("required-tier not_skill_invoked that passes against zero skill invocations → silent_fire", () => {
    const a = v({ type: "not_skill_invoked", skill: "bad", description: "d" } as Assertion);
    const out = metaCheck({
      perTurn: [{ assertion: a, result: { ok: true, description: "d" }, signals: nonEmptySig("no tool uses"), turnIndex: 0 }],
      final: [],
    });
    expect(out.silentFireCount).toBe(1);
    expect(out.decisions[0].kind).toBe("silent_fire");
  });

  test("required-tier not_contains that passes against NON-empty signals → pass (real evidence)", () => {
    const a = v({ type: "not_contains", value: "forbidden", description: "d" } as Assertion);
    const out = metaCheck({
      perTurn: [{ assertion: a, result: { ok: true, description: "d" }, signals: nonEmptySig("safe content"), turnIndex: 0 }],
      final: [],
    });
    expect(out.silentFireCount).toBe(0);
    expect(out.decisions[0].kind).toBe("pass");
  });

  test("diagnostic-tier fail does NOT flip requiredOk", () => {
    const a = v({ type: "contains", value: "x", description: "d", tier: "diagnostic" } as Assertion);
    const out = metaCheck({
      perTurn: [{ assertion: a, result: { ok: false, description: "d", detail: "x missing" }, signals: nonEmptySig("y"), turnIndex: 0 }],
      final: [],
    });
    expect(out.requiredOk).toBe(true);
    expect(out.decisions[0].kind).toBe("fail");
    expect(out.decisions[0].tier).toBe("diagnostic");
  });

  test("diagnostic-tier not_contains against empty signals is NOT labelled silent_fire", () => {
    // Silent-fire relabelling is specifically a required-tier gate. Diagnostic
    // assertions are advisory; whether they fired is informational, not a gate.
    const a = v({ type: "not_contains", value: "forbidden", description: "d", tier: "diagnostic" } as Assertion);
    const out = metaCheck({
      perTurn: [{ assertion: a, result: { ok: true, description: "d" }, signals: emptySig(), turnIndex: 0 }],
      final: [],
    });
    expect(out.silentFireCount).toBe(0);
    expect(out.decisions[0].kind).toBe("pass");
  });

  test("final chain assertions are passed through the same tier policy", () => {
    const a = v({ type: "chain_order", skills: ["a"], description: "d" } as Assertion);
    const out = metaCheck({
      perTurn: [],
      final: [{
        assertion: a,
        result: { ok: false, description: "d", detail: "mismatch" },
      }],
    });
    expect(out.requiredOk).toBe(false);
    expect(out.decisions[0].kind).toBe("fail");
  });
});

describe("ValidatedAssertion tier invariant", () => {
  test("every loaded assertion has a defined tier (no optional)", () => {
    // Pin the invariant from the validator: after loadEvalFile, every
    // assertion has tier set to "required" | "diagnostic" — never undefined.
    // Downstream code (metaCheck, renderers) relies on this to avoid `??`
    // fallbacks that would hide a forgotten default.
    const root = mkdtempSync(join(tmpdir(), "evals-tier-invariant-"));
    const skillDir = join(root, "skill-a", "evals");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "evals.json"), JSON.stringify({
      skill: "skill-a",
      evals: [{
        name: "mixed",
        turns: [{
          prompt: "t1",
          assertions: [
            { type: "contains", value: "a", description: "d1" },
            { type: "contains", value: "b", description: "d2", tier: "diagnostic" },
          ],
        }],
        final_assertions: [
          { type: "chain_order", skills: ["x"], description: "d3" },
          { type: "skill_invoked_in_turn", turn: 1, skill: "y", description: "d4", tier: "diagnostic" },
        ],
      }],
    }));
    const file = loadEvalFile(root, "skill-a")!;
    const ev = file.evals[0];
    if (ev.kind !== "multi") throw new Error("expected multi-turn");
    for (const a of ev.turns[0].assertions) {
      expect(a.tier).toBeDefined();
      expect(["required", "diagnostic"]).toContain(a.tier);
    }
    for (const a of ev.final_assertions ?? []) {
      expect(a.tier).toBeDefined();
      expect(["required", "diagnostic"]).toContain(a.tier);
    }
  });
});

describe("tallyEval() + suiteOk()", () => {
  test("tallyEval reports evalPassed=true when requiredOk=true, counts pass decisions", () => {
    const a1 = v({ type: "contains", value: "x", description: "d1" } as Assertion);
    const a2 = v({ type: "contains", value: "y", description: "d2", tier: "diagnostic" } as Assertion);
    const out = metaCheck({
      perTurn: [
        { assertion: a1, result: { ok: true, description: "d1" }, signals: { finalText: "x", toolUses: [], skillInvocations: [], terminalState: "result" }, turnIndex: 0 },
        { assertion: a2, result: { ok: false, description: "d2", detail: "missed" }, signals: { finalText: "x", toolUses: [], skillInvocations: [], terminalState: "result" }, turnIndex: 0 },
      ],
      final: [],
    });
    const { tallyEval } = require("./evals-lib.ts") as typeof import("./evals-lib.ts");
    const t = tallyEval(out, 2);
    // Diagnostic-tier fail does NOT flip evalPassed — this is the load-bearing
    // property behind the exit-code fix. If this ever regresses, the runner
    // will start exiting 1 on diagnostic fails again.
    expect(t.evalPassed).toBe(true);
    expect(t.assertionCount).toBe(2);
    expect(t.passedAssertionCount).toBe(1);
    expect(t.silentFireCount).toBe(0);
  });

  test("tallyEval surfaces silentFireCount", () => {
    const a = v({ type: "not_contains", value: "forbidden", description: "d" } as Assertion);
    const out = metaCheck({
      perTurn: [{
        assertion: a,
        result: { ok: true, description: "d" },
        signals: { finalText: "", toolUses: [], skillInvocations: [], terminalState: "empty" },
        turnIndex: 0,
      }],
      final: [],
    });
    const { tallyEval } = require("./evals-lib.ts") as typeof import("./evals-lib.ts");
    const t = tallyEval(out, 1);
    expect(t.evalPassed).toBe(false);
    expect(t.silentFireCount).toBe(1);
    expect(t.passedAssertionCount).toBe(0);
  });

  test("suiteOk returns true only when every tally's evalPassed is true", () => {
    const { suiteOk } = require("./evals-lib.ts") as typeof import("./evals-lib.ts");
    expect(suiteOk([])).toBe(true);
    expect(suiteOk([
      { evalPassed: true,  assertionCount: 3, passedAssertionCount: 3, silentFireCount: 0 },
      { evalPassed: true,  assertionCount: 2, passedAssertionCount: 1, silentFireCount: 0 },
    ])).toBe(true);
    expect(suiteOk([
      { evalPassed: true,  assertionCount: 3, passedAssertionCount: 3, silentFireCount: 0 },
      { evalPassed: false, assertionCount: 2, passedAssertionCount: 2, silentFireCount: 0 },
    ])).toBe(false);
  });

  test("suiteOk(failing tally) is false — closes the decision-doc exit-code contract", () => {
    // Regression guard for the original bug: the old runner used
    // `passedAssertions === totalAssertions` which flipped exit 1 on diagnostic
    // fails. The new contract — suiteOk(tallies) — must hold even when an
    // eval has diagnostic fails but passed required-tier.
    const { suiteOk } = require("./evals-lib.ts") as typeof import("./evals-lib.ts");
    const diagnosticFailButRequiredPassed = {
      evalPassed: true,
      assertionCount: 5,
      passedAssertionCount: 3,
      silentFireCount: 0,
    };
    expect(suiteOk([diagnosticFailButRequiredPassed])).toBe(true);
  });
});

describe("planning.md stage markers contract", () => {
  test("rules/planning.md contains the canonical [Stage: ...] markers", () => {
    const planning = readFileSync(
      join(import.meta.dir, "..", "rules", "planning.md"),
      "utf8",
    );
    expect(planning).toContain("[Stage: Problem Definition]");
    expect(planning).toContain("[Stage: Systems Analysis]");
    expect(planning).toContain("[Stage: Solution Design]");
  });
});
