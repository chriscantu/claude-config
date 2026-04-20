/**
 * Shared library for skill evals: schema loader, stream-json parser,
 * signal extractor, and assertion evaluator.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export type AssertionTier = "required" | "diagnostic";

type AssertionBase = { description: string; tier?: AssertionTier };

export type Assertion =
  | (AssertionBase & { type: "contains" | "not_contains"; value: string })
  | (AssertionBase & { type: "regex" | "not_regex"; pattern: string; flags?: string })
  | (AssertionBase & { type: "skill_invoked" | "not_skill_invoked"; skill: string })
  | (AssertionBase & { type: "tool_input_matches"; tool: string; input_key: string; input_value: string })
  | (AssertionBase & { type: "skill_invoked_in_turn"; turn: number; skill: string })
  | (AssertionBase & { type: "chain_order"; skills: string[] });

declare const validatedBrand: unique symbol;

/**
 * An assertion that has passed `validateAssertion` (directly or via
 * `loadEvalFile`). `evaluate` only accepts this branded form so that the
 * non-empty-string / regex-compiles invariants cannot be bypassed at the
 * type level. The `tier` field is narrowed to non-optional here — validation
 * always fills in the default, so downstream code never needs `?? "required"`.
 */
export type ValidatedAssertion = Assertion & {
  readonly [validatedBrand]: true;
  readonly tier: AssertionTier;
};

export interface Turn {
  prompt: string;
  assertions: Assertion[];
}

export interface Eval {
  name: string;
  summary?: string;
  /** Single-turn shape: either `prompt` + `assertions`, or … */
  prompt?: string;
  assertions?: Assertion[];
  /** … multi-turn shape: `turns[]` and optional `final_assertions`. */
  turns?: Turn[];
  final_assertions?: Assertion[];
}

export interface ValidatedTurn {
  readonly prompt: string;
  readonly assertions: readonly ValidatedAssertion[];
}

/**
 * After `loadEvalFile`, every eval is known to be exactly one of single-turn
 * or multi-turn — the xor invariant that the raw JSON schema can only express
 * procedurally is lifted into the type system here. `kind` discriminates;
 * narrowing on it gives callers access to the shape-specific fields without
 * `!` assertions or runtime key checks.
 */
export type ValidatedEval =
  | {
      readonly kind: "single";
      readonly name: string;
      readonly summary?: string;
      readonly prompt: string;
      readonly assertions: readonly ValidatedAssertion[];
    }
  | {
      readonly kind: "multi";
      readonly name: string;
      readonly summary?: string;
      readonly turns: readonly ValidatedTurn[];
      readonly final_assertions?: readonly ValidatedAssertion[];
    };

export interface EvalFile {
  skill: string;
  description?: string;
  evals: ValidatedEval[];
}

export type AssertionResult =
  | { ok: true; description: string }
  | { ok: false; description: string; detail: string };

/**
 * One decision per required-tier assertion after per-turn/chain evaluation.
 *   - "pass":           assertion passed with evidence
 *   - "fail":           assertion failed with a concrete mismatch detail
 *   - "silent_fire":    negative assertion (not_*) reported ok, but the signal
 *                       it was checking was empty — trivially true, no evidence.
 *                       Distinct failure label; fails the eval.
 */
export type MetaDecision =
  | { kind: "pass"; description: string; tier: AssertionTier }
  | { kind: "fail"; description: string; tier: AssertionTier; detail: string }
  | { kind: "silent_fire"; description: string; tier: AssertionTier; detail: string };

export interface MetaCheckInput {
  /** Per-turn assertion results in the same order the runner evaluated them.
   *  Each entry pairs the validated assertion, the AssertionResult, and the
   *  Signals it ran against (null if the turn had no signals — e.g., spawn
   *  failure). */
  readonly perTurn: ReadonlyArray<{
    readonly assertion: ValidatedAssertion;
    readonly result: AssertionResult;
    readonly signals: Signals | null;
    readonly turnIndex: number;
  }>;
  /** Chain-level assertion results. Silent-fire detection only applies to
   *  per-turn entries (it depends on per-turn signal emptiness), so the
   *  aggregated ChainSignals isn't needed here — only the validated assertion
   *  and its result. */
  readonly final: ReadonlyArray<{
    readonly assertion: ValidatedAssertion;
    readonly result: AssertionResult;
  }>;
}

