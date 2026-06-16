# execution-mode — live RED/GREEN demonstration (#370, ADR #0005 §4)

Per [ADR #0005](../../adrs/0005-behavioral-adr-promotion-requires-discriminating-signal.md) §4,
discrimination must be **demonstrated, not asserted**: the suite must pass against the
rule-present state (GREEN) and fail against a rule-broken state (RED), with eval output
from both. This file records the live runs for the `execution-mode` HARD-GATE.

**Method.** The only variable is the `~/.claude/rules/execution-mode.md` symlink target
(the harness globs `~/.claude/rules/*.md`; there is no `@`-import in CLAUDE.md). The suite
JSON is discovered from the runner's own dir, pinned to `main` — it is never the variable.
Runs use the subscription path (`env -u ANTHROPIC_API_KEY … bun run tests/eval-runner-v2.ts`),
`--concurrency 1`, `EVAL_SKIP_AUTH_PROBE=1`. Per-run logs: `/tmp/redgreen-exec-mode-logs/`;
transcripts: `tests/results/execution-mode-*-v2-*.md`.

## Result matrix

`✓` = eval passes (all required assertions pass). `✗` = eval fails (≥1 required assertion fails).

| Cell | GREEN ×3 (rule present) | RED-strip ×2 (rule emptied) | RED-broken 3-clause ×2 (#370 prescribed cut) | RED-broken surgical ×2 (tie-break para only) |
|---|:--:|:--:|:--:|:--:|
| 1 subagent-mode-on-large-multifile-plan | ✓ | ✗ | ✗ | ✓ |
| 2 single-implementer-on-small-single-file-plan | ✓ | ✗ | ✗ | ✓ |
| 3 trivial-tier-routes-to-single-implementer | ✓ | ✗ | ✗ | ✓ |
| 4 bug-fix-skip-no-marker-required | ✓ | ✓ | ✓ | ✓ |
| 5 tie-break-resolves-to-single-implementer | ✓ | ✗ | ✗ | ✓ old regex / 1-of-2 flip tightened |
| **evals passed** | **5/5, 5/5, 5/5** | **1/5, 1/5** | **1/5, 1/5** | **5/5, 5/5** |
| **assertions** | 15/16 each | 11/16, 12/16 | 11/16, 11/16 | 15/16 each |

The 16th assertion is cell 4's `not_skill_invoked`, intentionally demoted `required → diagnostic`
(it silent-fires — a required negative passes only against an empty signal channel; see its note
in `evals.json`). It is reported, never gates.

**Symlink restored to `main` after every phase** (`ln -sf`, `fish_exit` trap; never `rm`).

## Discrimination: proven at the rule-present/absent level

GREEN **5/5 ×3** (flake-stable) vs RED-strip **1/5 ×2**. **4 of 5 cells flip** when the rule is
removed. The `[Execution mode: …]` bracket is rule-specific vocabulary; a model without the rule
does not emit it. ADR #0005 §4 "demonstrate, not asserted" — **satisfied at suite level.**

## Two cells carry documented limitations

### Cell 4 (bug-fix skip) is a CONTROL, not a discriminator
Passes in **all** conditions (GREEN, strip, both broken). By design it tests the *skip* path,
where "no marker emitted" is both the rule-compliant answer **and** the rule-absent default. Per
the rules-evals procedure ("a cell discriminates only if the rule-compliant answer is not the
obvious default"), cell 4 cannot discriminate. It is a useful over-fire guard — it confirms the
rule does **not** spuriously emit a mode marker on bug fixes — but green here is **not** rule-regression
protection. Do not read it as such.

### Cell 5 (tie-break) boundary is OVER-DETERMINED — a genuine §4 finding
The #370-prescribed broken cut removes three clauses at once (Required Announcement section +
bug-fix skip line + tie-break paragraph). The **Required Announcement removal alone defines the
`[Execution mode: …]` marker for every plan-sizing cell** — so the 3-clause cut nukes the marker
for cells 1/2/3/5 and collapses RED-broken to the same `1/5` as RED-strip. It cannot isolate
*which clause drives which cell* — exactly the false-attribution ADR #0005 §4 warns against
("target ONLY the rule state the claim adds").

A **surgical** RED-broken (tie-break paragraph only, broken-branch `6625080`) was built to isolate
cell 5's boundary claim. It surfaced two real defects the JSON review and the wide-regex GREEN both missed:

1. **Regex leak (fixed).** Cell 5's required rationale regex included `TDD\s*increment`, bare
   `wins`, `disjunctive`/`conjunctive`. The c5 prompt describes the plan as *"40–50 LOC TDD
   increment"*, so the model echoes "TDD increment" in **any** mode decision — the assertion
   passed against an empty rule (RED-strip run 2) and a tie-break-deleted rule (surgical) alike.
   It bound to nothing. **Tightened to tie-break-specific vocab only** (`tie-break`,
   `both (modes|triggers|gates) … (fire|trip)`, `single-implementer wins`), validated **offline**
   against all 7 captured c5 transcripts: 3 GREEN match, 2 strip no-match (leak closed), surgical
   1-of-2 (below). Live re-run deferred per cost decision (ship-B).

2. **Over-determination (irreducible).** Even with the tie-break paragraph deleted, the model
   re-derives the tie-break behavior ~half the time from the **surviving** rule structure
   (`subagent = ALL-of` conjunctive, `single = ANY-of` disjunctive, + HARD-GATE "require all gates
   to fire before paying"). Surgical RED flips cell 5 **only 1 of 2 runs** (transcript `19-35` flips;
   `19-37` re-derives: *"Both gates trip. Tiebreaker = rule's own rationale…"*). Forcing a clean flip
   would require also deleting the conjunctive/disjunctive framing and the cost line — which removes
   **more than the clause the claim adds**, the §4 violation itself. So the tie-break clause is
   **partially unguarded** against precise single-paragraph removal: a full strip catches it; a
   surgical edit to that one paragraph may slip through ~50% of the time.

   This is a legitimate §4 outcome — **a claimed boundary that cannot be cleanly demonstrated because
   the rule states it redundantly.** Recorded, not papered over.

**Residual risk from the tightening:** the narrower regex removes flake-cushion the wide alternation
provided. GREEN matched 3/3 on captured transcripts, but future GREEN phrasings could miss the
narrower pattern (text-tier flake). Accepted: correctness over a cushion that was masking a leak.

## Transcript references

- GREEN ×3: `tests/results/execution-mode-*-v2-2026-06-15T13-4{4,5,7}-*.md` (5 cells each)
- RED-strip ×2: `…2026-06-15T13-49-*` / `…13-51-*`
- RED-broken 3-clause ×2: `…2026-06-15T13-55-*` / `…13-57-*` (broken-branch `01dc1ce`)
- RED-broken surgical ×2: `…2026-06-15T19-35-*` / `…19-37-*` (broken-branch `6625080`)
- Per-run logs + master logs: `/tmp/redgreen-exec-mode-logs/{GREEN,RED-strip,RED-broken,RED-broken-surgical}-run*.log`

## Acceptance (#370)

- [x] 5 GREEN runs documented (3 full passes ×5 cells, flake-stable 5/5)
- [x] 5 RED runs documented (strip ×2, 3-clause broken ×2, surgical broken ×2)
- [x] `rules-evals/execution-mode/REDGREEN.md` committed
- [x] Suite defect found + fixed (c5 rationale regex leak) — the §4 demonstration earned its cost
