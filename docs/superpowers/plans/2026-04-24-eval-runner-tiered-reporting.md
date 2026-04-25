# Eval Runner Tiered Reporting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reliability axis (structural vs text) to v2 eval runner output so audit consumers can read trustworthy signal at a glance, and add a `--text-nonblocking` flag to demote required-text failures to warnings.

**Architecture:** Reliability is computed from assertion type — no schema change. `MetaDecision` gains a `reliability` field. New aggregator + `suiteExit` helper live in `evals-lib.ts`. `eval-runner-v2.ts` parses the flag, prints a 3-line tier block, and routes the exit code through `suiteExit`. v1 runner untouched.

**Tech Stack:** TypeScript / Bun / `bun:test`. No new dependencies.

**Spec:** [docs/superpowers/specs/2026-04-24-eval-runner-tiered-reporting-design.md](../specs/2026-04-24-eval-runner-tiered-reporting-design.md)

**Issue:** [#129](https://github.com/chriscantu/claude-config/issues/129)

---

## Task 1: Add `ReliabilityTier` + `reliabilityOf` classifier

**Files:**
- Modify: `tests/evals-lib.ts` (add type + function near line 9, after existing `AssertionTier`)
- Test: `tests/evals-lib.test.ts`

- [ ] **Step 1: Write failing test**

Add to `tests/evals-lib.test.ts`:

```ts
import { reliabilityOf } from "./evals-lib.ts";

describe("reliabilityOf()", () => {
  test("structural assertion types map to 'structural'", () => {
    expect(reliabilityOf("skill_invoked")).toBe("structural");
    expect(reliabilityOf("not_skill_invoked")).toBe("structural");
    expect(reliabilityOf("skill_invoked_in_turn")).toBe("structural");
    expect(reliabilityOf("chain_order")).toBe("structural");
    expect(reliabilityOf("tool_input_matches")).toBe("structural");
  });

  test("text assertion types map to 'text'", () => {
    expect(reliabilityOf("contains")).toBe("text");
    expect(reliabilityOf("not_contains")).toBe("text");
    expect(reliabilityOf("regex")).toBe("text");
    expect(reliabilityOf("not_regex")).toBe("text");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/evals-lib.test.ts`
Expected: FAIL — `reliabilityOf is not exported from ./evals-lib.ts`.

- [ ] **Step 3: Implement**

In `tests/evals-lib.ts`, just after `export type AssertionTier = "required" | "diagnostic";` (line 9):

```ts
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
      return "structural";
    case "contains":
    case "not_contains":
    case "regex":
    case "not_regex":
      return "text";
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/evals-lib.test.ts`
Expected: PASS for the two new tests; existing tests unaffected.

- [ ] **Step 5: Run type-check**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```fish
git add tests/evals-lib.ts tests/evals-lib.test.ts
git commit -m "Add ReliabilityTier classifier (#129)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Extend `MetaDecision` to carry reliability

**Files:**
- Modify: `tests/evals-lib.ts` — `MetaDecision` (line ~103), `metaCheck` (line ~636)
- Test: `tests/evals-lib.test.ts`

- [ ] **Step 1: Write failing test**

Add to `tests/evals-lib.test.ts` inside an existing `describe("metaCheck()", ...)` (or create one):

```ts
import { type ValidatedAssertion } from "./evals-lib.ts";

test("metaCheck decisions carry reliability derived from assertion type", () => {
  const a1 = v({ type: "skill_invoked", skill: "x", description: "d1", tier: "required" });
  const a2 = v({ type: "regex", pattern: "foo", description: "d2", tier: "required" });
  const out = metaCheck({
    perTurn: [
      { assertion: a1, result: { ok: true, description: "d1" }, signals: sig("hello", { skillInvocations: [{ skill: "x" }] as SkillInvocation[] }) },
      { assertion: a2, result: { ok: false, description: "d2", detail: "no match" }, signals: sig("hello") },
    ],
    final: [],
  });
  expect(out.decisions[0].reliability).toBe("structural");
  expect(out.decisions[1].reliability).toBe("text");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/evals-lib.test.ts`
Expected: FAIL — `decisions[0].reliability` is undefined or compile error.

- [ ] **Step 3: Implement**

In `tests/evals-lib.ts`, update `MetaDecision` (around line 103) — add `reliability` to all three variants:

```ts
export type MetaDecision =
  | { kind: "pass"; description: string; tier: AssertionTier; reliability: ReliabilityTier }
  | { kind: "fail"; description: string; tier: AssertionTier; reliability: ReliabilityTier; detail: string }
  | { kind: "silent_fire"; description: string; tier: AssertionTier; reliability: ReliabilityTier; detail: string };
```

In `metaCheck` (around line 636), every `decisions.push({...})` call gets a `reliability` field. Each push site has access to `assertion`. Update:

```ts
const reliability = reliabilityOf(assertion.type);
```

at the top of each loop iteration (before the existing tier extraction), and append `reliability` to every push. Concrete patches:

Around line 686 (silent_fire branch):
```ts
decisions.push({
  kind: "silent_fire",
  description: result.description,
  tier,
  reliability,
  detail: `negative assertion trivially passed against empty signal — no evidence to judge`,
});
```

Around line 693 (per-turn pass):
```ts
decisions.push({ kind: "pass", description: result.description, tier, reliability });
```

Around line 697 (per-turn fail):
```ts
decisions.push({ kind: "fail", description: result.description, tier, reliability, detail: result.detail });
```

Around line 704 (final pass):
```ts
decisions.push({ kind: "pass", description: result.description, tier, reliability });
```

Around line 707 (final fail):
```ts
decisions.push({ kind: "fail", description: result.description, tier, reliability, detail: result.detail });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/evals-lib.test.ts`
Expected: PASS.

- [ ] **Step 5: Run type-check**

Run: `bunx tsc --noEmit`
Expected: no errors. If consumers of `MetaDecision` outside `evals-lib.ts` exist (search via `grep`), they will fail compile here — fix in this task.

- [ ] **Step 6: Commit**

```fish
git add tests/evals-lib.ts tests/evals-lib.test.ts
git commit -m "Carry reliability on MetaDecision (#129)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Add reliability aggregator + `tallyReliability` helper

**Files:**
- Modify: `tests/evals-lib.ts` — add types and helper near `EvalTally` (line ~728)
- Test: `tests/evals-lib.test.ts`

- [ ] **Step 1: Write failing test**

Add to `tests/evals-lib.test.ts`:

```ts
import { tallyReliability, type ReliabilityAgg } from "./evals-lib.ts";

describe("tallyReliability()", () => {
  test("buckets decisions by required×reliability with diagnostic combined", () => {
    const decisions: MetaDecision[] = [
      { kind: "pass", description: "a", tier: "required", reliability: "structural" },
      { kind: "fail", description: "b", tier: "required", reliability: "structural", detail: "x" },
      { kind: "pass", description: "c", tier: "required", reliability: "text" },
      { kind: "fail", description: "d", tier: "required", reliability: "text", detail: "x" },
      { kind: "pass", description: "e", tier: "diagnostic", reliability: "text" },
      { kind: "fail", description: "f", tier: "diagnostic", reliability: "structural", detail: "x" },
    ];
    const agg = tallyReliability(decisions);
    expect(agg.requiredStructural).toEqual({ pass: 1, fail: 1 });
    expect(agg.requiredText).toEqual({ pass: 1, fail: 1 });
    expect(agg.diagnostic).toEqual({ pass: 1, fail: 1 });
  });

  test("silent_fire counts as a fail in its bucket", () => {
    const decisions: MetaDecision[] = [
      { kind: "silent_fire", description: "a", tier: "required", reliability: "structural", detail: "x" },
    ];
    const agg = tallyReliability(decisions);
    expect(agg.requiredStructural).toEqual({ pass: 0, fail: 1 });
  });

  test("empty input → all zero", () => {
    expect(tallyReliability([])).toEqual({
      requiredStructural: { pass: 0, fail: 0 },
      requiredText: { pass: 0, fail: 0 },
      diagnostic: { pass: 0, fail: 0 },
    });
  });
});
```

(`MetaDecision` is already imported via earlier tests; if not, add the import.)

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/evals-lib.test.ts`
Expected: FAIL — `tallyReliability` not exported.

- [ ] **Step 3: Implement**

In `tests/evals-lib.ts`, near the `EvalTally` declaration (line ~728), add:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/evals-lib.test.ts`
Expected: PASS for new tests.

- [ ] **Step 5: Commit**

```fish
git add tests/evals-lib.ts tests/evals-lib.test.ts
git commit -m "Add tallyReliability aggregator (#129)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Add `suiteExit` helper supporting `--text-nonblocking`

**Files:**
- Modify: `tests/evals-lib.ts` — near `suiteOk` (line ~752)
- Test: `tests/evals-lib.test.ts`

- [ ] **Step 1: Write failing test**

Add to `tests/evals-lib.test.ts`:

```ts
import { suiteExit, type SuiteExitOptions } from "./evals-lib.ts";

describe("suiteExit()", () => {
  const zero = { pass: 0, fail: 0 };
  const passOne = { pass: 1, fail: 0 };
  const failOne = { pass: 0, fail: 1 };

  test("all pass → exit 0", () => {
    const r = suiteExit({ requiredStructural: passOne, requiredText: passOne, diagnostic: passOne }, {});
    expect(r.exitCode).toBe(0);
    expect(r.warning).toBeUndefined();
  });

  test("required-structural fail → exit 1", () => {
    const r = suiteExit({ requiredStructural: failOne, requiredText: passOne, diagnostic: zero }, {});
    expect(r.exitCode).toBe(1);
  });

  test("required-text fail (default) → exit 1", () => {
    const r = suiteExit({ requiredStructural: passOne, requiredText: failOne, diagnostic: zero }, {});
    expect(r.exitCode).toBe(1);
  });

  test("required-text fail with textNonblocking → exit 0 with warning", () => {
    const r = suiteExit({ requiredStructural: passOne, requiredText: failOne, diagnostic: zero }, { textNonblocking: true });
    expect(r.exitCode).toBe(0);
    expect(r.warning).toContain("text");
  });

  test("required-structural fail with textNonblocking → still exit 1", () => {
    const r = suiteExit({ requiredStructural: failOne, requiredText: failOne, diagnostic: zero }, { textNonblocking: true });
    expect(r.exitCode).toBe(1);
  });

  test("diagnostic-only fail → exit 0", () => {
    const r = suiteExit({ requiredStructural: passOne, requiredText: passOne, diagnostic: failOne }, {});
    expect(r.exitCode).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/evals-lib.test.ts`
Expected: FAIL — `suiteExit` not exported.

- [ ] **Step 3: Implement**

In `tests/evals-lib.ts`, after `suiteOk` (around line 754), add:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/evals-lib.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```fish
git add tests/evals-lib.ts tests/evals-lib.test.ts
git commit -m "Add suiteExit helper for tiered exit policy (#129)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Wire reporting + flag into `eval-runner-v2.ts`

**Files:**
- Modify: `tests/eval-runner-v2.ts` (arg parsing near line 56-58; aggregator collection during eval loop ~592, ~706; summary block ~788-805)

- [ ] **Step 1: Add flag parsing**

In `tests/eval-runner-v2.ts`, near line 56-58 (existing arg parsing), add:

```ts
const textNonblocking = args.includes("--text-nonblocking") || process.env.EVAL_TEXT_NONBLOCKING === "1";
```

Also extend imports at line 31 to add `tallyReliability`, `suiteExit`, plus types `MetaDecision`, `ReliabilityAgg` if used by name:

```ts
import {
  // ...existing imports...
  tallyReliability,
  suiteExit,
  type MetaDecision,
} from "./evals-lib.ts";
```

- [ ] **Step 2: Collect decisions across the run**

Near the existing `tallies` array declaration (around line 502-510, find where `tallies: EvalTally[] = []` is initialized), add:

```ts
const allDecisions: MetaDecision[] = [];
```

Inside `runSingleTurnEval` (around line 592 — after `const tally = tallyEval(meta, e.assertions.length);`), append:

```ts
allDecisions.push(...meta.decisions);
```

Inside `runMultiTurnEval` (around line 706 — same pattern), append:

```ts
allDecisions.push(...meta.decisions);
```

- [ ] **Step 3: Add tier block + flag-aware exit to summary**

Replace the summary block at lines ~788-805 with:

```ts
console.log("━".repeat(60));
const evalLine = `${passedEvals}/${totalEvals} evals passed`;
const assertionLine = `${passedAssertions}/${totalAssertions} assertions passed`;
console.log(passedEvals === totalEvals ? green(evalLine) : red(evalLine));
console.log(passedAssertions === totalAssertions ? green(assertionLine) : red(assertionLine));

// Reliability tier block (#129).
const agg = tallyReliability(allDecisions);
const fmt = (label: string, c: { pass: number; fail: number }, note: string) => {
  const total = c.pass + c.fail;
  const line = `${label.padEnd(24)} ${c.pass}/${total}  ${dim(note)}`;
  return c.fail === 0 ? green(line) : red(line);
};
console.log(fmt("Structural (required):", agg.requiredStructural, "(reliable, gates exit)"));
console.log(fmt("Text (required):", agg.requiredText, "(flaky, gates exit)"));
console.log(fmt("Diagnostic:", agg.diagnostic, "(reported, no gate)"));

const totalSilentFires = tallies.reduce((n, t) => n + t.silentFireCount, 0);
if (totalSilentFires > 0) {
  console.log(red(`${totalSilentFires} SILENT-FIRE FAILURE(S) across suite`));
}

// Exit-code contract (per decision doc + #129):
//   - required-structural fail → exit 1
//   - required-text fail → exit 1 by default; warn + exit 0 with --text-nonblocking
//   - diagnostic fail → never gates
// Dry-run mock-passes everything; the agg is empty so suiteExit returns 0.
const exit = dryRun ? { exitCode: 0 as const } : suiteExit(agg, { textNonblocking });
if (exit.warning) {
  console.log(red(`⚠ ${exit.warning}`));
}
process.exit(exit.exitCode);
```

(Note: this REPLACES the existing `suiteOk(tallies)` exit. `suiteExit` covers the same contract plus the new flag.)

- [ ] **Step 4: Type-check**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Smoke run — dry-run**

Run: `bun run tests/eval-runner-v2.ts --dry-run`
Expected: exits 0; the new tier lines print with all-zero counts (no real run); no errors.

- [ ] **Step 6: Smoke run — single skill, real**

Pick a small skill with evals (e.g. `define-the-problem` if present):

Run: `bun run tests/eval-runner-v2.ts define-the-problem`
Expected: tier block appears in summary; each line color-coded; exit code reflects required-structural+required-text.

- [ ] **Step 7: Smoke run — flag**

Manufacture (or reuse) an eval where required-text fails. Run with flag:

Run: `bun run tests/eval-runner-v2.ts <skill> --text-nonblocking`
Expected: warning banner prints; exit 0 if only required-text fails; exit 1 if required-structural also fails.

If no eval currently fails, skip this step's *real* run and rely on the unit test from Task 4.

- [ ] **Step 8: Commit**

```fish
git add tests/eval-runner-v2.ts
git commit -m "Wire tiered reporting + --text-nonblocking into v2 runner (#129)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Document tiers + flag in `EVALS.md`

**Files:**
- Modify: `tests/EVALS.md` (add new section after the schema section)

- [ ] **Step 1: Add "Reporting Tiers" section**

After the existing schema/field-requirements section in `tests/EVALS.md`, insert:

```markdown
## Reporting Tiers (v2 runner)

The v2 runner reports two independent axes:

### Axis 1: Exit-gating (`tier`, set per assertion in JSON)

- `required` (default): failure fails the suite (exit 1).
- `diagnostic`: failure is reported but does not gate the exit code.

### Axis 2: Reliability (derived from assertion type)

- `structural`: `skill_invoked`, `not_skill_invoked`, `skill_invoked_in_turn`,
  `chain_order`, `tool_input_matches`. Fires against parsed stream-json
  signals. Deterministic, spoof-resistant.
- `text`: `contains`, `not_contains`, `regex`, `not_regex`. Fires against
  model prose. Wording-sensitive, subject to run-to-run variance.

The two axes cross. Summary output:

```
Structural (required):   N/M  (reliable, gates exit)
Text (required):         N/M  (flaky, gates exit)
Diagnostic:              N/M  (reported, no gate)
```

### `--text-nonblocking`

Flag (or env `EVAL_TEXT_NONBLOCKING=1`) demotes required-text failures to a
warning and exits 0. Required-structural failures still force exit 1. Use
when running audits where text variance is expected and structural is the
source of truth.
```

- [ ] **Step 2: Commit**

```fish
git add tests/EVALS.md
git commit -m "Document reliability tiers + --text-nonblocking flag (#129)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Open PR

- [ ] **Step 1: Push branch + open PR**

```fish
git push -u origin HEAD
gh pr create --title "Eval runner: tiered structural/text reporting (#129)" --body "$(cat <<'EOF'
## Summary
- Adds reliability axis (structural vs text) to v2 runner output, orthogonal to existing required/diagnostic exit-gating axis
- New `--text-nonblocking` flag (or `EVAL_TEXT_NONBLOCKING=1`) demotes required-text failures to warnings while keeping required-structural blocking
- Zero schema change; no eval files touched

Closes #129

## Test plan
- [ ] `bun test tests/evals-lib.test.ts` passes
- [ ] `bunx tsc --noEmit` clean
- [ ] `bun run tests/eval-runner-v2.ts --dry-run` exits 0
- [ ] Real run on a skill prints the new 3-line tier block
- [ ] Real run with required-text-only fail + `--text-nonblocking` exits 0 with warning

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL printed.

---

## Self-Review Notes

- **Spec coverage:** every acceptance criterion in the spec has a task — classifier (T1), MetaDecision reliability (T2), aggregator (T3), exit policy (T4), runner wiring (T5), docs (T6).
- **Placeholder scan:** no TBDs/TODOs.
- **Type consistency:** `ReliabilityTier`, `ReliabilityCounts`, `ReliabilityAgg`, `SuiteExitOptions`, `SuiteExitResult` — all consistent across tasks. `tallyReliability` and `suiteExit` signatures match between definition (T3, T4) and call sites (T5).
- **No external CI parser** — `EvalTally` and `suiteOk` are still exported and unchanged for any external consumer; `suiteExit` is additive.
