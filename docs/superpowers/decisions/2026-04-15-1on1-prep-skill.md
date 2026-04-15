# /1on1-prep skill — Design Context Brief

**Date:** 2026-04-15
**Branch:** `feature/1on1-prep-skill`
**Issue:** [chriscantu/claude-config#33](https://github.com/chriscantu/claude-config/issues/33)
**Status:** Design approved through all seven sections. Next step is fat-marker sketch (excalidraw), then spec doc, then writing-plans.
**Why this brief exists:** Session was restarted mid-pipeline to load the excalidraw MCP tools after a fresh global install at `~/repos/mcp_excalidraw`. This brief preserves the design state so the next session can pick up at the fat-marker sketch without re-running the pipeline.

## Planning pipeline state

| Stage | Status | Notes |
|-------|--------|-------|
| Problem definition | ✅ Complete | See below |
| Systems analysis | ✅ Complete | See below |
| Solution design (brainstorming) | ✅ Complete | Seven sections approved section-by-section |
| **Fat marker sketch** | ⏳ **Next step** | Render in excalidraw, outline-only Excalifont, transparent background, staged drawing |
| Spec doc | ⏳ Pending | Write to `docs/superpowers/specs/YYYY-MM-DD-1on1-prep-design.md` |
| Writing-plans skill | ⏳ Pending | Invoked after spec approval |

## Problem statement

**User**: Chris Cantu as VP of Engineering, in two phases of the same role: intake (new-role discovery, ~first 30–90 days) and coaching (steady state). Mode is inferred per-Person with explicit override — transition speed varies by person and situation.

**Problem**: 1:1s are the highest-frequency executive activity but without structured prep degrade into status updates. Intake mode fails to extract strategic signal about opportunities, constraints, and relationships. Coaching mode drops follow-ups and displaces coaching with status reporting.

**Impact**: Thin early mental model → bad early decisions. Dropped follow-ups erode trust. Missed allies and stakeholders. Frequency is high enough that small quality gains compound enormously.

**Evidence**: Personal experience, structural composition with [#23](https://github.com/chriscantu/claude-config/issues/23) /stakeholder-map coverage-review mode, issue motivation.

**Constraints**:
- Storage: Anthropic KG Memory MCP per ADR [#0003](../../../adrs/0003-adopt-anthropic-kg-memory-mcp-for-onboarding-storage.md). No bespoke storage.
- Privacy: local-only; notes about real colleagues.
- Inputs: Google Calendar + user-supplied text. Nothing else until the user is in-role. No git, Gmail, or incident integrations in v1.
- Composition: output schema consumed by #23, #43, #42, #44.
- Discipline realism: must survive being maintained manually during a high-stress new-job transition.
- Fish shell, Bun runtime (not Node/npm), matches existing skill style.
- Question bank style: **strategic/opportunity/relationship, not tactical/operational** (see memory `leadership_intake_question_style.md`).
- User can always supplement or override generated questions.

## Systems analysis — key risks carried forward

1. **Schema lock-in risk:** `/1on1-prep` is the first writer to the graph. Its data shape becomes the de facto contract for all downstream onboarding skills (#23, #43, #42, #44). Mitigated by picking the minimal-schema path (B+ below).
2. **Hallucinated graph writes:** Nothing skill-interpreted is ever written. Every observation body is user-typed text. Every tag is a deterministic function of which prompt bucket the user answered.
3. **Capture discipline decay:** Prep and capture must feel like one continuous flow — not a separate chore. Mitigated by phase detection via calendar and one-message capture form.
4. **The one-way door:** Schema decisions on the graph. Starting minimal (Person-only) means migration later is cheap.
5. **Silent failure via graph decay:** No alarm fires when you skip capturing a meeting. Mitigated by the prep-phase output showing open commitments and follow-ups — you can see what's dropping.

## Approved design decisions (seven sections)

### 1. Architecture & data model

- **Skill surface**: one slash command `/1on1-prep <person-name>` with optional flags `--mode=intake|coaching`, `--phase=prep|capture`, `--context "..."`, `--sync`. Lives at `skills/1on1-prep/` in the claude-config repo (version controlled).
- **Entity types committed to in v1**: only `Person`. No Meeting, Team, Follow-up, or Commitment entities — those are observation tags, not entities.
- **Observation format**: `[YYYY-MM-DD][tag1][tag2]...[tagN] free-text body`
- **Relations**: none written automatically. `Person reports_to Person` allowed at bootstrap if the user provides org-chart info.
- **Append-only discipline**: skill never edits or deletes observations. Commitments and follow-ups are closed by writing a new `[resolved]` observation referencing the prior one by date.
- **Provenance rule**: the skill never writes its own interpretation to the graph. Prep phase is read-only. Capture phase writes verbatim user input with deterministic tags.

### 2. Tag vocabulary (v1)

| Tag | Category | Written when |
|-----|----------|--------------|
| `[1on1]` | meeting type | Observation came from a 1:1 meeting |
| `[intake]` | mode | Captured during intake mode |
| `[coaching]` | mode | Captured during coaching mode |
| `[opportunity]` | strategic | Strategic opening surfaced |
| `[concern]` | strategic | Worry/risk/problem raised |
| `[relationship]` | strategic | New cheerleader/critic/connector/name learned |
| `[commitment]` | strategic | They owe me something |
| `[followup]` | strategic | I owe them something |
| `[context]` | static | Background facts (role, tenure, bio); not tied to a meeting |
| `[mode:coaching]` | marker | Person has graduated from intake |
| `[mode:intake]` | marker | Reverted to intake (reversible) |
| `[resolved]` | lifecycle | Closes a prior `[commitment]` or `[followup]` |
| `[noshow]` | meeting state | Meeting happened on calendar but nothing captured |
| `[heard-from:<PersonName>]` | provenance | **Reserved for v2** (C+ cross-Person writes, not built) |
| `[meeting]` | reserved | Future group-discussion skill |

**Distinction that matters**: `[commitment]` = they owe me; `[followup]` = I owe them. Different tracking, different prep queries.

### 3. Invocation & phase detection

- **Phase detection**: query Google Calendar for events with the Person in a `-4h .. +24h` window.
  - Upcoming or in-progress → **prep phase**
  - Ended ≤4h ago → **capture phase**
  - No match → ask user explicitly
  - Multiple matches → ask user to pick
- **Mode detection per Person**:
  - Explicit `[mode:coaching]` / `[mode:intake]` observation wins.
  - Otherwise: intake if fewer than 3 prior `[1on1]` observations AND no `[context]` AND no `reports_to` relation. Coaching otherwise.
  - **Graduation nudge**: prep output suggests flipping mode but never does it silently.
- **Calendar graceful degradation**: calendar is an accelerator, not a dependency. Skill works end-to-end with zero calendar integration.

### 4. Prep phase output (read-only)

Six sections, empty ones omitted:

1. Header (name, mode badge, meeting time, prior-meeting count, graduation nudge if triggered)
2. Context (from `[context]` observations)
3. Open commitments from Person (unresolved `[commitment]`, oldest first)
4. Open follow-ups I owe Person (unresolved `[followup]`, oldest first)
5. Recent signal (last 2–3 `[1on1]` observations grouped by strategic tag)
6. What others have said (C+: substring search for Person name across all other Persons' observations, capped at 5 hits)
7. Suggested questions (3–4 per run, mode-appropriate, drawn from `skills/1on1-prep/questions.md`, rotated to avoid repeats)

**Never** summarizes, predicts, generates talking points, or offers coaching advice. The prep output is a formatted read of the graph.

### 5. Capture phase flow (A as described)

Single message with six prompts:

1. Opportunities
2. Concerns
3. Relationships
4. Commitments from them
5. Follow-ups for me
6. Anything else

User replies in one message. Skill parses, shows tagged observations, asks confirm/edit/cancel. Auto-tags by prompt bucket — **never by content interpretation**.

**Resolution mini-flow**: if a capture mentions closing a prior commitment/follow-up, skill substring-searches candidates and asks "is this closing out the YYYY-MM-DD entry?" Never auto-resolves.

### 6. Bootstrap (first-run on new Person)

Four-prompt form: full name, role/team, anything else known, reports-to. Creates Person entity via `mcp__memory__create_entities`, writes `[context]` observations from the answers, creates `reports_to` relation only if named Person already exists. **Never auto-creates referenced Persons.**

Name resolution: exact match → substring match → ambiguous → ask. Never merges entities automatically.

Context updates after bootstrap use `--context "..."` flag. No other update path.

Delete/rename/merge are not supported — manual via `mcp__memory__*` tools when needed.

### 7. Error handling & edge cases

- **Memory MCP unavailable**: write pending observations to `skills/1on1-prep/pending-sync/YYYY-MM-DD-<person>.md` in human-readable form. Warn on next invocation. Drain via `/1on1-prep --sync` when the server is back.
- **Calendar MCP unavailable**: graceful degradation, ask phase explicitly.
- **Write failure mid-capture**: **best-effort writes with per-observation reporting**, not atomic. Successful observations land; failed ones go to the pending-sync file for retry.
- **`[noshow]` handling**: write the observation, it's data for #23 coverage-review.
- **Bootstrap name collision**: warns and forces disambiguation — won't let two Person entities share a name.

### Testing approach

- Layer 1: `skills/1on1-prep/test/check-observations.ts` — static regex validator for observation format. Run manually.
- Layer 2: `skills/1on1-prep/test/scenarios.md` — manual end-to-end scenarios executed before merging.
- Layer 3: integration tests with downstream skills — deferred until #23 exists.

No automated tests. No CI. Test data isolation via memory MCP pointed at a test file.

## Feedback memories written during this session

Both already in the auto-memory index:
- `leadership_intake_question_style.md` — intake questions lean strategic, not tactical
- `onboarding_toolkit_manual_first.md` — calendar is the only trusted auto-integration; everything else is manual

## What was NOT decided explicitly

These were absorbed as defaults during the section-by-section review (no pushback from user, approved via "yes"):

- `[resolved]` convention uses free-text `(ref YYYY-MM-DD)` rather than a structured `[closes:YYYY-MM-DD]` pointer tag.
- No auto-generated relations from conversational content.
- Skill lives in the repo at `skills/1on1-prep/` (not in the personal `~/.claude/skills/` directory).
- 4h/24h calendar window.
- Three-signal graduation heuristic (3+ 1:1s + context + reports_to).
- Manual scenario checklist over automated tests.
- Best-effort writes with pending-sync file on failure.
- Auto-tag strictly by prompt bucket (no content interpretation even with a confirm step).

## Pick up here after session restart

1. **Verify excalidraw MCP tools are loaded**: check that `mcp__excalidraw__*` tools exist in the tool list. If yes, proceed. If no, check `claude mcp list` and debug.
2. **Verify canvas is running**: `lsof -iTCP:3000 -sTCP:LISTEN` should show the bun process. If not, start it: `cd ~/repos/mcp_excalidraw && PORT=3000 bun run canvas` in a persistent terminal.
3. **Invoke the fat-marker-sketch skill** for `/1on1-prep` — render in excalidraw following the staged-drawing protocol (pass 1: one batch per screen frame; passes 2–4: single batches).
4. **Sketch content**: seven screens showing the full journey — (1) invoke, (2) person lookup, (3) phase detect, (4) bootstrap (new person path), (5a) prep output, (5b) capture form, (6) confirm & tag, (7) write best-effort, (7b) pending-sync fallback — plus a FLOW section with the happy paths and edge branches listed at the bottom. The HTML version (deleted from /tmp) had this structure.
5. **Present the sketch, get the three-question check** (scope / components / flow).
6. **On approval**, transition to writing the spec doc at `docs/superpowers/specs/2026-04-15-1on1-prep-design.md`. Use this brief as the primary source — the spec is the canonical form.
7. **Self-review the spec** (placeholder scan, consistency, scope, ambiguity).
8. **Ask user to review the spec file**.
9. **On approval**, invoke the `superpowers:writing-plans` skill.

## Related artifacts

- ADR [#0003](../../../adrs/0003-adopt-anthropic-kg-memory-mcp-for-onboarding-storage.md) — storage decision (Anthropic KG Memory MCP)
- [2026-04-15-onboarding-memory-storage.md](2026-04-15-onboarding-memory-storage.md) — prior decision brief that unblocked this skill
- Onboarding toolkit issues: [#12](https://github.com/chriscantu/claude-config/issues/12), [#20](https://github.com/chriscantu/claude-config/issues/20), [#21](https://github.com/chriscantu/claude-config/issues/21), [#23](https://github.com/chriscantu/claude-config/issues/23), [#33](https://github.com/chriscantu/claude-config/issues/33), [#35](https://github.com/chriscantu/claude-config/issues/35), [#36](https://github.com/chriscantu/claude-config/issues/36), [#40](https://github.com/chriscantu/claude-config/issues/40), [#42](https://github.com/chriscantu/claude-config/issues/42), [#43](https://github.com/chriscantu/claude-config/issues/43), [#44](https://github.com/chriscantu/claude-config/issues/44)
