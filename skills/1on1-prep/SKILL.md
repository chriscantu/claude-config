---
name: 1on1-prep
description: Use when the user says /1on1-prep, "prep for my 1:1", "1:1 with", "capture my 1:1", or wants to prepare for or record notes from a one-on-one meeting.
---

# 1:1 Prep & Capture

Structures 1:1 meeting preparation and post-meeting capture using the knowledge graph.
Prep phase reads the graph to surface context, open commitments, and suggested questions.
Capture phase writes verbatim user observations with deterministic tags.

**Announce at start:** "I'm using the 1on1-prep skill to help you prepare for your 1:1."

**Execution order:** Prerequisites → Invocation → Person Lookup → Bootstrap (if new) →
Phase Detection → Mode Detection → Prep or Capture phase.

## Prerequisites

Verify the memory MCP is available:

```
mcp__memory__read_graph
```

If this fails, warn the user:
> "The memory MCP server isn't available. I can still help you prep from what you
> tell me, but I won't be able to read prior observations. If you capture notes,
> they'll be saved locally to `pending-sync/` and you can retry with `/1on1-prep --sync`
> when the server is back."

Set a flag to route all writes to pending-sync for the remainder of this session.
The capture phase and write path should treat every write as a failure and save to
the pending-sync file instead of attempting `mcp__memory__add_observations`.

Check for pending-sync files:

```fish
ls skills/1on1-prep/pending-sync/*.md 2>&1
```

If any exist, warn:
> "You have pending observations that failed to write previously. Run
> `/1on1-prep --sync` to retry writing them to the graph."

## Invocation

```
/1on1-prep <person-name> [--mode=intake|coaching] [--phase=prep|capture] [--context "..."] [--sync]
```

### Flag Handling

| Flag | Behavior |
|------|----------|
| `--mode=intake\|coaching` | Override auto-detected mode for this person |
| `--phase=prep\|capture` | Override calendar-based phase detection |
| `--context "..."` | Add a `[context]` observation without entering meeting flow |
| `--sync` | Drain pending-sync files — retry all failed writes |

**`--context` flow**: Write a `[context]` observation to the Person and exit. No meeting
flow, no phase detection. Format: `[YYYY-MM-DD][context] <user-provided text>`.
If the write fails (MCP unavailable or transient error), save to pending-sync and warn
the user, same as the capture phase fallback.

**`--sync` flow**: Read all files in `skills/1on1-prep/pending-sync/`, attempt to write
each observation to the graph via `mcp__memory__add_observations`. Report results
per-observation. Delete the pending-sync file only if all observations in it succeed.
Exit after sync — no meeting flow.

**Parsing pending-sync files**: Extract the Person name from the first line
(`# Pending Observations: <Person Name>`). Each line starting with `- [` is one
observation to write. The entity name for all observations in the file is the Person
name from the header.

Error handling for `--sync`:
- If a file cannot be read (permissions, missing), report the error per-file and skip it
- If a file is read but yields zero parseable observations, warn the user and do NOT
  delete the file (it may be corrupted — preserve it for manual inspection)
- Report: total files found, observations parsed, writes attempted, writes succeeded

## Person Lookup

Search the knowledge graph for the person:

```
mcp__memory__search_nodes({ query: "<person-name>" })
```

**Resolution rules** (in order):

1. **Exact match** on entity name → use that Person
2. **Substring match** on entity name (case-insensitive) → if exactly one result, use it
3. **Ambiguous** (multiple substring matches) → show matches, ask user to pick:
   > "I found multiple people matching '<name>': [list]. Which one?"
4. **Not found** (zero results returned) → proceed to **Bootstrap** (next section)
5. **Lookup failed** (tool call error, not zero results) → do NOT proceed to bootstrap.
   Inform the user: "Person lookup failed due to a server error. Please try again."
   This prevents accidentally creating a duplicate Person entity.

Never merge entities automatically. Never create a Person without going through Bootstrap.

## Bootstrap (New Person)

When person lookup returns no results, run the bootstrap flow. This creates a new
Person entity in the knowledge graph.

**If the memory MCP is unavailable**, bootstrap cannot proceed — entity creation is not
deferrable to pending-sync. Inform the user and exit:
> "I can't create a new person because the memory server is unavailable. Please check
> that the `memory` MCP server is running and try again."

**Four-prompt form** — present all four in one message, user replies in one message:

1. Full name?
2. Role / team?
3. Anything else known about them? (background, tenure, interests — anything useful)
4. Who do they report to? (optional)

### Writing to the Graph

Create the Person entity:

```
mcp__memory__create_entities({
  entities: [{
    name: "<full name>",
    entityType: "Person",
    observations: []
  }]
})
```

