/**
 * Shared library for skill evals: schema loader, stream-json parser,
 * signal extractor, and assertion evaluator.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type AssertionTier = "required" | "diagnostic";

/**
 * Reliability axis (orthogonal to AssertionTier).
 *
 *   - "structural" — assertion fires against parsed stream-json signals
 *     (tool uses, skill invocations). Deterministic; spoof-resistant.
 *   - "text" — assertion fires against model-generated prose (substring
 *     or regex). Wording-sensitive; subject to run-to-run variance.
 *
 * Used only for reporting and for the `--text-nonblocking` exit-code
 * softening. Derived from assertion type at report time; never stored.
 */
export type ReliabilityTier = "structural" | "text";

/**
 * Classify an assertion type by reliability. Exhaustive on AssertionType
 * — adding a new variant fails compilation here.
 */
export function reliabilityOf(type: Assertion["type"]): ReliabilityTier {
  switch (type) {
    case "skill_invoked":
    case "not_skill_invoked":
    case "skill_invoked_in_turn":
    case "chain_order":
    case "tool_input_matches":
    case "not_tool_input_matches":
    case "tool_called":
    case "not_tool_called":
      return "structural";
    case "contains":
    case "not_contains":
    case "regex":
    case "not_regex":
    case "thinking_contains":
    case "not_thinking_contains":
      return "text";
  }
}

type AssertionBase = { description: string; tier?: AssertionTier };

