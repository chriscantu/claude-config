# Refusal & Attribution Contract — Phase 3

> **Cross-bundle reference — monorepo-only, `.skill`-bundle hostile.** This file is the
> single-source contract for `onboard-guard.ts`, consumed by `/swot` and `/present` via
> repo-relative deep-links (`../onboard/refusal-contract.md`). Anthropic's skill packager
> would not follow the `../` reference; a fork-consumer copying just `skills/swot/` or
> `skills/present/` into another repo gets a dangling link. Acceptable risk in this
> monorepo per ADR #0013 (which accepted the same trade-off for shared architecture
> vocabulary). Reopen if a packaging or fork-consumer reverses the calculus.

This document is the canonical contract enforced by `skills/onboard/scripts/onboard-guard.ts`. Skills
that read user-supplied paths or render decks call the guard before proceeding.

## Repo-root resolution (all guard call-sites)

All guard invocations need the repo root to locate `skills/onboard/scripts/onboard-guard.ts`. Resolution rule, applied identically by every call-site:

- `$CLAUDE_PROJECT_DIR` is the harness-provided absolute path to the repository root. Use it when set.
- If the env var is not set (e.g., the skill is being executed outside the harness), resolve the repo root by walking up from CWD until a `.git` directory is found.

Each call-site invokes:

```fish
bun run "$CLAUDE_PROJECT_DIR/skills/onboard/scripts/onboard-guard.ts" <subcommand> <args>
```

with the env-var fallback applied per the rule above.

## Refusal — `skills/onboard/scripts/onboard-guard.ts refuse-raw <path>`

`/swot` and `/present` MUST run this before reading any user-supplied path. Exit
codes:

| Exit | Meaning | Skill action |
|---|---|---|
| 0 | Path is outside any `interviews/raw/` directory | proceed |
| 2 | Path is inside `interviews/raw/` (refused) | abort with the guard's stderr message; surface to the user; do NOT read the file |
| 64 | Misuse (wrong arg count) | bug — file an issue |

Detection rule: the path is resolved via `realpathSync` before the
`/interviews/raw/` segment check. Symlinks pointing at raw notes refuse;
broken symlinks (target missing) refuse as the safer default.

## Attribution — `skills/onboard/scripts/onboard-guard.ts attribution-check <deck.md> <map.md>`

`/onboard` MUST run this before invoking `/present` for any milestone reflect-back
(W4 interim, W8 final). Exit codes:

| Exit | Meaning | /onboard action |
|---|---|---|
| 0 | Deck contains zero stakeholder name matches | proceed to `/present` |
| 3 | Deck contains one or more matches; report on stderr | surface the report to the user; require explicit `override` token before proceeding |
| 64 | Misuse (wrong arg count) | bug |

Override semantics: the user types literal `override` to proceed despite matches.
Anything else aborts. The override is per-render, not persistent — a re-render
re-runs the check.

## Name extraction from `map.md`

Bullet lines in any `## ...` section under `stakeholders/map.md` matching
`^- (.+?)(?:\s+[—\-:]\s+|$)` contribute the captured name. Em-dash, hyphen, and
colon are recognized role separators. Bullets with no separator contribute the
whole bullet text as the name. Names are deduplicated; the regex is built as
`\b(name1|name2|...)\b/i`.

## Known blind spots — manual scan required

The regex-based attribution gate is high-precision/low-recall by design:
it catches exact mapped-name substrings only. Four classes of leakage
slip through and MUST be caught by the author-side manual scan
documented in [SKILL.md](SKILL.md) § "Pre-render attribution gate —
manual-pass checklist":

1. **Short-form names** — "Jon" for "Jonathan", "Sue" for "Susan".
2. **Misspellings within edit distance 2** — "Jonathon" / "Jonathan".
3. **Pronouns near quote contexts** — "she said…" + a unique role.
4. **Organizational shorthand** — "the CFO", "my manager", "our
   director of X" phrases that map to a single identifiable person.

The high-precision/low-recall design is deliberate: a low-precision
regex would surface false-positives on every render and erode the
override discipline. Closing the recall gap with heuristics
(Levenshtein, alias tables, pronoun coreference) is a Phase 6 decision
contingent on real-ramp evidence that the manual checklist is
insufficient.

## What this contract deliberately does NOT cover

- Heuristic attribution coverage (alias tables from memory-MCP entity
  shape, Levenshtein-distance matching for misspellings, pronoun
  coreference) — Phase 6 if real-ramp evidence demonstrates the manual
  checklist + author-side scan is insufficient.
- Refusal of memory-MCP reads of raw notes — `/1on1-prep` writes only to memory
  graph, and the wrapper command (`/onboard --capture`) is the only producer of
  `interviews/raw/` markdown. Memory-graph reads are NOT path-checked.
- Refusal in skills outside this repo (no marketplace/plugin call-sites today).
