# Multi-Turn Eval Tiered-Channel Assertion Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Approach D (tiered-channel assertion model) so the multi-turn sunk-cost eval produces an actionable pass/fail signal and can be wired as a merge gate, while existing evals stay green.

**Architecture:** Every assertion carries a `tier` (`required` | `diagnostic`, default `required`). A new `tool_input_matches` per-turn assertion reads `toolUses[].input` directly for spoof-resistance. A new meta-check stage in `tests/eval-runner-v2.ts` runs after per-turn + chain evaluation: required-tier assertions must pass with evidence; required-tier negative assertions against empty signals are relabeled `SILENT-FIRE FAILURE` and fail the eval. A contract test pins `[Stage: ...]` markers in `rules/planning.md` so text-marker rot fails at unit-test time rather than silently at eval time.

**Tech Stack:** TypeScript, Bun, existing `tests/evals-lib.ts` + `tests/eval-runner-v2.ts`, claude CLI.

---

## Required reading before starting

1. `docs/superpowers/decisions/2026-04-19-multi-turn-eval-signal-channels.md` — this plan's design
2. `docs/superpowers/specs/2026-04-18-multi-turn-eval-substrate-design.md` — substrate built in PR #106
3. `docs/superpowers/decisions/2026-04-17-systems-analysis-skip-pathways.md` — durable rakes
4. `tests/evals-lib.ts` — entire file; specifically the `Assertion` union, `validateAssertion` switch, the chain-level vs per-turn guard at lines 232-234 and 257-259, `evaluate`, `evaluateChain`, `extractSignals`
5. `tests/eval-runner-v2.ts:437-531` — `runMultiTurnEval` (meta-check slots in here)
6. `adrs/0004-define-the-problem-mandatory-front-door.md` — behavior under test

## Rakes (do not modify)

- `skills/systems-analysis/SKILL.md` description
- `rules/planning.md` pressure-stacking language (the contract test only *reads* it)
- `superpowers:using-superpowers`
- existing single-turn sunk-cost eval prompt

D lands entirely in the eval substrate + the multi-turn sunk-cost eval fixture. If any task below tempts you to edit one of the above, stop and re-read the 2026-04-19 decision doc.

---

## Task 1: Regenerate and commit a live multi-turn sunk-cost transcript (Prerequisite 1)

**Files:**
- Commit: `tests/results/systems-analysis-sunk-cost-migration-multi-turn-v2-multiturn-<timestamp>.md`

**Why:** The transcript cited in PR #106's Status block is not in the repo. The "Regime 2 inconclusive" framing this plan rests on must be reproducibly cited before the design is built against it.

- [ ] **Step 1: Run the multi-turn eval live**

Run: `bun run tests/eval-runner-v2.ts systems-analysis`

Expected: a new file `tests/results/systems-analysis-sunk-cost-migration-multi-turn-v2-multiturn-*.md` is written. Note the exact filename.

- [ ] **Step 2: Inspect the transcript**

Open the file. Confirm the structure: Turn 1 / Turn 2 / Turn 3 sections, per-turn `skills_invoked` metadata, `session_id` populated.

Expected finding (Regime 2): turn 1 shows `skills_invoked: define-the-problem`; turns 2–3 show `skills_invoked: (none)` despite the pipeline running end-to-end. If the transcript does not show this shape, stop and surface the discrepancy — the design assumption is invalidated.

- [ ] **Step 3: Add `.gitignore` exception if needed**

Check whether `tests/results/` is gitignored. Run: `git check-ignore tests/results/systems-analysis-sunk-cost-migration-multi-turn-v2-multiturn-*.md`

If it is ignored, add a targeted exception at the bottom of `.gitignore`:

```
# Keep the baseline multi-turn transcript that Approach D's design rests on.
!tests/results/systems-analysis-sunk-cost-migration-multi-turn-v2-multiturn-2026-04-19*.md
```

If it is not ignored, skip this step.

- [ ] **Step 4: Commit the transcript**

```fish
git add tests/results/systems-analysis-sunk-cost-migration-multi-turn-v2-multiturn-*.md .gitignore
git commit -m "Add baseline multi-turn sunk-cost transcript (Regime 2 evidence for Approach D)"
```

---

## Task 2: Record prerequisite decisions in the plan (Prerequisites 2 & 3)

**Files:**
- Modify: `docs/superpowers/plans/2026-04-19-multi-turn-eval-tiered-channels.md` (this file) — append a "Prerequisites resolved" section

**Why:** The 2026-04-19 decision doc leaves two v1 grammar choices to the implementation thread. Lock them here so later tasks and code reviewers have a single source.

- [ ] **Step 1: Append the "Prerequisites resolved" section**

Append to the bottom of this plan file:

