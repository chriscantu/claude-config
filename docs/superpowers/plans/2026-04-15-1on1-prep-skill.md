# `/1on1-prep` Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `/1on1-prep` Claude Code skill that structures 1:1 meeting preparation and post-meeting capture using the Anthropic KG Memory MCP, with Google Calendar integration for automatic phase detection.

**Architecture:** A `skills/1on1-prep/` directory containing `SKILL.md` (workflow instructions), `questions.md` (question bank partitioned by mode), a `pending-sync/` directory (for failed writes), and `test/` (observation format validator + manual scenarios). The skill reads/writes Person entities and tagged observations via `mcp__memory__*` tools. Phase detection queries Google Calendar MCP. Symlinked globally via `install.fish`.

**Tech Stack:** Claude Code skill (Markdown), Anthropic KG Memory MCP, Google Calendar MCP, Bun (for test runner), fish shell.

**Spec:** [2026-04-15-1on1-prep-design.md](../specs/2026-04-15-1on1-prep-design.md)

---

## File Structure

```
skills/1on1-prep/
  SKILL.md                          # Main skill definition (~350 lines)
  questions.md                      # Question bank: intake + coaching sections
  pending-sync/                     # Failed writes stored here for retry
    .gitkeep
  test/
    check-observations.ts           # Static regex validator for observation format
    scenarios.md                    # Manual end-to-end test scenarios
```

---

### Task 1: Scaffold Directory Structure

**Files:**
- Create: `skills/1on1-prep/pending-sync/.gitkeep`
- Create: `skills/1on1-prep/test/` (directory)

- [ ] **Step 1: Create directory skeleton**

```fish
mkdir -p skills/1on1-prep/pending-sync skills/1on1-prep/test
touch skills/1on1-prep/pending-sync/.gitkeep
```

- [ ] **Step 2: Verify structure**

```fish
find skills/1on1-prep -type f -o -type d | sort
```

Expected:
```
skills/1on1-prep
skills/1on1-prep/pending-sync
skills/1on1-prep/pending-sync/.gitkeep
skills/1on1-prep/test
```

- [ ] **Step 3: Commit**

```fish
git add skills/1on1-prep/
git commit -m "scaffold: create 1on1-prep skill directory structure"
```

---

### Task 2: Write Question Bank

**Files:**
- Create: `skills/1on1-prep/questions.md`

The question bank is separate from SKILL.md so it can grow independently. Questions lean strategic/opportunity/relationship, not tactical/operational.

- [ ] **Step 1: Create `skills/1on1-prep/questions.md`**

```markdown
# 1:1 Question Bank

Questions are partitioned by mode. The skill draws 3-4 per prep run, rotating
to avoid repeats. Rotation tracks which questions were used in recent preps
via a simple index — start from the top, advance each run, wrap around.

The user can always supplement or override generated questions.

## Intake Mode

Strategic discovery questions for the first 30-90 days. Focus: opportunities,
constraints, relationships, and mental models — not status or task tracking.

### Opportunities & Strategy

1. What's the biggest opportunity this team is sitting on that nobody's pursuing?
2. If you had an extra engineer for six months, what would you point them at?
3. What's one thing that used to be hard here but has gotten easier recently — and why?
4. Where do you see the most momentum right now?
5. What would you build if you didn't need anyone's permission?

### Constraints & Concerns

6. What's the thing most likely to blow up in the next 90 days?
7. What process or system do people quietly work around because it's broken?
8. Where are we carrying the most technical or organizational debt?
9. What's the decision you wish someone would just make?
10. What keeps coming up in your team's retros that never gets fixed?

### Relationships & Org Dynamics

11. Who outside this team should I build a relationship with early?
12. Who's the person that makes things happen here — regardless of title?
13. When this team needs something from another team, what usually goes wrong?
14. Who's someone whose perspective I should seek out, even if we might disagree?
15. If you were introducing me to the five people I need to know, who are they and why?

### Working Style & Trust

16. What does good support from your manager look like to you?
17. What's something a previous manager did that you'd want me to keep doing?
18. What's something a previous manager did that you'd want me to stop doing?
19. How do you prefer to get feedback — in the moment, written, scheduled?
20. When you're stuck, do you want me to jump in or give you space first?

## Coaching Mode

Ongoing coaching questions for steady-state 1:1s. Focus: growth, blockers,
strategic thinking, and relationship health — not status updates.

### Growth & Development

1. What skill are you actively trying to build right now?
2. What's a stretch project you'd want to take on in the next quarter?
3. Where do you feel most confident? Where do you feel least confident?
4. What's something you've learned recently that changed how you work?
5. Is there a part of your role that you've outgrown?

### Blockers & Support

6. What's slowing you down the most right now?
7. Is there a decision you're waiting on that I could unblock?
8. What's one thing I could do differently to be more helpful?
9. Where are you spending time that feels low-value?
10. Do you have what you need to do your best work this week?

### Strategic Thinking

11. If you were in my role, what would you change first?
12. What's a bet this team should be making that we're not?
13. What's the strongest signal you're seeing from customers or users right now?
14. Where are we over-investing? Under-investing?
15. What's a risk we're not talking about enough?

### Relationships & Team Health

16. How's the team dynamic feeling right now?
17. Is there a collaboration that's working well that I should know about?
18. Is there a collaboration that's struggling that I should know about?
19. Who on the team is doing great work that might not be visible?
20. Is there anything you're hearing from the team that I should know?
```