**Name collision check**: Before creating, search for the exact name. If a Person with
that name already exists, warn and force disambiguation:
> "A person named '<name>' already exists in the graph. Did you mean them, or is this
> a different person? If different, provide a distinguishing name (e.g., 'Sarah Chen (Platform)')."

Answer #1 (full name) is used as the entity name, not written as an observation.
For each non-empty answer (2, 3, 4), write a `[context]` observation:

```
mcp__memory__add_observations({
  observations: [{
    entityName: "<full name>",
    contents: ["[YYYY-MM-DD][context] <answer text>"]
  }]
})
```

Track success/failure per context write, same as the capture phase. If any fail, save
to pending-sync and report which context observations were written vs. failed. The
Person entity still exists — the user just needs to retry the failed context writes.

**`reports_to` relation**: Only create if the named manager already exists as a Person
entity in the graph. Search first:

```
mcp__memory__search_nodes({ query: "<manager name>" })
```

If found (exact match):
```
mcp__memory__create_relations({
  relations: [{
    from: "<full name>",
    to: "<manager name>",
    relationType: "reports_to"
  }]
})
```

If not found, skip silently — do not auto-create the manager as a Person entity.

If the manager is found but `create_relations` fails, warn the user:
> "I couldn't save the reporting relationship to <manager name>. You can add it later
> with `--context`."

After bootstrap completes, proceed to **Phase Detection**.

## Phase Detection

If `--phase` flag was provided, use it directly. Otherwise, detect phase from the
calendar.

### Calendar Query

Search Google Calendar for events involving the Person in a -4h to +24h window:

```
mcp__5726bf10-7325-408d-9c0c-e32eaf106ac5__list_events({
  startTime: "<now minus 4 hours, ISO 8601>",
  endTime: "<now plus 24 hours, ISO 8601>",
  fullText: "<person name>"
})
```

**If Calendar MCP is unavailable** (tool call fails): ask the user directly:
> "I can't access your calendar right now. Are you prepping for an upcoming 1:1 with
> <name>, or capturing notes from one that just happened?"

### Phase Routing

| Calendar result | Phase |
|----------------|-------|
| Event upcoming or in-progress | **Prep** — proceed to Prep Phase |
| Event ended ≤4 hours ago | **Capture** — proceed to Capture Phase |
| Multiple matching events | Ask user to pick: "I see multiple events with <name>: [list with times]. Which one?" |
| No matching events | Ask user: "I don't see a meeting with <name> on your calendar. Are you prepping or capturing?" |

## Mode Detection

If `--mode` flag was provided, use it directly. Otherwise, detect mode for this Person.

**Priority order:**

1. Check for explicit mode marker in the graph — search the Person's observations for
   `[mode:coaching]` or `[mode:intake]`. Most recent marker wins.
2. **Auto-detect heuristic**: count the Person's observations.
   - **Intake** if ALL of these are true:
     - Fewer than 3 observations tagged `[1on1]`
     - No `[context]` observations
     - No `reports_to` relation
   - **Coaching** otherwise

To check observations, read the Person's node:

```
mcp__memory__open_nodes({ names: ["<person name>"] })
```

Count observations matching `[1on1]` and check for `[context]`.

**Note:** `open_nodes` does not return relations. To check for `reports_to`, use
`search_nodes` with the person's name and inspect the relations in the result, or
check the full graph via `read_graph` if needed. If the relation check is inconclusive,
treat it as absent (conservative — defaults toward intake).

### Graduation Nudge

If the auto-detect heuristic says "coaching" but no explicit `[mode:coaching]` marker
exists, include a nudge at the end of the prep output. The person is already being
treated as coaching by heuristic — the nudge is about persisting that classification:

> "Based on your history with <name> (N meetings, context recorded, reporting
> relationship set), I'm treating them as coaching mode. Want me to lock that in with
> an explicit marker so this detection doesn't have to re-run each time? You can always
> switch back."

If the user confirms, write:
```
mcp__memory__add_observations({
  observations: [{
    entityName: "<person name>",
    contents: ["[YYYY-MM-DD][mode:coaching] Graduated from intake"]
  }]
})
```

If the write fails, warn the user:
> "I couldn't save the mode change. The graduation nudge will appear again next time.
> Check that the memory server is available."

Never flip mode silently.

## Prep Phase (Read-Only)

The prep phase reads the knowledge graph and outputs a structured briefing. It never
writes to the graph. It never summarizes, predicts, generates talking points, or
offers coaching advice. The output is a formatted read of the graph.

Read the Person's full node:

```
mcp__memory__open_nodes({ names: ["<person name>"] })
```

### Output Sections

Render these sections in order. **Omit any section that would be empty.**

#### 1. Header

```
## <Person Name>  [MODE]  1:1 #N

Meeting: <time from calendar, or "not scheduled">
```

