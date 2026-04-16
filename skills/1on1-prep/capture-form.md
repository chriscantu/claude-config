# 1:1 Prep — Capture Form & Parsing

## The 6-Prompt Capture Form

Present all six prompts in one message:

```
## Post-1:1 Capture: <Person Name>

Quick capture from your 1:1. Answer what applies, skip what doesn't.

1. **Opportunities** — Any strategic openings, momentum, or possibilities surfaced?
2. **Concerns** — Any risks, worries, or problems raised?
3. **Relationships** — Any new names, allies, critics, or connectors mentioned?
4. **Commitments from them** — Anything they owe you?
5. **Follow-ups for you** — Anything you owe them?
6. **Anything else** — Notes that don't fit the above?
```

## Tag Mapping

| Prompt # | Tags applied |
|----------|-------------|
| 1 | `[1on1][<mode>][opportunity]` |
| 2 | `[1on1][<mode>][concern]` |
| 3 | `[1on1][<mode>][relationship]` |
| 4 | `[1on1][<mode>][commitment]` |
| 5 | `[1on1][<mode>][followup]` |
| 6 | `[1on1][<mode>]` (no strategic tag) |

Where `<mode>` is `intake` or `coaching`.

## Parsing Rules

- Match responses by number prefix (`1. ...` or `1) ...`) or sequential paragraph order
- **Unparseable input**: If no numbers or clear breaks, re-present the form and ask
  the user to slot responses by number. Do NOT interpret content into buckets.
- Skip empty responses — no observation for blank prompts
- Each non-empty response = exactly one observation (don't split multi-sentence answers)
- Observation body = user's verbatim text (never summarize)

## Confirm & Tag

Show tagged observations for review before writing:

```
## Tagged Observations Preview

I'll write these observations to <Person Name>'s record:

1. [2026-04-15][1on1][intake][opportunity] Platform rewrite is an opening for the team
2. [2026-04-15][1on1][intake][commitment] Owes me the org chart by Friday

Does this look right? You can **confirm**, **edit**, or **cancel**.
```

## Resolution Mini-Flow

After showing the tagged preview, check new `[commitment]` or `[followup]` observations
against existing open items for potential resolution.

**Matching rule**: Extract substantive noun phrases from the new observation and check
for substring matches in existing open items. Requires at least one multi-word phrase
(2+ words) or distinctive single noun (not common words like "update", "meeting",
"team"). When in doubt, do NOT match.

If a plausible match is found, ask:

> "This looks like it might close an earlier item:
> - Prior: [2026-04-10][1on1][intake][commitment] Owes me the org chart by Friday
> - New: [2026-04-15][1on1][intake][commitment] Received the org chart
>
> Is this closing out the 2026-04-10 entry? [Yes] [No]"

If **Yes**: add `[YYYY-MM-DD][1on1][<mode>][resolved] <text> (ref YYYY-MM-DD)`.
If **No**: proceed without resolving. Never auto-resolve.
