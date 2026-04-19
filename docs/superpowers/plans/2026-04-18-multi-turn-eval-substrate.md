# Multi-Turn Eval Substrate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the v2 eval harness to chain multiple `claude` turns via `--resume`, add two new assertion types (`skill_invoked_in_turn`, `chain_order`), and replace the current single-turn `sunk-cost-migration` regression check with a 3-turn version that can observe whether each stage of the planning pipeline actually fires.

**Architecture:** Backward-compatible schema change in `tests/evals-lib.ts` (single-turn `prompt` still works; new evals use `turns[]` + `final_assertions`). A new `runClaudeChain` function in `tests/eval-runner-v2.ts` boots turn 1 with `claude --print --output-format stream-json`, extracts `session_id` from the `type:"system", subtype:"init"` event, and spawns turns 2..N with `claude --resume <id> --print --output-format stream-json`. Per-turn signals are extracted independently; `chain_order` / `skill_invoked_in_turn` run against the per-turn "winner" skill (first `Skill` tool_use in that turn); existing assertion types (`contains` / `regex` / `skill_invoked`) still work per-turn via the turn's own assertions array.

**Tech Stack:** TypeScript, Bun runtime, `claude` CLI (v2.1.98+), `spawnSync` for subprocess control, `bun:test` for unit tests.

**Prework (completed during planning, 2026-04-18):**
- ✅ **`claude --resume <session_id>` works for chaining.** Turn 1's `stream-json` stream emits `type:"system", subtype:"init"` with a `session_id` field (also present on every subsequent event). Turn 2 via `claude --resume <id> --print --output-format stream-json --verbose --permission-mode bypassPermissions` resumed the conversation and correctly recalled context from turn 1 (verified with a "favorite color is chartreuse → what's my favorite color" round-trip). Design stays on `--resume` (SDK path not needed).
- ⚠️ **ADR #0004 status is "Proposed", not "Accepted".** The spec explicitly notes this affects interpretation, not shape: "A passing multi-turn `sunk-cost-migration` against an unaccepted ADR is weaker evidence than against an accepted one." This plan leaves the ADR as-is and documents the interpretation in the eval's `description` / `summary` fields (Task 9) so results are correctly read as probing an intent, not an adopted contract. Accepting ADR #0004 is a separate decision and explicitly out of scope here.

**Reference for reviewers:**
- Spec: `docs/superpowers/specs/2026-04-18-multi-turn-eval-substrate-design.md`
- Current runner: `tests/eval-runner-v2.ts`
- Current library: `tests/evals-lib.ts`
- Current authoring docs: `tests/EVALS.md`
- Current single-turn eval being augmented: `skills/systems-analysis/evals/evals.json` (`sunk-cost-migration` entry)

---

## File Structure

**Files modified:**

| File | Responsibility after this change |
|---|---|
| `tests/evals-lib.ts` | Types + schema loader + single-assertion + single-turn signal extraction (unchanged for single-turn callers). Adds: `skill_invoked_in_turn` and `chain_order` assertion variants; `MultiTurnEval` shape; `ChainSignals` type; `extractSessionId(events)` helper; `evaluateChain(assertion, chainSignals)` evaluator. |
| `tests/eval-runner-v2.ts` | Runs single-turn evals via `runClaude(prompt)` (unchanged) **or** multi-turn evals via new `runClaudeChain(turns, scratchDir)`. Detects eval shape and dispatches. Writes a combined multi-turn transcript. |
| `tests/evals-lib.test.ts` | Adds unit tests for: new assertion validation, new schema loader branches, `extractSessionId`, `evaluateChain`. |
| `tests/EVALS.md` | Adds a "Multi-turn evals" section: when to reach for them, the turn-boundary contract (crafted user replies), and authoring template. Adds the two new assertion rows to the schema table. |
| `skills/systems-analysis/evals/evals.json` | Adds new `sunk-cost-migration-multi-turn` eval (3 turns + final_assertions). Adds a `summary` annotation on existing `sunk-cost-migration` marking it as pre-ADR-#0004 regression guard; does not delete. |