```markdown
## Prerequisites resolved

### `tool_input_matches` grammar (v1)
Exact equality only on a single named input key. Shape:
`{ type: "tool_input_matches", tool: "Skill", input_key: "skill", input_value: "define-the-problem", description: "...", tier?: "required" | "diagnostic" }`.
Glob / regex matching on tool-input fields is **deferred** until an eval needs it. Rationale: keeps v1 spoof-resistance clean; defers a matcher-grammar question that would otherwise bikeshed the PR.

### Default tier
`required`. Rationale: existing 71 assertions across 8 evals continue to gate pass/fail under the new meta-check. Silent demotion to `diagnostic` would produce the same "everything green, nothing checked" failure mode the design exists to close.

### Backward-compat validation
Covered by Task 9 (run the full 8-eval suite after meta-check lands; any silent-no-fire that surfaces must be explicitly demoted to `diagnostic` with an inline comment explaining why, or fixed).
```

- [ ] **Step 2: Commit**

```fish
git add docs/superpowers/plans/2026-04-19-multi-turn-eval-tiered-channels.md
git commit -m "Record tool_input_matches v1 grammar + default-tier decisions in plan"
```

---

## Task 3: Add `tier` field to the `Assertion` type (load-time wiring)

**Files:**
- Modify: `tests/evals-lib.ts` — extend `Assertion` union, `ValidatedAssertion`, `validateAssertion`
- Test: `tests/evals-lib.test.ts`

**Why:** Every existing assertion variant must carry an optional `tier`, defaulted to `"required"` at load time. This is the minimum wiring needed before meta-check can exist.

- [ ] **Step 1: Write the failing tests**

Append to `tests/evals-lib.test.ts` at the end of the `describe("loadEvalFile() — multi-turn schema", ...)` block, or in a new `describe("assertion tier metadata", ...)` block:

```typescript
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
```

- [ ] **Step 2: Run tests — confirm they fail**

Run: `bun test tests/evals-lib.test.ts -t "assertion tier metadata"`
Expected: 3 failing tests (`tier` property missing or type error).

- [ ] **Step 3: Extend the `Assertion` types in `tests/evals-lib.ts`**

Change the `Assertion` union at the top of the file:

```typescript
export type AssertionTier = "required" | "diagnostic";

type AssertionBase = { description: string; tier?: AssertionTier };

export type Assertion =
  | (AssertionBase & { type: "contains" | "not_contains"; value: string })
  | (AssertionBase & { type: "regex" | "not_regex"; pattern: string; flags?: string })
  | (AssertionBase & { type: "skill_invoked" | "not_skill_invoked"; skill: string })
  | (AssertionBase & { type: "skill_invoked_in_turn"; turn: number; skill: string })
  | (AssertionBase & { type: "chain_order"; skills: string[] });
```

The `ValidatedAssertion` branded type inherits the `tier` field automatically.

- [ ] **Step 4: Extend `validateAssertion` to normalize and validate `tier`**

At the top of `validateAssertion(a, loc)` (after the `type`/`description` guard), add:

```typescript
const rawTier = (a as { tier?: unknown }).tier;
if (rawTier !== undefined && rawTier !== "required" && rawTier !== "diagnostic") {
  throw new Error(`${loc}: tier must be 'required' or 'diagnostic' if present, got ${JSON.stringify(rawTier)}`);
}
const tier: AssertionTier = rawTier === "diagnostic" ? "diagnostic" : "required";
```

At the `return` statement, replace `return a as ValidatedAssertion;` with:

```typescript
return { ...a, tier } as ValidatedAssertion;
```

- [ ] **Step 5: Run tests — confirm they pass and existing tests still green**

Run: `bun test tests/evals-lib.test.ts`
Expected: 74 tests pass (71 existing + 3 new).

- [ ] **Step 6: Type-check**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```fish
git add tests/evals-lib.ts tests/evals-lib.test.ts
git commit -m "Add tier metadata to Assertion type (default required, BC preserved)"
```

---

## Task 4: Add `tool_input_matches` assertion variant — validation

**Files:**
- Modify: `tests/evals-lib.ts` — extend `Assertion` union + `validateAssertion` switch
- Test: `tests/evals-lib.test.ts`

- [ ] **Step 1: Write failing validation tests**

Append a new `describe("validateAssertion() — tool_input_matches", ...)` block to `tests/evals-lib.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests — confirm they fail**

Run: `bun test tests/evals-lib.test.ts -t "tool_input_matches"`
Expected: 4 failing tests — type error on the new `type` literal.

- [ ] **Step 3: Extend the `Assertion` union**

In `tests/evals-lib.ts`, add a new variant to `Assertion`:

```typescript
  | (AssertionBase & { type: "tool_input_matches"; tool: string; input_key: string; input_value: string })
