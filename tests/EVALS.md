# Skill Evals

Executable behavioral evals for skills. Each pilot skill has `skills/<name>/evals/evals.json`
declaring either a single-turn eval (one `prompt` to `claude --print`) or a multi-turn eval
(a `turns[]` chain via `claude --print` + `--resume`). The runner applies structural and
regex assertions against the stream-json transcript — real PASS/FAIL, not narrative.

This complements `validate.fish` (structural/concept-coverage drift) and
`run-scenarios.fish` (manual-review behavioral scenarios). Evals are the executable
middle: cheap enough to run pre-PR, deterministic enough to run in CI.

## Running

Two runners exist. Both consume the same `evals.json` schema and write
transcripts to `tests/results/`:

- **v1 (`tests/eval-runner.ts`)** — shells `claude --print`, reads stdout text
  only. Regex/substring assertions against prose.
- **v2 (`tests/eval-runner-v2.ts`)** — shells `claude --print --output-format
  stream-json`, parses the NDJSON event stream, and runs assertions against
  structured *signals* (`finalText`, `toolUses`, `skillInvocations`) extracted
  from the transcript. Adds `skill_invoked` / `not_skill_invoked` structural
  assertions on top of the existing regex/substring set. Runs on the user's
  existing `claude` auth — no API credits billed separately.

```fish
# v1 — text-only substrate
bun run tests/eval-runner.ts                      # all skills with evals
bun run tests/eval-runner.ts define-the-problem   # one skill
bun run tests/eval-runner.ts --dry-run            # validate JSON + regex compile, no API calls
env CLAUDE_BIN=/path/to/claude bun run tests/eval-runner.ts  # `env` prefix because fish has no inline VAR=value syntax

# v2 — stream-json substrate
bun run tests/eval-runner-v2.ts                   # all skills with evals
bun run tests/eval-runner-v2.ts define-the-problem
bun run tests/eval-runner-v2.ts --dry-run         # no CLI calls; schema + regex validation only
env CLAUDE_BIN=/path/to/claude bun run tests/eval-runner-v2.ts
```

Exits non-zero if any assertion fails. v2 transcripts are suffixed `-v2-` so
they don't collide with v1 when both are run back-to-back for comparison.

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
        { "type": "contains",         "value": "...",   "description": "human-readable" },
        { "type": "not_contains",     "value": "...",   "description": "..." },
        { "type": "regex",            "pattern": "...", "flags": "i", "description": "..." },
        { "type": "not_regex",        "pattern": "...", "flags": "i", "description": "..." },
        { "type": "skill_invoked",    "skill": "...",   "description": "..." },
        { "type": "not_skill_invoked","skill": "...",   "description": "..." }
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
| `evals[].prompt` | one of `prompt` or `turns[]` | single-turn: sent verbatim to `claude --print`. Mutually exclusive with `turns[]` |
| `evals[].assertions` | required with `prompt` | non-empty array; per-turn assertion types only |
| `evals[].turns` | one of `prompt` or `turns[]` | multi-turn: non-empty array of `{ prompt, assertions }` objects run as a chain |
| `evals[].final_assertions` | optional with `turns[]` | non-empty array if present; runs against the chain after all turns (the only place `chain_order` / `skill_invoked_in_turn` are allowed) |
| `assertion.type` | required | one of `contains` / `not_contains` / `regex` / `not_regex` / `skill_invoked` / `not_skill_invoked` / `skill_invoked_in_turn` / `chain_order` |
| `assertion.description` | required | human-readable; what the assertion proves |
| `assertion.value` | required for `contains` / `not_contains` | non-empty string |
| `assertion.pattern` | required for `regex` / `not_regex` | non-empty string; must compile |
| `assertion.flags` | optional for `regex` / `not_regex` | RegExp flags string (e.g. `"i"`, `"im"`) |
| `assertion.skill` | required for `skill_invoked` / `not_skill_invoked` | non-empty string; matches the Skill tool's `input.skill` in the stream-json transcript (v2 runner only) |
| `assertion.turn` | required for `skill_invoked_in_turn` | integer ≥ 1; refers to turn index in a multi-turn eval's `turns[]` array |
| `assertion.skills` | required for `chain_order` | non-empty array of non-empty skill names; compared against the sequence of per-turn winner skills |

