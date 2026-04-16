# /swot Manual Test Scenarios

Run these end-to-end scenarios before merging. Each scenario should be executed in a
fresh Claude Code session. Use a test org name (e.g., "Test Corp Alpha") to avoid
polluting real data.

## Setup

Ensure the memory MCP is running and the graph is accessible:
````
mcp__memory__read_graph
````

## Scenario 1: Bootstrap New Org

**Steps:**
1. Run `/swot "Test Corp Alpha"`
2. Verify skill detects org not found and enters bootstrap
3. Confirm org name
4. Verify SWOT entity created with name "Test Corp Alpha SWOT" and entityType "SWOT"
5. Verify mode defaults to `add` and capture form is presented

**Expected:** SWOT entity created, capture form shown.

**Cleanup:** `mcp__memory__delete_entities({ entityNames: ["Test Corp Alpha SWOT"] })`

## Scenario 2: Conversational Capture

**Setup:** Create a SWOT entity:
````
mcp__memory__create_entities({ entities: [{ name: "Test Corp Beta SWOT", entityType: "SWOT", observations: [] }] })
````

**Steps:**
1. Run `/swot "Test Corp Beta"`
2. Provide capture responses:
   - Strengths: "CI/CD deploys in 15 min with zero-downtime"
   - Weaknesses: "No SRE team, devs carry pager"
   - Opportunities: "Competitor dropped enterprise support"
   - Threats: (skip)
   - Context: "Went through reorg 6 months ago"
3. Verify landscape tags are proposed (e.g., `[technical]` for CI/CD)
4. Verify provenance prompt appears
5. Provide provenance: "1 from repo README, 2 from 1:1 with Sarah, 3 from sales team, 5 from 1:1 with Mike"
6. Verify tagged preview shows 4 observations with correct SWOT tags
7. Confirm
8. Verify write results show all observations succeeded

**Expected:** 4 observations written with correct SWOT + landscape tags + provenance.

**Cleanup:** `mcp__memory__delete_entities({ entityNames: ["Test Corp Beta SWOT"] })`

## Scenario 3: Artifact-Pointed Capture

**Setup:** Same as Scenario 2 (fresh entity with no observations).