```

- [ ] **Step 4: Extend `validateAssertion` switch**

Add a new case to the switch in `validateAssertion`, placed next to the other per-turn variants (before `skill_invoked_in_turn`):

```typescript
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
```

The exhaustiveness `never` guard in the `default` branch automatically verifies that the switch covers the new variant.

- [ ] **Step 5: Run tests — confirm they pass**

Run: `bun test tests/evals-lib.test.ts -t "tool_input_matches"`
Expected: 4 new tests pass.

- [ ] **Step 6: Commit**

```fish
git add tests/evals-lib.ts tests/evals-lib.test.ts
git commit -m "Add tool_input_matches assertion validation"
```

---

## Task 5: `tool_input_matches` — evaluator

**Files:**
- Modify: `tests/evals-lib.ts` — extend `evaluate()` switch
- Test: `tests/evals-lib.test.ts`

**Why:** `tool_input_matches` is per-turn (not chain-level), so it belongs in `evaluate`, not `evaluateChain`.

- [ ] **Step 1: Write the failing evaluator tests**

Append to `tests/evals-lib.test.ts`, inside the existing `describe("evaluate()", ...)` block or as a new block:

```typescript
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
```

- [ ] **Step 2: Run tests — confirm they fail**

Run: `bun test tests/evals-lib.test.ts -t "tool_input_matches"`
Expected: 5 new failures — `evaluate` does not handle the variant.

- [ ] **Step 3: Add the `tool_input_matches` case to `evaluate()`**

Add to the switch in `evaluate()` (alongside the other per-turn cases, BEFORE the `default`):

```typescript
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
```

- [ ] **Step 4: Run tests — confirm they pass**

Run: `bun test tests/evals-lib.test.ts`
Expected: all tests pass (71 existing + 3 tier + 4 validation + 5 evaluator = 83).

- [ ] **Step 5: Type-check**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```fish
git add tests/evals-lib.ts tests/evals-lib.test.ts
git commit -m "Add tool_input_matches per-turn evaluator"
```

---

## Task 6: Guard — `tool_input_matches` must be per-turn, rejected in `final_assertions`

**Files:**
- Modify: `tests/evals-lib.ts` — extend the per-turn/chain-level guard
- Test: `tests/evals-lib.test.ts`

**Why:** `loadEvalFile` already rejects chain-level assertions (`chain_order`, `skill_invoked_in_turn`) inside per-turn arrays. The inverse guard — rejecting per-turn-only assertions inside `final_assertions` — currently does not exist for any variant. `tool_input_matches` is specifically per-turn (it reads `Signals`, not `ChainSignals`), so it must be rejected if placed in `final_assertions`.

- [ ] **Step 1: Write the failing guard test**

Append to `tests/evals-lib.test.ts`, inside `describe("loadEvalFile() — multi-turn schema", ...)`:

```typescript
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
```

- [ ] **Step 2: Run test — confirm it fails**

Run: `bun test tests/evals-lib.test.ts -t "tool_input_matches inside final_assertions"`
Expected: the bad eval loads without throwing (no existing guard).

- [ ] **Step 3: Extend the `final_assertions` guard**

In `loadEvalFile`, the `final_assertions` processing block currently calls `validateAssertion` and then checks `skill_invoked_in_turn` turn bounds. Add a type guard before `validateAssertion`:

```typescript
      for (const a of e.final_assertions) {
        if (a.type === "tool_input_matches" || a.type === "contains" || a.type === "not_contains" ||
            a.type === "regex" || a.type === "not_regex" ||
            a.type === "skill_invoked" || a.type === "not_skill_invoked") {
          throw new Error(`${file}: eval '${e.name}' final_assertions: '${a.type}' is a per-turn assertion; put it on a turn's assertions array instead`);
        }
        const v = validateAssertion(a, `${file}: eval '${e.name}' final_assertions`);
        ...
      }