export interface MetaCheckOutput {
  readonly decisions: readonly MetaDecision[];
  /** True iff every required-tier decision is `pass`. Diagnostic decisions
   *  never flip this. */
  readonly requiredOk: boolean;
  /** True iff any required decision is `silent_fire`. Reporter highlights this
   *  separately from a plain mismatch. */
  readonly silentFireCount: number;
}

/**
 * One parsed entry from `claude --print --output-format stream-json`.
 * Loosely typed because the CLI emits heterogeneous events — consumers
 * pick out the fields they care about via narrowing.
 */
export interface StreamEvent {
  type?: string;
  subtype?: string;
  session_id?: string;
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

/**
 * Container for per-turn signals in a multi-turn eval run.
 *
 * `per_turn_winner[i]` is the first skill invocation seen in turn `i+1`
 * (1-indexed in the schema), or `undefined` if no skill fired. This is the
 * "winner" — the skill the model chose to run for that turn. `chain_order`
 * assertions compare their expected sequence against this array by strict
 * element-wise equality: length must match `skills[]`, and a turn with no
 * winner (`undefined`) fails the assertion for that position. Keep this
 * contract tight — a future "tolerate missing winners" variant should be a
 * new assertion type, not a silent relaxation of `chain_order`.
 */
export interface ChainSignals {
  readonly per_turn: readonly Signals[];
  readonly per_turn_winner: readonly (string | undefined)[];
}

export function aggregateChainSignals(per_turn: readonly Signals[]): ChainSignals {
  const per_turn_winner = per_turn.map((s) => s.skillInvocations[0]?.skill);
  return { per_turn, per_turn_winner };
}

function validateAssertion(a: Assertion, loc: string): ValidatedAssertion {
  if (!a.type || !a.description) {
    throw new Error(`${loc}: assertion missing 'type' or 'description'`);
  }
  const rawTier = (a as { tier?: unknown }).tier;
  if (rawTier !== undefined && rawTier !== "required" && rawTier !== "diagnostic") {
    throw new Error(`${loc}: tier must be 'required' or 'diagnostic' if present, got ${JSON.stringify(rawTier)}`);
  }
  const tier: AssertionTier = rawTier === "diagnostic" ? "diagnostic" : "required";
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
    case "tool_input_matches":
      if (typeof a.tool !== "string" || a.tool.length === 0) {
        throw new Error(`${loc}: tool_input_matches requires non-empty 'tool' string`);
      }
      if (typeof a.input_key !== "string" || a.input_key.length === 0) {
        throw new Error(`${loc}: tool_input_matches requires non-empty 'input_key' string`);
      }
      if (typeof a.input_value !== "string" || a.input_value.length === 0) {
        throw new Error(`${loc}: tool_input_matches requires non-empty 'input_value' string`);
      }
      break;
    case "skill_invoked_in_turn":
      if (typeof a.turn !== "number" || !Number.isInteger(a.turn) || a.turn < 1) {
        throw new Error(`${loc}: skill_invoked_in_turn requires integer 'turn' >= 1`);
      }
      if (typeof a.skill !== "string" || a.skill.length === 0) {
        throw new Error(`${loc}: skill_invoked_in_turn requires non-empty 'skill' string`);
      }
      break;
    case "chain_order":
      if (!Array.isArray(a.skills) || a.skills.length === 0 || !a.skills.every((s) => typeof s === "string" && s.length > 0)) {
        throw new Error(`${loc}: chain_order requires non-empty array 'skills' of non-empty strings`);
      }
      break;
    default: {
      // Exhaustiveness: adding a new variant to `Assertion` without extending
      // the switch causes a type error here, not a silent fall-through.
      const exhaustive: never = a;
      throw new Error(`${loc}: unknown assertion type '${(exhaustive as { type: string }).type}'`);
    }
  }
  return { ...a, tier } as ValidatedAssertion;
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

