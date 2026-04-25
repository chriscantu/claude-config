# Eval Runner: Tiered Assertion Reporting

**Issue:** [#129](https://github.com/chriscantu/claude-config/issues/129)
**Date:** 2026-04-24
**Status:** Design approved, pending implementation

## Problem

When verifying skill/rule changes via evals, top-line scores (e.g. `11/11` vs
`9/11`) vary run-to-run even when behavior didn't change. The runner conflates
two assertion tiers under one score:

- **Structural** (`tool_input_matches`, `skill_invoked`) — deterministic,
  spoof-resistant
- **Text-compliance** (`text_matches`, `not_regex`) — wording-sensitive, flaky

Effect: lost trust in eval output, longer audits, real regressions hidden behind
text flake. Four-cell FMS audit (2026-04-24) hit this — required manual
transcript review to disambiguate.

## Goal

Separate scores so reliable signal is readable at a glance. Top-line structural
score = trustworthy. Text score = flaky-aware. Total = sanity check.

## Non-Goals

- v1 runner (`tests/eval-runner.ts`) is not modified.
- Eval file schema is not changed.
- Existing eval files are not edited.
- Issue #92 (text-to-structural migration) is out of scope; this design is
  complementary, not blocking.

## Approach

Type-based reliability grouping inside the v2 runner. Zero schema change.

**Two axes already / now in play:**

- **Exit-gating axis (existing):** `AssertionTier = "required" | "diagnostic"`.
  `required` failures fail the suite. `diagnostic` failures are reported but
  do not gate exit code. Already implemented.
- **Reliability axis (new):** `ReliabilityTier = "structural" | "text"`.
  Computed from assertion type — no schema field. Used only for reporting.

Assertion type → reliability:

| Reliability | Assertion types |
|---|---|
| Structural | `skill_invoked`, `not_skill_invoked`, `skill_invoked_in_turn`, `chain_order` |
| Text | `contains`, `not_contains`, `regex`, `not_regex` |

The two axes cross: a `regex` assertion can be `required` (gates exit, flaky)
or `diagnostic` (non-gating, flaky). Both axes are reported.

## Design

### File scope

- `tests/eval-runner-v2.ts` — primary change
- `tests/evals-lib.ts` — if assertion classifier is shared
- `tests/evals-lib.test.ts` — new tests
- `tests/EVALS.md` — doc update

v1 runner and all eval files untouched.

### Reliability classifier

New type added alongside existing `AssertionTier`:

```ts
export type ReliabilityTier = "structural" | "text";

export function reliabilityOf(type: AssertionType): ReliabilityTier {
  switch (type) {
    case "skill_invoked":
    case "not_skill_invoked":
    case "skill_invoked_in_turn":
    case "chain_order":
      return "structural";
    case "contains":
    case "not_contains":
    case "regex":
    case "not_regex":
      return "text";
  }
}
```

Exhaustive switch — TypeScript flags new assertion types at compile time. Lives
in `tests/evals-lib.ts` near `AssertionTier`.

### Result aggregation

`MetaDecision` already carries `tier: AssertionTier` (required/diagnostic) and
`description`. Reliability is derived at report time from the originating
assertion's `type`. Two paths:

1. **Add `reliability` field to `MetaDecision`** at decision-creation time in
   `metaCheck` (line ~637 of `evals-lib.ts`). Cleaner — no re-lookup at print.
2. **Pass assertion type alongside** in a parallel array used only for reporting.

Use option 1 — the type is already in scope where the decision is created and
storage cost is one string per assertion.

Aggregate counters per skill and run:

```ts
type ReliabilityCounts = { pass: number; fail: number };
type ReliabilityAgg = {
  requiredStructural: ReliabilityCounts;
  requiredText: ReliabilityCounts;
  diagnostic: ReliabilityCounts; // structural+text combined; diagnostic never gates
};
```

Diagnostic isn't split by reliability — diagnostic doesn't gate, so the
reliability split there adds noise without value.

### Output format

Per-eval line stays compact (existing format). Final summary block:

```
─── Summary ───
Structural (required):   17/18  (reliable, gates exit)
Text (required):          9/12  (flaky, gates exit)
Diagnostic:              27/29  (reported, no gate)
Total:                   53/59

Failures:
  ✗ [req-structural] systems-analysis/sunk-cost-migration: skill_invoked systems-analysis
  ✗ [req-text]       systems-analysis/rush-to-brainstorm: regex /surface area/i
  ✗ [diagnostic]     systems-analysis/foo: contains "..."
```

Failure list groups by tier; bracket prefix identifies each line.

### Exit code

Existing semantics preserved: any required-tier failure → exit 1; diagnostic
failures never gate. New flag adds reliability-based softening:

- Default: any required failure (structural or text) → exit 1.
- Flag `--text-nonblocking` (or env `EVAL_TEXT_NONBLOCKING=1`): required-text
  failures print warning banner + exit 0; required-structural failures still
  → exit 1.

The flag is for audit workflows where text variance is expected and structural
is the source of truth. Not the default — required-text fails should still get
attention by default.

### Documentation

`tests/EVALS.md` adds a "Reporting Tiers" section after the schema:

- Why two tiers exist (variance source).
- Type-to-tier mapping table.
- Exit-code semantics + `--text-nonblocking` flag.
- Note that text assertions remain useful as diagnostic signal even when flaky.

## Tests

`tests/evals-lib.test.ts` additions:

1. **Classifier exhaustiveness** — `reliabilityOf` returns correct tier for
   each `AssertionType` member.
2. **MetaDecision carries reliability** — `metaCheck` outputs include the
   reliability field for each decision.
3. **Aggregation** — mixed pass/fail input produces correct counts for
   `requiredStructural`, `requiredText`, `diagnostic`.
4. **Exit-code logic** (new helper, e.g. `suiteExit`):
   - Required-structural fail + rest pass → exit 1.
   - Required-text fail (default) + rest pass → exit 1.
   - Required-text fail (`--text-nonblocking`) + rest pass → exit 0 + warning flag.
   - Required-structural fail + `--text-nonblocking` → still exit 1.
   - Diagnostic-only fail → exit 0.
   - All pass → exit 0.

## Risks

- **Output-format change breaks audit consumers.** Mitigation: no external CI
  parses runner output today. Four-cell audit is human-readable. Risk: low.
- **Coarse tiering** (e.g., a deterministic literal `contains` is tagged "text"
  even though it's spoof-proof). Mitigation: accept; if pain emerges, follow-up
  adds explicit `tier` field per assertion (deferred — see issue #92 for
  parallel migration).

## Acceptance Criteria

- Running v2 runner prints `Required Structural` / `Required Text` /
  `Diagnostic` / `Total` lines in summary.
- Failure list prefixes each line with `[req-structural]` / `[req-text]` /
  `[diagnostic]`.
- Default exit code unchanged (any required fail → 1; diagnostic-only → 0).
- `--text-nonblocking` flag demotes required-text failures to warnings while
  keeping required-structural blocking.
- `EVALS.md` documents the reliability axis and the flag.
- New tests pass; existing tests unchanged.

## Out of Scope / Follow-Ups

- Explicit per-assertion `tier` field in schema (deferred; revisit if
  type-based grouping proves too coarse).
- Migration of text assertions to structural where possible (#92).
- v1 runner retirement.