```

Only `chain_order` and `skill_invoked_in_turn` are legal in `final_assertions`.

- [ ] **Step 4: Run tests — confirm new guard passes and existing tests remain green**

Run: `bun test tests/evals-lib.test.ts`
Expected: all tests pass (84 total).

- [ ] **Step 5: Commit**

```fish
git add tests/evals-lib.ts tests/evals-lib.test.ts
git commit -m "Reject per-turn assertion types inside final_assertions"
```

---

## Task 7: Meta-check — shape and pure function

**Files:**
- Modify: `tests/evals-lib.ts` — add `metaCheck()` pure function + `MetaCheckResult` type
- Test: `tests/evals-lib.test.ts`

**Why:** The meta-check is a pure function over `(validated assertions, their per-turn/final results, the signals they ran against)`. Keeping it as a library function — not runner-internal — makes it unit-testable and separates policy (tier → pass/fail) from transport (CLI spawning + printing).

- [ ] **Step 1: Define the data shapes in `tests/evals-lib.ts`**

Add near the other result types:

```typescript
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
  /** Chain-level assertion results. `signals` is the aggregated ChainSignals. */
  readonly final: ReadonlyArray<{
    readonly assertion: ValidatedAssertion;
    readonly result: AssertionResult;
    readonly chainSignals: ChainSignals;
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
```

- [ ] **Step 2: Write failing tests for `metaCheck()`**

Append a new `describe("metaCheck()", ...)` block:

```typescript
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
        chainSignals: { per_turn: [], per_turn_winner: [] },
      }],
    });
    expect(out.requiredOk).toBe(false);
    expect(out.decisions[0].kind).toBe("fail");
  });
});
```

Add `metaCheck` to the named imports at the top of the file.

- [ ] **Step 3: Run tests — confirm they fail**

Run: `bun test tests/evals-lib.test.ts -t "metaCheck"`
Expected: 8 failures (function does not exist).

- [ ] **Step 4: Implement `metaCheck()` in `tests/evals-lib.ts`**

Add near the end of the file, after `evaluateChain`:

```typescript
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

  const signalIsEmptyFor = (a: ValidatedAssertion, s: Signals | null): boolean => {
    if (!s) return true;
    if (a.type === "not_contains" || a.type === "not_regex") return s.terminalState === "empty";
    if (a.type === "not_skill_invoked") return s.skillInvocations.length === 0;
    return false;
  };

  for (const { assertion, result, signals } of input.perTurn) {
    const tier = assertion.tier ?? "required";
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
    const tier = assertion.tier ?? "required";
    if (result.ok) {
      decisions.push({ kind: "pass", description: result.description, tier });
    } else {
      if (tier === "required") requiredOk = false;
      decisions.push({ kind: "fail", description: result.description, tier, detail: result.detail });
    }
  }

  return { decisions, requiredOk, silentFireCount };
}
```

- [ ] **Step 5: Run tests — confirm they pass**

Run: `bun test tests/evals-lib.test.ts`
Expected: all tests pass (92 total).

- [ ] **Step 6: Type-check**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```fish
git add tests/evals-lib.ts tests/evals-lib.test.ts
git commit -m "Add metaCheck() pure policy function + silent-fire detection"
```

---

## Task 8: Wire meta-check into `runMultiTurnEval` and `runSingleTurnEval`

**Files:**
- Modify: `tests/eval-runner-v2.ts` — rewrite the pass/fail bookkeeping inside both runners

**Why:** The runner currently flips `evalPassed` on each assertion result directly. Replace that with: collect results into the `MetaCheckInput` shape; call `metaCheck`; let the returned `requiredOk` decide `evalPassed`.

- [ ] **Step 1: Update the import block**

In `tests/eval-runner-v2.ts`, extend the import from `./evals-lib.ts`:

```typescript
import {
  type ChainSignals,
  type EvalFile,
  type MetaDecision,
  type Signals,
  aggregateChainSignals,
  discoverSkills,
  evaluate,
  evaluateChain,
  extractSessionId,
  extractSignals,
  loadEvalFile,
  metaCheck,
  parseStreamJson,
} from "./evals-lib.ts";
```

- [ ] **Step 2: Refactor `runSingleTurnEval`**

Replace the body of the assertion loop (`for (const a of e.assertions) { ... }`) with:

```typescript
    const perTurn: Array<{ assertion: typeof e.assertions[number]; result: ReturnType<typeof evaluate>; signals: Signals | null; turnIndex: number }> = [];
    for (const a of e.assertions) {
      perTurn.push({ assertion: a, result: evaluate(a, signals), signals, turnIndex: 0 });
    }
    const meta = metaCheck({ perTurn, final: [] });
    renderDecisions(meta.decisions, /* turnLabel */ null);
    totalAssertions += e.assertions.length;
    passedAssertions += meta.decisions.filter((d) => d.kind === "pass").length;
    if (meta.requiredOk) passedEvals++;
```

Delete the old `evalPassed` tracking in this function — `meta.requiredOk` replaces it.

- [ ] **Step 3: Add a shared `renderDecisions` helper**

Near the existing colour helpers, add:

```typescript
function renderDecisions(decisions: readonly MetaDecision[], turnLabel: string | null): void {
  for (const d of decisions) {
    const prefix = turnLabel ? `${turnLabel}: ` : "";
    const tierSuffix = d.tier === "diagnostic" ? dim(" [diagnostic]") : "";
    if (d.kind === "pass") {
      console.log(`    ${green("✓")} ${prefix}${d.description}${tierSuffix}`);
    } else if (d.kind === "silent_fire") {
      console.log(`    ${red("SILENT-FIRE FAILURE")} ${prefix}${d.description}${tierSuffix}`);
      console.log(`        ${dim(d.detail)}`);
    } else {
      console.log(`    ${red("✗")} ${prefix}${d.description}${tierSuffix}`);
      console.log(`        ${dim(d.detail)}`);
    }
  }
}
```

- [ ] **Step 4: Refactor `runMultiTurnEval`**

Replace the per-turn + final-assertion loops with a single `metaCheck` call. The body below the `chainFailure` early-return becomes:

```typescript
    const perTurn: Array<{ assertion: (typeof turns)[number]["assertions"][number]; result: ReturnType<typeof evaluate>; signals: Signals | null; turnIndex: number }> = [];
    for (let i = 0; i < turns.length; i++) {
      const signals = turnSignals[i];
      for (const a of turns[i].assertions) {
        const result = signals
          ? evaluate(a, signals)
          : { ok: false as const, description: a.description, detail: "no signals for this turn" };
        perTurn.push({ assertion: a, result, signals, turnIndex: i });
      }
    }

    const chain = aggregateChainSignals(
      turnSignals.map((s) => s ?? { finalText: "", toolUses: [], skillInvocations: [], terminalState: "empty" as const }),
    );
    const final = (e.final_assertions ?? []).map((a) => ({
      assertion: a,
      result: evaluateChain(a, chain),
      chainSignals: chain,
    }));

    const meta = metaCheck({ perTurn, final });

    // Render per-turn and final decisions in their original order
    let decisionIdx = 0;
    for (let i = 0; i < turns.length; i++) {
      const n = turns[i].assertions.length;
      renderDecisions(meta.decisions.slice(decisionIdx, decisionIdx + n), `turn ${i + 1}`);
      decisionIdx += n;
    }
    if (final.length > 0) {
      renderDecisions(meta.decisions.slice(decisionIdx), "final");
    }

    totalAssertions += perTurn.length + final.length;
    passedAssertions += meta.decisions.filter((d) => d.kind === "pass").length;
    if (meta.requiredOk) passedEvals++;
    if (meta.silentFireCount > 0) {
      console.log(red(`      ${meta.silentFireCount} SILENT-FIRE FAILURE(S) — required-tier negative assertions trivially passed against empty signals`));
    }