**Files NOT modified (per spec's non-goals and Rakes list):**
- `skills/systems-analysis/SKILL.md` — reverted 2026-04-17, do not touch.
- `skills/define-the-problem/SKILL.md` — out of scope.
- `rules/planning.md` — reverted 2026-04-17, do not touch.
- `superpowers:using-superpowers` — fork rejected as Option 3.
- `tests/eval-runner.ts` (v1) — v1 stays single-turn-only; multi-turn is v2-only.
- `adrs/0004-define-the-problem-mandatory-front-door.md` — status change is a separate decision.

---

## Task 1: Baseline snapshot — confirm current suite passes before changes

Before touching any code, establish a known-good baseline. The current v2 suite is stated as "3/4 evals passing, 10/11 assertions" in the spec; that's expected steady-state. Capture what the numbers look like on this machine so later diffs attribute regressions correctly.

**Files:**
- Read-only: `tests/eval-runner-v2.ts`, `skills/systems-analysis/evals/evals.json`

- [ ] **Step 1: Dry-run the v2 suite to confirm schema + regex validity**

Run: `bun run tests/eval-runner-v2.ts --dry-run`
Expected: exit 0, all assertions reported `[dry-run] ✓`. No CLI spawns.

- [ ] **Step 2: Run the full unit test suite**

Run: `bun test tests/`
Expected: all existing `evals-lib.test.ts` tests pass. Record the count.

- [ ] **Step 3: Typecheck**

Run: `bunx tsc --noEmit`
Expected: exit 0, no errors.

- [ ] **Step 4: (Optional, expensive) Live run of systems-analysis evals to capture baseline numbers**

This task is slow (8 evals × ~30-90s each) and spends real model calls. Skip if the unit/dry-run pass is enough signal that the substrate is intact. If running:

Run: `bun run tests/eval-runner-v2.ts systems-analysis`
Expected: the known-failing `sunk-cost-migration` eval fails its `skill_invoked` assertion (that's the bug this substrate is addressing). All other evals pass. Record the exact fail line for comparison after Task 9.

- [ ] **Step 5: Commit the baseline marker (empty commit, optional)**

If you ran step 4, capture its output in a commit message so the regression diff later has a textual anchor. Otherwise skip.

```fish
git commit --allow-empty -m "Baseline: v2 evals before multi-turn substrate

3/4 evals passing, 10/11 assertions; sunk-cost-migration skill_invoked fails
as expected per issue #90. Captured before multi-turn substrate work."
```

---

## Task 2: Extend `Assertion` type with new variants (schema + validation)

Add two new assertion variants to `evals-lib.ts` that will be used by multi-turn evals. This task only defines types and validation — evaluation comes in Task 6.

**Files:**
- Modify: `tests/evals-lib.ts:9-13` (the `Assertion` union)
- Modify: `tests/evals-lib.ts:85-118` (the `validateAssertion` function)
- Test: `tests/evals-lib.test.ts` (add cases for new validation)

- [ ] **Step 1: Write failing tests for the new assertion variants' validation**

Add to `tests/evals-lib.test.ts` inside a new `describe("validateAssertion() — multi-turn variants", …)` block. Use `brandForTest as v`:

```typescript
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
    expect(() => v({ type: "chain_order", skills: "a,b,c", description: "d" } as Assertion)).toThrow(/skills/);
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run: `bun test tests/evals-lib.test.ts`
Expected: FAIL with "unknown assertion type 'skill_invoked_in_turn'" (the exhaustive switch throws on unknown types).

- [ ] **Step 3: Extend the `Assertion` union**

Edit `tests/evals-lib.ts`. Replace the `Assertion` export (lines 9-13) with:

```typescript
export type Assertion =
  | { type: "contains" | "not_contains"; value: string; description: string }
  | { type: "regex" | "not_regex"; pattern: string; flags?: string; description: string }
  | { type: "skill_invoked" | "not_skill_invoked"; skill: string; description: string }
  | { type: "skill_invoked_in_turn"; turn: number; skill: string; description: string }
  | { type: "chain_order"; skills: string[]; description: string };
```

- [ ] **Step 4: Extend `validateAssertion` switch**

In `tests/evals-lib.ts`, update the `validateAssertion` switch (around line 89) to handle the new variants. Insert before the `default:` branch:

```typescript
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
```

- [ ] **Step 5: Run the tests**

Run: `bun test tests/evals-lib.test.ts`
Expected: all tests pass including the new `validateAssertion() — multi-turn variants` block.

- [ ] **Step 6: Typecheck**

Run: `bunx tsc --noEmit`
Expected: exit 0. The discriminated union exhaustiveness check in `validateAssertion`'s `default` branch still works because the two new variants are covered.

- [ ] **Step 7: Commit**

```fish
git add tests/evals-lib.ts tests/evals-lib.test.ts
git commit -m "Add skill_invoked_in_turn and chain_order assertion types

Extends the Assertion union and validateAssertion with two chain-level
variants. No evaluator logic yet — that lands in a later task."
```

---

## Task 3: Add `session_id` extraction from stream-json events

Turn 1's `type:"system", subtype:"init"` event carries the `session_id` that turn 2 needs for `claude --resume`. This task adds a small extractor with a unit test, and exposes the field on `StreamEvent`.

**Files:**
- Modify: `tests/evals-lib.ts:46-59` (widen `StreamEvent` to name `session_id`)
- Modify: `tests/evals-lib.ts` (add exported `extractSessionId` function)
- Test: `tests/evals-lib.test.ts` (new tests)

- [ ] **Step 1: Write failing tests for `extractSessionId`**

Add to `tests/evals-lib.test.ts`:

```typescript
import { extractSessionId } from "./evals-lib.ts";

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
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `bun test tests/evals-lib.test.ts`
Expected: FAIL with "extractSessionId is not a function" (not yet exported).

- [ ] **Step 3: Widen `StreamEvent` and implement `extractSessionId`**

In `tests/evals-lib.ts`, update `StreamEvent` to name `session_id` explicitly (keeps the catch-all signature; only documents the field):

```typescript
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
```

Add the `extractSessionId` export (place it near `extractSignals`):

```typescript
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
```

- [ ] **Step 4: Run the tests**

Run: `bun test tests/evals-lib.test.ts`
Expected: all tests pass including `extractSessionId()`.

- [ ] **Step 5: Typecheck and commit**

Run: `bunx tsc --noEmit`
Expected: exit 0.

```fish
git add tests/evals-lib.ts tests/evals-lib.test.ts
git commit -m "Add extractSessionId from stream-json init event

Pulls session_id from type:'system' subtype:'init'. Skips past earlier
hook events that also carry session_id. Needed by the multi-turn runner
to pass --resume <id> on turns 2..N."
```

---

## Task 4: Extend `Eval` + `EvalFile` schema to accept `turns[]` + `final_assertions`

Make the loader accept either shape — `{prompt, assertions}` (single-turn, unchanged) or `{turns: [{prompt, assertions}, …], final_assertions}` (multi-turn). Validation is strict: exactly one shape, not both; each turn's assertions array must be non-empty; `final_assertions` is optional.

**Files:**
- Modify: `tests/evals-lib.ts:24-35` (`Eval`, `EvalFile` types)
- Modify: `tests/evals-lib.ts:120-145` (`loadEvalFile`)
- Test: `tests/evals-lib.test.ts` (new loader tests)

- [ ] **Step 1: Write failing tests covering all four schema shapes**

Add to `tests/evals-lib.test.ts` a new describe block. Uses a helper to write a temp evals.json and call `loadEvalFile`:

```typescript
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
    expect(file!.evals[0].turns).toHaveLength(2);
    expect(file!.evals[0].final_assertions).toHaveLength(1);
    expect(file!.evals[0].prompt).toBeUndefined();
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
    expect(file!.evals[0].prompt).toBe("hello");
    expect(file!.evals[0].turns).toBeUndefined();
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
    expect(file!.evals[0].final_assertions ?? []).toEqual([]);
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
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `bun test tests/evals-lib.test.ts`
Expected: FAIL — loader still requires `prompt` and rejects `turns`.

- [ ] **Step 3: Update `Eval`, `EvalFile`, and loader types**

In `tests/evals-lib.ts`, replace the `Eval` and `EvalFile` interfaces (lines 24-35) with:

```typescript
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

export interface ValidatedEval {
  readonly name: string;
  readonly summary?: string;
  readonly prompt?: string;
  readonly assertions?: readonly ValidatedAssertion[];
  readonly turns?: readonly ValidatedTurn[];
  readonly final_assertions?: readonly ValidatedAssertion[];
}

export interface EvalFile {
  skill: string;
  description?: string;
  evals: ValidatedEval[];
}
```

- [ ] **Step 4: Rewrite `loadEvalFile` to accept both shapes**

In `tests/evals-lib.ts`, replace the `loadEvalFile` function (around lines 120-145). The new loader routes on shape and enforces:
- exactly one of `prompt` / `turns` is set, not both, not neither
- single-turn: `assertions` is a non-empty array
- multi-turn: `turns` non-empty; each turn has `prompt` + non-empty `assertions`; `final_assertions` is optional (may be absent or a non-empty array); per-turn assertions cannot be `chain_order` or `skill_invoked_in_turn`; `skill_invoked_in_turn.turn` must be `<= turns.length`.

```typescript
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
      throw new Error(`${file}: eval is missing 'name'`);
    }
    const hasPrompt = typeof e.prompt === "string" && e.prompt.length > 0;
    const hasTurns = Array.isArray(e.turns);
    if (hasPrompt && hasTurns) {
      throw new Error(`${file}: eval '${e.name}' has both 'prompt' and 'turns' — pick one`);
    }
    if (!hasPrompt && !hasTurns) {
      throw new Error(`${file}: eval '${e.name}' must define either 'prompt' (single-turn) or 'turns' (multi-turn)`);
    }

    if (hasPrompt) {
      if (!Array.isArray(e.assertions) || e.assertions.length === 0) {
        throw new Error(`${file}: eval '${e.name}' missing non-empty 'assertions'`);
      }
      const validated: ValidatedAssertion[] = [];
      for (const a of e.assertions) {
        if (a.type === "chain_order" || a.type === "skill_invoked_in_turn") {
          throw new Error(`${file}: eval '${e.name}': '${a.type}' is a chain-level assertion; use it in 'final_assertions' on a multi-turn eval`);
        }
        validated.push(validateAssertion(a, `${file}: eval '${e.name}'`));
      }
      validatedEvals.push({ name: e.name, summary: e.summary, prompt: e.prompt, assertions: validated });
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
        const v = validateAssertion(a, `${file}: eval '${e.name}' final_assertions`);
        if (a.type === "skill_invoked_in_turn" && a.turn > validatedTurns.length) {
          throw new Error(`${file}: eval '${e.name}' final_assertions: skill_invoked_in_turn.turn=${a.turn} is out of range (only ${validatedTurns.length} turns)`);
        }
        validatedFinal.push(v);
      }
    }

    validatedEvals.push({
      name: e.name,
      summary: e.summary,
      turns: validatedTurns,
      final_assertions: validatedFinal,
    });
  }

  return { skill: parsed.skill, description: parsed.description, evals: validatedEvals };
}
```

- [ ] **Step 5: Run tests**

Run: `bun test tests/evals-lib.test.ts`
Expected: all tests pass, including every new schema test.

- [ ] **Step 6: Typecheck**

Run: `bunx tsc --noEmit`
Expected: exit 0.

The existing runners reference `e.prompt` and `e.assertions` as required — Task 7 + 8 adapt the v2 runner for the multi-turn branch. The v1 runner still only sees single-turn evals (it can and should throw `Error: …has both 'prompt' and 'turns'` if given a multi-turn eval, but it will actually receive a `ValidatedEval` with `prompt` undefined, which the v1 code path reads via `e.prompt`). Verify v1 does not regress:

Run: `bun run tests/eval-runner.ts --dry-run`
Expected: exit 0; v1 only reads single-turn evals and all existing JSON is still single-turn, so dry-run is clean.

- [ ] **Step 7: Commit**

```fish
git add tests/evals-lib.ts tests/evals-lib.test.ts
git commit -m "Extend EvalFile schema with turns[] + final_assertions

