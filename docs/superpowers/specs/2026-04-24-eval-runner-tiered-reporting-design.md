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

Type-based grouping inside the v2 runner. Zero schema change. Assertion type
maps directly to tier:

| Tier | Assertion types |
|---|---|
| Structural | `skill_invoked`, `not_skill_invoked`, `skill_invoked_in_turn`, `chain_order` |
| Text | `contains`, `not_contains`, `regex`, `not_regex` |

## Design

### File scope

- `tests/eval-runner-v2.ts` — primary change
- `tests/evals-lib.ts` — if assertion classifier is shared
- `tests/evals-lib.test.ts` — new tests
- `tests/EVALS.md` — doc update

v1 runner and all eval files untouched.

### Tier classifier

```ts
type AssertionTier = "structural" | "text";

function tierOf(type: AssertionType): AssertionTier {
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

Exhaustive switch — TypeScript flags new assertion types at compile time.

### Result aggregation

Existing per-assertion result struct gains tier (computed at print time or
stored). Aggregate counters at skill-level and run-level:

```ts
type TierCounts = { pass: number; fail: number };
type TierAgg = { structural: TierCounts; text: TierCounts };
```

### Output format

Per-eval line stays compact (existing format). Final summary block:

```
─── Summary ───
Structural:  17/18  (reliable)
Text:         9/12  (flaky — wording-sensitive)
Total:       26/30

Failures:
  ✗ [structural] systems-analysis/sunk-cost-migration: skill_invoked systems-analysis
  ✗ [text]       systems-analysis/rush-to-brainstorm: regex /surface area/i
```

Failure list groups by tier; tier prefix in brackets identifies each line.

### Exit code

- Default: any failure → exit 1.
- Flag `--text-nonblocking` (or env `EVAL_TEXT_NONBLOCKING=1`): structural fail
  forces exit 1; text-only fail prints warning banner, exit 0.

The flag exists for audit workflows where text variance is expected and
structural is the source of truth. Not the default — text fails should still
get attention.

### Documentation

`tests/EVALS.md` adds a "Reporting Tiers" section after the schema:

- Why two tiers exist (variance source).
- Type-to-tier mapping table.
- Exit-code semantics + `--text-nonblocking` flag.
- Note that text assertions remain useful as diagnostic signal even when flaky.

## Tests

`tests/evals-lib.test.ts` additions:

1. **Classifier exhaustiveness** — `tierOf` returns correct tier for each
   `AssertionType` member. Compile-time exhaustive check + runtime assertion.
2. **Aggregation** — mixed pass/fail input produces correct tier counts and
   total.
3. **Exit-code logic**:
   - Structural fail + text pass → exit 1.
   - Structural pass + text fail (default) → exit 1.
   - Structural pass + text fail (`--text-nonblocking`) → exit 0 + warning.
   - All pass → exit 0.

## Risks

- **Output-format change breaks audit consumers.** Mitigation: no external CI
  parses runner output today. Four-cell audit is human-readable. Risk: low.
- **Coarse tiering** (e.g., a deterministic literal `contains` is tagged "text"
  even though it's spoof-proof). Mitigation: accept; if pain emerges, follow-up
  adds explicit `tier` field per assertion (deferred — see issue #92 for
  parallel migration).

## Acceptance Criteria

- Running v2 runner prints structural / text / total tiers in summary.
- Failure list prefixes each line with tier.
- Default exit code unchanged (any fail → 1).
- `--text-nonblocking` flag demotes text-only failures to warnings.
- `EVALS.md` documents the tiers.
- New tests pass.

## Out of Scope / Follow-Ups

- Explicit per-assertion `tier` field in schema (deferred; revisit if
  type-based grouping proves too coarse).
- Migration of text assertions to structural where possible (#92).
- v1 runner retirement.