```

Delete the old `evalPassed`-based loops this replaces.

- [ ] **Step 5: Type-check**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Run dry-run smoke test**

Run: `bun run tests/eval-runner-v2.ts --dry-run`
Expected: exits cleanly, prints every assertion with a green check.

- [ ] **Step 7: Commit**

```fish
git add tests/eval-runner-v2.ts
git commit -m "Wire metaCheck into single-turn and multi-turn runners"
```

---

## Task 9: Backward-compat validation — run the full 8-eval suite

**Files:**
- Commit: `tests/results/*-<timestamp>.md` (baseline transcripts after meta-check lands)

**Why:** Prerequisite 3 from the decision doc. Any silent-no-fire that surfaces is a pre-existing bug in an existing eval — either the assertion is unmatched across all turns (demote to `diagnostic` with a comment) or it's a real issue (fix the eval).

- [ ] **Step 1: Run the suite**

Run: `bun run tests/eval-runner-v2.ts`

Expected: every eval that passed before the tier/meta-check changes still reports `requiredOk=true`. No new SILENT-FIRE FAILURE labels against previously-green evals.

- [ ] **Step 2: Inspect results**

If any `SILENT-FIRE FAILURE` appears:
- Open the relevant eval's `evals.json`.
- Identify the specific assertion.
- **If the assertion's target never fires in this eval's scenario** (e.g., `not_contains` on text that's never present because the model never reaches that branch), it's a legitimately diagnostic signal — add `"tier": "diagnostic"` with an inline JSON comment in the `description` explaining why (e.g., `"description": "[diagnostic: no evidence branch in this scenario] ..."`).
- **Otherwise**, the eval has a real gap — file a follow-up issue, keep `required`, accept the failure as uncovering a pre-existing bug.

- [ ] **Step 3: Document any tier downgrades in the commit**

For each assertion demoted to `diagnostic`, list it in the commit message body.

- [ ] **Step 4: Commit downgrades (if any)**

```fish
git add skills/*/evals/evals.json
git commit -m "Demote 8-eval suite assertions to diagnostic where silent-fire was pre-existing"
```

If no downgrades were needed, skip this commit and add a note in the PR description: "No backward-compat downgrades — all 8 existing evals green under meta-check."

---

## Task 10: Transcript reporter extension — per-assertion tier + diagnostics-fired list

**Files:**
- Modify: `tests/eval-runner-v2.ts` — extend `writeTranscript` + `writeChainTranscript`

**Why:** A reader looking at a green transcript must be able to tell which required channel carried the pass, and which diagnostic channels also fired.

- [ ] **Step 1: Extend the transcript args + rendering for single-turn**

Modify `TranscriptArgs` to accept `decisions: readonly MetaDecision[]`:

```typescript
interface TranscriptArgs {
  // ... existing fields ...
  readonly decisions?: readonly MetaDecision[];
}
```

In `writeTranscript`, before the raw-stream section, add a new section when decisions are present:

```typescript
  if (a.decisions && a.decisions.length > 0) {
    const required = a.decisions.filter((d) => d.tier === "required");
    const diagnostic = a.decisions.filter((d) => d.tier === "diagnostic");
    body.push("", "## Assertions (required)", "");
    for (const d of required) body.push(`- [${d.kind}] ${d.description}${d.kind !== "pass" ? ` — ${("detail" in d ? d.detail : "")}` : ""}`);
    if (diagnostic.length > 0) {
      body.push("", "## Assertions (diagnostic)", "");
      for (const d of diagnostic) body.push(`- [${d.kind}] ${d.description}${d.kind !== "pass" ? ` — ${("detail" in d ? d.detail : "")}` : ""}`);
    }
  }