Backward-compatible: single-turn evals continue to use prompt+assertions.
Multi-turn evals declare turns[] with per-turn assertions and optional
final_assertions for chain-level checks. Loader enforces exactly one
shape per eval and rejects chain-level assertion types in per-turn slots."
```

---

## Task 5: Add `ChainSignals` type and aggregation helper

Chain-level assertions need a unified view of per-turn signals. This task adds the container type and the logic to aggregate per-turn `Signals` into `ChainSignals`.

**Files:**
- Modify: `tests/evals-lib.ts` (add `ChainSignals` type and `aggregateChainSignals`)
- Test: `tests/evals-lib.test.ts`

- [ ] **Step 1: Write failing tests for `aggregateChainSignals`**

```typescript
import { aggregateChainSignals, type ChainSignals, type SkillInvocation, type ToolUse } from "./evals-lib.ts";

describe("aggregateChainSignals()", () => {
  function inv(skill: string): SkillInvocation {
    return { skill, raw: { name: "Skill" as const, input: { skill } } };
  }

  test("per_turn preserves the full signal for each turn; union is all invocations", () => {
    const t1: Signals = { finalText: "one", toolUses: [], skillInvocations: [inv("a")], terminalState: "result" };
    const t2: Signals = { finalText: "two", toolUses: [], skillInvocations: [inv("b"), inv("c")], terminalState: "result" };
    const chain = aggregateChainSignals([t1, t2]);
    expect(chain.per_turn).toHaveLength(2);
    expect(chain.per_turn[0]).toBe(t1);
    expect(chain.union_skill_invocations.map((s) => s.skill)).toEqual(["a", "b", "c"]);
  });

  test("per_turn_winner returns the first skill invocation per turn, or undefined if none fired", () => {
    const t1: Signals = { finalText: "", toolUses: [], skillInvocations: [inv("a"), inv("b")], terminalState: "result" };
    const t2: Signals = { finalText: "", toolUses: [], skillInvocations: [], terminalState: "result" };
    const t3: Signals = { finalText: "", toolUses: [], skillInvocations: [inv("c")], terminalState: "result" };
    const chain = aggregateChainSignals([t1, t2, t3]);
    expect(chain.per_turn_winner).toEqual(["a", undefined, "c"]);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `bun test tests/evals-lib.test.ts`
Expected: FAIL with "aggregateChainSignals is not a function".

- [ ] **Step 3: Add types and function**

In `tests/evals-lib.ts`, after the `Signals` interface, add:

```typescript
/**
 * Container for per-turn signals in a multi-turn eval run, plus aggregations
 * that chain-level assertions consume.
 *
 * `per_turn_winner[i]` is the first skill invocation seen in turn `i+1`
 * (1-indexed in the schema), or `undefined` if no skill fired. This is the
 * "winner" — the skill the model chose to run for that turn. `chain_order`
 * assertions compare their expected sequence against this array (filtering
 * out turns with no winner to keep the contract intuitive: a chain like
 * `[DTP, SA, brainstorming]` should still pass even if one of the turns
 * also emits an incidental helper skill, as long as the winners line up).
 */
export interface ChainSignals {
  readonly per_turn: readonly Signals[];
  readonly per_turn_winner: readonly (string | undefined)[];
  readonly union_skill_invocations: readonly SkillInvocation[];
}

export function aggregateChainSignals(per_turn: readonly Signals[]): ChainSignals {
  const per_turn_winner = per_turn.map((s) => s.skillInvocations[0]?.skill);
  const union_skill_invocations = per_turn.flatMap((s) => s.skillInvocations);
  return { per_turn, per_turn_winner, union_skill_invocations };
}
```

- [ ] **Step 4: Run tests**

Run: `bun test tests/evals-lib.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Typecheck and commit**

Run: `bunx tsc --noEmit`
Expected: exit 0.

```fish
git add tests/evals-lib.ts tests/evals-lib.test.ts
git commit -m "Add ChainSignals type and aggregateChainSignals helper

Builds a unified view across per-turn Signals: the per-turn winner skill
(first Skill tool_use per turn), and the union of all skill invocations.
Chain-level assertions consume this in the next task."
```

---

## Task 6: Implement `evaluateChain` for `skill_invoked_in_turn` and `chain_order`

Per-turn assertions continue to use the existing `evaluate(assertion, signals)`. Chain-level final assertions need `evaluateChain(assertion, chainSignals)`.

**Files:**
- Modify: `tests/evals-lib.ts` (add `evaluateChain`)
- Test: `tests/evals-lib.test.ts`

- [ ] **Step 1: Write failing tests for `evaluateChain`**

```typescript
import { evaluateChain, brandForTest as v } from "./evals-lib.ts";

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
      union_skill_invocations: winners.filter((w): w is string => !!w).map(inv),
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
      union_skill_invocations: [inv("winner"), inv("helper")],
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
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `bun test tests/evals-lib.test.ts`
Expected: FAIL with "evaluateChain is not a function".

- [ ] **Step 3: Implement `evaluateChain`**

Add to `tests/evals-lib.ts`, near `evaluate`:

```typescript
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
    default:
      // Other assertion variants are per-turn; the runner should route them to
      // `evaluate`, not here. Reaching this branch is a runner bug.
      return fail(`evaluateChain called with non-chain assertion type '${(assertion as { type: string }).type}' — this is a runner bug`);
  }
}
```

- [ ] **Step 4: Run tests**

Run: `bun test tests/evals-lib.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Typecheck and commit**

Run: `bunx tsc --noEmit`
Expected: exit 0.

```fish
git add tests/evals-lib.ts tests/evals-lib.test.ts
git commit -m "Add evaluateChain for chain_order and skill_invoked_in_turn

Chain-level assertions read across turns: chain_order compares the
sequence of per-turn winner skills to an expected list; skill_invoked_in_turn
asserts a specific skill fired in a specific turn (membership, not winnership)."
```

---

## Task 7: Add `runClaudeChain` to the v2 runner

Extend the v2 runner with a chained spawn helper. Turn 1 boots a fresh session and captures `session_id`; turns 2..N call `claude --resume <id>`. All turns share the same scratch cwd so tool writes persist across the chain.

**Files:**
- Modify: `tests/eval-runner-v2.ts` (add `runClaudeChain`; refactor `runClaude` scratchDir handling so both code paths share cleanup)

- [ ] **Step 1: Refactor `runClaude` to take an optional preallocated `cwd`**

This is a no-behavior-change refactor that lets the chain helper control the scratch dir lifecycle.

In `tests/eval-runner-v2.ts`, replace the `runClaude` function (lines 70-101) with:

```typescript
/**
 * Spawn a single fresh `claude --print` turn in an isolated scratch cwd.
 * Used for single-turn evals and as turn 1 of a multi-turn chain.
 *
 * When `cwd` is provided (by the chain helper), the caller owns cleanup.
 * Otherwise we create and clean up a tmpdir in this function.
 */
function runClaude(prompt: string, cwd?: string): CliRun {
  const timeoutMs = 5 * 60 * 1000;
  const ownCwd = cwd ?? mkdtempSync(join(tmpdir(), "claude-eval-"));
  try {
    const res = spawnSync(
      claudeBin,
      ["--print", "--output-format", "stream-json", "--verbose", "--permission-mode", "bypassPermissions"],
      {
        input: prompt,
        encoding: "utf8",
        timeout: timeoutMs,
        maxBuffer: 64 * 1024 * 1024,
        cwd: ownCwd,
      },
    );
    let failure: string | undefined;
    if (res.error) {
      failure = `spawn error: ${(res.error as NodeJS.ErrnoException).code ?? ""} ${res.error.message}`.trim();
    } else if (res.signal) {
      failure = res.signal === "SIGTERM" ? `timed out after ${timeoutMs / 1000}s (SIGTERM)` : `killed by signal ${res.signal}`;
    } else if (res.status === null) {
      failure = "process exited without status (no signal, no error)";
    }
    return { stdout: res.stdout ?? "", stderr: res.stderr ?? "", exitCode: res.status, failure };
  } finally {
    if (!cwd) {
      try {
        rmSync(ownCwd, { recursive: true, force: true });
      } catch (err) {
        console.error(`[eval-runner] failed to clean scratch dir ${ownCwd}: ${(err as Error).message}`);
      }
    }
  }
}
```

- [ ] **Step 2: Add types and `runClaudeChain` alongside `runClaude`**

Still in `tests/eval-runner-v2.ts`, add near the top (after `CliRun`):

```typescript
import { extractSessionId } from "./evals-lib.ts";

interface ChainRun {
  readonly turns: readonly CliRun[];
  readonly sessionId: string | null;
  /** Set when the chain could not proceed — e.g. turn 1 failed or yielded no session_id. */
  readonly chainFailure?: string;
}
```

Add the chain function below `runClaude`:

```typescript
/**
 * Run an N-turn chain via `claude --print` (turn 1) + `claude --resume <id>`
 * (turns 2..N). All turns share one scratch cwd so tool writes persist.
 *
 * Short-circuits if turn 1 fails to produce a session_id — chain continuation
 * would be meaningless without a valid --resume handle. Partial-failure runs
 * return a `chainFailure` message; the caller decides how to render it.
 *
 * Each turn has its own 5-minute timeout; a 3-turn chain therefore caps at 15
 * minutes of wall time.
 */
function runClaudeChain(turnPrompts: readonly string[]): ChainRun {
  if (turnPrompts.length === 0) {
    return { turns: [], sessionId: null, chainFailure: "chain has zero turns" };
  }
  const scratchDir = mkdtempSync(join(tmpdir(), "claude-eval-chain-"));
  const runs: CliRun[] = [];
  let sessionId: string | null = null;
  let chainFailure: string | undefined;
  try {
    // Turn 1: fresh session
    const t1 = runClaude(turnPrompts[0], scratchDir);
    runs.push(t1);
    if (t1.failure || t1.exitCode !== 0) {
      chainFailure = `turn 1 failed: ${t1.failure ?? `exit ${t1.exitCode}`}`;
      return { turns: runs, sessionId: null, chainFailure };
    }
    const { events: t1Events } = parseStreamJson(t1.stdout);
    sessionId = extractSessionId(t1Events);
    if (!sessionId) {
      chainFailure = `turn 1 produced no session_id in stream-json init event (events=${t1Events.length})`;
      return { turns: runs, sessionId: null, chainFailure };
    }

    // Turns 2..N: resume
    for (let i = 1; i < turnPrompts.length; i++) {
      const timeoutMs = 5 * 60 * 1000;
      const res = spawnSync(
        claudeBin,
        [
          "--resume", sessionId,
          "--print",
          "--output-format", "stream-json",
          "--verbose",
          "--permission-mode", "bypassPermissions",
        ],
        {
          input: turnPrompts[i],
          encoding: "utf8",
          timeout: timeoutMs,
          maxBuffer: 64 * 1024 * 1024,
          cwd: scratchDir,
        },
      );
      let failure: string | undefined;
      if (res.error) {
        failure = `spawn error: ${(res.error as NodeJS.ErrnoException).code ?? ""} ${res.error.message}`.trim();
      } else if (res.signal) {
        failure = res.signal === "SIGTERM" ? `timed out after ${timeoutMs / 1000}s (SIGTERM)` : `killed by signal ${res.signal}`;
      } else if (res.status === null) {
        failure = "process exited without status (no signal, no error)";
      }
      const turnRun: CliRun = { stdout: res.stdout ?? "", stderr: res.stderr ?? "", exitCode: res.status, failure };
      runs.push(turnRun);
      if (failure || res.status !== 0) {
        chainFailure = `turn ${i + 1} failed: ${failure ?? `exit ${res.status}`}`;
        // Stop the chain — turn N+1 depends on N succeeding. Assertions for
        // later turns will be counted as failures by the caller.
        return { turns: runs, sessionId, chainFailure };
      }
    }

    return { turns: runs, sessionId };
  } finally {
    try {
      rmSync(scratchDir, { recursive: true, force: true });
    } catch (err) {
      console.error(`[eval-runner] failed to clean scratch dir ${scratchDir}: ${(err as Error).message}`);
    }
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `bunx tsc --noEmit`
Expected: exit 0. `runClaudeChain` is added but not yet called from `main` — that's Task 8.

- [ ] **Step 4: Dry-run to confirm the v2 runner still loads**

Run: `bun run tests/eval-runner-v2.ts --dry-run`
Expected: exit 0. All existing evals are single-turn so the chain path is not yet exercised, but the file must still parse.

- [ ] **Step 5: Commit**

```fish
git add tests/eval-runner-v2.ts
git commit -m "Add runClaudeChain helper to v2 runner

Chains N turns via claude --print + claude --resume <id>. Shares one
scratch cwd across turns. Short-circuits on turn failure or missing
session_id. Not yet wired into main() — that's the next task."
```

---

## Task 8: Wire the multi-turn branch into `main()` with per-turn + final assertions

Dispatch in the main loop on `e.prompt` (single-turn) vs `e.turns` (multi-turn). For multi-turn evals: run the chain, extract per-turn signals, evaluate each turn's assertions against that turn's signals, evaluate `final_assertions` against aggregated `ChainSignals`, and write a unified transcript.

**Files:**
- Modify: `tests/eval-runner-v2.ts` — `main()` body (lines 216-313), `writeTranscript` (lines 111-167)

- [ ] **Step 1: Add a multi-turn transcript writer**

Add after `writeTranscript` in `tests/eval-runner-v2.ts`:

```typescript
interface ChainTranscriptArgs {
  readonly path: string;
  readonly skillName: string;
  readonly evalName: string;
  readonly turnPrompts: readonly string[];
  readonly turnSignals: ReadonlyArray<Signals | null>;
  readonly turnRuns: readonly CliRun[];
  readonly sessionId: string | null;
  readonly chainFailure?: string;
}

function writeChainTranscript(a: ChainTranscriptArgs): void {
  const body: string[] = [
    `# ${a.skillName} / ${a.evalName} (v2, multi-turn)`,
    "",
    `session_id: ${a.sessionId ?? "(none)"}`,
    `turns_run: ${a.turnRuns.length}/${a.turnPrompts.length}`,
  ];
  if (a.chainFailure) body.push(`chain_failure: ${a.chainFailure}`);
  body.push("");

  for (let i = 0; i < a.turnPrompts.length; i++) {
    const run = a.turnRuns[i];
    const signals = a.turnSignals[i] ?? null;
    body.push(`## Turn ${i + 1} prompt`, "", a.turnPrompts[i], "");
    if (!run) {
      body.push(`(turn not run — chain aborted before reaching it)`, "");
      continue;
    }
    body.push(`## Turn ${i + 1} final text`, "", signals?.finalText ?? "(no signals — turn failed)", "");
    const meta = [
      `exit_code: ${run.exitCode ?? "(none)"}`,
      `stdout_bytes: ${run.stdout.length}`,
      `stderr_bytes: ${run.stderr.length}`,
      `terminal_state: ${signals?.terminalState ?? "(no signals)"}`,
      `tool_uses: ${signals?.toolUses.map((t) => t.name).join(", ") || "(none)"}`,
      `skills_invoked: ${signals?.skillInvocations.map((s) => s.skill).join(", ") || "(none)"}`,
    ].join("\n");
    body.push(`## Turn ${i + 1} metadata`, "", meta, "");
    if (run.failure) body.push(`## Turn ${i + 1} failure`, "", run.failure, "");
    if (run.stderr.trim()) body.push(`## Turn ${i + 1} stderr`, "", run.stderr, "");
    body.push(`## Turn ${i + 1} raw stream-json stdout`, "", "```", run.stdout || "(empty)", "```", "");
  }

  try {
    writeFileSync(a.path, body.join("\n"));
  } catch (err) {
    console.log(`    ${dim(`(transcript write failed: ${(err as Error).message})`)}`);
  }
}
```

- [ ] **Step 2: Update imports in the runner**

Update the top-of-file import from `./evals-lib.ts` to include the new helpers:

```typescript
import {
  type EvalFile,
  type Signals,
  type ChainSignals,
  type CliRun as _CliRunFromLib, // not exported — leave alone, CliRun stays local
  aggregateChainSignals,
  discoverSkills,
  evaluate,
  evaluateChain,
  extractSessionId,
  extractSignals,
  loadEvalFile,
  parseStreamJson,
} from "./evals-lib.ts";
```

(Note: `CliRun` is defined in the runner file, not the library — do not import it.)

- [ ] **Step 3: Refactor the main per-eval loop to dispatch on shape**

In `tests/eval-runner-v2.ts`, replace the body of the inner `for (const e of evalFile.evals)` loop (lines ~216-312) with a shape-dispatch. The single-turn branch is the existing code moved into a helper; the multi-turn branch is new.

Extract the single-turn handler into a local function at the top of `main()`:

```typescript
async function main() {
  // … existing skill discovery / load / probe / mkdir …

  // Shared helpers captured by the two branches below so the report counters
  // and transcript paths come from one place.
  let totalEvals = 0;
  let passedEvals = 0;
  let totalAssertions = 0;
  let passedAssertions = 0;

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

  function runSingleTurnEval(skillName: string, e: (typeof evalFile)["evals"][number]): void {
    // ... the body that currently lives in the loop, unchanged except for the
    // references to local variables that now come from the enclosing scope
    // (totalAssertions, passedAssertions, etc.).
  }

  function runMultiTurnEval(skillName: string, e: (typeof evalFile)["evals"][number]): void {
    // ... defined in step 4 below
  }
```

Then in the loop:

```typescript
      if (dryRun) {
        const turns = e.turns ?? [{ prompt: e.prompt!, assertions: e.assertions! }];
        for (const t of turns) {
          for (const a of t.assertions) {
            totalAssertions++;
            passedAssertions++;
            console.log(`    ${green("✓")} ${dim("[dry-run]")} ${a.description}`);
          }
        }
        for (const a of e.final_assertions ?? []) {
          totalAssertions++;
          passedAssertions++;
          console.log(`    ${green("✓")} ${dim("[dry-run, final]")} ${a.description}`);
        }
        passedEvals++;
        continue;
      }

      if (e.turns) {
        runMultiTurnEval(skillName, e);
      } else {
        runSingleTurnEval(skillName, e);
      }
```

- [ ] **Step 4: Implement `runMultiTurnEval`**

```typescript
  function runMultiTurnEval(skillName: string, e: (typeof evalFile)["evals"][number]): void {
    const turns = e.turns!;
    const turnPrompts = turns.map((t) => t.prompt);
    const transcriptFile = join(resultsDir, `${skillName}-${e.name}-v2-multiturn-${timestamp}.md`);
    const { turns: runs, sessionId, chainFailure } = runClaudeChain(turnPrompts);

    // Extract per-turn signals for each completed turn. Missing turns (chain
    // aborted before reaching them) get null signals; their assertions count
    // as failures. The first turn to fail has a CliRun entry but may have
    // unparseable stdout; the extractor gracefully returns terminalState:"empty".
    const turnSignals: (Signals | null)[] = [];
    for (const run of runs) {
      if (run.failure || run.exitCode !== 0) {
        turnSignals.push(null);
        continue;
      }
      const { events } = parseStreamJson(run.stdout);
      if (events.length === 0) {
        turnSignals.push(null);
        continue;
      }
      turnSignals.push(extractSignals(events));
    }
    while (turnSignals.length < turns.length) turnSignals.push(null);

    writeChainTranscript({
      path: transcriptFile,
      skillName,
      evalName: e.name,
      turnPrompts,
      turnSignals,
      turnRuns: runs,
      sessionId,
      chainFailure,
    });

    let evalPassed = true;
    if (chainFailure) {
      console.log(`    ${red("✗")} ${chainFailure}`);
      // All assertions still count — mark them failed so the summary is honest.
      for (const t of turns) totalAssertions += t.assertions.length;
      totalAssertions += e.final_assertions?.length ?? 0;
      console.log(dim(`      transcript → ${transcriptFile.replace(repoDir + "/", "")}`));
      return;
    }

    // Per-turn assertions
    for (let i = 0; i < turns.length; i++) {
      const signals = turnSignals[i];
      for (const a of turns[i].assertions) {
        totalAssertions++;
        if (!signals) {
          evalPassed = false;
          console.log(`    ${red("✗")} turn ${i + 1}: ${a.description}`);
          console.log(`        ${dim("no signals for this turn")}`);
          continue;
        }
        const r = evaluate(a, signals);
        if (r.ok) {
          passedAssertions++;
          console.log(`    ${green("✓")} turn ${i + 1}: ${r.description}`);
        } else {
          evalPassed = false;
          console.log(`    ${red("✗")} turn ${i + 1}: ${r.description}`);
          console.log(`        ${dim(r.detail)}`);
        }
      }
    }

    // Chain-level final assertions
    if (e.final_assertions && e.final_assertions.length > 0) {
      const chain = aggregateChainSignals(turnSignals.map((s) => s ?? { finalText: "", toolUses: [], skillInvocations: [], terminalState: "empty" as const }));
      for (const a of e.final_assertions) {
        totalAssertions++;
        const r = evaluateChain(a, chain);
        if (r.ok) {
          passedAssertions++;
          console.log(`    ${green("✓")} final: ${r.description}`);
        } else {
          evalPassed = false;
          console.log(`    ${red("✗")} final: ${r.description}`);
          console.log(`        ${dim(r.detail)}`);
        }
      }
    }

    if (evalPassed) passedEvals++;
    const union = turnSignals.reduce((sum, s) => sum + (s?.skillInvocations.length ?? 0), 0);
    console.log(
      dim(
        `      transcript → ${transcriptFile.replace(repoDir + "/", "")}` +
          ` (turns=${runs.length}/${turns.length} skills=${union} session=${sessionId ?? "none"})`,
      ),
    );
  }
```

- [ ] **Step 5: Move the existing single-turn logic into `runSingleTurnEval`**

Copy the original per-eval body (the exit-0, no-events, extractSignals, writeTranscript, and per-assertion loop from lines ~230-312) into the `runSingleTurnEval` helper. It now references `totalEvals`/`passedEvals`/`totalAssertions`/`passedAssertions`/`timestamp` from the enclosing `main` scope. Remove the original code from the outer loop.

`totalEvals++` and the `console.log(bold("▸"), …)` announcement stay in the outer loop — shared by both branches.

- [ ] **Step 6: Typecheck**

Run: `bunx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 7: Dry-run to verify the suite still parses and reports correctly**

Run: `bun run tests/eval-runner-v2.ts --dry-run`
Expected: exit 0. Single-turn evals report all assertions as `[dry-run] ✓`. Until Task 9 adds the multi-turn eval, the dry-run pass does not exercise the multi-turn branch.

- [ ] **Step 8: Unit tests still green**

Run: `bun test tests/`
Expected: all tests pass.

- [ ] **Step 9: Commit**

```fish
git add tests/eval-runner-v2.ts
git commit -m "Wire multi-turn eval branch into v2 runner main loop

Dispatches on eval shape: single-turn keeps the existing behaviour;
multi-turn calls runClaudeChain, extracts per-turn signals, and runs
per-turn assertions against per-turn signals plus final_assertions
against aggregated ChainSignals. Writes a unified multi-turn transcript."
```

---

## Task 9: Add the `sunk-cost-migration-multi-turn` eval

Encode the 3-turn chain in `skills/systems-analysis/evals/evals.json`. Keep the existing single-turn `sunk-cost-migration` eval in place (annotated as the pre-ADR-#0004 regression guard) until the multi-turn version is validated.

Turn-boundary contract decision (spec's explicit open question): **crafted user replies** (spec recommendation). Turns 2 and 3 are minimal, realistic continuations a human would actually type in a live pipeline handoff. We accept the marginal authoring cost to keep the eval close to real conversations; if eval authoring costs become prohibitive for future multi-turn evals, revisit auto-advance stubs in `tests/EVALS.md`.

ADR #0004 interpretation (spec's prework item 2): **document in plan that evals probe an intent, not an adopted contract**. The new eval's description/summary will say so explicitly.

**Files:**
- Modify: `skills/systems-analysis/evals/evals.json`

- [ ] **Step 1: Add the new multi-turn eval**

Edit `skills/systems-analysis/evals/evals.json`. Inside the `evals` array, insert a new entry immediately after the existing `sunk-cost-migration` eval (which lives around lines 55-72 in the current file). The new entry:

```json
    {
      "name": "sunk-cost-migration-multi-turn",
      "summary": "REGRESSION GUARD (multi-turn). Probes whether the full DTP → systems-analysis → brainstorming pipeline chains end-to-end under sunk-cost pressure. Uses crafted user replies for turns 2-3 to keep behaviour close to a real conversation. NOTE: ADR #0004 is currently 'Proposed' (not 'Accepted') — this eval probes the intended contract, not an adopted one; a pass is weaker evidence than it would be after acceptance.",
      "turns": [
        {
          "prompt": "We already committed to migrating our auth service from in-house JWT to Auth0 last quarter — the vendor contract is signed. Don't re-analyze the system, just help me brainstorm migration steps and cutover strategies.",
          "assertions": [
            {
              "type": "skill_invoked",
              "skill": "define-the-problem",
              "description": "Turn 1: DTP fires — mandatory front door per ADR #0004, regardless of sunk-cost framing"
            },
            {
              "type": "not_regex",
              "pattern": "^(##\\s*)?(migration steps|cutover (plan|strateg)|step 1[:.])\\b",
              "flags": "im",
              "description": "Turn 1: does NOT lead with a migration-steps section — front-door bypass would be a regression"
            }
          ]
        },
        {
          "prompt": "Confirmed — the problem statement is correct as drafted. Proceed.",
          "assertions": [
            {
              "type": "skill_invoked",
              "skill": "systems-analysis",
              "description": "Turn 2: systems-analysis fires next — surface-area pass must run before brainstorming, even after the user confirms the problem"
            }
          ]
        },
        {
          "prompt": "Looks good — let's move on to brainstorming migration approaches.",
          "assertions": [
            {
              "type": "skill_invoked",
              "skill": "superpowers:brainstorming",
              "description": "Turn 3: brainstorming fires — the pipeline reaches the stage the user originally asked for, but only after DTP and systems-analysis have run"
            }
          ]
        }
      ],
      "final_assertions": [
        {
          "type": "chain_order",
          "skills": ["define-the-problem", "systems-analysis", "superpowers:brainstorming"],
          "description": "Chain order matches the pipeline: DTP → systems-analysis → brainstorming. Any reordering or missing stage is the exact regression this eval exists to catch."
        },
        {
          "type": "skill_invoked_in_turn",
          "turn": 2,
          "skill": "systems-analysis",
          "description": "systems-analysis specifically fires in turn 2 — not just somewhere in the chain. Guards against the skill running only as a stub from inside another skill."
        }
      ]
    },
```

- [ ] **Step 2: Annotate the existing single-turn `sunk-cost-migration` eval**

Still in `skills/systems-analysis/evals/evals.json`, update the `summary` of the existing `sunk-cost-migration` eval (around line 57) to mark it as the pre-ADR-#0004 regression guard kept alongside the new multi-turn version until validation. Change the summary field from:

```json
      "summary": "REGRESSION GUARD. Sunk-cost framing ('contract signed, don't re-analyze') previously caused full skip. Must reframe systems analysis as mapping breakage points, not re-litigating the decision.",
```

to:

```json
      "summary": "REGRESSION GUARD (single-turn, pre-ADR-#0004). Sunk-cost framing ('contract signed, don't re-analyze') previously caused full skip. Single-turn evals can only observe the first skill fired; kept alongside sunk-cost-migration-multi-turn until the multi-turn version has been validated on a live run, then remove (per plan Task 11). Must reframe systems analysis as mapping breakage points, not re-litigating the decision.",
```

- [ ] **Step 3: Dry-run to validate the new JSON**

Run: `bun run tests/eval-runner-v2.ts --dry-run systems-analysis`
Expected: exit 0. The new eval's assertions all report `[dry-run] ✓` and `[dry-run, final] ✓`; schema validation passes (no "chain_order is a chain-level assertion" errors, no out-of-range turn indexes).

- [ ] **Step 4: Run unit tests**

Run: `bun test tests/`
Expected: all tests pass — schema validation of the new eval exercises the loader through `loadEvalFile` indirectly via the dry-run already, but unit tests confirm no collateral damage.

- [ ] **Step 5: Commit**

```fish
git add skills/systems-analysis/evals/evals.json
git commit -m "Add sunk-cost-migration-multi-turn eval

3-turn chain that observes each stage of the DTP → systems-analysis →
brainstorming pipeline under sunk-cost pressure. Uses crafted user
replies for turns 2-3 (spec recommendation). Keeps the single-turn
sunk-cost-migration eval alongside as the pre-ADR-#0004 regression
guard until the multi-turn version is validated on a live run."
```

---

## Task 10: Update `tests/EVALS.md` with multi-turn authoring guidance

Document the multi-turn path: when to reach for it, the schema extensions, the turn-boundary contract, and a worked example.

**Files:**
- Modify: `tests/EVALS.md`

- [ ] **Step 1: Add new rows to the schema table for the two new assertion types**

In `tests/EVALS.md`, extend the schema table's `assertion.type` row (around line 77) to include the two new types:

```markdown
| `assertion.type` | required | one of `contains` / `not_contains` / `regex` / `not_regex` / `skill_invoked` / `not_skill_invoked` / `skill_invoked_in_turn` / `chain_order` |
```

Add new rows after `assertion.skill`:

```markdown
| `assertion.turn` | required for `skill_invoked_in_turn` | integer ≥ 1; refers to turn index in a multi-turn eval's `turns[]` array |
| `assertion.skills` | required for `chain_order` | non-empty array of non-empty skill names; compared against the sequence of per-turn winner skills |
```

- [ ] **Step 2: Add the Multi-turn evals section**

Add a new `## Multi-turn evals` section between the current `## Eval file schema` section and the existing `## Signal channels (v2)` section. Content:

```markdown
## Multi-turn evals

`claude --print` is single-turn. Some behavioural regressions — notably the
planning pipeline's DTP → systems-analysis → brainstorming chain — can only be
observed across turns. The v2 runner supports an additive multi-turn shape that
runs a chain via `claude --print` (turn 1) + `claude --resume <session_id>`
(turns 2..N). All turns share one scratch cwd so tool writes persist.

### When to reach for multi-turn

Prefer single-turn by default — it's faster, cheaper, and simpler to author.
Reach for multi-turn only when the thing under test is the chaining behaviour
itself: pipeline stage transitions, retention of context across turns, or a
behaviour that only emerges after the first hand-off.

If you find yourself writing a single-turn eval with heroically complex regex
to catch a behaviour that happens on a follow-up, you probably want multi-turn.

### Multi-turn schema

A multi-turn eval declares `turns[]` instead of `prompt`. Each turn has its
own `prompt` and `assertions` (these run against that turn's stream-json
output only). The eval may also declare `final_assertions` that run against
the whole chain.

```json
{
  "name": "my-multi-turn-eval",
  "summary": "...",
  "turns": [
    { "prompt": "turn 1 user message", "assertions": [/* per-turn */] },
    { "prompt": "turn 2 user message", "assertions": [/* per-turn */] },
    { "prompt": "turn 3 user message", "assertions": [/* per-turn */] }
  ],
  "final_assertions": [
    { "type": "chain_order", "skills": ["a", "b", "c"], "description": "..." },
    { "type": "skill_invoked_in_turn", "turn": 2, "skill": "b", "description": "..." }
  ]
}
```

An eval declares **either** `prompt` (single-turn) **or** `turns[]` (multi-turn),
never both. `final_assertions` only applies to multi-turn evals and is optional.

### The turn-boundary contract: crafted user replies

Turns 2..N contain **crafted user replies** — realistic continuations a human
would actually type when handed off between pipeline stages ("confirmed —
proceed", "move on to brainstorming"). This keeps eval behaviour close to
real conversations. The trade-off: each multi-turn eval needs its turn-2/3
text written by hand.

Auto-advance stubs (canned "ok"/"yes" replies injected by the harness) were
considered and rejected for the initial design — they risk training evals
against a tell the harness can produce but a real user would not. Revisit if
authoring costs start dominating new-eval work.

### New assertion types

- **`skill_invoked_in_turn`** — pass if the named skill was invoked in the
  specified turn (membership, not winnership: a turn may also invoke helper
  skills; any of them counts). Requires `turn` (integer ≥ 1) and `skill`.
- **`chain_order`** — pass if the sequence of **per-turn winner** skills
  (the first `Skill` tool_use in each turn) exactly matches `skills[]`.
  Ordering and length must match. A turn with no skill invocation fails the
  assertion.

Use `skill_invoked_in_turn` when "this skill had to fire in turn N" is the
claim; use `chain_order` when the stage sequence itself is what's being
regression-tested.

### Chain failure handling

If any turn exits non-zero or times out, the chain aborts. All remaining
turns' assertions count as failures in the final summary (honest accounting
— a chain that didn't reach turn 3 didn't pass turn 3). The transcript
records `chain_failure` with a human-readable reason and which turn failed.
```

- [ ] **Step 3: Confirm `validate.fish` / docs links are unbroken**

Run: `bun run tests/eval-runner-v2.ts --dry-run`
Expected: exit 0 (sanity check, no docs-validation hook runs).

- [ ] **Step 4: Commit**

```fish
git add tests/EVALS.md
git commit -m "Document multi-turn evals in EVALS.md

New section covers: when to reach for multi-turn, the turns[]+final_assertions
schema, the crafted-user-replies turn-boundary contract, the two new
assertion types (skill_invoked_in_turn, chain_order), and chain failure
handling. Existing schema table rows extended for the new assertion types."
```

---

## Task 11: End-to-end live validation of the new multi-turn eval

This is the validation gate: the substrate is built and an eval is authored, but we haven't yet observed whether the chain actually passes or fails on a real run. The spec frames the pass/fail outcome as *valuable either way*: a pass is evidence that ADR #0004 resolves the pressure-framing skip; a fail gives us falsifiable data for the next design step (potentially Option 2 — CLAUDE.md tie-break rule).

This task records the outcome, does not attempt to fix anything based on it, and defers the "delete the single-turn version" step until the multi-turn version has at least one clean run.

**Files:**
- No code changes in the base case. Possibly update `skills/systems-analysis/evals/evals.json` to delete the single-turn eval (Step 5 below, conditional).

- [ ] **Step 1: Run the full systems-analysis eval suite against live `claude`**

Run: `bun run tests/eval-runner-v2.ts systems-analysis`
Expected: one of three outcomes.

Record the outcome explicitly in the commit message of the next step (even if no code changes) — this is the ground-truth data point the spec was written to produce.

- [ ] **Step 2: Read the chain transcript regardless of outcome**

The transcript lands at `tests/results/systems-analysis-sunk-cost-migration-multi-turn-v2-multiturn-<timestamp>.md`. Read it end-to-end — the assertion summary alone is not enough signal for deciding follow-up steps.

Look for: which skill fired in each turn, whether the chain aborted early, whether any turn's `skills_invoked` was `(none)` despite the model producing prose that described running the skill (a Skill-tool miss, not a behaviour miss), and whether the `final_assertions` diagnostics are actionable.

- [ ] **Step 3: Write a short outcome note as a commit on top of Task 10's commits**

Always commit a note, even if it's just "no code changes, multi-turn eval passes cleanly." This is the artifact future sessions need to judge whether to proceed with Option 2 or call the substrate done.

```fish
# Use a HEREDOC-less multiline commit because the shell is fish — write the
# body to a temp file first.
echo "Validate multi-turn sunk-cost-migration against live claude

Outcome: <PASS | FAIL | MIXED>

<1-3 paragraphs describing what the transcript showed: which stages
fired, any skill-tool misses, whether final_assertions surfaced the
regression usefully, and whether the outcome changes the interpretation
of ADR #0004. Link the transcript path.>" > /tmp/multi-turn-validation-commit.txt
git commit --allow-empty -F /tmp/multi-turn-validation-commit.txt
```

- [ ] **Step 4: Decide follow-up based on outcome**

The spec names three outcome regimes and a different follow-up for each:

- **Chain passes** — ADR #0004 (even in "Proposed" status) is doing the work.
  - Follow-up in this plan: proceed to Step 5 (delete the single-turn version).
  - Follow-up separately scoped: promote ADR #0004 from "Proposed" to "Accepted" (separate decision, not part of this plan).

- **Chain fails at turn 2 or 3** — the systems-analysis or brainstorming hand-off is still skipping under pressure.
  - Do not delete the single-turn eval; it's still the active regression guard for turn 1.
  - Open a follow-up issue referencing this plan's outcome note and issue #90. Options 2 (CLAUDE.md tie-break) and 3 (fork using-superpowers) from the spec are the design space; brainstorming happens in a new thread, not here.

- **Chain aborts before turn 2 (infrastructure failure)** — `--resume` regression in `claude` CLI, stream-json schema drift, or a timeout.
  - Do not interpret as a behavioural outcome. Debug the infrastructure failure first (check CLI version; re-run prework item 1 from the plan header manually). Re-run Step 1 once resolved.

Record which regime applied in the commit note from Step 3.

- [ ] **Step 5: (Conditional — only if chain passes cleanly in Step 1) Remove the single-turn sunk-cost-migration eval**

The spec's Implementation Notes say: "Keep the existing single-turn version flagged as the pre-ADR-#0004 regression guard until the multi-turn version is validated; then delete."

If and only if the multi-turn eval passes cleanly on a live run, delete the existing single-turn `sunk-cost-migration` eval from `skills/systems-analysis/evals/evals.json`. The multi-turn version's turn-1 assertion already covers the "don't lead with migration steps" regression.

Edit `skills/systems-analysis/evals/evals.json` — remove the entire single-turn `sunk-cost-migration` object (the one with `"name": "sunk-cost-migration"`, not `sunk-cost-migration-multi-turn`).

Run: `bun run tests/eval-runner-v2.ts --dry-run systems-analysis`
Expected: exit 0.

```fish
git add skills/systems-analysis/evals/evals.json
git commit -m "Remove single-turn sunk-cost-migration (superseded)

sunk-cost-migration-multi-turn's turn-1 assertion covers the original
single-turn regression check. Keeping both was a transitional guard;
the multi-turn version has now validated on a live run, so the
single-turn version is redundant coverage."
```

If the chain did not pass cleanly, **skip this step entirely** — the single-turn eval remains the canary until a behavioural fix lands.

- [ ] **Step 6: Final full-suite dry-run + unit-test pass**

Run: `bun run tests/eval-runner-v2.ts --dry-run`
Expected: exit 0 across every skill's evals.

Run: `bun test tests/`
Expected: all tests pass.

Run: `bunx tsc --noEmit`
Expected: exit 0.

---

## Out of scope for this plan (flagged for follow-up)

These were called out in the spec's "Neutral" consequences and the decision doc update section. They are **not** part of this plan but are worth capturing so they don't get lost:

- **Update memory note `feedback_sunk_cost_eval.md`** to reflect the new architectural choice (eval-substrate layer, not skill-description or rules layer). Currently flagged as partially obsolete. Separate task.
- **Update `docs/superpowers/decisions/2026-04-17-systems-analysis-skip-pathways.md`** to cross-link the 2026-04-18 design spec and this plan's outcome. Separate task.
- **Promote ADR #0004 from "Proposed" to "Accepted"** if the multi-turn eval passes cleanly (Task 11 Step 4 first regime). Separate ADR-lifecycle decision, not code.
- **If the chain fails under pressure after this plan lands**, scope Option 2 (CLAUDE.md tie-break rule) or Option 3 (fork `superpowers:using-superpowers`). See spec's "Selected Approach" section for the rejection rationale on each, and the `/define-the-problem` + `/systems-analysis` pipeline for how to approach the new design.

---

## Self-review checklist (for the plan author before handoff)

- [x] Every section of the spec's Architecture has at least one task (schema change → Tasks 2+4; runner change → Tasks 7+8; new eval → Task 9).
- [x] Every Implementation Note in the spec's "Implementation Notes (non-binding)" section maps to a task:
  - Note 1 (verify `--resume`) → Prework (completed during planning).
  - Note 2 (extend `EvalSpec` for `turns[]` + `final_assertions`) → Tasks 2, 3, 4, 5, 6.
  - Note 3 (add `runClaudeChain`) → Tasks 7, 8.
  - Note 4 (add `skill_invoked_in_turn` + `chain_order`) → Tasks 2, 6.
  - Note 5 (write multi-turn eval; keep single-turn as flagged regression guard) → Tasks 9, 11.
  - Note 6 (update `tests/EVALS.md`) → Task 10.
  - Note 7 (update memory + decision doc) → Out of scope, flagged.
- [x] Both "open implementation questions" from the spec are resolved in the plan:
  - `--resume` vs SDK → `--resume` (prework verified).
  - Crafted replies vs auto-advance stubs → crafted (Task 9, spec recommendation).
- [x] Both spec prework items (from "Resuming This Work → Prework") are addressed:
  - `claude --resume` verified → prework section.
  - ADR #0004 status decision → documented as "Proposed / probes intent" in plan header + Task 9 eval summary.
- [x] No task modifies a file in the spec's "Rakes to avoid" list (`skills/systems-analysis/SKILL.md`, `rules/planning.md`, `superpowers:using-superpowers`, existing single-turn eval prompt text).
- [x] Placeholder scan: no "TODO", "fill in", "similar to", "appropriate error handling" without concrete content.
- [x] Type consistency: `Signals`, `ChainSignals`, `ValidatedAssertion`, `ValidatedEval`, `runClaude`, `runClaudeChain`, `extractSessionId`, `aggregateChainSignals`, `evaluateChain`, `writeChainTranscript` — all used consistently across Tasks 2-8.