export type Assertion =
  | (AssertionBase & { type: "contains" | "not_contains"; value: string })
  | (AssertionBase & { type: "regex" | "not_regex"; pattern: string; flags?: string })
  | (AssertionBase & { type: "thinking_contains" | "not_thinking_contains"; value: string })
  | (AssertionBase & { type: "skill_invoked" | "not_skill_invoked"; skill: string })
  | (AssertionBase & { type: "tool_input_matches" | "not_tool_input_matches"; tool: string; input_key: string; input_value: string })
  /**
   * Any-of membership over tool names — passes if *any* listed tool fired
   * (positive form) or if *none* fired (negative form). No input filtering;
   * compare to `tool_input_matches` which asserts a specific tool's input.
   * Use this for canonical-step gates where the question is "did the model
   * do *any* of these tool calls" (#192). Tuple type encodes non-empty at
   * compile time — `validateAssertion` still checks per-element non-empty.
   */
  | (AssertionBase & { type: "tool_called" | "not_tool_called"; tools: readonly [string, ...string[]] })
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
  /** Optional shell command run before the prompt is sent. Single-turn evals only. */
  setup?: string;
  /** Optional shell command run after assertions complete. Single-turn evals only. */
  teardown?: string;
  /**
   * Optional decoy files to seed into the scratch cwd BEFORE the claude
   * process spawns. Map of relative path → file content. Subdirectories
   * are created automatically. Applies to both single-turn and multi-turn
   * (chain) evals — for chains, all turns share the same scratch cwd so
   * decoys are visible across resumes.
   *
   * Used by ADR #0011 / Option B-lite to break the empty-cwd detection
   * cue that triggers thinking-channel meta-awareness on hot-spot
   * fixtures (`*-honored-skip-named-cost`, etc.). Without decoys, the
   * scratch cwd from PR #93 is itself a cue: "only an excalidraw log
   * file" / "this is an eval environment with no actual codebase."
   */
  scratch_decoy?: Record<string, string>;
  /** Optional synthetic <system-reminder> the runner prepends to prompt
   *  envelope. Mutually informative with `setup` (end-to-end) — this is
   *  the routing-contract path. Single-turn only. */
  additional_context?: string;
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
      readonly setup?: string;
      readonly teardown?: string;
      readonly scratch_decoy?: ValidatedScratchDecoy;
      /** Optional synthetic <system-reminder> the runner prepends to prompt
       *  envelope. Mutually informative with `setup` (end-to-end) — this is
       *  the routing-contract path. Single-turn only. */
      readonly additional_context?: string;
    }
  | {
      readonly kind: "multi";
      readonly name: string;
      readonly summary?: string;
      readonly turns: readonly ValidatedTurn[];
      readonly final_assertions?: readonly ValidatedAssertion[];
      readonly scratch_decoy?: ValidatedScratchDecoy;
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
  | { kind: "pass"; description: string; tier: AssertionTier; reliability: ReliabilityTier }
  | { kind: "fail"; description: string; tier: AssertionTier; reliability: ReliabilityTier; detail: string }
  | { kind: "silent_fire"; description: string; tier: AssertionTier; reliability: ReliabilityTier; detail: string };

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
      type: "text" | "tool_use" | "thinking" | (string & {});
      text?: string;
      thinking?: string;
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
 *   - `result`     — a `result` event was present; `finalText` is the
 *                    intermediate assistant text (if any) concatenated with
 *                    the result event's payload, separated by `\n`. Concat
 *                    is intentional: regex assertions need to see plans /
 *                    preambles the model emits before tool uses, which
 *                    otherwise wouldn't appear in the result event.
 *   - `assistant`  — no `result` event; `finalText` is concatenated assistant text.
 *   - `empty`      — neither; `finalText` is "".
 */
export interface Signals {
  readonly finalText: string;
  /**
   * Concatenation of every `thinking` block emitted by assistant events,
   * joined by `\n`. Empty string if the model produced no thinking content.
   *
   * Used by `thinking_contains` / `not_thinking_contains` to detect
   * meta-awareness leaks (e.g. *"this is an eval environment"*) that don't
   * surface in `finalText` but indicate the model has detected eval
   * framing — see ADR #0011 and audit
   * `docs/superpowers/audits/2026-04-28-thinking-channel-meta-awareness.md`.
   *
   * Wording-sensitive (text-tier reliability) by definition: the thinking
   * channel is free-form prose. Use as a regression sentinel for known
   * detection phrases, not as a behavioral correctness check.
   */
  readonly thinkingText: string;
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

/**
 * Branded post-validation type for scratch-decoy maps. Mirrors the
 * `ValidatedAssertion` brand: callers downstream (runClaude /
 * runClaudeChain / seedScratchDecoy) accept only this branded form, so
 * the path-safety invariants enforced by `validateScratchDecoy` cannot
 * be re-injected via an unvalidated `Record<string, string>` from a
 * future call site. The brand has no runtime cost — it's a phantom
 * type erased at compile.
 */
declare const validatedScratchDecoyBrand: unique symbol;
export type ValidatedScratchDecoy = Readonly<Record<string, string>> & {
  readonly [validatedScratchDecoyBrand]: true;
};

/**
 * Validate a `scratch_decoy` map. Returns `undefined` for absent decoy
 * (the field is optional). Otherwise enforces:
 *   - Object literal with string-keyed entries
 *   - All keys are non-empty relative paths (no absolute paths —
 *     POSIX `/` or Windows `\` prefix — and no `..` traversal). The
 *     decoy writes into the scratch tmpdir and an escape would write
 *     into the user's actual filesystem.
 *   - All values are strings (file content)
 *
 * Path safety is load-bearing: `seedScratchDecoy` joins these onto a
 * `mkdtemp` scratch dir and writes them. A bad path would punch out of
 * the scratch sandbox. Brand on the return type prevents downstream
 * call sites from constructing a decoy without going through this
 * validator.
 */
function validateScratchDecoy(
  raw: unknown,
  loc: string,
): ValidatedScratchDecoy | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${loc}: scratch_decoy must be an object map of relative paths to file content`);
  }
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length === 0) {
    throw new Error(`${loc}: scratch_decoy must have at least one entry if present (omit the field for none)`);
  }
  for (const [path, content] of entries) {
    if (typeof path !== "string" || path.length === 0) {
      throw new Error(`${loc}: scratch_decoy keys must be non-empty strings`);
    }
    if (path.startsWith("/") || path.startsWith("\\")) {
      throw new Error(`${loc}: scratch_decoy path '${path}' is absolute; use a path relative to the scratch dir`);
    }
    if (path.split(/[\\/]/).includes("..")) {
      throw new Error(`${loc}: scratch_decoy path '${path}' contains '..' which would escape the scratch dir`);
    }
    if (typeof content !== "string") {
      throw new Error(`${loc}: scratch_decoy['${path}'] must be a string (file content)`);
    }
  }
  return Object.freeze({ ...(raw as Record<string, string>) }) as ValidatedScratchDecoy;
}

/**
 * Structured error thrown by `seedScratchDecoy` when a decoy file cannot
 * be written. Carries the offending relative path and the original
 * filesystem errno so callers (`runClaude`, `runClaudeChain`) can
 * surface a useful failure message instead of an opaque throw.
 *
 * Why a custom class: the `code` property of NodeJS.ErrnoException is
 * not always set (e.g. on platform-specific failures), and the relPath
 * is the load-bearing diagnostic that turns an opaque ENOSPC into
 * "decoy seed failed for 'src/index.ts': ENOSPC". Subclassing keeps the
 * caller's catch block narrow.
 */
export class ScratchDecoySeedError extends Error {
  readonly relPath: string;
  readonly errno: string | undefined;
  constructor(relPath: string, cause: Error) {
    const errno = (cause as NodeJS.ErrnoException).code;
    super(`decoy seed failed for '${relPath}': ${errno ?? cause.message}`);
    this.name = "ScratchDecoySeedError";
    this.relPath = relPath;
    this.errno = errno;
  }
}

/**
 * Seed `decoy` files into `cwd` BEFORE the claude process spawns. Used
 * by ADR #0011 / Option B-lite to break the empty-cwd detection cue
 * that triggers thinking-channel meta-awareness on hot-spot fixtures.
 *
 * Path safety is enforced upstream in `validateScratchDecoy` — paths
 * are non-empty, non-absolute, and contain no `..` segments. The brand
 * on `ValidatedScratchDecoy` makes it a compile error to pass an
 * unvalidated map.
 *
 * On filesystem failure (EACCES, ENOSPC, EROFS, race), throws a
 * `ScratchDecoySeedError` carrying the offending relPath and errno so
 * the runner can surface a structured failure instead of an opaque
 * throw. Partial writes from prior iterations remain on disk — the
 * caller is responsible for scratch-dir cleanup (`rmSync` in the
 * runner's finally block).
 */
export function seedScratchDecoy(
  cwd: string,
  decoy: ValidatedScratchDecoy | undefined,
  fs: { mkdirSync: typeof mkdirSync; writeFileSync: typeof writeFileSync } = { mkdirSync, writeFileSync },
): void {
  if (!decoy) return;
  for (const [relPath, content] of Object.entries(decoy)) {
    const fullPath = join(cwd, relPath);
    const parentDir = dirname(fullPath);
    try {
      fs.mkdirSync(parentDir, { recursive: true });
      fs.writeFileSync(fullPath, content, "utf8");
    } catch (err) {
      throw new ScratchDecoySeedError(relPath, err as Error);
    }
  }
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
    case "thinking_contains":
    case "not_thinking_contains":
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
    case "not_tool_input_matches":
      if (typeof a.tool !== "string" || a.tool.length === 0) {
        throw new Error(`${loc}: ${a.type} requires non-empty 'tool' string`);
      }
      if (typeof a.input_key !== "string" || a.input_key.length === 0) {
        throw new Error(`${loc}: ${a.type} requires non-empty 'input_key' string`);
      }
      if (typeof a.input_value !== "string" || a.input_value.length === 0) {
        throw new Error(`${loc}: ${a.type} requires non-empty 'input_value' string`);
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
    case "tool_called":
    case "not_tool_called":
      if (!Array.isArray(a.tools) || a.tools.length === 0 || !a.tools.every((t) => typeof t === "string" && t.length > 0)) {
        throw new Error(`${loc}: ${a.type} requires non-empty array 'tools' of non-empty strings`);
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
      const decoy = validateScratchDecoy(e.scratch_decoy, `${file}: eval '${e.name}'`);
      let validatedAdditionalContext: string | undefined;
      if (e.additional_context !== undefined) {
        if (typeof e.additional_context !== "string") {
          throw new Error(`${file}: eval '${e.name}' additional_context must be a string (got ${typeof e.additional_context})`);
        }
        validatedAdditionalContext = e.additional_context;
      }
      validatedEvals.push({
        kind: "single",
        name: e.name,
        summary: e.summary,
        prompt: e.prompt!,
        assertions: validated,
        setup: e.setup,
        teardown: e.teardown,
        scratch_decoy: decoy,
        additional_context: validatedAdditionalContext,
      });
      continue;
    }

    // multi-turn
    if (e.setup || e.teardown) {
      throw new Error(
        `${file}: eval '${e.name}' declares setup/teardown but is multi-turn; setup/teardown is single-turn only`,
      );
    }
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
        if (a.type === "tool_input_matches" || a.type === "not_tool_input_matches" ||
            a.type === "tool_called" || a.type === "not_tool_called" ||
            a.type === "contains" || a.type === "not_contains" ||
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

    const decoy = validateScratchDecoy(e.scratch_decoy, `${file}: eval '${e.name}'`);
    validatedEvals.push({
      kind: "multi",
      name: e.name,
      summary: e.summary,
      turns: validatedTurns,
      final_assertions: validatedFinal,
      scratch_decoy: decoy,
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
 * When `claude --print` exits non-zero, the actionable cause is usually inside
 * the structured stream as a `result` event with `is_error:true` (e.g. auth
 * 401, billing block, model quota). The CLI writes nothing to stderr for
 * these structured failures, so falling back to stderr alone surfaces empty
 * reasons.
 *
 * Returns a short reason string built from `api_error_status` + the first
 * line of `result` (truncated to 200 chars with an ellipsis when cut), or
 * null if no error result event is present. A null return is INDETERMINATE,
 * not a guarantee of success — callers that need a positive health signal
 * (e.g. pre-flight probes) must verify a non-error `result` event exists,
 * not just the absence of one.
 */
/**
 * Positive health signal — true iff the stream contains at least one
 * `result` event with `is_error !== true`. Use this in pre-flight probes
 * instead of `extractStreamErrorReason(events) === null`, which conflates
 * "no error" with "couldn't tell" (empty stdout, parse failure, killed
 * mid-stream all return null).
 */
export function streamHasSuccessfulResult(events: readonly StreamEvent[]): boolean {
  for (const ev of events) {
    if (ev.type !== "result") continue;
    if ((ev as { is_error?: unknown }).is_error !== true) return true;
  }
  return false;
}

export function extractStreamErrorReason(events: readonly StreamEvent[]): string | null {
  for (const ev of events) {
    if (ev.type !== "result") continue;
    const isError = (ev as { is_error?: unknown }).is_error;
    if (isError !== true) continue;
    const status = (ev as { api_error_status?: unknown }).api_error_status;
    const resultText = typeof ev.result === "string" ? ev.result : "";
    const rawFirstLine = resultText.split("\n")[0] ?? "";
    const firstLine = rawFirstLine.length > 200 ? rawFirstLine.slice(0, 200) + "…" : rawFirstLine;
    if (typeof status === "number" || typeof status === "string") {
      return firstLine ? `api_error_status=${status}: ${firstLine}` : `api_error_status=${status}`;
    }
    if (firstLine) return firstLine;
    const errStr = typeof (ev as { error?: unknown }).error === "string" ? (ev as { error: string }).error : "";
    return errStr || "result.is_error with no detail";
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
  const thinkingParts: string[] = [];
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
        } else if (block.type === "thinking" && typeof block.thinking === "string") {
          thinkingParts.push(block.thinking);
        } else if (block.type === "thinking") {
          // Non-string `thinking` field on a thinking-typed block: silent
          // skip is intentional — historically the field has only been a
          // string. If SDK shape drifts (e.g. structured thinking with
          // {text, signature}), the audit cadence in ADR #0011 catches it
          // by re-running the meta-awareness regex against transcripts and
          // observing zero hits where prior runs had them. Don't throw —
          // a parser failure would gate the entire eval suite on schema
          // drift unrelated to the model under test.
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
    // Concatenate intermediate assistant text (emitted before tool uses) with
    // the final result event. Without this, plans the model emits BEFORE
    // running tools (a common goal-driven shape) are invisible to regex
    // assertions because the result event only carries the final summary.
    finalText = assistantTextParts.length > 0
      ? `${assistantTextParts.join("\n")}\n${resultText}`
      : resultText;
    terminalState = "result";
  } else if (assistantTextParts.length > 0) {
    finalText = assistantTextParts.join("\n");
    terminalState = "assistant";
  } else {
    finalText = "";
    terminalState = "empty";
  }

  const thinkingText = thinkingParts.join("\n");

  return { finalText, thinkingText, toolUses, skillInvocations, terminalState };
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
    case "thinking_contains":
      return signals.thinkingText.includes(assertion.value)
        ? pass()
        : fail(`expected thinking-channel substring: ${JSON.stringify(assertion.value)}`);
    case "not_thinking_contains":
      return signals.thinkingText.includes(assertion.value)
        ? fail(`forbidden thinking-channel substring present: ${JSON.stringify(assertion.value)}`)
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
      const matched = signals.toolUses.some((tu) => {
        if (tu.name !== assertion.tool) return false;
        const value = tu.input[assertion.input_key];
        return typeof value === "string" && value.includes(assertion.input_value);
      });
      if (matched) return pass();
      const sameToolUses = signals.toolUses.filter((tu) => tu.name === assertion.tool);
      const seen = sameToolUses
        .map((tu) => JSON.stringify(tu.input[assertion.input_key]))
        .join(", ");
      // Schema-drift hint: if the assertion pins the Claude Code Skill-tool
      // contract (tool="Skill", input_key="skill") AND the runner saw zero
      // Skill tool_uses at all, the most likely cause is upstream rename of
      // the tool name or input key — not a behavioral regression of the
      // skill-under-test. Without this hint, on-call sees N identical
      // failures across unrelated suites and burns time diagnosing each as
      // a behavioral bug. Closes #113. The hint is conditional on Skill +
      // skill specifically because that's the contract pinned in PR #112 +
      // ADR #0004; other tools (Bash, mcp__*) failing is genuinely
      // behavioral and gets the same fail message they always had.
      const isSkillContract =
        assertion.tool === "Skill" && assertion.input_key === "skill";
      const noSkillFired = sameToolUses.length === 0;
      const driftHint =
        isSkillContract && noSkillFired
          ? " | If multiple Skill tool_input_matches assertions are failing simultaneously, suspect Claude Code Skill-tool schema drift before behavioral regression. See adrs/0004-define-the-problem-mandatory-front-door.md and the _contract_note field in skills/define-the-problem/evals/evals.json."
          : "";
      return fail(
        `tool_input_matches: no ${assertion.tool} tool_use had ${assertion.input_key}=${JSON.stringify(assertion.input_value)}. ` +
          `Saw ${assertion.tool}.${assertion.input_key} values: ${seen || "(no matching tool)"}` +
          driftHint,
      );
    }
    case "not_tool_input_matches": {
      const offending = signals.toolUses.find((tu) => {
        if (tu.name !== assertion.tool) return false;
        const value = tu.input[assertion.input_key];
        return typeof value === "string" && value.includes(assertion.input_value);
      });
      if (!offending) return pass();
      return fail(
        `not_tool_input_matches: forbidden ${assertion.tool} tool_use had ` +
          `${assertion.input_key}=${JSON.stringify(offending.input[assertion.input_key])} ` +
          `(matched substring ${JSON.stringify(assertion.input_value)})`,
      );
    }
    case "tool_called": {
      const wanted = new Set(assertion.tools);
      const matched = signals.toolUses.some((tu) => wanted.has(tu.name));
      if (matched) return pass();
      const seen = signals.toolUses.length === 0
        ? "(no tools)"
        : Array.from(new Set(signals.toolUses.map((tu) => tu.name))).join(", ");
      return fail(
        `tool_called: none of [${assertion.tools.join(", ")}] invoked. Tools seen: ${seen}`,
      );
    }
    case "not_tool_called": {
      const wanted = new Set(assertion.tools);
      const offending = signals.toolUses.find((tu) => wanted.has(tu.name));
      if (!offending) return pass();
      return fail(
        `not_tool_called: forbidden tool '${offending.name}' invoked (forbidden set: [${assertion.tools.join(", ")}])`,
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
    case "thinking_contains":
    case "not_thinking_contains":
    case "skill_invoked":
    case "not_skill_invoked":
    case "tool_input_matches":
    case "not_tool_input_matches":
    case "tool_called":
    case "not_tool_called":
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
    a.type === "not_contains" || a.type === "not_regex" || a.type === "not_thinking_contains" || a.type === "not_skill_invoked" || a.type === "not_tool_input_matches" || a.type === "not_tool_called";

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
      case "not_thinking_contains":
        // Silent-fire only when thinking is empty AND the run did not
        // complete with a `result` event. A successful `result`-tier run
        // that produced no thinking blocks (e.g. extended thinking
        // disabled, tool-only run, provider/model that doesn't emit
        // thinking) is a meaningful completion — the assertion's
        // negative passing against it is real evidence, not silent-fire.
        // Without this terminalState guard, every legitimate completed
        // run on a non-thinking model would false-positive silent-fire.
        return s.thinkingText.length === 0 && s.terminalState !== "result";
      case "not_skill_invoked":
        return s.skillInvocations.length === 0;
      case "not_tool_input_matches":
      case "not_tool_called":
        // Silent-fire only when the model emitted no tool uses at all. If any
        // tools fired (even unrelated ones), the absence of the forbidden tool
        // is meaningful information — the model engaged with tool-using
        // behavior and chose not to invoke the forbidden one.
        //
        // Symmetric with the `not_skill_invoked` branch above: empty-of-category,
        // not empty-of-filtered. A filter-by-tool-name heuristic would collapse
        // the metaCheck distinction by flagging every legitimate negative pass
        // as silent-fire (the pass condition is precisely "no offending tool
        // fired"). Don't re-litigate without rereading both cases together.
        //
        // `not_tool_called` shares this rule: same channel (toolUses), same
        // empty-of-category semantic.
        return s.toolUses.length === 0;
      case "contains":
      case "regex":
      case "thinking_contains":
      case "skill_invoked":
      case "tool_input_matches":
      case "tool_called":
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
    const reliability = reliabilityOf(assertion.type);
    if (result.ok) {
      if (tier === "required" && isNegative(assertion) && signalIsEmptyFor(assertion, signals)) {
        silentFireCount++;
        requiredOk = false;
        decisions.push({
          kind: "silent_fire",
          description: result.description,
          tier,
          reliability,
          detail: `negative assertion trivially passed against empty signal — no evidence to judge`,
        });
      } else {
        decisions.push({ kind: "pass", description: result.description, tier, reliability });
      }
    } else {
      if (tier === "required") requiredOk = false;
      decisions.push({ kind: "fail", description: result.description, tier, reliability, detail: result.detail });
    }
  }

  for (const { assertion, result } of input.final) {
    const tier = assertion.tier;
    const reliability = reliabilityOf(assertion.type);
    if (result.ok) {
      decisions.push({ kind: "pass", description: result.description, tier, reliability });
    } else {
      if (tier === "required") requiredOk = false;
      decisions.push({ kind: "fail", description: result.description, tier, reliability, detail: result.detail });
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

export interface ReliabilityCounts {
  pass: number;
  fail: number;
}

export interface ReliabilityAgg {
  requiredStructural: ReliabilityCounts;
  requiredText: ReliabilityCounts;
  /**
   * Diagnostic decisions are NOT split by reliability. Diagnostic never
   * gates exit, so the structural-vs-text distinction adds noise without
   * decision value at this tier.
   */
  diagnostic: ReliabilityCounts;
}

/**
 * Bucket meta decisions across one or more evals by required×reliability.
 * silent_fire counts as a failure in its bucket; pass and fail count as
 * themselves.
 */
export function tallyReliability(decisions: readonly MetaDecision[]): ReliabilityAgg {
  const agg: ReliabilityAgg = {
    requiredStructural: { pass: 0, fail: 0 },
    requiredText: { pass: 0, fail: 0 },
    diagnostic: { pass: 0, fail: 0 },
  };
  for (const d of decisions) {
    const bucket =
      d.tier === "diagnostic"
        ? agg.diagnostic
        : d.reliability === "structural"
          ? agg.requiredStructural
          : agg.requiredText;
    if (d.kind === "pass") bucket.pass += 1;
    else bucket.fail += 1;
  }
  return agg;
}

export interface SuiteExitOptions {
  /** Demote required-text failures to warnings (still printed). */
  textNonblocking?: boolean;
}

export interface SuiteExitResult {
  exitCode: 0 | 1;
  /** When set, print as a warning banner before exiting. */
  warning?: string;
}

/**
 * Exit-code policy by required×reliability:
 *   - required-structural fail  → always exit 1
 *   - required-text fail        → exit 1 by default; exit 0 + warning when textNonblocking
 *   - diagnostic fail           → never gates exit
 */
export function suiteExit(agg: ReliabilityAgg, opts: SuiteExitOptions): SuiteExitResult {
  if (agg.requiredStructural.fail > 0) {
    return { exitCode: 1 };
  }
  if (agg.requiredText.fail > 0) {
    if (opts.textNonblocking) {
      return {
        exitCode: 0,
        warning: `${agg.requiredText.fail} required-text failure(s) demoted by --text-nonblocking`,
      };
    }
    return { exitCode: 1 };
  }
  return { exitCode: 0 };
}

/**
 * Result of `runLifecycle`. Distinguishes the setup-failed path (teardown
 * did NOT run — setup is atomic, nothing to undo) from the ok path where
 * `work` produced a value and teardown has already fired in the finally.
 * If `work` throws, `runLifecycle` re-throws after running teardown, so
 * callers see the original error and do NOT need to branch on a "work
 * threw" case here.
 */
export type LifecycleResult<T> =
  | { kind: "ok"; value: T }
  | { kind: "setup_failed"; error: Error };

/**
 * Run `work()` with optional setup/teardown shell commands.
 *
 * Contract:
 *   - `setup` runs BEFORE `work`. Setup failure short-circuits with
 *     `setup_failed`; teardown is NOT invoked (nothing to tear down).
 *   - `teardown` runs in a finally. It fires when `work` returns AND
 *     when `work` throws. Teardown failures are reported via
 *     `onTeardownError` and swallowed so they do not mask the original
 *     outcome.
 *   - If `work` throws, teardown runs, then the original error
 *     propagates out of `runLifecycle`.
 *
 * `exec` is injectable so unit tests can run without spawning real
 * shells. The runner passes an `execSync`-backed wrapper; tests pass a
 * recording stub.
 */
export function runLifecycle<T>(opts: {
  setup?: string;
  teardown?: string;
  work: () => T;
  exec: (cmd: string) => void;
  onTeardownError?: (msg: string) => void;
}): LifecycleResult<T> {
  if (opts.setup) {
    try {
      opts.exec(opts.setup);
    } catch (err) {
      return { kind: "setup_failed", error: err instanceof Error ? err : new Error(String(err)) };
    }
  }
  try {
    return { kind: "ok", value: opts.work() };
  } finally {
    if (opts.teardown) {
      try {
        opts.exec(opts.teardown);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        opts.onTeardownError?.(msg);
      }
    }
  }
}
