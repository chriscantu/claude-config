---
name: onboard
description: >
  Use when the user says /onboard <org>, "scaffold a new ramp", "set up
  onboarding workspace for <org>", or starts a new senior eng leader role.
  Day-0 scaffolder for a per-org ramp workspace; Phase 1 only — cadence nags,
  confidentiality enforcement, Calendar integration, and graduation ship in
  later phases. Do NOT use for codebase / architecture onboarding (see
  `architecture-overview` skill, issue #44).
status: experimental
version: 0.1.0
---

# /onboard — Senior Eng Leader 90-Day Ramp Orchestrator

Phase 1 (this implementation): scaffolds a per-org git-isolated workspace at
`~/repos/onboard-<org>/` with the canonical directory tree, `.gitignore`,
`RAMP.md` from a chosen cadence preset, stakeholder seed file, and an
optionally created private GitHub remote (user-confirmed at scaffold time).

**Announce at start:** "I'm using the onboard skill to scaffold your <org> ramp workspace."

## When to Use

- `/onboard <org-name>` — day-0 scaffold for a new senior leadership role
- "Set up onboarding workspace for <org>"
- "Scaffold a new ramp"

## When NOT to Use

- Codebase / architecture onboarding (use `architecture-overview`, issue #44)
- Resuming a graduated ramp — see [graduate.md](graduate.md) § "Manual
  recovery / Ungraduate"

## Procedure

1. Confirm the org slug. Default to a kebab-case form of the org name. → verify: user confirms or supplies override
2. Confirm the workspace target path. Default `~/repos/onboard-<slug>/`. → verify: path is absolute, parent exists
3. Ask the cadence preset:

   > Pick cadence: aggressive | **standard** | relaxed

   → verify: user picks one of the three valid values
4. Ask whether to create a private GitHub remote:

   > Create a private GitHub repo for this ramp now? Y/N (default Y)

   → verify: user answers Y or N
5. Run `bin/onboard-scaffold.fish --target <path> --cadence <preset> --gh-create yes|no`. → verify: exit 0; target dir exists with `RAMP.md`, `.gitignore`, `stakeholders/map.md`, a `.git` dir, and the per-org subdirs `stakeholders/`, `interviews/raw/`, `interviews/sanitized/`, `swot/`, `decks/slidev/`, `decisions/`
6. Capture manager-handoff inputs (see [manager-handoff.md](manager-handoff.md))
   directly into `<target>/stakeholders/map.md` via the section prompts there.
   → verify: each of the four section headers has at least the canonical "(none yet)" placeholder OR captured content
7. Print next-step guidance:

   > Workspace ready at <path>. Next: invoke /stakeholder-map to flesh out the seed
   > and /1on1-prep when you book your first interview.

8. **Register the cadence-nag scheduled task** (Phase 2). Run the
   scaffold-time registration protocol in [cadence-nags.md](cadence-nags.md)
   § "Scaffold-time registration protocol" — Step A (substitute
   `{{WORKSPACE_ABS_PATH}}` + `{{ORG_SLUG}}` placeholders, scan for missed
   `{{` tokens), Step B (call `mcp__scheduled-tasks__create_scheduled_task`),
   Step C (on MCP unavailable or call failure, append to
   `<workspace>/.scaffold-warnings.log` and surface the partial-ready
   message). Do NOT silently continue on failure.

## Status, mute, and unmute

`/onboard --status <org>` → run `bun run bin/onboard-status.ts --status <workspace-path>`.
Prints elapsed days, next unchecked milestone, and current mutes.

`/onboard --mute <category>` → run `bun run bin/onboard-status.ts --mute <category> <workspace-path>`.
Categories: `milestone` | `velocity` | `calendar`. Mute state persists in
`RAMP.md` `## Cadence Mutes`.

`/onboard --unmute <category>` → run `bun run bin/onboard-status.ts --unmute <category> <workspace-path>`.

## Capture and sanitize (Phase 3)

`/onboard --capture <person>` → wrap `/1on1-prep` to capture verbatim notes
into `<workspace>/interviews/raw/` with per-observation sanitization tags
(`attributable | aggregate-only | redact`). See
[capture-and-sanitize.md](capture-and-sanitize.md) for the full flow.

`/onboard --sanitize <workspace>` → emit themes from tagged raw notes into
`<workspace>/interviews/sanitized/`. See
[capture-and-sanitize.md](capture-and-sanitize.md).

Sanitization is the gateway: `/swot` and `/present` refuse to read
`interviews/raw/` per [refusal-contract.md](refusal-contract.md). All
downstream synthesis consumes `interviews/sanitized/` exclusively.

## Pre-render attribution gate (Phase 3)

Before invoking `/present` for any milestone reflect-back (W4 interim, W8
final), MUST run:

```fish
bun run "$CLAUDE_PROJECT_DIR/bin/onboard-guard.ts" attribution-check \
  <workspace>/decks/slidev/<deck>/slides.md \
  <workspace>/stakeholders/map.md
```

(`CLAUDE_PROJECT_DIR` is harness-provided; if unset, walk up from CWD until a
`.git` directory is found.)

On exit 3, surface the guard's stderr (file:line:phrase report) and require
the literal `override` token before proceeding. Override is enforced HERE in
the SKILL.md body — the helper is pure, no interactive I/O. Per-render, no
persistent state.

See [refusal-contract.md](refusal-contract.md) for the full exit-code table
and override semantics.

## Calendar paste (Phase 4)

`/onboard --calendar-paste <workspace>` reads a Calendar attendee summary
from stdin, parses it, diffs against `<workspace>/stakeholders/map.md`, and
writes unmatched invitees to `<workspace>/calendar-suggestions.md` for user
review. The cron-fired cadence-nag worker reminds on Mondays when paste is
7+ days stale.

```fish
# Common usage — paste from clipboard, pipe to helper
pbpaste | bun run "$CLAUDE_PROJECT_DIR/bin/onboard-calendar.ts" paste <workspace>
```

(`CLAUDE_PROJECT_DIR` is harness-provided; if unset, walk up from CWD until
a `.git` directory is found.)

Paste-only is Phase 4 by design (live MCP scan deferred). See
[calendar-paste.md](calendar-paste.md) for the format taxonomy, diff-key
limitations, suggestions-file shape, and override semantics. Mute via
`/onboard --mute calendar` per the existing status helper.

## Graduate (Phase 5)

`/onboard --graduate <workspace>` closes a 90-day ramp. The 9-step
idempotent flow (detect prior graduation → verify clean tree → compose
retro → commit → tag → push → pause cron via MCP → write `.graduated`
sentinel → print summary) is documented in [graduate.md](graduate.md).

```fish
bun run "$CLAUDE_PROJECT_DIR/bin/onboard-graduate.ts" graduate <workspace>
```

Re-running on a graduated workspace exits 0 with an "already graduated"
warning. `--force` re-applies every step idempotently. The cadence-nag
autonomous session has a defense-in-depth `.graduated` guard
([cadence-nags.md](cadence-nags.md) Step 0.5) that no-ops fires even if
the MCP pause failed.

## Pre-render attribution gate — manual-pass checklist

Before invoking `/present` for any milestone reflect-back (W4 interim,
W8 final), run the regex-based attribution gate (see § "Pre-render
attribution gate (Phase 3)" above) AND walk this manual checklist. The
regex gate is high-precision/low-recall by design — it catches exact
mapped-name substrings but cannot catch the four classes below. Treat
the manual scan as load-bearing, not optional.

1. **Short-form names** — scan the deck for short forms of mapped
   stakeholders: "Jon" if `map.md` has "Jonathan", "Sue" for "Susan",
   "Mike" for "Michael". The regex matches whole tokens of the canonical
   form only.
2. **Misspellings** — scan for variants within edit distance 2 of any
   mapped name ("Jonathon" / "Jonathan", "Cathy" / "Kathy"). A single
   transposed character defeats the literal-match regex.
3. **Pronouns near quote contexts** — scan for "he", "she", "they"
   within 1–2 sentences of a quoted observation. A pronoun + a unique
   role phrase ("the CFO said…") is identifying even without a name.
4. **Organizational shorthand** — scan for "the CFO", "my manager",
   "our director of X", "the platform lead" — phrases that map to a
   single identifiable person in context.

**Per-render scope.** Re-walk all four classes on EVERY render, not
just the first time. The override token is per-render (see
[refusal-contract.md](refusal-contract.md) "Override semantics") — a
re-render of the same deck must re-pass the manual scan AND re-issue
`override` if the regex gate still fires. A once-per-deck sign-off is
NOT compliant with this contract.

**Procedure for the four classes:**

1. **Short-form names** — for each name in `map.md`, generate the
   standard short forms (Jonathan → Jon / Jonny; Susan → Sue / Susie;
   Michael → Mike / Mick) and grep the deck literal for each.
2. **Misspellings** — for each name, scan the deck for variants within
   edit distance 2 (one transposition or two single-character changes).
   When in doubt, search for substrings of the canonical name (≥4
   chars).
3. **Pronouns near quote contexts** — grep the deck for `\b(he|she|they)\b`
   and inspect each match's surrounding 2 sentences for a unique role
   phrase ("the CFO said", "our director of X").
4. **Organizational shorthand** — grep for "the (CFO|VP|director|head|
   manager|lead)" and inspect each match for a single-person referent.

Override the regex gate ONLY after this manual scan returns clean for
THIS specific render. Literal-name regex matches are NEVER overridable
on a single sweep — re-author the deck with aggregate framing first.

## Backtracking

If `bin/onboard-scaffold.fish` exits non-zero, surface the stderr directly to
the user and stop. The most common cause is the target dir already containing
files (clobber-refusal); ask the user whether to choose a different path.

## What this skill deliberately does NOT do (yet)

- Live Calendar MCP scan, attribution heuristics (alias / Levenshtein /
  pronoun), and `map.md` email-match schema — Phase 6, pending real-ramp
  evidence that the manual paste path + attribution checklist are
  insufficient.

## References

Read on demand, not upfront:

- [scaffold.md](scaffold.md) — dir layout, scaffold flow, helper flag reference
- [ramp-template.md](ramp-template.md) — RAMP.md preset templates
- [manager-handoff.md](manager-handoff.md) — manager-handoff capture prompts
- [graduate.md](graduate.md) — `/onboard --graduate` flow, retro template, recovery