  const validatedEvals: ValidatedEval[] = [];
  for (const e of parsed.evals) {
    if (!e.name) {
      throw new Error(`${file}: eval '${e.name ?? "(unnamed)"}' missing name/prompt/assertions`);
    }
    const hasPrompt = typeof e.prompt === "string" && e.prompt.length > 0;
    const hasTurns = Array.isArray(e.turns);
    if (hasPrompt && hasTurns) {
      throw new Error(`${file}: eval '${e.name}' has both 'prompt' and 'turns' — pick one`);
    }
    if (!hasPrompt && !hasTurns) {
      throw new Error(`${file}: eval '${e.name}' missing name/prompt/assertions`);
    }

    if (hasPrompt) {
      if (!Array.isArray(e.assertions) || e.assertions.length === 0) {
        throw new Error(`${file}: eval '${e.name}' missing name/prompt/assertions`);
      }
      const validated: ValidatedAssertion[] = [];
      for (const a of e.assertions) {
        if (a.type === "chain_order" || a.type === "skill_invoked_in_turn") {
          throw new Error(`${file}: eval '${e.name}': '${a.type}' is a chain-level assertion; use it in 'final_assertions' on a multi-turn eval`);
        }
        validated.push(validateAssertion(a, `${file}: eval '${e.name}'`));
      }
      validatedEvals.push({ kind: "single", name: e.name, summary: e.summary, prompt: e.prompt!, assertions: validated });
      continue;
    }

    // multi-turn
    const turns = e.turns as Turn[];
    if (turns.length === 0) {
      throw new Error(`${file}: eval '${e.name}' has empty 'turns' array`);
    }
    const validatedTurns: ValidatedTurn[] = [];
    turns.forEach((t, idx) => {
      const turnLoc = `${file}: eval '${e.name}' turn ${idx + 1}`;
      if (typeof t.prompt !== "string" || t.prompt.length === 0) {
        throw new Error(`${turnLoc}: missing non-empty 'prompt'`);
      }
      if (!Array.isArray(t.assertions) || t.assertions.length === 0) {
        throw new Error(`${turnLoc}: missing non-empty 'assertions'`);
      }
      const va: ValidatedAssertion[] = [];
      for (const a of t.assertions) {
        if (a.type === "chain_order" || a.type === "skill_invoked_in_turn") {
          throw new Error(`${turnLoc}: '${a.type}' is a chain-level assertion; move it to 'final_assertions' on the eval`);
        }
        va.push(validateAssertion(a, turnLoc));
      }
      validatedTurns.push({ prompt: t.prompt, assertions: va });
    });

    let validatedFinal: ValidatedAssertion[] | undefined;
    if (e.final_assertions !== undefined) {
      if (!Array.isArray(e.final_assertions) || e.final_assertions.length === 0) {
        throw new Error(`${file}: eval '${e.name}': 'final_assertions' must be a non-empty array if present (omit the field for none)`);
      }
      validatedFinal = [];
      for (const a of e.final_assertions) {
        if (a.type === "tool_input_matches" || a.type === "contains" || a.type === "not_contains" ||
            a.type === "regex" || a.type === "not_regex" ||
            a.type === "skill_invoked" || a.type === "not_skill_invoked") {
          throw new Error(`${file}: eval '${e.name}' final_assertions: '${a.type}' is a per-turn assertion; put it on a turn's assertions array instead`);
        }
        const v = validateAssertion(a, `${file}: eval '${e.name}' final_assertions`);
        if (a.type === "skill_invoked_in_turn" && a.turn > validatedTurns.length) {
          throw new Error(`${file}: eval '${e.name}' final_assertions: skill_invoked_in_turn.turn=${a.turn} is out of range (only ${validatedTurns.length} turns)`);
        }
        validatedFinal.push(v);
      }
    }

    validatedEvals.push({
      kind: "multi",
      name: e.name,
      summary: e.summary,
      turns: validatedTurns,
      final_assertions: validatedFinal,
    });
  }

