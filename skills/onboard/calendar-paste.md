# Calendar Paste — Phase 4 (Q3-C: paste-only)

`/onboard --calendar-paste <workspace>` reads a calendar attendee summary from
stdin, parses it, diffs against `<workspace>/stakeholders/map.md`, and writes
unmatched invitees to `<workspace>/calendar-suggestions.md` for user review.

Phase 4 is paste-only by design (Q3-C). Live MCP scan via
`mcp__5726bf10-…__list_events` is deferred to a later phase — the autonomous
cron worker MUST NOT call MCP tools; foreground Claude sessions can layer a
`--calendar-scan` wrapper that emits paste-format and pipes into this helper.

## Paste format

The parser tolerates three line shapes per attendee, blank lines ignored,
surrounding whitespace trimmed:

| Shape | Example |
|---|---|
| Freeform `<email>` | `Sarah Chen <sarah@acme.com>` |
| Freeform separator | `Sarah Chen — sarah@acme.com` (em-dash, hyphen, or `<`) |
| Bare name | `Sarah Chen` (email becomes `null`) |
| ICS subset | `ATTENDEE;CN=Sarah Chen:mailto:sarah@acme.com` |

Mixed shapes within a single paste are fine. Order is preserved.

## Diff key (Phase 4 limitation)

Match is **display-name only**, case-insensitive, against names extracted from
`stakeholders/map.md` via `bin/onboard-guard.ts` `extractNames()` (the same
helper Phase 3 uses for attribution-check; single source of truth).

**Residual risks** (same bucket as Phase 3 attribution-check):

- Nicknames: paste says `Sarah`, map.md has `Sarah Chen` — false-positive
  unmatched.
- Misspellings: paste says `Sara Chen` — false-positive unmatched.
- Email-only match — NOT supported in Phase 4 (map.md has no email column
  today; schema extension deferred to Phase 5+).

False-positive unmatched is the safe failure mode (over-flag, never silently
miss). User reviews `calendar-suggestions.md` and cherry-picks into
`stakeholders/map.md`.

## Suggestions file

`<workspace>/calendar-suggestions.md` is review-friendly markdown. New paste
runs OVERWRITE the file (not append) — it represents the current snapshot,
not history. Format:

```markdown
# Calendar invitee suggestions — <ISO date>

Unmatched invitees from latest paste. Review and add to
`stakeholders/map.md` if appropriate.

- Priya Patel <priya@acme.com>
- Diego Lopez
```

When zero invitees are unmatched, the file is NOT written (avoid stale empty
files).

## Staleness contract

`<workspace>/.calendar-last-paste` holds a single ISO date line, written on
every paste run regardless of unmatched count. The cadence-nag autonomous
worker reads this on Monday-fires (only) and nags when missing or 7+ days
stale. See [`cadence-nags.md`](cadence-nags.md) Step 5.

## NAGS.md integration

Each paste run appends ONE summary line to `<workspace>/NAGS.md`:

    <ISO date>  calendar  N new invitee(s) pending review (see calendar-suggestions.md)

Subject to the Phase 2 dedupe contract — re-running paste on the same day
does NOT duplicate the line. Per-invitee detail lines live in
`calendar-suggestions.md`, not NAGS.md.

## Override semantics

None. Paste is purely user-initiated; there is no gate that the user can
override. If the user disagrees with an unmatched flag, they edit
`calendar-suggestions.md` (or ignore it) directly.

## What this flow deliberately does NOT do

- Call MCP / HTTP / Calendar APIs from any context (paste-only, Phase 4).
- Modify `stakeholders/map.md` (suggestions are user-cherry-picked).
- Match on email (Phase 5+ schema extension required).
- Cluster invitees across multiple meetings (single-paste snapshot).
- Distinguish recurring from one-shot meetings (out of scope; user decides
  whether to add to map.md).
- Auto-archive old `calendar-suggestions.md` versions (file is overwritten
  per run; user's git history preserves prior suggestions if needed).