- [ ] **Step 2: Commit**

```fish
git add skills/1on1-prep/questions.md
git commit -m "feat: add 1on1-prep question bank (intake + coaching)"
```

---

### Task 3: Write Observation Format Validator (TDD)

**Files:**
- Create: `skills/1on1-prep/test/check-observations.ts`

This is the only executable code in the skill — a static regex validator for the `[YYYY-MM-DD][tag1][tag2]... body` format. Run manually with `bun`.

- [ ] **Step 1: Write the test file with embedded test cases**

Create `skills/1on1-prep/test/check-observations.ts`:

```typescript
/**
 * Static validator for 1on1-prep observation format.
 * Run: bun skills/1on1-prep/test/check-observations.ts
 *
 * Validates that observations match the format:
 *   [YYYY-MM-DD][tag1][tag2]...[tagN] free-text body
 */

const VALID_TAGS = new Set([
  "1on1",
  "intake",
  "coaching",
  "opportunity",
  "concern",
  "relationship",
  "commitment",
  "followup",
  "context",
  "mode:coaching",
  "mode:intake",
  "resolved",
  "noshow",
]);

const DATE_PATTERN = /^\[\d{4}-\d{2}-\d{2}\]/;
const TAG_PATTERN = /\[([^\]]+)\]/g;
const FULL_PATTERN = /^\[\d{4}-\d{2}-\d{2}\](\[[^\]]+\])+ .+$/;

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function validateObservation(obs: string): ValidationResult {
  const errors: string[] = [];

  if (!obs || obs.trim().length === 0) {
    return { valid: false, errors: ["Observation is empty"] };
  }

  // Check date prefix
  if (!DATE_PATTERN.test(obs)) {
    errors.push("Missing or malformed date prefix [YYYY-MM-DD]");
  }

  // Check full structure: date + at least one tag + space + body
  if (!FULL_PATTERN.test(obs)) {
    errors.push(
      "Does not match format: [YYYY-MM-DD][tag1]...[tagN] free-text body"
    );
  }

  // Extract and validate individual tags (skip the date)
  const allBrackets = obs.match(TAG_PATTERN) || [];
  const tags = allBrackets.slice(1); // skip date bracket

  if (tags.length === 0) {
    errors.push("No tags found after date");
  }

  for (const raw of tags) {
    const tag = raw.slice(1, -1); // strip brackets
    if (!VALID_TAGS.has(tag)) {
      errors.push(`Unknown tag: [${tag}]`);
    }
  }

  // Check date is valid
  const dateMatch = obs.match(/^\[(\d{4}-\d{2}-\d{2})\]/);
  if (dateMatch) {
    const d = new Date(dateMatch[1]);
    if (isNaN(d.getTime())) {
      errors.push(`Invalid date: ${dateMatch[1]}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// --- Test Suite ---

