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
env CLAUDE_BIN=/path/to/claude bun run tests/eval-runner.ts  # `env` prefix because fish has no inline VAR=value syntax
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

**Field requirements:**

| Field | Required? | Notes |
|---|---|---|
| `skill` (top level) | required | must equal the parent directory name |
| `description` (top level) | optional | shown in runner header |
| `evals` | required | non-empty array |
| `evals[].name` | required | slug; used in transcript filenames |
| `evals[].summary` | optional | shown next to the name in runner output |
| `evals[].prompt` | required | sent verbatim to `claude --print` |
| `evals[].assertions` | required | non-empty array |
| `assertion.type` | required | one of `contains` / `not_contains` / `regex` / `not_regex` |
| `assertion.description` | required | human-readable; what the assertion proves |
| `assertion.value` | required for `contains` / `not_contains` | non-empty string |
| `assertion.pattern` | required for `regex` / `not_regex` | non-empty string; must compile |
| `assertion.flags` | optional for `regex` / `not_regex` | RegExp flags string (e.g. `"i"`, `"im"`) |

**Load-time invariants enforced by the runner** (`loadEvalFile` in `tests/eval-runner.ts`):
- The `skill` field must equal the parent directory name (catches copy-paste mistakes).
- `evals` and each eval's `assertions` array must be non-empty.
- Every assertion is type-checked: required fields present, regex patterns precompiled.
- A bad regex or missing required field fails fast with a file path in the error — the runner exits 1 before sending any prompt to claude.

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
