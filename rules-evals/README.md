# Rules-layer evals

Behavioral evals for HARD-GATEs that live in `rules/*.md` rather than
`skills/*/SKILL.md`. Layout mirrors the skill-layer pattern exactly:

```
rules-evals/
└── <gate-name>/
    └── evals/
        └── evals.json
```

Current suites:

- `disagreement/` — covers the new-evidence requirement + Hedge-then-Comply
  prohibition from [`rules/disagreement.md`](../rules/disagreement.md)
- `goal-driven/` — covers the per-step verify checks + named-cost skip
  contract from [`rules/goal-driven.md`](../rules/goal-driven.md)
- `memory-discipline/` — covers the re-challenge contract on material
  context shift from [`rules/memory-discipline.md`](../rules/memory-discipline.md)
- `pr-validation/` — covers the trigger surface (speech-act + action-bound),
  test-plan locator, and zero-functional-change carve-out from
  [`rules/pr-validation.md`](../rules/pr-validation.md)
- `scope-tier-memory-check/` — covers the `UserPromptSubmit` hook routing
  contract that fires before the pressure-framing floor (see
  [`rules/planning.md`](../rules/planning.md))
- `think-before-coding/` — covers the three-part preamble + emission
  contract from [`rules/think-before-coding.md`](../rules/think-before-coding.md)
- `verification/` — covers the end-of-work goal-verification gate from
  [`rules/verification.md`](../rules/verification.md)

## Coverage map vs HARD-GATE set

The [HARD-GATE cap policy](../rules/README.md#hard-gate-cap) freezes the
live set at 8 rules. Eval coverage lives in two roots — `skills/<name>/evals/`
for gates that have a host skill, and `rules-evals/<gate>/evals/` for the rest.

| HARD-GATE rule | Eval home |
|---|---|
| `planning.md` | `skills/define-the-problem/evals/` + `skills/systems-analysis/evals/` + 4 floor evals here (`disagreement`, `memory-discipline`, `pr-validation`, `scope-tier-memory-check`) |
| `fat-marker-sketch.md` | `skills/fat-marker-sketch/evals/` (skill-layer boundary) |
| `goal-driven.md` | `rules-evals/goal-driven/` |
| `think-before-coding.md` | `rules-evals/think-before-coding/` |
| `pr-validation.md` | `rules-evals/pr-validation/` |
| `disagreement.md` | `rules-evals/disagreement/` |
| `memory-discipline.md` | `rules-evals/memory-discipline/` |
| `execution-mode.md` | **GAP — no discriminating eval at this rule's boundary; tracked in #361** |

Soft rules (`tdd-pragmatic.md`, `verification.md`) are not required by
[ADR #0005](../adrs/0005-behavioral-adr-promotion-requires-discriminating-signal.md)
to ship discriminating signal — `verification/` exists as bonus coverage,
not as a policy requirement.

## Why a sibling root rather than `skills/`

See the canonical explanation in [`tests/EVALS.md`](../tests/EVALS.md#rules-layer-evals).
Short version: `install.fish`/`bin/link-config.fish` symlink every dir under
`skills/` as a real skill, and `validate.fish` requires `SKILL.md` frontmatter
for each — neither holds for a rule-layer eval suite.

## Running

The runner at [`tests/eval-runner-v2.ts`](../tests/eval-runner-v2.ts) discovers
both `skills/<name>/evals/` and `rules-evals/<name>/evals/` at startup and
merges them into one suite. Naming collisions across roots fail fast.

Authoring guidance: same as skill-layer evals. See `tests/EVALS.md`.