Where:
- `[MODE]` is `INTAKE` or `COACHING`
- `#N` is the count of prior `[1on1]` observations + 1 (this meeting)

#### 2. Context

Render all `[context]` observations as a bulleted list:

```
### Context
- Sr Director of Engineering, Platform team, 3yr tenure
- Previously at Stripe, led payments infrastructure
```

#### 3. Open Commitments From Them

Filter observations tagged `[commitment]` that do not have a corresponding `[resolved]`
observation referencing the same date. Show oldest first, up to 10 items. If more than
10 exist, show the 10 oldest and note: "N more open items not shown. Consider reviewing
and resolving stale items."

```
### Open Commitments (they owe you)
- [2026-04-10] Owes me the org chart by Friday
- [2026-04-03] Promised headcount justification doc
```

"Corresponding `[resolved]`" means: any `[resolved]` observation whose body contains
the string `(ref YYYY-MM-DD)` matching the commitment's date.

#### 4. Open Follow-ups I Owe Them

Same logic as commitments but for `[followup]` tags. Same 10-item cap.

```
### Open Follow-ups (you owe them)
- [2026-04-10] Send onboarding doc
```

#### 5. Recent Signal

Show observations from the last 2-3 `[1on1]` sessions, grouped by strategic tag.
Skip `[commitment]`, `[followup]`, and `[context]` — those are shown in their own
sections.

```
### Recent Signal

**Opportunities**
- [2026-04-10] Platform rewrite is an opening for the team

**Concerns**
- [2026-04-10] Team morale dropping after reorg

**Relationships**
- [2026-04-03] Sarah is a strong ally on infrastructure decisions
```

#### 6. What Others Have Said

Search for this Person's name across the entire graph using server-side filtering:

```
mcp__memory__search_nodes({ query: "<person name>" })
```

From the results, filter observations across other entities (excluding this Person's
own observations) where the body contains the Person's name. Cap at 5 hits. Show the
source entity name.

**Scaling note:** Do NOT use `read_graph` for this section — it pulls the entire graph
into context and will degrade as the graph grows. `search_nodes` leverages server-side
filtering.

```
### What Others Have Said
- **Mike (Engineering)**: "Sarah flagged the deployment risk early" (2026-04-08)
- **Priya (Product)**: "Sarah's team is the bottleneck on API v2" (2026-04-05)
```

If no cross-references found, omit this section entirely. If `read_graph` fails,
include a note instead: "Could not load cross-references (memory server error).
Other observations about <name> may exist but couldn't be retrieved."

#### 7. Suggested Questions

Read the question bank from `skills/1on1-prep/questions.md`. Draw 3-4 questions from
the current mode's section. Draw from **at least 2 different categories** per prep.

**Signal-based selection**: Start from the category matching the current strategic focus
(if open commitments exist, lean toward Constraints & Concerns questions; if few
relationships recorded, lean toward Relationships & Org Dynamics questions).

**Default rotation**: If no signal guides category selection, rotate categories
round-robin using `(count of prior 1:1s) mod (number of categories)` as the starting
category. Draw 2 questions from that category and 1-2 from the next.

```
### Suggested Questions
1. What's the biggest opportunity this team is sitting on that nobody's pursuing?
2. Who outside this team should I build a relationship with early?
3. What's the decision you wish someone would just make?
```

Append:
> "These are suggestions — add your own or skip any that don't fit."

### Graduation Nudge (if triggered)

If mode detection triggered a graduation nudge (see Mode Detection section), show it
at the end of the prep output.

### End of Prep

Prep phase ends here. No further action unless the user asks for something.

## Capture Phase

The capture phase collects post-meeting observations from the user and writes them to
the knowledge graph. Tags are applied deterministically by prompt bucket — never by
content interpretation.

**Before presenting the capture form**, check if the user indicates no meeting occurred
(e.g., "nothing happened", "we didn't meet", "they cancelled"). If so, skip directly
to **Noshow Handling** at the end of this section.

### Capture Form

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

The user replies in **one message**. Each numbered response maps to a tag:

| Prompt # | Tags applied |
|----------|-------------|
| 1 | `[1on1][<mode>][opportunity]` |
| 2 | `[1on1][<mode>][concern]` |
| 3 | `[1on1][<mode>][relationship]` |
| 4 | `[1on1][<mode>][commitment]` |
| 5 | `[1on1][<mode>][followup]` |
| 6 | `[1on1][<mode>]` (no strategic tag) |

Where `<mode>` is `intake` or `coaching` based on the detected mode.

### Parsing Rules

- Match user responses to prompts by number prefix (e.g., "1. ..." or "1) ...") or by
  sequential paragraph order if no numbers are provided