interface TestCase {
  input: string;
  expectValid: boolean;
  description: string;
}

const testCases: TestCase[] = [
  // Valid observations
  {
    input: "[2026-04-15][1on1][intake][opportunity] Platform rewrite is an opening",
    expectValid: true,
    description: "valid: standard intake observation with strategic tag",
  },
  {
    input: "[2026-04-15][1on1][coaching][concern] Team morale dropping after reorg",
    expectValid: true,
    description: "valid: coaching observation with concern tag",
  },
  {
    input: "[2026-04-15][1on1][intake][commitment] Owes me the org chart by Friday",
    expectValid: true,
    description: "valid: commitment (they owe me)",
  },
  {
    input: "[2026-04-15][1on1][intake][followup] Send them the onboarding doc",
    expectValid: true,
    description: "valid: followup (I owe them)",
  },
  {
    input: "[2026-04-15][1on1][coaching][relationship] Sarah is a strong ally on infra",
    expectValid: true,
    description: "valid: relationship tag",
  },
  {
    input: "[2026-04-15][context] Sr Director of Engineering, Platform team, 3yr tenure",
    expectValid: true,
    description: "valid: context observation (no meeting tags)",
  },
  {
    input: "[2026-04-15][mode:coaching] Graduated from intake",
    expectValid: true,
    description: "valid: mode transition marker",
  },
  {
    input: "[2026-04-15][1on1][intake][resolved] Received org chart (ref 2026-04-10)",
    expectValid: true,
    description: "valid: resolved observation with date reference",
  },
  {
    input: "[2026-04-15][1on1][coaching][noshow] No capture recorded",
    expectValid: true,
    description: "valid: noshow marker",
  },
  {
    input: "[2026-04-15][mode:intake] Reverted to intake after reorg",
    expectValid: true,
    description: "valid: mode revert",
  },

  // Invalid observations
  {
    input: "",
    expectValid: false,
    description: "invalid: empty string",
  },
  {
    input: "Platform rewrite is an opening",
    expectValid: false,
    description: "invalid: missing date and tags",
  },
  {
    input: "[2026-04-15] Missing tags but has body",
    expectValid: false,
    description: "invalid: date but no tags",
  },
  {
    input: "[2026-04-15][1on1][intake][opportunity]",
    expectValid: false,
    description: "invalid: tags but no body text",
  },
  {
    input: "[not-a-date][1on1][intake] Some observation",
    expectValid: false,
    description: "invalid: malformed date",
  },
  {
    input: "[2026-04-15][1on1][INVALID_TAG] Some observation",
    expectValid: false,
    description: "invalid: unknown tag",
  },
  {
    input: "[2026-13-45][1on1][intake] Bad calendar date",
    expectValid: false,
    description: "invalid: impossible date values",
  },
];

// --- Runner ---

let passed = 0;
let failed = 0;

for (const tc of testCases) {
  const result = validateObservation(tc.input);
  const ok = result.valid === tc.expectValid;

  if (ok) {
    passed++;
    console.log(`  PASS  ${tc.description}`);
  } else {
    failed++;
    console.log(`  FAIL  ${tc.description}`);
    console.log(`        expected valid=${tc.expectValid}, got valid=${result.valid}`);
    if (result.errors.length > 0) {
      console.log(`        errors: ${result.errors.join("; ")}`);
    }
  }
}

console.log(`\n${passed} passed, ${failed} failed, ${testCases.length} total`);

