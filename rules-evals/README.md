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

- `goal-driven/` — covers the per-step verify checks + named-cost skip
  contract from [`rules/goal-driven.md`](../rules/goal-driven.md)
- `think-before-coding/` — covers the three-part preamble + emission
  contract from [`rules/think-before-coding.md`](../rules/think-before-coding.md)

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
