# Skill Evals

Executable behavioral evals for skills. Each pilot skill has `skills/<name>/evals/evals.json`
with prompts and rubric assertions. The runner sends each prompt through `claude --print`
and applies regex/substring assertions against the response — real PASS/FAIL, not narrative.

This complements `validate.fish` (structural/concept-coverage drift) and
`run-scenarios.fish` (manual-review behavioral scenarios). Evals are the executable
middle: cheap enough to run pre-PR, deterministic enough to run in CI.

## Running

```fish
bun run tests/eval-runner.ts                      # all skills with evals
bun run tests/eval-runner.ts define-the-problem   # one skill
bun run tests/eval-runner.ts --dry-run            # validate JSON + regex compile, no API calls
CLAUDE_BIN=/path/to/claude bun run tests/eval-runner.ts
```

Exits non-zero if any assertion fails. Per-eval transcripts land in `tests/results/`.

## Eval file schema

```json
{
  "skill": "<skill-name>",
  "description": "<why these evals exist; what regressions they guard>",
  "evals": [
    {
      "name": "slug-form-name",
      "summary": "one-line description shown in runner output",
      "prompt": "verbatim user prompt to send to claude --print",
      "assertions": [
        { "type": "contains",     "value": "...",   "description": "human-readable" },
        { "type": "not_contains", "value": "...",   "description": "..." },
        { "type": "regex",        "pattern": "...", "flags": "i", "description": "..." },
        { "type": "not_regex",    "pattern": "...", "flags": "i", "description": "..." }
      ]
    }
  ]
}
```

## Authoring evals

- **One assertion = one observable signal.** "Asks about persona" not "follows the skill correctly."
- **Mix positive and negative.** A `regex` for what should appear AND a `not_regex` for what should NOT (e.g., the skill should ask probing questions AND should NOT lead with an architecture section).
- **Regression guards belong in evals.** When a narrative test surfaces a loophole, encode the failing scenario as an eval with assertions that would have caught it.
- **Keep prompts realistic.** Lift them from real conversations or pressure-tested narrative scenarios — don't write idealized prompts that don't reflect how users actually frame requests.

## Pilot scope (issue #69)

Pilot skills: `define-the-problem`, `systems-analysis`, `fat-marker-sketch`. Migrated
prompts and behavioral signals from each skill's `tests.md` and from
`tests/scenarios/{planning-pipeline,systems-analysis}.md` (problem-definition and
systems-analysis portions). Verification scenarios remain in `tests/scenarios/` for
now — they cross multiple rules rather than a single skill.

## What this is NOT

- **Not LLM-graded.** v1 is rubric-only. LLM-graded assertions are a follow-up — they
  cost more and add nondeterminism, but catch nuance the regex misses.
- **Not a replacement for `validate.fish`.** That covers structural drift (frontmatter,
  symlinks, concept coverage). Evals cover behavioral drift.
- **Not a replacement for human review.** When an eval fails, read the transcript before
  assuming the skill is broken — the assertion may be over-fit.