if (failed > 0) {
  process.exit(1);
}
```

- [ ] **Step 2: Run the validator**

```fish
bun skills/1on1-prep/test/check-observations.ts
```

Expected: all 17 test cases pass, exit code 0.

- [ ] **Step 3: Commit**

```fish
git add skills/1on1-prep/test/check-observations.ts
git commit -m "feat: add observation format validator with test cases"
```

---

### Task 4: Write SKILL.md — Frontmatter, Entry Point, Person Lookup

**Files:**
- Create: `skills/1on1-prep/SKILL.md`

This task creates the file with the first three sections. Subsequent tasks append sections.

- [ ] **Step 1: Create `skills/1on1-prep/SKILL.md`**

````markdown
---
name: 1on1-prep
description: Prepare for and capture 1:1 meetings with structured observation tracking. Use when the user says /1on1-prep, "prep for my 1:1", "1:1 with", "capture my 1:1", or wants to prepare for or record notes from a one-on-one meeting.
---

# 1:1 Prep & Capture

Structures 1:1 meeting preparation and post-meeting capture using the knowledge graph.
Prep phase reads the graph to surface context, open commitments, and suggested questions.
Capture phase writes verbatim user observations with deterministic tags.

**Announce at start:** "I'm using the 1on1-prep skill to help you prepare for your 1:1."

## Prerequisites

Verify the memory MCP is available:

```
mcp__memory__read_graph
```

If this fails, warn the user:
> "The memory MCP server isn't available. I can still help you prep, but I won't be
> able to read or write observations. To fix this, check that the `memory` MCP server
> is configured and running."

Check for pending-sync files:

```fish
ls skills/1on1-prep/pending-sync/*.md 2>/dev/null
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

**`--sync` flow**: Read all files in `skills/1on1-prep/pending-sync/`, attempt to write
each observation to the graph via `mcp__memory__add_observations`. Report results
per-observation. Delete the pending-sync file only if all observations in it succeed.
Exit after sync — no meeting flow.

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
4. **Not found** → proceed to **Bootstrap** (next section)

Never merge entities automatically. Never create a Person without going through Bootstrap.
````

- [ ] **Step 2: Verify file was created correctly**

```fish
head -5 skills/1on1-prep/SKILL.md
```

Expected: frontmatter with `name: 1on1-prep`.

- [ ] **Step 3: Commit**

```fish
git add skills/1on1-prep/SKILL.md
git commit -m "feat: add SKILL.md with frontmatter, invocation, and person lookup"
```

---

### Task 5: Append to SKILL.md — Bootstrap Flow

**Files:**
- Modify: `skills/1on1-prep/SKILL.md` (append after Person Lookup section)

- [ ] **Step 1: Append Bootstrap section**

Append the following to the end of `skills/1on1-prep/SKILL.md`:

````markdown

## Bootstrap (New Person)

When person lookup returns no results, run the bootstrap flow. This creates a new
Person entity in the knowledge graph.

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

For each non-empty answer (2, 3, 4), write a `[context]` observation:

```
mcp__memory__add_observations({
  observations: [{
    entityName: "<full name>",
    contents: ["[YYYY-MM-DD][context] <answer text>"]
  }]
})
```

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

After bootstrap completes, proceed to **Phase Detection**.
````

- [ ] **Step 2: Commit**

```fish
git add skills/1on1-prep/SKILL.md
git commit -m "feat: add bootstrap flow for new person creation"
```

---

### Task 6: Append to SKILL.md — Phase Detection and Mode Detection

**Files:**
- Modify: `skills/1on1-prep/SKILL.md` (append after Bootstrap section)

- [ ] **Step 1: Append Phase Detection and Mode Detection sections**

Append the following to the end of `skills/1on1-prep/SKILL.md`:

````markdown

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

To check, read the Person's observations:

```
mcp__memory__open_nodes({ names: ["<person name>"] })
```

Count observations matching `[1on1]`, check for `[context]`, and check relations.

### Graduation Nudge

If the auto-detect heuristic says "coaching" but no explicit `[mode:coaching]` marker
exists, include a nudge at the end of the prep output:

> "Based on your history with <name> (N meetings, context recorded, reporting
> relationship set), they might be ready to graduate from intake to coaching mode.
> Want me to mark them as coaching? This just adds a `[mode:coaching]` observation —
> you can always switch back."

If the user confirms, write:
```
mcp__memory__add_observations({
  observations: [{
    entityName: "<person name>",
    contents: ["[YYYY-MM-DD][mode:coaching] Graduated from intake"]
  }]
})
```

Never flip mode silently.
````

- [ ] **Step 2: Commit**

```fish
git add skills/1on1-prep/SKILL.md
git commit -m "feat: add phase detection and mode detection logic"
```

---

### Task 7: Append to SKILL.md — Prep Phase Output

**Files:**
- Modify: `skills/1on1-prep/SKILL.md` (append after Mode Detection section)

- [ ] **Step 1: Append Prep Phase section**

Append the following to the end of `skills/1on1-prep/SKILL.md`:

````markdown

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
observation referencing the same date. Show oldest first.

```
### Open Commitments (they owe you)
- [2026-04-10] Owes me the org chart by Friday
- [2026-04-03] Promised headcount justification doc
```

"Corresponding `[resolved]`" means: any `[resolved]` observation whose body contains
the string `(ref YYYY-MM-DD)` matching the commitment's date.

#### 4. Open Follow-ups I Owe Them

Same logic as commitments but for `[followup]` tags.

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

Search ALL Person entities for observations that mention this Person's name as a
substring in the observation body:

```
mcp__memory__read_graph()
```

Filter all observations across all entities (excluding this Person's own observations)
where the body contains the Person's name. Cap at 5 hits. Show the source entity name.

```
### What Others Have Said
- **Mike (Engineering)**: "Sarah flagged the deployment risk early" (2026-04-08)
- **Priya (Product)**: "Sarah's team is the bottleneck on API v2" (2026-04-05)
```

If no cross-references found, omit this section entirely.

#### 7. Suggested Questions

Draw 3-4 questions from `skills/1on1-prep/questions.md`, using the current mode's
section. Rotate through the list to avoid repeats:

- Track which question index was last used in a simple way: start from the section
  matching the current strategic focus (if open commitments exist, lean toward
  Constraints & Concerns questions; if few relationships recorded, lean toward
  Relationships & Org Dynamics questions).
- If no signal to guide selection, start from where the last prep left off (use the
  count of prior 1:1s modulo the number of questions in the section).

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
````

- [ ] **Step 2: Commit**

```fish
git add skills/1on1-prep/SKILL.md
git commit -m "feat: add prep phase output with 7 sections"
```

---

### Task 8: Append to SKILL.md — Capture Phase, Confirm & Tag, Write

**Files:**
- Modify: `skills/1on1-prep/SKILL.md` (append after Prep Phase section)

- [ ] **Step 1: Append Capture Phase, Confirm, and Write sections**

Append the following to the end of `skills/1on1-prep/SKILL.md`:

````markdown

## Capture Phase

The capture phase collects post-meeting observations from the user and writes them to
the knowledge graph. Tags are applied deterministically by prompt bucket — never by
content interpretation.

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
- Skip empty responses — if the user leaves a prompt blank or says "nothing", don't
  create an observation for it
- Each non-empty response becomes exactly one observation
- The observation body is the user's verbatim text (not a summary or interpretation)

### Confirm & Tag

After parsing, show the tagged observations for review:

```
## Tagged Observations Preview

I'll write these observations to <Person Name>'s record:

1. [2026-04-15][1on1][intake][opportunity] Platform rewrite is an opening for the team
2. [2026-04-15][1on1][intake][commitment] Owes me the org chart by Friday
3. [2026-04-15][1on1][intake][followup] Send them the onboarding doc

[Confirm] [Edit] [Cancel]
```

- **Confirm**: proceed to Write
- **Edit**: ask which observation to change, show the edited version, re-confirm
- **Cancel**: discard all observations, exit

### Resolution Mini-Flow

After showing the tagged preview, check if any `[commitment]` or `[followup]`
observation's body might reference closing a prior open item. For each new observation
tagged `[commitment]` or `[followup]`, substring-search the Person's existing open
commitments and follow-ups for overlapping keywords.

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
````

- [ ] **Step 2: Commit**

```fish
git add skills/1on1-prep/SKILL.md
git commit -m "feat: add capture phase, confirm & tag, write to graph"
```

---

### Task 9: Append to SKILL.md — Noshow Handling

**Files:**
- Modify: `skills/1on1-prep/SKILL.md` (append after Write section)

- [ ] **Step 1: Append Noshow section**

Append the following to the end of `skills/1on1-prep/SKILL.md`:

````markdown

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

This is intentional data — the `[noshow]` tag feeds into #23 stakeholder-map
coverage-review to track meeting frequency and gaps.
````

- [ ] **Step 2: Commit**

```fish
git add skills/1on1-prep/SKILL.md
git commit -m "feat: add noshow handling"
```

---

### Task 10: Write Manual Test Scenarios

**Files:**
- Create: `skills/1on1-prep/test/scenarios.md`

- [ ] **Step 1: Create `skills/1on1-prep/test/scenarios.md`**

```markdown
# 1on1-prep Manual Test Scenarios

Run these end-to-end scenarios before merging. Each scenario should be executed in a
fresh Claude Code session. Use a test Person name (e.g., "Test Person Alpha") to avoid
polluting real data.

## Setup

Ensure the memory MCP is running and the graph is accessible:
```
mcp__memory__read_graph
```

## Scenario 1: Bootstrap New Person

**Steps:**
1. Run `/1on1-prep "Test Person Alpha"`
2. Verify skill detects person not found and enters bootstrap
3. Provide: name="Test Person Alpha", role="Sr Director Eng", context="Joined 2026", reports_to="Test Person Beta" (does not exist)
4. Verify Person entity created with `[context]` observations
5. Verify `reports_to` relation was NOT created (Test Person Beta doesn't exist)
6. Verify phase detection runs after bootstrap

**Expected:** Person entity created, context observations written, no relation created.

**Cleanup:** `mcp__memory__delete_entities({ entityNames: ["Test Person Alpha"] })`

## Scenario 2: Prep Phase with Open Items

**Setup:** Create a Person with history:
```
mcp__memory__create_entities({ entities: [{ name: "Test Person Beta", entityType: "Person", observations: [] }] })
mcp__memory__add_observations({ observations: [{ entityName: "Test Person Beta", contents: [
  "[2026-04-10][context] VP of Product, Commerce team",
  "[2026-04-10][1on1][intake][opportunity] API marketplace has untapped revenue",
  "[2026-04-10][1on1][intake][commitment] Owes me the Q3 roadmap draft",
  "[2026-04-10][1on1][intake][followup] Send them the platform architecture doc",
  "[2026-04-03][1on1][intake][concern] Hiring freeze may block new team formation"
]}] })
```

**Steps:**
1. Run `/1on1-prep "Test Person Beta" --phase=prep`
2. Verify header shows `[INTAKE]` mode and `1:1 #3`
3. Verify context section shows VP of Product info
4. Verify open commitments shows the Q3 roadmap item
5. Verify open follow-ups shows the architecture doc item
6. Verify recent signal groups by opportunity/concern tags
7. Verify suggested questions are from intake section of questions.md

**Expected:** All 7 prep sections render correctly with data from graph.

**Cleanup:** `mcp__memory__delete_entities({ entityNames: ["Test Person Beta"] })`

## Scenario 3: Capture Phase with Resolution

**Setup:** Same as Scenario 2.

**Steps:**
1. Run `/1on1-prep "Test Person Beta" --phase=capture`
2. Provide capture responses:
   - Opportunities: "New partnership with Stripe could unlock payments integration"
   - Commitments: "Received the Q3 roadmap draft"
   - Follow-ups: "Review their team's OKRs by Thursday"
3. Verify tagged preview shows correct tags per prompt bucket
4. Verify resolution mini-flow triggers for "Q3 roadmap draft" matching the 04-10 commitment
5. Confirm resolution
6. Verify `[resolved]` observation written with `(ref 2026-04-10)`
7. Confirm all observations
8. Verify write results show all observations succeeded

**Expected:** 3 new observations + 1 resolved observation written to graph.

**Cleanup:** `mcp__memory__delete_entities({ entityNames: ["Test Person Beta"] })`

## Scenario 4: Pending-Sync Fallback

**Steps:**
1. Create a Person "Test Person Gamma"
2. Simulate write failure (e.g., stop the memory MCP mid-capture, or test with a
   deliberately malformed observation)
3. Verify failed observation saved to `skills/1on1-prep/pending-sync/YYYY-MM-DD-test-person-gamma.md`
4. Verify file is human-readable with retry instructions
5. Restart memory MCP
6. Run `/1on1-prep --sync`
7. Verify pending observation written to graph
8. Verify pending-sync file deleted

**Expected:** Observation survives MCP outage and syncs on retry.

**Cleanup:** Delete test entities and any remaining pending-sync files.

## Scenario 5: Mode Graduation

**Setup:** Create a Person with enough history to trigger graduation:
```
mcp__memory__create_entities({ entities: [{ name: "Test Person Delta", entityType: "Person", observations: [] }] })
mcp__memory__add_observations({ observations: [{ entityName: "Test Person Delta", contents: [
  "[2026-04-01][context] Engineering Manager, Core team",
  "[2026-04-01][1on1][intake][opportunity] Migration project is ahead of schedule",
  "[2026-04-05][1on1][intake][concern] On-call rotation needs attention",
  "[2026-04-10][1on1][intake][relationship] Strong ally on platform decisions"
]}] })
mcp__memory__create_relations({ relations: [{ from: "Test Person Delta", to: "Test Person Alpha", relationType: "reports_to" }] })
```

**Steps:**
1. Run `/1on1-prep "Test Person Delta" --phase=prep`
2. Verify graduation nudge appears (3+ 1:1s, context exists, reports_to exists)
3. Confirm graduation
4. Verify `[mode:coaching]` observation written
5. Run `/1on1-prep "Test Person Delta" --phase=prep` again
6. Verify mode is now `COACHING` and questions come from coaching section

**Expected:** Mode transitions from intake to coaching via explicit user confirmation.

**Cleanup:** Delete test entities.

## Scenario 6: Calendar Unavailable

**Steps:**
1. Run `/1on1-prep "Test Person Beta"` with Calendar MCP disconnected
2. Verify skill asks for phase explicitly instead of failing
3. Select "prep"
4. Verify prep output renders correctly

**Expected:** Skill degrades gracefully without calendar.
```

- [ ] **Step 2: Commit**

```fish
git add skills/1on1-prep/test/scenarios.md
git commit -m "feat: add manual end-to-end test scenarios"
```

---

### Task 11: Install, Verify, and Final Commit

**Files:**
- No new files — verification only

- [ ] **Step 1: Run the observation format validator**

```fish
bun skills/1on1-prep/test/check-observations.ts
```

Expected: all tests pass.

- [ ] **Step 2: Verify SKILL.md structure**

Check that the SKILL.md has all expected sections:

```fish
grep "^## " skills/1on1-prep/SKILL.md
```

Expected sections:
```
## Prerequisites
## Invocation
## Person Lookup
## Bootstrap (New Person)
## Phase Detection
## Mode Detection
## Prep Phase (Read-Only)
## Capture Phase
## Noshow Handling
```

- [ ] **Step 3: Verify file count**

```fish
find skills/1on1-prep -type f | sort
```

Expected:
```
skills/1on1-prep/SKILL.md
skills/1on1-prep/pending-sync/.gitkeep
skills/1on1-prep/questions.md
skills/1on1-prep/test/check-observations.ts
skills/1on1-prep/test/scenarios.md
```

- [ ] **Step 4: Run install.fish to symlink**

```fish
fish install.fish
```

Verify the symlink:
```fish
ls -la ~/.claude/skills/1on1-prep
```

Expected: symlink pointing to `/Users/cantu/repos/claude-config/skills/1on1-prep`

- [ ] **Step 5: Verify skill loads in Claude Code**

Start a new Claude Code session and check that `/1on1-prep` appears in the available
skills list. You don't need to run it — just confirm it's discoverable.

- [ ] **Step 6: Final commit (if any unstaged changes remain)**

```fish
git add -A skills/1on1-prep/
git status
git commit -m "chore: finalize 1on1-prep skill installation"
```