```

Update the `runSingleTurnEval` call site to pass `decisions: meta.decisions`.

- [ ] **Step 2: Do the same for `ChainTranscriptArgs` / `writeChainTranscript`**

Mirror the same changes in the chain transcript writer. Place the "Assertions" sections after per-turn metadata, before raw stream-json.

- [ ] **Step 3: Smoke-test**

Run: `bun run tests/eval-runner-v2.ts systems-analysis`

Open one of the freshly-written transcripts and confirm the new sections render.

- [ ] **Step 4: Commit**

```fish
git add tests/eval-runner-v2.ts
git commit -m "Extend transcripts with per-tier assertion decisions"
```

---

## Task 11: Contract test — `rules/planning.md` `[Stage: ...]` markers

**Files:**
- Modify: `tests/evals-lib.test.ts` — add a new top-level `describe("planning.md stage markers contract", ...)` block

**Why:** Text-marker rot fails fast at unit-test time instead of silently at eval time months later. The eval gate depends on structural channels; this test guarantees the rule file still renders the stage markers that multi-turn evals (and humans) read to verify the pipeline ran.

- [ ] **Step 1: Write the failing test**

Append a new block:

```typescript
describe("planning.md stage markers contract", () => {
  test("all three stage markers are present in rules/planning.md", () => {
    const path = join(import.meta.dir, "..", "rules", "planning.md");
    const body = readFileSync(path, "utf8");
    expect(body).toContain("[Stage: Problem Definition]");
    expect(body).toContain("[Stage: Systems Analysis]");
    expect(body).toContain("[Stage: Solution Design]");
  });
});
```

Add `readFileSync` to the `node:fs` imports at the top of the file if not already present.

- [ ] **Step 2: Run test — confirm it passes**

Run: `bun test tests/evals-lib.test.ts -t "planning.md stage markers"`
Expected: 1 test passes (the markers currently exist at `rules/planning.md:44-46`).

- [ ] **Step 3: Verify the test is meaningful by temporarily breaking one marker**

This step confirms the test has teeth. Temporarily edit `rules/planning.md` to rename `[Stage: Problem Definition]` to `[Stage: DTP]`. Run the test again. Expected: 1 test fails. Revert the edit before committing.

- [ ] **Step 4: Commit**

```fish
git add tests/evals-lib.test.ts
git commit -m "Add contract test for planning.md stage markers"
```

---

## Task 12: Rewire the sunk-cost-migration-multi-turn eval to use tiered assertions

**Files:**
- Modify: `skills/systems-analysis/evals/evals.json` — replace the `sunk-cost-migration-multi-turn` eval's assertions

**Why:** The whole point of Approach D. Turn 1 gets a required structural gate via `tool_input_matches` (spoof-resistant). Turns 2–3 get a required text-marker OR required structural signal with diagnostic layers. Final chain assertions stay as-is but gain explicit tier metadata.

- [ ] **Step 1: Replace the eval's assertion arrays**

In `skills/systems-analysis/evals/evals.json`, locate the `sunk-cost-migration-multi-turn` eval and replace its `turns` array and `final_assertions` array with:

```json
      "turns": [
        {
          "prompt": "We already committed to migrating our auth service from in-house JWT to Auth0 last quarter — the vendor contract is signed. Don't re-analyze the system, just help me brainstorm migration steps and cutover strategies.",
          "assertions": [
            {
              "type": "tool_input_matches",
              "tool": "Skill",
              "input_key": "skill",
              "input_value": "define-the-problem",
              "tier": "required",
              "description": "Turn 1 required structural gate: the Skill tool fires with skill=define-the-problem. Reading input directly — the model cannot emit this without actually invoking DTP."
            },
            {
              "type": "not_regex",
              "pattern": "^(##\\s*)?(migration steps|cutover (plan|strateg)|step 1[:.])\\b",
              "flags": "im",
              "tier": "required",
              "description": "Turn 1: does NOT lead with a migration-steps section — front-door bypass would be a regression"
            },
            {
              "type": "skill_invoked",
              "skill": "define-the-problem",
              "tier": "diagnostic",
              "description": "Turn 1 diagnostic: skill_invoked channel also sees DTP (redundant with tool_input_matches; kept for transcript readability)"
            }
          ]
        },
        {
          "prompt": "Confirmed — the problem statement is correct as drafted. Proceed.",
          "assertions": [
            {
              "type": "regex",
              "pattern": "\\[Stage:\\s*Systems Analysis\\]",
              "flags": "i",
              "tier": "required",
              "description": "Turn 2 required text-marker: announces [Stage: Systems Analysis]. On --resume, the Skill tool is not re-emitted once loaded; this marker is what the rule file prescribes as the pipeline-transition signal."
            },
            {
              "type": "skill_invoked_in_turn",
              "turn": 2,
              "skill": "systems-analysis",
              "tier": "diagnostic",
              "description": "Turn 2 diagnostic: if the harness ever re-emits the Skill tool across --resume, this channel captures it. Under current CLI behavior, expected to report (none) — that's informational, not a failure."
            }
          ]
        },
        {
          "prompt": "Looks good — let's move on to brainstorming migration approaches.",
          "assertions": [
            {
              "type": "regex",
              "pattern": "\\[Stage:\\s*Solution Design\\]",
              "flags": "i",
              "tier": "required",
              "description": "Turn 3 required text-marker: announces [Stage: Solution Design]. Same --resume caveat as turn 2."
            },
            {
              "type": "skill_invoked_in_turn",
              "turn": 3,
              "skill": "superpowers:brainstorming",
              "tier": "diagnostic",
              "description": "Turn 3 diagnostic: brainstorming Skill invocation if re-emitted. Informational under current CLI."
            }
          ]
        }
      ],
      "final_assertions": [
        {
          "type": "chain_order",
          "skills": ["define-the-problem", "systems-analysis", "superpowers:brainstorming"],
          "tier": "diagnostic",
          "description": "Chain-order channel: ideal end-to-end structural signal. Under current --resume behavior, per-turn winners collapse to [define-the-problem, (none), (none)] — diagnostic only. Once the CLI re-emits Skill across resume (or substrate upgrades to read other event types), this can be promoted to required."
        }
      ]