**Load-time invariants enforced by the runners** (`loadEvalFile` in `tests/evals-lib.ts` for v2; matching logic in v1):
- The `skill` field must equal the parent directory name (catches copy-paste mistakes).
- `evals` and each eval's `assertions` array must be non-empty.
- Every assertion is type-checked: required fields present, regex patterns precompiled.
- A bad regex or missing required field fails fast with a file path in the error — the runner exits 1 before sending any prompt to claude.

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

````
Structural (required):   N/M  (reliable, gates exit)
Text (required):         N/M  (flaky, gates exit)
Diagnostic:              N/M  (reported, no gate)
````

### `--text-nonblocking`

Flag (or env `EVAL_TEXT_NONBLOCKING=1`) demotes required-text failures to a
warning and exits 0. Required-structural failures still force exit 1. Use
when running audits where text variance is expected and structural is the
source of truth.

Text assertions remain valuable as diagnostic signal even when flaky — run-to-run
wording variance can hide real regressions where the model stops producing a phrase
entirely, so tracking text coverage alongside structural results is worthwhile.

## Multi-turn evals

`claude --print` is single-turn. Some behavioural regressions — notably the
planning pipeline's DTP → systems-analysis → brainstorming chain — can only be
observed across turns. The v2 runner supports an additive multi-turn shape that
runs a chain via `claude --print` (turn 1) + `claude --resume <session_id>`
(turns 2..N). All turns share one scratch cwd so tool writes persist.

### When to reach for multi-turn

Prefer single-turn by default — it's faster, cheaper, and simpler to author.
Reach for multi-turn only when the thing under test is the chaining behaviour
itself: pipeline stage transitions, retention of context across turns, or a
behaviour that only emerges after the first hand-off.

If you find yourself writing a single-turn eval with heroically complex regex
to catch a behaviour that happens on a follow-up, you probably want multi-turn.

### Multi-turn schema

A multi-turn eval declares `turns[]` instead of `prompt`. Each turn has its
own `prompt` and `assertions` (these run against that turn's stream-json
output only). The eval may also declare `final_assertions` that run against
the whole chain.

```json
{
  "name": "my-multi-turn-eval",
  "summary": "...",
  "turns": [
    { "prompt": "turn 1 user message", "assertions": [/* per-turn */] },
    { "prompt": "turn 2 user message", "assertions": [/* per-turn */] },
    { "prompt": "turn 3 user message", "assertions": [/* per-turn */] }
  ],
  "final_assertions": [
    { "type": "chain_order", "skills": ["a", "b", "c"], "description": "..." },
    { "type": "skill_invoked_in_turn", "turn": 2, "skill": "b", "description": "..." }
  ]
}
```

An eval declares **either** `prompt` (single-turn) **or** `turns[]` (multi-turn),
never both. `final_assertions` only applies to multi-turn evals and is optional.

### The turn-boundary contract: crafted user replies

Turns 2..N contain **crafted user replies** — realistic continuations a human
would actually type when handed off between pipeline stages ("confirmed —
proceed", "move on to brainstorming"). This keeps eval behaviour close to
real conversations. The trade-off: each multi-turn eval needs its turn-2/3
text written by hand.

Auto-advance stubs (canned "ok"/"yes" replies injected by the harness) were
considered and rejected for the initial design — they risk training evals
against a tell the harness can produce but a real user would not. Revisit if
authoring costs start dominating new-eval work.

### New assertion types

- **`skill_invoked_in_turn`** — pass if the named skill was invoked in the
  specified turn (membership, not winnership: a turn may also invoke helper
  skills; any of them counts). Requires `turn` (integer ≥ 1) and `skill`.
- **`chain_order`** — pass if the sequence of **per-turn winner** skills
  (the first `Skill` tool_use in each turn) exactly matches `skills[]`.
  Ordering and length must match. A turn with no skill invocation fails the
  assertion.

Use `skill_invoked_in_turn` when "this skill had to fire in turn N" is the
claim; use `chain_order` when the stage sequence itself is what's being
regression-tested.

### Chain failure handling

If any turn exits non-zero or times out, the chain aborts. All remaining
turns' assertions count as failures in the final summary (honest accounting
— a chain that didn't reach turn 3 didn't pass turn 3). The transcript
records `chain_failure` with a human-readable reason and which turn failed.

## Signal channels (v2)