  return { skill: parsed.skill, description: parsed.description, evals: validatedEvals };
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
 * Pull the canonical session_id from an `init` system event emitted by
 * `claude --print --output-format stream-json`. Used by the multi-turn runner
 * to feed `claude --resume <id>` on turns 2..N.
 *
 * The CLI also emits `session_id` on earlier hook events (SessionStart hooks
 * fire before `init`), so we specifically match `type:"system" subtype:"init"`
 * rather than the first event with a session_id field. Returns null if the
 * stream ended before init (a spawn or parse failure).
 */
export function extractSessionId(events: readonly StreamEvent[]): string | null {
  for (const ev of events) {
    if (ev.type === "system" && ev.subtype === "init" && typeof ev.session_id === "string" && ev.session_id.length > 0) {
      return ev.session_id;
    }
  }
  return null;
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
    case "tool_input_matches": {
      const matched = signals.toolUses.some(
        (tu) =>
          tu.name === assertion.tool &&
          typeof tu.input[assertion.input_key] === "string" &&
          tu.input[assertion.input_key] === assertion.input_value,
      );
      if (matched) return pass();
      const seen = signals.toolUses
        .filter((tu) => tu.name === assertion.tool)
        .map((tu) => JSON.stringify(tu.input[assertion.input_key]))
        .join(", ");
      return fail(
        `tool_input_matches: no ${assertion.tool} tool_use had ${assertion.input_key}=${JSON.stringify(assertion.input_value)}. ` +
          `Saw ${assertion.tool}.${assertion.input_key} values: ${seen || "(no matching tool)"}`,
      );
    }
    case "skill_invoked_in_turn":
    case "chain_order":
      // Routing guard: chain-level assertions belong in `evaluateChain`, not
      // here. Explicit cases (rather than a bare default) let the compiler
      // enforce exhaustiveness — a new Assertion variant must be handled here
      // or it won't type-check.
      return fail(`evaluate called with chain-level assertion type '${assertion.type}' — this is a runner bug`);
    default: {
      const exhaustive: never = assertion;
      return fail(`evaluate: impossible assertion type: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/**
 * Chain-level assertion evaluator. Handles `skill_invoked_in_turn` and
 * `chain_order` — the only two assertion variants that read across turns.
 * For all other assertion types, the per-turn loop in the runner calls the
 * regular `evaluate(assertion, signals)` on the matching turn's signals.
 */
export function evaluateChain(assertion: ValidatedAssertion, chain: ChainSignals): AssertionResult {
  const { description } = assertion;
  const fail = (detail: string): AssertionResult => ({ ok: false, description, detail });
  const pass = (): AssertionResult => ({ ok: true, description });

  switch (assertion.type) {
    case "skill_invoked_in_turn": {
      const idx = assertion.turn - 1;
      if (idx < 0 || idx >= chain.per_turn.length) {
        return fail(`turn ${assertion.turn} is out of range (only ${chain.per_turn.length} turns in chain)`);
      }
      const fired = chain.per_turn[idx].skillInvocations.some((s) => s.skill === assertion.skill);
      if (fired) return pass();
      const skills = chain.per_turn[idx].skillInvocations.map((s) => s.skill);
      return fail(
        `turn ${assertion.turn}: Skill('${assertion.skill}') not invoked. Skills seen in this turn: ${
          skills.length === 0 ? "(none)" : skills.join(", ")
        }`,
      );
    }
    case "chain_order": {
      const actual = chain.per_turn_winner;
      const expected = assertion.skills;
      const same = expected.length === actual.length && expected.every((s, i) => s === actual[i]);
      if (same) return pass();
      return fail(`chain_order mismatch. expected=[${expected.join(", ")}] actual=[${actual.map((s) => s ?? "(none)").join(", ")}]`);
    }
    case "contains":
    case "not_contains":
    case "regex":
    case "not_regex":
    case "skill_invoked":
    case "not_skill_invoked":
    case "tool_input_matches":
      // Routing guard: per-turn assertions belong in `evaluate`, not here.
      // Explicit cases let the compiler enforce exhaustiveness — a new
      // Assertion variant must be handled here or it won't type-check.
      return fail(`evaluateChain called with non-chain assertion type '${assertion.type}' — this is a runner bug`);
    default: {
      const exhaustive: never = assertion;
      return fail(`evaluateChain: impossible assertion type: ${JSON.stringify(exhaustive)}`);
    }
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

/**
 * Policy over per-turn and chain-level assertion results: a required-tier
 * negative assertion that passes against an empty signal is a silent-fire
 * failure (trivially true, no evidence). Everything else is decided by the
 * AssertionResult alone, gated by tier.
 */
export function metaCheck(input: MetaCheckInput): MetaCheckOutput {
  const decisions: MetaDecision[] = [];
  let silentFireCount = 0;
  let requiredOk = true;

  const isNegative = (a: ValidatedAssertion): boolean =>
    a.type === "not_contains" || a.type === "not_regex" || a.type === "not_skill_invoked";

  /**
   * Is the signal the assertion ran against empty, in the sense that a
   * negative assertion would trivially pass against it? Per-turn callers
   * should only invoke this when the assertion reported `ok: true` — in
   * particular, the null-signals case is handled by the runner emitting
   * `{ok: false, detail: "no signals for this turn"}` before reaching
   * metaCheck. We still accept `null` defensively so a future refactor
   * routing through here doesn't silently silent-fire.
   *
   * Exhaustive on purpose: a new per-turn variant added to `Assertion`
   * must choose whether it counts as "empty-signal-trivially-passable"
   * or not, rather than silently falling through.
   */
  const signalIsEmptyFor = (a: ValidatedAssertion, s: Signals | null): boolean => {
    if (!s) return true;
    switch (a.type) {
      case "not_contains":
      case "not_regex":
        return s.terminalState === "empty";
      case "not_skill_invoked":
        return s.skillInvocations.length === 0;
      case "contains":
      case "regex":
      case "skill_invoked":
      case "tool_input_matches":
      case "skill_invoked_in_turn":
      case "chain_order":
        return false;
      default: {
        const exhaustive: never = a;
        void exhaustive;
        return false;
      }
    }
  };

  for (const { assertion, result, signals } of input.perTurn) {
    const tier = assertion.tier;
    if (result.ok) {
      if (tier === "required" && isNegative(assertion) && signalIsEmptyFor(assertion, signals)) {
        silentFireCount++;
        requiredOk = false;
        decisions.push({
          kind: "silent_fire",
          description: result.description,
          tier,
          detail: `negative assertion trivially passed against empty signal — no evidence to judge`,
        });
      } else {
        decisions.push({ kind: "pass", description: result.description, tier });
      }
    } else {
      if (tier === "required") requiredOk = false;
      decisions.push({ kind: "fail", description: result.description, tier, detail: result.detail });
    }
  }

  for (const { assertion, result } of input.final) {
    const tier = assertion.tier;
    if (result.ok) {
      decisions.push({ kind: "pass", description: result.description, tier });
    } else {
      if (tier === "required") requiredOk = false;
      decisions.push({ kind: "fail", description: result.description, tier, detail: result.detail });
    }
  }

  return { decisions, requiredOk, silentFireCount };
}

/**
 * Per-eval tally derived from a `metaCheck` result. Extracts the three
 * runner-level counters in one place so both the single-turn and multi-turn
 * paths aggregate the same way.
 *
 *   - `evalPassed`: the eval's required-tier gate (`meta.requiredOk`). The
 *     decision-doc exit-code contract aggregates these across evals.
 *   - `passedAssertionCount`: for the per-assertion progress line — diagnostic
 *     fails DO decrement this, which is why it's reported separately from
 *     `evalPassed` and must NOT gate the exit code.
 *   - `silentFireCount`: surfaced in the transcript so a reader can tell a
 *     plain fail apart from a required-negative-on-empty-signal fail, even
 *     though `requiredOk` already implies it for exit purposes.
 */
export interface EvalTally {
  readonly evalPassed: boolean;
  readonly assertionCount: number;
  readonly passedAssertionCount: number;
  readonly silentFireCount: number;
}

export function tallyEval(meta: MetaCheckOutput, assertionCount: number): EvalTally {
  const passedAssertionCount = meta.decisions.filter((d) => d.kind === "pass").length;
  return {
    evalPassed: meta.requiredOk,
    assertionCount,
    passedAssertionCount,
    silentFireCount: meta.silentFireCount,
  };
}

/**
 * Suite-level pass/fail per the decision-doc contract: exit 0 iff every eval's
 * required-tier gate passed. Silent-fire implies `evalPassed: false` (the
 * `metaCheck` branch that records a silent_fire also sets `requiredOk = false`),
 * so a separate silent-fire check here would be redundant — but we expose it
 * as a named function so the contract is documented in one place.
 */
export function suiteOk(tallies: readonly EvalTally[]): boolean {
  return tallies.every((t) => t.evalPassed);
}
