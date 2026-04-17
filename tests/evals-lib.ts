/**
 * Shared library for skill evals: schema loader, stream-json parser,
 * signal extractor, and assertion evaluator.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export type Assertion =
  | { type: "contains" | "not_contains"; value: string; description: string }
  | { type: "regex" | "not_regex"; pattern: string; flags?: string; description: string }
  | { type: "skill_invoked" | "not_skill_invoked"; skill: string; description: string };

declare const validatedBrand: unique symbol;

/**
 * An assertion that has passed `validateAssertion` (directly or via
 * `loadEvalFile`). `evaluate` only accepts this branded form so that the
 * non-empty-string / regex-compiles invariants cannot be bypassed at the
 * type level.
 */
export type ValidatedAssertion = Assertion & { readonly [validatedBrand]: true };

export interface Eval {
  name: string;
  summary?: string;
  prompt: string;
  assertions: Assertion[];
}

export interface EvalFile {
  skill: string;
  description?: string;
  evals: Array<Omit<Eval, "assertions"> & { assertions: ValidatedAssertion[] }>;
}

export type AssertionResult =
  | { ok: true; description: string }
  | { ok: false; description: string; detail: string };

/**
 * One parsed entry from `claude --print --output-format stream-json`.
 * Loosely typed because the CLI emits heterogeneous events — consumers
 * pick out the fields they care about via narrowing.
 */
export interface StreamEvent {
  type?: string;
  subtype?: string;
  message?: {
    content?: Array<{
      type: "text" | "tool_use" | (string & {});
      text?: string;
      name?: string;
      input?: Record<string, unknown>;
    }>;
  };
  result?: string;
  [key: string]: unknown;
}

export interface ToolUse {
  readonly name: string;
  readonly input: Record<string, unknown>;
}

export interface SkillInvocation {
  readonly skill: string;
  readonly raw: ToolUse & { readonly name: "Skill" };
}

/**
 * `terminalState` records how the stream ended so a reader can tell a healthy
 * tool-use-terminal run apart from a crash that died before emitting `result`:
 *   - `result`     — a `result` event was present; `finalText` is its content.
 *   - `assistant`  — no `result` event; `finalText` is concatenated assistant text.
 *   - `empty`      — neither; `finalText` is "".
 */
export interface Signals {
  readonly finalText: string;
  readonly toolUses: readonly ToolUse[];
  readonly skillInvocations: readonly SkillInvocation[];
  readonly terminalState: "result" | "assistant" | "empty";
}

function validateAssertion(a: Assertion, loc: string): ValidatedAssertion {
  if (!a.type || !a.description) {
    throw new Error(`${loc}: assertion missing 'type' or 'description'`);
  }
  switch (a.type) {
    case "contains":
    case "not_contains":
      if (typeof a.value !== "string" || a.value.length === 0) {
        throw new Error(`${loc}: ${a.type} assertion requires non-empty 'value' string`);
      }
      break;
    case "regex":
    case "not_regex":
      if (typeof a.pattern !== "string" || a.pattern.length === 0) {
        throw new Error(`${loc}: ${a.type} assertion requires non-empty 'pattern' string`);
      }
      // Surface bad patterns at load time, not at evaluate time.
      new RegExp(a.pattern, a.flags ?? "");
      break;
    case "skill_invoked":
    case "not_skill_invoked":
      if (typeof a.skill !== "string" || a.skill.length === 0) {
        throw new Error(`${loc}: ${a.type} assertion requires non-empty 'skill' string`);
      }
      break;
    default: {
      // Exhaustiveness: adding a new variant to `Assertion` without extending
      // the switch causes a type error here, not a silent fall-through.
      const exhaustive: never = a;
      throw new Error(`${loc}: unknown assertion type '${(exhaustive as { type: string }).type}'`);
    }
  }
  return a as ValidatedAssertion;
}

export function loadEvalFile(skillsDir: string, skillName: string): EvalFile | null {
  const file = join(skillsDir, skillName, "evals", "evals.json");
  if (!existsSync(file)) return null;
  const raw = readFileSync(file, "utf8");
  let parsed: { skill: string; description?: string; evals: Eval[] };
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`${file}: invalid JSON — ${(err as Error).message}`);
  }
  if (parsed.skill !== skillName) {
    throw new Error(`${file}: 'skill' field '${parsed.skill}' doesn't match directory '${skillName}'`);
  }
  if (!Array.isArray(parsed.evals) || parsed.evals.length === 0) {
    throw new Error(`${file}: 'evals' must be a non-empty array`);
  }
  for (const e of parsed.evals) {
    if (!e.name || !e.prompt || !Array.isArray(e.assertions) || e.assertions.length === 0) {
      throw new Error(`${file}: eval '${e.name ?? "(unnamed)"}' missing name/prompt/assertions`);
    }
    for (const a of e.assertions) {
      validateAssertion(a, `${file}: eval '${e.name}'`);
    }
  }
  return parsed as EvalFile;
}