- **Unparseable input**: If the response cannot be matched to prompt buckets (single
  paragraph, no numbers, no clear breaks), present it back and ask the user to slot it
  into the numbered prompts: "I couldn't match your notes to the capture categories.
  Could you break them out by number? Here's the form again: [re-present the 6 prompts]."
  Do NOT attempt to interpret content into buckets — that violates deterministic tagging.
- Skip empty responses — if the user leaves a prompt blank or says "nothing", don't
  create an observation for it
- Each non-empty response becomes exactly one observation — if a response is
  multi-sentence, it is still one observation. Do not split within a prompt bucket.
- The observation body is the user's verbatim text (not a summary or interpretation)

### Confirm & Tag

After parsing, show the tagged observations for review:

```
## Tagged Observations Preview

I'll write these observations to <Person Name>'s record:

1. [2026-04-15][1on1][intake][opportunity] Platform rewrite is an opening for the team
2. [2026-04-15][1on1][intake][commitment] Owes me the org chart by Friday
3. [2026-04-15][1on1][intake][followup] Send them the onboarding doc

Does this look right? You can **confirm**, **edit**, or **cancel**.
```

- **confirm**: proceed to Write
- **edit**: ask which observation to change, show the edited version, re-confirm
- **cancel**: discard all observations, exit

### Resolution Mini-Flow

After showing the tagged preview, check if any `[commitment]` or `[followup]`
observation's body might reference closing a prior open item. For each new observation
tagged `[commitment]` or `[followup]`, compare against the Person's existing open
commitments and follow-ups using this matching rule:

**Matching**: Extract substantive noun phrases from the new observation and check if any
appear as substrings in existing open items. A match requires at least one multi-word
phrase (2+ words) or a distinctive single noun (not common words like "update",
"meeting", "team") appearing in both. When in doubt, do not match — it is better to
miss a resolution than to false-positive.

If a plausible match is found, ask:

> "This looks like it might close an earlier item:
> - Prior: [2026-04-10][1on1][intake][commitment] Owes me the org chart by Friday
> - New: [2026-04-15][1on1][intake][commitment] Received the org chart
>
> Is this closing out the 2026-04-10 entry? [Yes] [No]"

If **Yes**: add a `[resolved]` observation:
```
[2026-04-15][1on1][intake][resolved] Received org chart (ref 2026-04-10)
```

If **No**: proceed without resolving.

Never auto-resolve. Always ask.

### Write to Graph

Write observations **one at a time** (best-effort, not atomic). For each confirmed
observation:

```
mcp__memory__add_observations({
  observations: [{
    entityName: "<person name>",
    contents: ["<tagged observation string>"]
  }]
})
```

Track success/failure per observation.

### Write Results

After attempting all writes, report:

```
## Write Results

Written: 3/4 observations
- [OK] [2026-04-15][1on1][intake][opportunity] Platform rewrite is an opening
- [OK] [2026-04-15][1on1][intake][commitment] Owes me the org chart by Friday
- [OK] [2026-04-15][1on1][intake][followup] Send them the onboarding doc
- [FAILED] [2026-04-15][1on1][intake][concern] Team morale dropping
  -> Saved to pending-sync/2026-04-15-sarah.md
```

### Pending-Sync Fallback

For any failed write, save the observation to a pending-sync file:

**File**: `skills/1on1-prep/pending-sync/YYYY-MM-DD-<person-name-lowercase>.md`

**Format** (human-readable):
```markdown
# Pending Observations: <Person Name>
# Failed: YYYY-MM-DD HH:MM
# Retry: /1on1-prep --sync

- [2026-04-15][1on1][intake][concern] Team morale dropping after reorg
```

If the file already exists (multiple failed writes on the same day), append to it.

Warn the user:
> "One or more observations failed to write. They've been saved locally. Run
> `/1on1-prep --sync` to retry when the memory server is available."

**Last-resort fallback**: If writing to the pending-sync file itself fails (disk full,
permissions), display the full observation text directly in the chat output so the user
can copy it manually:
> "I could not save this observation to the pending-sync file either. Please copy the
> text below and save it yourself:
> `[2026-04-15][1on1][intake][concern] Team morale dropping after reorg`"

This ensures observations are never silently lost even in a double-failure scenario.

## Noshow Handling

If the user invokes capture phase but says there's nothing to capture (e.g., "nothing
happened", "we didn't meet", "they cancelled"), write a `[noshow]` observation:

```
mcp__memory__add_observations({
  observations: [{
    entityName: "<person name>",
    contents: ["[YYYY-MM-DD][1on1][<mode>][noshow] No capture recorded"]
  }]
})
```

If the noshow write fails, save to pending-sync and warn the user, same as the capture
phase fallback.

This is intentional data — the `[noshow]` tag feeds into #23 stakeholder-map
coverage-review to track meeting frequency and gaps.