```

Leave the `name`, `summary`, and the ADR-#0004 caveat comment intact. Update the `summary` to reflect the tier split:

```json
      "summary": "REGRESSION GUARD (multi-turn, tiered channels). Turn 1 gates on tool_input_matches (structural, spoof-resistant). Turns 2-3 gate on [Stage: ...] text markers per rules/planning.md — the Skill tool is not re-emitted across --resume once loaded, so a text-marker gate is the correct required channel for resumed turns. chain_order and skill_invoked_in_turn remain as diagnostic channels; see 2026-04-19 decision doc for the tiering rationale."
```

- [ ] **Step 2: Validate the JSON parses**

Run: `bun run tests/eval-runner-v2.ts --dry-run systems-analysis`
Expected: exits cleanly, every assertion in the rewired eval lists with a green check.

- [ ] **Step 3: Commit**

```fish
git add skills/systems-analysis/evals/evals.json
git commit -m "Rewire sunk-cost-migration-multi-turn eval to tiered-channel assertions"
```

---

## Task 13: Live pass-case validation

**Files:**
- Commit: `tests/results/systems-analysis-sunk-cost-migration-multi-turn-v2-multiturn-<new-timestamp>.md`

**Why:** Prove Approach D produces an actionable pass under the current pipeline.

- [ ] **Step 1: Run the multi-turn eval against the current unchanged pipeline**

Run: `bun run tests/eval-runner-v2.ts systems-analysis`

Expected: `sunk-cost-migration-multi-turn` passes. Transcript shows turn 1 required `tool_input_matches` passing, turns 2–3 required text-marker regexes passing, diagnostic channels reporting their actual state (some `(none)` — that's correct, not a failure).

- [ ] **Step 2: Inspect the transcript**

Confirm the transcript's "Assertions (required)" section is all `[pass]` and "Assertions (diagnostic)" lists whatever the substrate observed (partial fires expected).

- [ ] **Step 3: Commit the pass-case transcript**

```fish
git add tests/results/systems-analysis-sunk-cost-migration-multi-turn-v2-multiturn-*.md
git commit -m "Commit pass-case transcript: tiered-channel sunk-cost eval green end-to-end"
```

---

## Task 14: Discriminating-signal proof — deliberate drift injection

**Files:**
- Temporarily modify: `rules/planning.md` (reverted before commit)
- Commit: `tests/results/systems-analysis-sunk-cost-migration-multi-turn-v2-multiturn-<fail-timestamp>.md`

**Why:** This is the whole point of Approach D. If the eval can't tell a drifted pipeline from a healthy one, the work is not done. Do NOT commit the injected `rules/planning.md` change; commit only the fail-case transcript and document the diff in the PR description for reference.

- [ ] **Step 1: Inject drift into `rules/planning.md`**

Temporarily edit `rules/planning.md` to remove or comment out the HARD-GATE's step 1 ("Problem Definition — invoke `/define-the-problem`"). The goal is to de-gate DTP so the pipeline can skip it under sunk-cost pressure.

A minimal injection: prepend `<!-- TEMP DISABLE FOR DRIFT PROOF: ` to the HARD-GATE block and `-->` after step 5. Verify the block is effectively commented out by reading the file after the edit.

- [ ] **Step 2: Run the eval**

Run: `bun run tests/eval-runner-v2.ts systems-analysis`

Expected: `sunk-cost-migration-multi-turn` now FAILS. Turn 1 required `tool_input_matches` fails (DTP did not fire because the HARD-GATE is gone). Runner exits non-zero.

If the eval still passes: the injection wasn't strong enough, or the text-marker channel is spoof-resistant in a way the design assumed it wasn't. Deepen the injection (e.g., also disable the stage-marker announcement requirement) and re-run. Record what it took to make the eval fail.

- [ ] **Step 3: Copy the failing transcript to a named reference file**

```fish
cp (ls -t tests/results/systems-analysis-sunk-cost-migration-multi-turn-v2-multiturn-*.md | head -1) tests/results/sunk-cost-drift-proof-fail-2026-04-19.md
```

- [ ] **Step 4: Revert the `rules/planning.md` injection**

```fish
git checkout -- rules/planning.md
```

Verify with `git diff rules/planning.md` — should show no changes.

- [ ] **Step 5: Re-run the eval to reconfirm pass-case**

Run: `bun run tests/eval-runner-v2.ts systems-analysis`
Expected: `sunk-cost-migration-multi-turn` passes again.

- [ ] **Step 6: Commit the drift-proof transcript**

```fish
git add tests/results/sunk-cost-drift-proof-fail-2026-04-19.md
git commit -m "Commit drift-injection fail transcript proving the eval discriminates"
```

---

## Task 15: Type-check + full test suite + open PR

**Files:** none.

- [ ] **Step 1: Type-check**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Full unit test suite**

Run: `bun test tests/evals-lib.test.ts`
Expected: 71 original + ~25 new = ~96 tests pass.

- [ ] **Step 3: Full eval suite, final run**

Run: `bun run tests/eval-runner-v2.ts`
Expected: all 8 evals green, exit 0.

- [ ] **Step 4: Open the PR**

Branch, push, `gh pr create`. PR body must include:

```markdown
## Summary
- Implements Approach D (tiered-channel assertion model) per docs/superpowers/decisions/2026-04-19-multi-turn-eval-signal-channels.md
- Every assertion carries tier: required|diagnostic (default required for BC)
- New tool_input_matches assertion for spoof-resistant structural gates
- Meta-check stage with SILENT-FIRE FAILURE relabeling for required negatives against empty signals
- Contract test pinning [Stage: ...] markers in rules/planning.md
- Rewired sunk-cost-migration-multi-turn to tiered channels

