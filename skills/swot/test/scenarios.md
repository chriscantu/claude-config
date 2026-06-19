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
2. Verify the capture form shows **6 neutral prompts** (what observed, how known,
   compared to what, what's missing, so-what, anything else) and that **no prompt names
   a SWOT quadrant**.
3. Provide observation-first responses (the user does NOT pick a bucket):
   - What observed: "Deploys take 15 min, zero downtime. No on-call rotation — two devs carry the pager. A rival just raised $80M and is hiring in our space."
   - How known: "Deploy dashboard; 1:1 with Sarah; public filing."
   - Compared to what: "My last org took 2 hours to deploy."
   - What's missing: "No staging environment that matches production."
   - So what: (skip)
   - Anything else: "Reorg 6 months ago."
4. Verify the **auto-tag preview** proposes SWOT + landscape tags with a one-line
   rationale per entry (deploys → `[strength][technical]`, no on-call → `[weakness][org]`,
   no staging → `[weakness][org]`, rival raised $80M → `[threat][market]`).
5. **Exercise Retag end-to-end.** Pick an entry and Retag it to a different SWOT tag
   (e.g., Retag the rival-$80M entry to `[opportunity]`), Confirm, then verify the
   **written** string carries the *corrected* tag (`[opportunity]`), not the originally
   proposed `[threat]`. A Retag that silently writes the original proposal fails here.
6. Confirm the rest.
7. Verify write results: SWOT entries carry a full
   `[date][swot-tag][landscape-tag] text (provenance)` string; the "Reorg 6 months ago"
   entry is written as `[date][context] ...` (context legitimately has no SWOT valence).
   **No draft / proposal-state entry is persisted** — every written entry is one the user
   confirmed at the preview.

**Expected:** Observations written with confirmed tags; a Retag changes the persisted
tag; the user never chose a bucket at input time; categorization happened at confirm.

**Cleanup:** `mcp__memory__delete_entities({ entityNames: ["Test Corp Beta SWOT"] })`

## Scenario 3: Artifact-Pointed Capture

**Setup:** Same as Scenario 2 (fresh entity with no observations).

**Steps:**
1. Run `/swot "Test Corp Beta" --read skills/swot/SKILL.md` (use the skill file itself
   as a test artifact — it won't produce meaningful SWOT entries, but tests the flow)
2. Verify skill reads the file
3. Verify draft observations are presented in the **same auto-tag confirm preview**
   (proposed SWOT + landscape tag, one-line rationale per draft)
4. Edit one draft, remove another
5. Confirm remaining
6. Verify write results — confirmed entries are fully tagged; nothing written unconfirmed

**Expected:** Artifact read, drafts presented in the auto-tag confirm flow, user edits
respected, confirmed entries written.

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

## Scenario 12: Discovery Handoff (`--from=1on1-prep`)

**Setup:** Create a SWOT entity and a `Person` with `[1on1]` observations. Note the
`Person` entity uses the 1on1-prep schema (`entityType: "Person"`, capitalized) and its
observations carry **no** provenance parenthetical — that is the producing skill's real
format (see `skills/1on1-prep/graph-schema.md`):
````
mcp__memory__create_entities({ entities: [
  { name: "Test Corp Iota SWOT", entityType: "SWOT", observations: [] },
  { name: "Sarah Chen", entityType: "Person", observations: [
    "[2026-05-01][1on1][intake][concern] Biggest risk in 90 days: billing service has no owner and breaks often",
    "[2026-05-01][1on1][intake][concern] We work around the deploy process because staging doesn't match prod"
  ]}
] })
````

**Steps:**
1. Run `/swot "Test Corp Iota" --from=1on1-prep`
2. Verify the skill reads the `[1on1]` observations via `search_nodes` (does NOT show the
   conversational capture form). The draft bodies must be **verbatim** from the 1:1 notes —
   this proves a graph read, not re-elicitation.
3. Verify each 1:1 note is presented as a **draft** in the auto-tag confirm preview, with
   provenance **synthesized** as `(1:1 with Sarah Chen)` from the source `Person` entity
   (the 1:1 note had no provenance of its own).
4. **Cancel-guard.** First run a Cancel pass: at the preview, choose **Cancel**, then
   `mcp__memory__open_nodes({ names: ["Test Corp Iota SWOT"] })` and verify the entity
   still has **zero** observations. A handoff that writes before confirm fails here.
5. Re-run `/swot "Test Corp Iota" --from=1on1-prep` and **Confirm**.
6. Verify written entries are fully tagged and carry the synthesized `(1:1 with Sarah Chen)`
   provenance.

**Expected:** 1:1 discovery notes drafted verbatim into SWOT observations, provenance
synthesized, Cancel writes nothing, Confirm writes tagged entries — no re-typing, no
unconfirmed writes.

**Cleanup:** `mcp__memory__delete_entities({ entityNames: ["Test Corp Iota SWOT", "Sarah Chen"] })`

## Scenario 13: Backward-Compatible Read (old + new entries together)

Confirms review/challenge render a mix of entries written before and after this change.
The two seeds intentionally share the stored string shape — that *is* the compatibility
contract (the redesign changes only *when* tags are assigned, not the stored format). The
shape-drift regression (a new-flow write that loses a bracket) is guarded by Scenario 2
step 7, not here.

**Setup:** Create a SWOT entity holding one old-flow entry and one new-flow entry — both
use the same string shape:
````
mcp__memory__create_entities({ entities: [{ name: "Test Corp Kappa SWOT", entityType: "SWOT", observations: [] }] })
mcp__memory__add_observations({ observations: [{ entityName: "Test Corp Kappa SWOT", contents: [
  "[2026-04-10][strength][technical] Good API design — consistent REST conventions, versioned (code review)",
  "[2026-05-01][weakness][org] No staging environment matching production (platform lead)"
]}] })
````

**Steps:**
1. Run `/swot "Test Corp Kappa" --mode=review`
2. Verify a single report renders both entries with no format errors
3. Run `/swot "Test Corp Kappa" --mode=challenge`
4. Verify both entries run through the 4 checks without parse errors

**Expected:** Old- and new-flow entries read identically; observation-first capture
introduced no migration need.

**Cleanup:** `mcp__memory__delete_entities({ entityNames: ["Test Corp Kappa SWOT"] })`

## Scenario 14: Unparseable Multi-Observation Input

Guards the parsing rule "if you can't tell where one observation ends and the next
begins, re-present the form; do NOT invent splits" (capture-form.md).

**Setup:** `mcp__memory__create_entities({ entities: [{ name: "Test Corp Lambda SWOT", entityType: "SWOT", observations: [] }] })`

**Steps:**
1. Run `/swot "Test Corp Lambda"`
2. To "what observed?" paste a run-on with no line breaks: "everything is kind of a mess
   the deploys are slow and also nobody owns billing and morale and the reorg"
3. Verify the skill **re-presents the form** (or asks for one observation per line) rather
   than fabricating multiple split observations
4. Verify **no observation is written** from the unparseable input

**Expected:** Skill asks for clearer input; nothing written; no invented splits.

**Cleanup:** `mcp__memory__delete_entities({ entityNames: ["Test Corp Lambda SWOT"] })`

## Scenario 15: Discovery Handoff — Empty `[1on1]` Graph

Guards the fallback "if there are no `[1on1]` observations yet, say so and fall back to
conversational capture."

**Setup:** A SWOT entity and a `Person` with **no** `[1on1]` observations:
````
mcp__memory__create_entities({ entities: [
  { name: "Test Corp Mu SWOT", entityType: "SWOT", observations: [] },
  { name: "Pat Lee", entityType: "Person", observations: ["[2026-05-01][context] Eng manager, joined recently"] }
] })
````

**Steps:**
1. Run `/swot "Test Corp Mu" --from=1on1-prep`
2. Verify the skill reports it found no `[1on1]` notes (does not error or hang)
3. Verify it falls back to the conversational capture form

**Expected:** Graceful empty-graph message, fallback to conversational capture.

**Cleanup:** `mcp__memory__delete_entities({ entityNames: ["Test Corp Mu SWOT", "Pat Lee"] })`

## Scenario 16: Comparative / Absence Prompt Spawns a Standalone Observation

Guards the rule that prompts 3 and 4 may produce their own observations.

**Setup:** `mcp__memory__create_entities({ entities: [{ name: "Test Corp Nu SWOT", entityType: "SWOT", observations: [] }] })`

**Steps:**
1. Run `/swot "Test Corp Nu"`
2. Leave "what observed?" blank; answer "compared to what?" with: "Every peer team I've
   worked with has an on-call rotation; this team has none."
3. Verify this comparative answer is drafted as its own observation (an absence vs. a
   baseline) and auto-tagged `[weakness][org]` at the preview
4. Confirm and verify it is written

**Expected:** A comparative/absence answer with no prompt-1 entry still produces a
standalone, correctly-tagged observation.

**Cleanup:** `mcp__memory__delete_entities({ entityNames: ["Test Corp Nu SWOT"] })`

## Scenario 17: AC#3 — Challenge Flags Fewer Entries (sample re-derivation)

Backs issue #483 acceptance criterion 3 ("checks #1 and #4 flag measurably fewer entries
on a sample run") against the committed fixture.

**Reference:** `skills/swot/samples/483-intake-sample.md` (frozen input + expected counts).

**Steps:**
1. Capture the sample's OLD-flow entries into a throwaway entity, run `--mode=challenge`,
   and record how many entries Check #1 (vague) and Check #4 (miscategorized) flag.
2. Capture the sample's NEW-flow entries into a second throwaway entity, run
   `--mode=challenge`, record the same two counts.
3. Verify the NEW counts are **lower** than the OLD counts for both Check #1 and Check #4
   (the fixture documents 4→0 and 3→0 as the representative run).

**Expected:** NEW-flow capture trips checks #1 and #4 fewer times than OLD-flow capture.
LLM tagging is non-deterministic, so treat the exact integers as representative; the
required signal is **NEW < OLD on both checks**. If a run regresses, re-derive against
the fixture definitions before assuming a code defect.

**Cleanup:** delete the two throwaway entities.
