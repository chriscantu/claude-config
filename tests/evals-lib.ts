/**
 * Shared eval library — loaded by the v2 runner (stream-json path).
 *
 * v1 runs its own local copy; this lib is where the v2 path evolves independently
 * while #86 is in flight.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export type Assertion =
  | { type: "contains" | "not_contains"; value: string; description: string }
  | { type: "regex" | "not_regex"; pattern: string; flags?: string; description: string }
  | { type: "skill_invoked" | "not_skill_invoked"; skill: string; description: string };

export interface Eval {
  name: string;
  summary?: string;
  prompt: string;
  assertions: Assertion[];
}

export interface EvalFile {
  skill: string;
  description?: string;
  evals: Eval[];
}

export interface AssertionResult {
  ok: boolean;
  description: string;
  detail?: string;
}

/**
 * One parsed entry from `claude --print --output-format stream-json`.
 * The CLI emits a heterogeneous JSON-per-line stream; we keep events
 * loosely typed and pull the few fields we care about in `extractSignals`.
 */
export interface StreamEvent {
  type?: string;
  subtype?: string;
  message?: {
    content?: Array<{
      type: string;
      text?: string;
      name?: string;
      input?: Record<string, unknown>;
    }>;
  };
  result?: string;
  // permissive for fields we don't explicitly consume
  [key: string]: unknown;
}

export interface ToolUse {
  name: string;
  input: Record<string, unknown>;
}

export interface SkillInvocation {
  skill: string;
  raw: ToolUse;
}

/**
 * Deterministic signals extracted from a stream-json transcript.
 * Assertions run against these — not against raw CLI stdout text.
 */
export interface Signals {
  finalText: string;
  toolUses: ToolUse[];
  skillInvocations: SkillInvocation[];
}

export function loadEvalFile(skillsDir: string, skillName: string): EvalFile | null {
  const file = join(skillsDir, skillName, "evals", "evals.json");
  if (!existsSync(file)) return null;
  const raw = readFileSync(file, "utf8");
  let parsed: EvalFile;
  try {
    parsed = JSON.parse(raw) as EvalFile;
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
    for (const a of e.assertions as Assertion[]) {
      if (!a.type || !a.description) {
        throw new Error(`${file}: eval '${e.name}' has assertion missing 'type' or 'description'`);
      }
      if (a.type === "contains" || a.type === "not_contains") {
        if (typeof a.value !== "string" || a.value.length === 0) {
          throw new Error(`${file}: eval '${e.name}' ${a.type} assertion requires non-empty 'value' string`);
        }
      } else if (a.type === "regex" || a.type === "not_regex") {
        if (typeof a.pattern !== "string" || a.pattern.length === 0) {
          throw new Error(`${file}: eval '${e.name}' ${a.type} assertion requires non-empty 'pattern' string`);
        }
        new RegExp(a.pattern, a.flags ?? "");
      } else if (a.type === "skill_invoked" || a.type === "not_skill_invoked") {
        if (typeof a.skill !== "string" || a.skill.length === 0) {
          throw new Error(`${file}: eval '${e.name}' ${a.type} assertion requires non-empty 'skill' string`);
        }
      } else {
        throw new Error(`${file}: eval '${e.name}' has unknown assertion type '${(a as { type: string }).type}'`);
      }
    }
  }
  return parsed;
}

export function discoverSkills(skillsDir: string): string[] {
  return readdirSync(skillsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(skillsDir, d.name, "evals", "evals.json")))
    .map((d) => d.name)
    .sort();
}

/**
 * Parse NDJSON produced by `claude --print --output-format stream-json`.
 * Malformed lines are skipped rather than throwing — the CLI occasionally
 * emits informational stderr chatter that gets interleaved under buffering,
 * and dropping one bad line is better than failing a whole run. Empty lines
 * are skipped silently (trailing newline is normal).
 */
export function parseStreamJson(raw: string): StreamEvent[] {
  const events: StreamEvent[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed) as StreamEvent);
    } catch {
      // Skip non-JSON lines — some CLI versions emit banners before the stream.
    }
  }
  return events;
}

/**
 * Pull the fields assertions care about out of the raw event list.
 * - finalText: the CLI's own `result` event if present, otherwise concatenated
 *   `text` parts from assistant messages (covers runs that end on a tool_use
 *   without a terminal result).
 * - toolUses: every `tool_use` content block across assistant messages, flat.
 * - skillInvocations: subset of toolUses where name === "Skill"; pulls the
 *   invoked skill's name out of `input.skill` / `input.name` — the CLI has
 *   used both keys depending on version, so we check both.
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
    if (skill) skillInvocations.push({ skill, raw: tu });
  }

  return {
    finalText: resultText ?? assistantTextParts.join("\n"),
    toolUses,
    skillInvocations,
  };
}

export function evaluate(assertion: Assertion, signals: Signals): AssertionResult {
  switch (assertion.type) {
    case "contains": {
      const ok = signals.finalText.includes(assertion.value);
      return { ok, description: assertion.description, detail: ok ? undefined : `expected substring: ${JSON.stringify(assertion.value)}` };
    }
    case "not_contains": {
      const ok = !signals.finalText.includes(assertion.value);
      return { ok, description: assertion.description, detail: ok ? undefined : `forbidden substring present: ${JSON.stringify(assertion.value)}` };
    }
    case "regex": {
      const re = new RegExp(assertion.pattern, assertion.flags ?? "");
      const ok = re.test(signals.finalText);
      return { ok, description: assertion.description, detail: ok ? undefined : `regex did not match: /${assertion.pattern}/${assertion.flags ?? ""}` };
    }
    case "not_regex": {
      const re = new RegExp(assertion.pattern, assertion.flags ?? "");
      const ok = !re.test(signals.finalText);
      return { ok, description: assertion.description, detail: ok ? undefined : `forbidden regex matched: /${assertion.pattern}/${assertion.flags ?? ""}` };
    }
    case "skill_invoked": {
      const ok = signals.skillInvocations.some((s) => s.skill === assertion.skill);
      const detail = ok
        ? undefined
        : `Skill('${assertion.skill}') not invoked. Skills seen: ${
          signals.skillInvocations.length === 0
            ? "(none)"
            : signals.skillInvocations.map((s) => s.skill).join(", ")
        }`;
      return { ok, description: assertion.description, detail };
    }
    case "not_skill_invoked": {
      const ok = !signals.skillInvocations.some((s) => s.skill === assertion.skill);
      return {
        ok,
        description: assertion.description,
        detail: ok ? undefined : `forbidden Skill('${assertion.skill}') was invoked`,
      };
    }
  }
}