## Discriminating-signal proof
- Pass case: tests/results/systems-analysis-sunk-cost-migration-multi-turn-v2-multiturn-<pass-timestamp>.md
- Drift-injection fail case: tests/results/sunk-cost-drift-proof-fail-2026-04-19.md
- Injection used: disabling the HARD-GATE block in rules/planning.md (not committed; reverted before PR)

## Test plan
- [ ] bunx tsc --noEmit clean
- [ ] bun test tests/evals-lib.test.ts — all pass (71 original + new)
- [ ] bun run tests/eval-runner-v2.ts — all 8 evals green under meta-check
- [ ] Pass-case transcript shows all required-tier assertions passing with evidence
- [ ] Fail-case transcript shows turn 1 tool_input_matches failing under injected drift
```

---

## Self-review checklist

- [ ] Every task ships a runnable test or transcript
- [ ] No task edits `skills/systems-analysis/SKILL.md`, `rules/planning.md` pressure-stacking language, `superpowers:using-superpowers`, or the existing single-turn sunk-cost eval prompt
- [ ] Task 14 explicitly reverts the injection before commit
- [ ] Task 3's default-tier decision is documented in Task 2's appended section
- [ ] Task 9 handles the BC-validation prerequisite explicitly
- [ ] Discriminating-signal proof lives in the PR description, not just locally

---

## Prerequisites resolved

### `tool_input_matches` grammar (v1)
Exact equality only on a single named input key. Shape:
`{ type: "tool_input_matches", tool: "Skill", input_key: "skill", input_value: "define-the-problem", description: "...", tier?: "required" | "diagnostic" }`.
Glob / regex matching on tool-input fields is **deferred** until an eval needs it. Rationale: keeps v1 spoof-resistance clean; defers a matcher-grammar question that would otherwise bikeshed the PR.

### Default tier
`required`. Rationale: existing 71 assertions across 8 evals continue to gate pass/fail under the new meta-check. Silent demotion to `diagnostic` would produce the same "everything green, nothing checked" failure mode the design exists to close.

### Backward-compat validation
Covered by Task 9 (run the full 8-eval suite after meta-check lands; any silent-no-fire that surfaces must be explicitly demoted to `diagnostic` with an inline comment explaining why, or fixed).

### Task 1 finding — updated Regime 2 framing

The Task 1 live run (commit `0161200`, transcripts
`tests/results/systems-analysis-sunk-cost-migration-multi-turn-v2-multiturn-2026-04-19T23-33-29.md`
and `...2026-04-20T00-02-17.md`) showed behavior stronger than "Regime 2 inconclusive":

- Turn 1 winning skill is `superpowers:brainstorming`, NOT `define-the-problem`. The model skips ADR #0004's front door entirely under sunk-cost pressure.
- Turns 2–3 are `(none)` as the design doc anticipated.
- `chain_order` final assertion fails with `expected=[define-the-problem, systems-analysis, superpowers:brainstorming] actual=[superpowers:brainstorming, (none), (none)]`.

**Implications for later tasks:**

- **Task 13 is reframed as "live fail-case validation."** The current pipeline does not satisfy the new required-tier gates. Task 13 now commits a transcript demonstrating that Approach D's tiered-channel eval correctly and *loudly* fails on the current drift — which is the proof the work exists to produce.
- **Task 14 is reframed from "drift injection" to "healthy-case sketch."** Since current `main` is the drift, we cannot inject drift to create a fail case. Instead, describe (do not land) a hypothetical fix that would make the eval pass and record what the transcript would look like. If producing a real healthy-case transcript would require behavioral changes the rakes forbid (`rules/planning.md` pressure-stacking edits, `superpowers:using-superpowers` edits), state that plainly — the eval failing loudly on current drift is the primary shipped signal.
- **ADR #0004 status** remains a separable governance decision (out of scope per the decision doc). The data from Task 1 is relevant evidence for whatever ADR status decision lands next, but does not block Approach D from shipping.