**Steps:**
1. Run `/swot "Test Corp Beta" --read skills/swot/SKILL.md` (use the skill file itself
   as a test artifact — it won't produce meaningful SWOT entries, but tests the flow)
2. Verify skill reads the file
3. Verify draft observations are presented for confirmation
4. Edit one draft, remove another
5. Confirm remaining
6. Verify write results

**Expected:** Artifact read, drafts presented, user edits respected, confirmed entries written.

**Cleanup:** `mcp__memory__delete_entities({ entityNames: ["Test Corp Beta SWOT"] })`

## Scenario 4: Challenge Mode

**Setup:** Create a SWOT entity with mixed-quality observations:
````
mcp__memory__create_entities({ entities: [{ name: "Test Corp Gamma SWOT", entityType: "SWOT", observations: [] }] })
mcp__memory__add_observations({ observations: [{ entityName: "Test Corp Gamma SWOT", contents: [
  "[2026-05-01][strength][technical] CI/CD deploys in 15 min, zero-downtime (repo README)",
  "[2026-05-01][strength][cultural] Strong engineering culture",
  "[2026-05-01][opportunity][market] AI is big right now",
  "[2026-05-01][threat][org] No SRE team, devs carry pager"
]}] })
````

**Steps:**
1. Run `/swot "Test Corp Gamma" --mode=challenge`
2. Verify "Strong engineering culture" flagged as NOT SPECIFIC
3. Verify "AI is big right now" flagged as NOT ACTIONABLE
4. Verify "No SRE team" flagged as MISCATEGORIZED (threat→weakness, internal not external)
5. Verify "CI/CD deploys in 15 min" passes all checks
6. Edit "Strong engineering culture" to "Blameless postmortem culture — 3 reviewed, all thorough"
7. Recategorize "No SRE team" to [weakness][org]
8. Remove "AI is big right now"
9. Verify graph updates: old observations deleted, new ones written

**Expected:** 3 of 4 entries flagged, user actions applied, graph updated.

**Cleanup:** `mcp__memory__delete_entities({ entityNames: ["Test Corp Gamma SWOT"] })`

## Scenario 5: Review Mode with Coverage Gaps

**Setup:** Create a SWOT entity with uneven coverage:
````
mcp__memory__create_entities({ entities: [{ name: "Test Corp Delta SWOT", entityType: "SWOT", observations: [] }] })
mcp__memory__add_observations({ observations: [{ entityName: "Test Corp Delta SWOT", contents: [
  "[2026-05-01][strength][technical] Excellent test coverage, 90%+ across services (CI dashboard)",
  "[2026-05-01][strength][technical] Fast deploys, 15 min average (monitoring)",
  "[2026-05-01][strength][org] Experienced platform team lead (1:1 with CTO)",
  "[2026-05-01][weakness][org] No SRE function (1:1 with Sarah)",
  "[2026-05-01][opportunity][market] Competitor dropped enterprise (sales team)",
  "[2026-05-01][threat][market] New competitor raised $80M (public filing)"
]}] })
````

**Steps:**
1. Run `/swot "Test Corp Delta" --mode=review`
2. Verify report renders with Internal/External sections
3. Verify observations grouped by SWOT tag, sub-grouped by landscape tag
4. Verify coverage gaps section identifies gaps (e.g., cultural strengths: 0,
   technical weaknesses: 0, cultural threats: 0, etc.)
5. Verify export options are offered after review

**Expected:** Full report rendered with accurate coverage gap analysis.

**Cleanup:** `mcp__memory__delete_entities({ entityNames: ["Test Corp Delta SWOT"] })`

## Scenario 6: Pending-Sync Fallback

**Steps:**
1. Create a SWOT entity "Test Corp Epsilon SWOT"
2. Simulate write failure (stop the memory MCP mid-capture, or test with a
   deliberately malformed observation)
3. Verify failed observation saved to `skills/swot/pending-sync/YYYY-MM-DD-test-corp-epsilon.md`
4. Verify file is human-readable with retry instructions
5. Restart memory MCP
6. Run `/swot "Test Corp Epsilon" --sync`
7. Verify pending observation written to graph
8. Verify pending-sync file deleted

**Expected:** Observation survives MCP outage and syncs on retry.

**Cleanup:** Delete test entities and any remaining pending-sync files.

## Scenario 7: Excalidraw Export

**Setup:** Same as Scenario 5 (entity with observations across quadrants).

**Steps:**
1. Run `/swot "Test Corp Delta" --mode=review`
2. Select Excalidraw export
3. Verify canvas is cleared
4. Verify 2x2 grid drawn with four quadrant rectangles
5. Verify quadrant titles present: "STRENGTHS", "WEAKNESSES", "OPPORTUNITIES", "THREATS"
6. Verify observations rendered as text within correct quadrants
7. Verify title text above grid

**Expected:** 2x2 SWOT grid rendered on excalidraw canvas.

**Cleanup:** `mcp__memory__delete_entities({ entityNames: ["Test Corp Delta SWOT"] })`

## Scenario 8: Existing Org Lookup

**Setup:** Create a SWOT entity:
````
mcp__memory__create_entities({ entities: [{ name: "Test Corp Zeta SWOT", entityType: "SWOT", observations: [] }] })
mcp__memory__add_observations({ observations: [{ entityName: "Test Corp Zeta SWOT", contents: [
  "[2026-05-01][strength][technical] Good API design (code review)"
]}] })
````

**Steps:**
1. Run `/swot "Test Corp Zeta"`
2. Verify skill finds existing entity (no bootstrap)
3. Verify capture form is presented (default add mode)
4. Verify new observations accumulate alongside existing one

**Expected:** Existing entity found, observations accumulate.

**Cleanup:** `mcp__memory__delete_entities({ entityNames: ["Test Corp Zeta SWOT"] })`

## Scenario 9: Empty Entity Guard

**Setup:** Create a SWOT entity with no observations:
````
mcp__memory__create_entities({ entities: [{ name: "Test Corp Eta SWOT", entityType: "SWOT", observations: [] }] })
````

**Steps:**
1. Run `/swot "Test Corp Eta" --mode=review`
2. Verify skill warns: "This SWOT analysis has no observations yet. Let's add some first."
3. Verify skill redirects to `add` mode and presents the capture form
4. Run `/swot "Test Corp Eta" --mode=challenge`
5. Verify same warning and redirect to `add` mode

**Expected:** Both review and challenge modes redirect to add when entity is empty.

**Cleanup:** `mcp__memory__delete_entities({ entityNames: ["Test Corp Eta SWOT"] })`

## Scenario 10: Ambiguous Org Lookup

**Setup:** Create two SWOT entities with overlapping names:
````
mcp__memory__create_entities({ entities: [
  { name: "Test Corp SWOT", entityType: "SWOT", observations: [] },
  { name: "Test Corp Beta SWOT", entityType: "SWOT", observations: [] }
] })
````

**Steps:**
1. Run `/swot "Test Corp"`
2. Verify skill finds multiple matches
3. Verify disambiguation prompt appears: "I found multiple SWOT entities matching 'Test Corp': [list]. Which one?"
4. Select "Test Corp SWOT"
5. Verify capture form is presented for the correct entity

**Expected:** Disambiguation prompt shown, user selection respected.

**Cleanup:** `mcp__memory__delete_entities({ entityNames: ["Test Corp SWOT", "Test Corp Beta SWOT"] })`

## Scenario 11: Sync Error Handling — Malformed File

**Setup:** Create a malformed pending-sync file with no parseable observations:
````fish
echo "# Pending Observations: Test Corp Theta SWOT
# Failed: 2026-05-01 10:00
# Retry: /swot Test Corp Theta --sync

This line has no observation format
Neither does this one" > skills/swot/pending-sync/2026-05-01-test-corp-theta.md
````

**Steps:**
1. Run `/swot "Test Corp Theta" --sync`
2. Verify skill reads the file
3. Verify skill warns about zero parseable observations
4. Verify file is NOT deleted (preserved for manual inspection)
5. Verify report shows: 1 file found, 0 observations parsed

**Expected:** Malformed file detected, warning shown, file preserved.

**Cleanup:** Remove `skills/swot/pending-sync/2026-05-01-test-corp-theta.md`