**v2 parses the NDJSON event stream from `claude --print --output-format
stream-json` into structured signals.** Assertions run against three channels:

- `finalText` — the CLI's `result` event (or concatenated assistant text if the
  run ended on a tool use). Regex/substring assertions consume this.
- `toolUses` — every `tool_use` block from assistant messages, in order.
- `skillInvocations` — the subset of `toolUses` where the tool is `Skill`,
  with the invoked skill name lifted to the top level.

The `skill_invoked` / `not_skill_invoked` assertion types let an eval assert
*structurally* that the right skill fired, instead of scanning prose for words
the model happens to say. This is the main lever against over-fit regex
failures on single-turn `claude --print` responses.

**Authoring guidance:** for new coverage, prefer a structural assertion over a
regex when the signal is observable in the tool-use stream. Keep regex for
content the model must produce in its answer (e.g., pushback framing). See the
maintenance guidance below for the regex layer.

## Maintaining regex evals

Regex/substring assertions still apply to any content the model must produce in
its answer. This section is the craft guidance for that layer — how to keep
regex assertions from over-fitting on `claude --print`'s single-turn response
shape.

- **One assertion = one observable signal.** "Asks about persona" not "follows the skill correctly."
- **Mix positive and negative.** A `regex` for what should appear AND a `not_regex` for what should NOT (e.g., the skill should ask probing questions AND should NOT lead with an architecture section).
- **When a narrative test surfaces a loophole**, encode it in an existing eval's assertions. Prefer a structural assertion over a regex when the signal is observable in the tool-use stream.
- **Keep prompts realistic.** Lift them from real conversations or pressure-tested narrative scenarios — don't write idealized prompts that don't reflect how users actually frame requests.

### `claude --print` is single-turn and short — write behaviorally

`claude --print` responses are one turn. When a skill runs a multi-question flow,
Claude typically asks **only the first question** and waits. The skill HARD-GATE
language that appears reliably in longer interactive sessions ("red flag",
"solution-first", "low blast radius") often does NOT appear in the truncated
single-question response. Assertions that scan for that vocabulary over-fit — they
fail on correct behavior.

- **Assert behavior, not vocabulary.** Instead of matching "red flag", match the
  observable refusal framing: "before (I |we )?(draft|design|propose|build)",
  "need to understand", "what (we'?re|you'?re) (actually )?(solving|building)".
  These appear regardless of whether the full multi-step skill body fires.
- **Include multiple synonyms in positive regex.** If Claude might say "shape of
  your current system" OR "how does your current auth work" OR "what touches the
  JWT system," the regex must match all three phrasings — not just the one you
  happened to see first.
- **Anchor `not_regex` to actual questionnaire-start markers, not rhetorical
  mentions.** Claude sometimes meta-discusses the eval framing (quoting the very
  phrases you're scanning for). Match questionnaire structure (`question 1`, `Q1`,
  `1. Who`, `first question`, `let's start with`) rather than free-floating phrases
  like "what's the underlying pain" that also appear rhetorically.
- **Prefer observable framing over editorial vocabulary.** "Distinguishes X from Y"
  assertions should accept either an explicit distinction ("X isn't the same as Y")
  OR a reframing ("X is a solution, not a problem"). Don't require one specific
  phrasing.
- **When in doubt, read the transcript before assuming the skill is broken.** The
  transcripts land in `tests/results/` — if a failed assertion's response shows
  correct skill behavior, the assertion is over-fit. Loosen it; don't patch the
  skill.

## Pilot scope

Pilot skills: `define-the-problem`, `systems-analysis`, `fat-marker-sketch`. Migrated
prompts and behavioral signals from each skill's `tests.md` and from
`tests/scenarios/{planning-pipeline,systems-analysis}.md` (problem-definition and
systems-analysis portions). Verification scenarios remain in `tests/scenarios/` for
now — they cross multiple rules rather than a single skill.

## What this is NOT

- **Not LLM-graded.** Both v1 and v2 are rubric-only (regex + structural). LLM-graded
  assertions are out of scope — they bill API credits separately from the user's
  existing `claude` subscription and add nondeterminism.
- **Not a replacement for `validate.fish`.** That covers structural drift (frontmatter,
  symlinks, concept coverage). Evals cover behavioral drift.
- **Not a replacement for human review.** When an eval fails, read the transcript before
  assuming the skill is broken — the assertion may be over-fit.
