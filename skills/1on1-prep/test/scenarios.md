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
2. Verify header shows `[INTAKE]` mode and `1:1 #5` (4 prior `[1on1]` observations + 1)
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

**Setup:** Create two Persons — one as the reports_to target, one with enough history
to trigger graduation (exactly 3 `[1on1]` observations — the boundary case):
```
mcp__memory__create_entities({ entities: [
  { name: "Test Person Alpha", entityType: "Person", observations: [] },
  { name: "Test Person Delta", entityType: "Person", observations: [] }
] })
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

**Cleanup:** `mcp__memory__delete_entities({ entityNames: ["Test Person Alpha", "Test Person Delta"] })`

## Scenario 6: Calendar Unavailable

**Steps:**
1. Run `/1on1-prep "Test Person Beta"` with Calendar MCP disconnected
2. Verify skill asks for phase explicitly instead of failing
3. Select "prep"
4. Verify prep output renders correctly

**Expected:** Skill degrades gracefully without calendar.

## Scenario 7: Context Flag (Quick-Add)

**Setup:** Create a Person:
```
mcp__memory__create_entities({ entities: [{ name: "Test Person Epsilon", entityType: "Person", observations: [] }] })
```

**Steps:**
1. Run `/1on1-prep "Test Person Epsilon" --context "Promoted to VP last week"`
2. Verify a `[context]` observation is written: `[YYYY-MM-DD][context] Promoted to VP last week`
3. Verify the skill exits immediately — no phase detection, no meeting flow
4. Run `/1on1-prep "Test Person Epsilon" --phase=prep`
5. Verify the context section shows the promotion note

**Expected:** Context observation written and visible in next prep. No meeting flow triggered.

**Cleanup:** `mcp__memory__delete_entities({ entityNames: ["Test Person Epsilon"] })`
