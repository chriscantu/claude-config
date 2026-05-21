# Rules-layer evals

Behavioral evals for HARD-GATEs that live in `rules/*.md` rather than
`skills/*/SKILL.md`. Layout mirrors the skill-layer pattern exactly:

```
rules-evals/
└── <gate-name>/
    └── evals/
        └── evals.json
```

<!-- Suite list is enforced by validate.fish Phase 1p: bullets below must
     match ls rules-evals/ exactly. Add a new bullet whenever you add a
     suite dir. Bullet format is load-bearing — must be
     `- \`<lowercase-slug>/\` — ...` exactly; uppercase or non-[a-z0-9_-]
     chars in the slug are rejected by the strict filter regex. -->
Current suites:

- `disagreement/` — covers the new-evidence requirement + Hedge-then-Comply
  prohibition from [`rules/disagreement.md`](../rules/disagreement.md)
- `execution-mode/` — covers the sizing-guard mode announcement (subagent-driven
  vs. single-implementer) from [`rules/execution-mode.md`](../rules/execution-mode.md)
- `goal-driven/` — covers the per-step verify checks + named-cost skip
  contract from [`rules/goal-driven.md`](../rules/goal-driven.md)
- `hard-gate-cap/` — covers the 8-rule HARD-GATE cap + three-condition
  gate from [`rules/GOVERNANCE.md`](../rules/GOVERNANCE.md#hard-gate-cap) (ADR #0015)
- `memory-discipline/` — covers the re-challenge contract on material
  context shift from [`rules/memory-discipline.md`](../rules/memory-discipline.md)
- `pr-validation/` — covers the trigger surface (speech-act + action-bound),
  test-plan locator, and zero-functional-change carve-out from
  [`rules/pr-validation.md`](../rules/pr-validation.md)
- `scope-tier-memory-check/` — covers the `UserPromptSubmit` hook routing
  contract that fires before the pressure-framing floor, documented in
  [`rules/planning.md`'s scope-tier section](../rules/planning.md#scope-tier-memory-check)
- `think-before-coding/` — covers the three-part preamble + emission
  contract from [`rules/think-before-coding.md`](../rules/think-before-coding.md)
- `verification/` — covers the end-of-work goal-verification gate from
  [`rules/verification.md`](../rules/verification.md)

## Coverage map vs HARD-GATE set

The [HARD-GATE cap policy](../rules/GOVERNANCE.md#hard-gate-cap) freezes the
set listed in [`rules/README.md`](../rules/README.md)'s "What lives here"
table at 8 rules.
Eval coverage lives in two roots — `skills/<name>/evals/` for gates that
have a host skill, and `rules-evals/<gate>/evals/` for the rest. The
pressure-framing floor in `planning.md` is *inherited* by every HARD-GATE,
so floor behavior is exercised indirectly through every per-rule suite —
the rows below name each rule's *primary* eval home, not the inheritance
graph.

| HARD-GATE rule | Eval home |
|---|---|
| `planning.md` | `skills/define-the-problem/evals/` + `skills/systems-analysis/evals/` |
| `fat-marker-sketch.md` | `skills/fat-marker-sketch/evals/` (skill-layer boundary) |
| `goal-driven.md` | `rules-evals/goal-driven/` |
| `think-before-coding.md` | `rules-evals/think-before-coding/` |
| `pr-validation.md` | `rules-evals/pr-validation/` |
| `disagreement.md` | `rules-evals/disagreement/` |
| `memory-discipline.md` | `rules-evals/memory-discipline/` |
| `execution-mode.md` | `rules-evals/execution-mode/` |

Soft rules (no `<HARD-GATE>` block, no skip contract) — `tdd-pragmatic.md`
and `verification.md` — are not required by
[ADR #0005](../adrs/0005-behavioral-adr-promotion-requires-discriminating-signal.md)
to ship discriminating signal. `verification/` exists as bonus coverage,
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