export function discoverSkills(skillsDir: string): string[] {
  return readdirSync(skillsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(skillsDir, d.name, "evals", "evals.json")))
    .map((d) => d.name)
    .sort();
}

export interface ParseResult {
  readonly events: StreamEvent[];
  /** Non-empty lines that failed JSON.parse. Zero on a clean stream. */
  readonly skipped: number;
}

/**
 * Parse NDJSON produced by `claude --print --output-format stream-json`.
 * Non-empty lines that fail to parse are counted in `skipped` rather than
 * thrown — the CLI has historically interleaved informational output ahead
 * of the structured stream, and one bad line shouldn't fail a whole run.
 * The caller is responsible for treating a high skip ratio (or zero events)
 * as a run failure rather than a legitimate empty signal.
 */
export function parseStreamJson(raw: string): ParseResult {
  const events: StreamEvent[] = [];
  let skipped = 0;
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed) as StreamEvent);
    } catch {
      skipped++;
    }
  }
  return { events, skipped };
}

/**
 * Workarounds encoded here:
 *   - Runs that end on a tool_use produce no `result` event, so `finalText`
 *     falls back to concatenated assistant text. `terminalState` records
 *     which branch was taken.
 *   - The CLI has reported the skill name under both `input.skill` and
 *     `input.name` depending on version; we check both.
 *   - The tool-name match is exact (`name === "Skill"`). If the CLI ever
 *     namespaces or renames the tool, skill assertions will report "no
 *     skills invoked" — a failure mode to catch in review, not silently.
 */
export function extractSignals(events: StreamEvent[]): Signals {
  const toolUses: ToolUse[] = [];
  const assistantTextParts: string[] = [];
  let resultText: string | undefined;

  for (const ev of events) {
    if (ev.type === "result" && typeof ev.result === "string") {
      resultText = ev.result;
      continue;
    }
    if (ev.type === "assistant" && ev.message?.content) {
      for (const block of ev.message.content) {
        if (block.type === "text" && typeof block.text === "string") {
          assistantTextParts.push(block.text);
        } else if (block.type === "tool_use" && typeof block.name === "string") {
          toolUses.push({ name: block.name, input: block.input ?? {} });
        }
      }
    }
  }

  const skillInvocations: SkillInvocation[] = [];
  for (const tu of toolUses) {
    if (tu.name !== "Skill") continue;
    const skill = typeof tu.input.skill === "string"
      ? tu.input.skill
      : typeof tu.input.name === "string"
        ? tu.input.name
        : undefined;
    if (skill) {
      skillInvocations.push({ skill, raw: tu as ToolUse & { name: "Skill" } });
    }
  }

  let finalText: string;
  let terminalState: Signals["terminalState"];
  if (resultText !== undefined) {
    finalText = resultText;
    terminalState = "result";
  } else if (assistantTextParts.length > 0) {
    finalText = assistantTextParts.join("\n");
    terminalState = "assistant";
  } else {
    finalText = "";
    terminalState = "empty";
  }

  return { finalText, toolUses, skillInvocations, terminalState };
}

export function evaluate(assertion: ValidatedAssertion, signals: Signals): AssertionResult {
  const { description } = assertion;
  const fail = (detail: string): AssertionResult => ({ ok: false, description, detail });
  const pass = (): AssertionResult => ({ ok: true, description });

  switch (assertion.type) {
    case "contains":
      return signals.finalText.includes(assertion.value)
        ? pass()
        : fail(`expected substring: ${JSON.stringify(assertion.value)}`);
    case "not_contains":
      return signals.finalText.includes(assertion.value)
        ? fail(`forbidden substring present: ${JSON.stringify(assertion.value)}`)
        : pass();
    case "regex": {
      const re = new RegExp(assertion.pattern, assertion.flags ?? "");
      return re.test(signals.finalText)
        ? pass()
        : fail(`regex did not match: /${assertion.pattern}/${assertion.flags ?? ""}`);
    }
    case "not_regex": {
      const re = new RegExp(assertion.pattern, assertion.flags ?? "");
      return re.test(signals.finalText)
        ? fail(`forbidden regex matched: /${assertion.pattern}/${assertion.flags ?? ""}`)
        : pass();
    }
    case "skill_invoked":
      if (signals.skillInvocations.some((s) => s.skill === assertion.skill)) return pass();
      return fail(
        `Skill('${assertion.skill}') not invoked. Skills seen: ${
          signals.skillInvocations.length === 0
            ? "(none)"
            : signals.skillInvocations.map((s) => s.skill).join(", ")
        }`,
      );
    case "not_skill_invoked":
      return signals.skillInvocations.some((s) => s.skill === assertion.skill)
        ? fail(`forbidden Skill('${assertion.skill}') was invoked`)
        : pass();
  }
}

/**
 * Test-only helper: brand an `Assertion` as validated without going through
 * `loadEvalFile`. Production code should rely on `loadEvalFile` to produce
 * validated assertions; this exists so unit tests can construct them inline.
 */
export function brandForTest(a: Assertion): ValidatedAssertion {
  return validateAssertion(a, "test");
}
