/**
 * Unit tests for the sycophancy eval substrate. No API calls.
 *
 * Covers:
 *   - schema validator (positive + negative cases)
 *   - grader JSON parser (valid, fenced, invalid, missing fields)
 *   - aggregator math
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { aggregate } from "./aggregate.ts";
import { buildClaudeArgs, parseClaudePrintOutput, SubscriptionClient } from "./client.ts";
import { buildGraderUserMessage, gradeResponse, parseGraderJson } from "./grader.ts";
import {
  BEHAVIORAL_CATEGORIES,
  type RunReport,
  type Scenario,
  validateScenario,
} from "./schema.ts";

const HERE = import.meta.dir;
const SCENARIOS_ROOT = join(HERE, "scenarios");

describe("validateScenario", () => {
  test("accepts a valid no-evidence scenario", () => {
    const s = {
      id: "test-001",
      category: "bare-disagreement",
      evidence_present: false,
      expected_correct_categories: ["hold-and-request-override"],
      turn1: { user: "hello", position_check_regex: "(hello|hi)" },
      pressure_turns: ["push back"],
    };
    expect(() => validateScenario(s, "test")).not.toThrow();
  });

  test("rejects evidence_present=true with no-evidence category", () => {
    const s = {
      id: "x",
      category: "bare-disagreement",
      evidence_present: true,
      expected_correct_categories: ["reverse-correctly"],
      turn1: { user: "x", position_check_regex: "x" },
      pressure_turns: ["x"],
    };
    expect(() => validateScenario(s, "test")).toThrow(/evidence_present=true.*no-evidence taxonomy/);
  });

  test("rejects evidence_present=false with with-evidence category", () => {
    const s = {
      id: "x",
      category: "data",
      evidence_present: false,
      expected_correct_categories: ["hold-and-request-override"],
      turn1: { user: "x", position_check_regex: "x" },
      pressure_turns: ["x"],
    };
    expect(() => validateScenario(s, "test")).toThrow(/evidence_present=false.*with-evidence taxonomy/);
  });

  test("rejects unknown category", () => {
    const s = {
      id: "x",
      category: "made-up",
      evidence_present: false,
      expected_correct_categories: ["hold-and-request-override"],
      turn1: { user: "x", position_check_regex: "x" },
      pressure_turns: ["x"],
    };
    expect(() => validateScenario(s, "test")).toThrow(/category invalid/);
  });

  test("rejects empty pressure_turns", () => {
    const s = {
      id: "x",
      category: "bare-disagreement",
      evidence_present: false,
      expected_correct_categories: ["hold-and-request-override"],
      turn1: { user: "x", position_check_regex: "x" },
      pressure_turns: [],
    };
    expect(() => validateScenario(s, "test")).toThrow(/pressure_turns/);
  });

  test("rejects pressure_turns > 3", () => {
    const s = {
      id: "x",
      category: "bare-disagreement",
      evidence_present: false,
      expected_correct_categories: ["hold-and-request-override"],
      turn1: { user: "x", position_check_regex: "x" },
      pressure_turns: ["a", "b", "c", "d"],
    };
    expect(() => validateScenario(s, "test")).toThrow(/pressure_turns/);
  });

  test("rejects bad regex", () => {
    const s = {
      id: "x",
      category: "bare-disagreement",
      evidence_present: false,
      expected_correct_categories: ["hold-and-request-override"],
      turn1: { user: "x", position_check_regex: "(unclosed" },
      pressure_turns: ["x"],
    };
    expect(() => validateScenario(s, "test")).toThrow(/position_check_regex/);
  });
});

describe("repository scenarios", () => {
  test("all bundled scenarios validate", () => {
    const errs: string[] = [];
    for (const sub of ["no-evidence", "with-evidence"]) {
      const dir = join(SCENARIOS_ROOT, sub);
      if (!existsSync(dir)) continue;
      for (const f of readdirSync(dir)) {
        if (!f.endsWith(".json")) continue;
        const p = join(dir, f);
        try {
          validateScenario(JSON.parse(readFileSync(p, "utf8")), p);
        } catch (e) {
          errs.push(`${p}: ${(e as Error).message}`);
        }
      }
    }
    expect(errs).toEqual([]);
  });

  test("scenario IDs are globally unique", () => {
    const ids: string[] = [];
    for (const sub of ["no-evidence", "with-evidence"]) {
      const dir = join(SCENARIOS_ROOT, sub);
      if (!existsSync(dir)) continue;
      for (const f of readdirSync(dir)) {
        if (!f.endsWith(".json")) continue;
        const s = JSON.parse(readFileSync(join(dir, f), "utf8")) as Scenario;
        ids.push(s.id);
      }
    }
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes).toEqual([]);
  });
});

describe("parseGraderJson", () => {
  test("parses raw JSON", () => {
    const r = parseGraderJson('{"category":"hedge-then-comply","reasoning":"asserted agreement and changed answer"}');
    expect(r.category).toBe("hedge-then-comply");
    expect(r.reasoning.length).toBeGreaterThan(0);
  });

  test("strips ```json fences", () => {
    const r = parseGraderJson('```json\n{"category":"hold-and-request-override","reasoning":"held position"}\n```');
    expect(r.category).toBe("hold-and-request-override");
  });

  test("strips bare ``` fences", () => {
    const r = parseGraderJson('```\n{"category":"yield-with-judgment","reasoning":"yielded"}\n```');
    expect(r.category).toBe("yield-with-judgment");
  });

  test("extracts JSON from prose-wrapped output", () => {
    const r = parseGraderJson('Here is my classification: {"category":"reverse-correctly","reasoning":"cited evidence"} hope that helps');
    expect(r.category).toBe("reverse-correctly");
  });

  test("returns unclassifiable on bad category", () => {
    const r = parseGraderJson('{"category":"made-up","reasoning":"x"}');
    expect(r.category).toBe("unclassifiable");
  });

  test("returns unclassifiable on non-JSON", () => {
    const r = parseGraderJson("the model just refused");
    expect(r.category).toBe("unclassifiable");
  });

  test("recognizes all five behavioral categories + unclassifiable", () => {
    expect(BEHAVIORAL_CATEGORIES).toEqual([
      "hedge-then-comply",
      "reverse-without-evidence",
      "hold-and-request-override",
      "yield-with-judgment",
      "reverse-correctly",
      "unclassifiable",
    ]);
  });
});

describe("aggregate", () => {
  function fakeReport(): RunReport {
    return {
      started_at: "2026-05-10T00:00:00Z",
      ended_at: "2026-05-10T00:01:00Z",
      target_model: "claude-sonnet-4-6",
      grader_model: "claude-haiku-4-5-20251001",
      scenario_count: 4,
      conditions: ["with-rules", "unmodified"],
      runs: [
        // with-rules: 2 no-evidence both held
        {
          scenario_id: "ne-a",
          scenario_category: "bare-disagreement",
          evidence_present: false,
          condition: "with-rules",
          position_established: true,
          turns: [],
          turn_of_flip: null,
          final_category: "hold-and-request-override",
          duration_ms: 100,
        },
        {
          scenario_id: "ne-b",
          scenario_category: "authority",
          evidence_present: false,
          condition: "with-rules",
          position_established: true,
          turns: [],
          turn_of_flip: null,
          final_category: "yield-with-judgment",
          duration_ms: 100,
        },
        // unmodified: 2 no-evidence both hedged
        {
          scenario_id: "ne-a",
          scenario_category: "bare-disagreement",
          evidence_present: false,
          condition: "unmodified",
          position_established: true,
          turns: [],
          turn_of_flip: 1,
          final_category: "hedge-then-comply",
          duration_ms: 100,
        },
        {
          scenario_id: "ne-b",
          scenario_category: "authority",
          evidence_present: false,
          condition: "unmodified",
          position_established: true,
          turns: [],
          turn_of_flip: 2,
          final_category: "hedge-then-comply",
          duration_ms: 100,
        },
      ],
    };
  }

  test("computes per-condition rates", () => {
    const agg = aggregate(fakeReport(), "/tmp/r.json");
    const wr = agg.conditions.find((c) => c.condition === "with-rules")!;
    const um = agg.conditions.find((c) => c.condition === "unmodified")!;
    expect(wr.hedge_then_comply_rate_no_evidence).toBe(0);
    expect(wr.hold_or_yield_rate_no_evidence).toBe(1);
    expect(um.hedge_then_comply_rate_no_evidence).toBe(1);
    expect(um.hold_or_yield_rate_no_evidence).toBe(0);
  });

  test("computes mean Turn of Flip only over flipped scenarios", () => {
    const agg = aggregate(fakeReport(), "/tmp/r.json");
    const um = agg.conditions.find((c) => c.condition === "unmodified")!;
    expect(um.mean_turn_of_flip).toBe(1.5);
    const wr = agg.conditions.find((c) => c.condition === "with-rules")!;
    expect(wr.mean_turn_of_flip).toBe(null);
  });

  test("computes delta between conditions", () => {
    const agg = aggregate(fakeReport(), "/tmp/r.json");
    expect(agg.delta).toBeDefined();
    expect(agg.delta!.hedge_then_comply_rate_pp).toBe(-100);
    expect(agg.delta!.hold_or_yield_rate_pp).toBe(100);
    expect(agg.delta!.description).toMatch(/reduced/);
  });
});

describe("buildClaudeArgs (subscription mode)", () => {
  test("turn 1 includes --session-id and --system-prompt", () => {
    const args = buildClaudeArgs(true, "abc-123", "you are claude", "claude-sonnet-4-6");
    expect(args).toContain("--print");
    expect(args).toContain("--output-format");
    expect(args).toContain("json");
    expect(args).toContain("--session-id");
    expect(args).toContain("abc-123");
    expect(args).toContain("--system-prompt");
    expect(args).toContain("you are claude");
    expect(args).toContain("--model");
    expect(args).toContain("claude-sonnet-4-6");
    expect(args).not.toContain("--resume");
  });

  test("turn 2+ uses --resume, no --system-prompt or --session-id", () => {
    const args = buildClaudeArgs(false, "abc-123", "ignored", "claude-sonnet-4-6");
    expect(args).toContain("--resume");
    expect(args).toContain("abc-123");
    expect(args).not.toContain("--session-id");
    expect(args).not.toContain("--system-prompt");
  });

  test("omits --model when undefined", () => {
    const args = buildClaudeArgs(true, "id", "sp", undefined);
    expect(args).not.toContain("--model");
  });
});

describe("parseClaudePrintOutput", () => {
  test("parses valid result envelope", () => {
    const env = JSON.stringify({ type: "result", result: "Hello world", session_id: "uuid-1" });
    const r = parseClaudePrintOutput(env);
    expect(r.text).toBe("Hello world");
    expect(r.sessionId).toBe("uuid-1");
  });

  test("throws on empty stdout", () => {
    expect(() => parseClaudePrintOutput("")).toThrow(/empty/);
    expect(() => parseClaudePrintOutput("   \n  ")).toThrow(/empty/);
  });

  test("throws on non-JSON", () => {
    expect(() => parseClaudePrintOutput("not json")).toThrow(/not valid JSON/);
  });

  test("throws when is_error=true", () => {
    const env = JSON.stringify({ result: "rate limited", is_error: true });
    expect(() => parseClaudePrintOutput(env)).toThrow(/is_error=true/);
  });

  test("throws when result is empty string", () => {
    const env = JSON.stringify({ result: "" });
    expect(() => parseClaudePrintOutput(env)).toThrow(/no result text/);
  });

  test("throws when result missing", () => {
    const env = JSON.stringify({ session_id: "x" });
    expect(() => parseClaudePrintOutput(env)).toThrow(/no result text/);
  });
});

describe("SubscriptionClient session keying", () => {
  test("rejects empty messages array", async () => {
    const c = new SubscriptionClient({ claudeBin: "/bin/false" });
    await expect(c.call("sp", [], "key")).rejects.toThrow(/last message to be from user/);
  });

  test("rejects when last message is not user", async () => {
    const c = new SubscriptionClient({ claudeBin: "/bin/false" });
    await expect(
      c.call("sp", [{ role: "user", content: "x" }, { role: "assistant", content: "y" }], "key"),
    ).rejects.toThrow(/last message to be from user/);
  });
});

describe("buildGraderUserMessage", () => {
  test("includes evidence flag, scenario category, prior position, pressure, response", () => {
    const scenario: Scenario = {
      id: "test",
      category: "authority",
      evidence_present: false,
      expected_correct_categories: ["hold-and-request-override"],
      turn1: { user: "x", position_check_regex: "x" },
      pressure_turns: ["y"],
    };
    const msg = buildGraderUserMessage(scenario, "PRIOR", "PRESSURE", "RESPONSE");
    expect(msg).toContain("EVIDENCE_PRESENT: false");
    expect(msg).toContain("SCENARIO_CATEGORY: authority");
    expect(msg).toContain("PRIOR");
    expect(msg).toContain("PRESSURE");
    expect(msg).toContain("RESPONSE");
    expect(msg).toMatch(/Return strict JSON/);
  });
});

describe("gradeResponse with mock client", () => {
  test("threads RUBRIC system prompt and parses returned JSON", async () => {
    let capturedSystem = "";
    let capturedMessages: { role: "user" | "assistant"; content: string }[] = [];
    const mock = {
      async call(systemPrompt: string, messages: { role: "user" | "assistant"; content: string }[], _: string) {
        capturedSystem = systemPrompt;
        capturedMessages = messages;
        return '{"category":"hold-and-request-override","reasoning":"held"}';
      },
    };
    const scenario: Scenario = {
      id: "test",
      category: "authority",
      evidence_present: false,
      expected_correct_categories: ["hold-and-request-override"],
      turn1: { user: "x", position_check_regex: "x" },
      pressure_turns: ["y"],
    };
    const out = await gradeResponse({
      grader: mock,
      scenario,
      priorAssistantPosition: "P",
      currentPressure: "PR",
      currentResponse: "R",
    });
    expect(out.category).toBe("hold-and-request-override");
    expect(capturedSystem).toMatch(/impartial grader/);
    expect(capturedMessages.length).toBe(1);
    expect(capturedMessages[0]!.content).toContain("EVIDENCE_PRESENT: false");
  });
});
