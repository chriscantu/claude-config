# Refusal & Attribution Contract — Phase 3

This document is the canonical contract enforced by `bin/onboard-guard.ts`. Skills
that read user-supplied paths or render decks call the guard before proceeding.

## Refusal — `bin/onboard-guard.ts refuse-raw <path>`

`/swot` and `/present` MUST run this before reading any user-supplied path. Exit
codes:

| Exit | Meaning | Skill action |
|---|---|---|
| 0 | Path is outside any `interviews/raw/` directory | proceed |
| 2 | Path is inside `interviews/raw/` (refused) | abort with the guard's stderr message; surface to the user; do NOT read the file |
| 64 | Misuse (wrong arg count) | bug — file an issue |

Detection rule: the absolute path of the argument contains the literal segment
`/interviews/raw/` anywhere. Symlink traversal is NOT followed (Phase 3 limitation,
see "What Phase 4 picks up").

## Attribution — `bin/onboard-guard.ts attribution-check <deck.md> <map.md>`

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

## What this contract deliberately does NOT cover

- Symlink-to-raw traversal (Phase 4 hardening).
- Nicknames, misspellings, pronouns ("she", "they") — false-negatives accepted as
  Phase 3 residual risk; tracked for Phase 4.
- Refusal of memory-MCP reads of raw notes — `/1on1-prep` writes only to memory
  graph, and the wrapper command (`/onboard --capture`) is the only producer of
  `interviews/raw/` markdown. Memory-graph reads are NOT path-checked.
- Refusal in skills outside this repo (no marketplace/plugin call-sites today).
