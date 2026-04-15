# Design Spec: `/1on1-prep` Skill

**Date**: 2026-04-15
**Status**: Draft
**Issue**: [chriscantu/claude-config#33](https://github.com/chriscantu/claude-config/issues/33)
**Branch**: `feature/1on1-prep-skill`

---

## Problem Statement

**User**: Chris Cantu as VP of Engineering, in two phases: intake (new-role discovery, first 30-90 days) and coaching (steady state). Mode is inferred per-Person with explicit override.

**Problem**: 1:1s are the highest-frequency executive activity but without structured prep they degrade into status updates. Intake mode fails to extract strategic signal about opportunities, constraints, and relationships. Coaching mode drops follow-ups and displaces coaching with status reporting.

**Impact**: Thin early mental model leads to bad early decisions. Dropped follow-ups erode trust. Missed allies and stakeholders. High frequency means small quality gains compound enormously.

**Evidence**: Personal experience, structural composition with #23 `/stakeholder-map` coverage-review mode.

**Constraints**:
- Storage: Anthropic KG Memory MCP per [ADR #0003](../../../adrs/0003-adopt-anthropic-kg-memory-mcp-for-onboarding-storage.md)
- Privacy: local-only; notes about real colleagues
- Inputs: Google Calendar + user-supplied text; no git, Gmail, or incident integrations in v1
- Composition: output schema consumed by #23, #43, #42, #44
- Must survive manual maintenance during a high-stress new-job transition
- Fish shell, Bun runtime (not Node/npm)
- Question bank: strategic/opportunity/relationship, not tactical/operational

---

## Architecture

The skill lives at `skills/1on1-prep/SKILL.md` and is symlinked globally to `~/.claude/skills/1on1-prep/` via the existing `install.fish` mechanism.

### Single Command Surface

```
/1on1-prep <person-name> [--mode=intake|coaching] [--phase=prep|capture] [--context "..."] [--sync]
```

- `<person-name>`: required; looked up in the knowledge graph
- `--mode`: override auto-detected mode for this person
- `--phase`: override calendar-based phase detection
- `--context "..."`: add a `[context]` observation outside the meeting flow
- `--sync`: drain pending-sync file (retry failed writes)

### Data Model

**Entity types**: only `Person`. No Meeting, Team, Follow-up, or Commitment entities in v1 — those concepts live as tagged observations.

**Observation format**: `[YYYY-MM-DD][tag1][tag2]...[tagN] free-text body`

All observation bodies are verbatim user input. The skill never writes its own interpretation to the graph.

**Relations**: none written automatically. `Person reports_to Person` allowed at bootstrap if the user provides org-chart info.

**Append-only discipline**: the skill never edits or deletes observations. Commitments and follow-ups are closed by writing a new `[resolved]` observation referencing the prior one by date.

### External Dependencies

| Dependency | Role | Failure mode |
|-----------|------|-------------|
| `mcp__memory__*` | Knowledge graph storage | Write to pending-sync file, warn on next invocation |
| Google Calendar MCP | Phase detection accelerator | Ask phase explicitly; skill works end-to-end without it |

---

## Tag Vocabulary (v1)

| Tag | Category | Written when |
|-----|----------|-------------|
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

**Reserved tags** (not built in v1):
- `[heard-from:<PersonName>]` — cross-Person provenance (v2)
- `[meeting]` — future group-discussion skill

**Key distinction**: `[commitment]` = they owe me; `[followup]` = I owe them. Different tracking, different prep queries.

---

## Phase Detection

### Calendar Query

Query Google Calendar for events with the Person in a `-4h .. +24h` window:

| Calendar result | Phase |
|----------------|-------|
| Upcoming or in-progress event | **prep** |
| Event ended ≤4h ago | **capture** |
| Multiple matches | Ask user to pick |
| No match | Ask user explicitly |

Calendar is an accelerator, not a dependency. The skill works end-to-end with zero calendar integration.

### Mode Detection Per-Person

Priority order:
1. Explicit `--mode` flag wins
2. Explicit `[mode:coaching]` or `[mode:intake]` observation in the graph wins
3. Auto-detect: **intake** if fewer than 3 prior `[1on1]` observations AND no `[context]` AND no `reports_to` relation; **coaching** otherwise

**Graduation nudge**: prep output suggests flipping mode when heuristic says coaching, but the person is still marked intake. Never flips silently.

---

## Phases

### Bootstrap (New Person)

Triggered when person lookup finds no match. Four-prompt form:

1. Full name?
2. Role / team?
3. Anything else known?
4. Reports to?

Creates Person entity via `mcp__memory__create_entities`, writes `[context]` observations from each non-empty answer. Creates `reports_to` relation only if the named Person entity already exists in the graph.

**Name resolution**: exact match → substring match → ambiguous → ask. Never merges entities automatically. Warns on name collision and forces disambiguation.

Context updates after bootstrap use the `--context "..."` flag. No other update path in v1. Delete/rename/merge are not supported — manual via `mcp__memory__*` tools.

### Prep Phase (Read-Only)

Six sections, empty ones omitted:

1. **Header** — name, mode badge, meeting time, prior-meeting count, graduation nudge if triggered
2. **Context** — from `[context]` observations
3. **Open commitments from Person** — unresolved `[commitment]`, oldest first
4. **Open follow-ups I owe Person** — unresolved `[followup]`, oldest first
5. **Recent signal** — last 2-3 `[1on1]` observations grouped by strategic tag
6. **What others have said** — substring search for Person name across all other Persons' observations, capped at 5 hits
7. **Suggested questions** — 3-4 per run, mode-appropriate, drawn from `skills/1on1-prep/questions.md`, rotated to avoid repeats

The prep output is a formatted read of the graph. It never summarizes, predicts, generates talking points, or offers coaching advice.

### Capture Phase

Single message with six prompts:

1. Opportunities?
2. Concerns?
3. Relationships?
4. Commitments from them?
5. Follow-ups for me?
6. Anything else?

User replies in one message. Skill parses the response, shows tagged observations, and asks confirm/edit/cancel. Tags are applied deterministically by prompt bucket — never by content interpretation.

**Resolution mini-flow**: if a capture mentions closing a prior commitment/follow-up, skill substring-searches candidate observations and asks "is this closing out the YYYY-MM-DD entry?" Never auto-resolves.

---

## Error Handling

| Scenario | Behavior |
|---------|----------|
| Memory MCP unavailable | Write pending observations to `skills/1on1-prep/pending-sync/YYYY-MM-DD-<person>.md` in human-readable form. Warn on next invocation. Drain via `--sync`. |
| Calendar MCP unavailable | Ask phase explicitly. No degradation to core functionality. |
| Write failure mid-capture | **Best-effort writes with per-observation reporting.** Successful observations land; failed ones go to the pending-sync file for retry. Not atomic. |
| `[noshow]` | Write the observation — it's data for #23 coverage-review. |
| Bootstrap name collision | Warn and force disambiguation. Won't create duplicate Person entities. |

---

## File Layout

```
skills/1on1-prep/
  SKILL.md              # Skill definition (invoked by Claude Code)
  questions.md          # Question bank, partitioned by mode
  pending-sync/         # Failed writes stored here for retry
    YYYY-MM-DD-<person>.md
  test/
    check-observations.ts   # Static regex validator for observation format
    scenarios.md            # Manual end-to-end test scenarios
```

---

## Testing Approach

- **Layer 1**: `check-observations.ts` — static regex validator for the `[YYYY-MM-DD][tag]... body` format. Run manually with `bun test/check-observations.ts`.
- **Layer 2**: `scenarios.md` — manual end-to-end scenarios executed before merging. Covers: bootstrap new person, prep with open commitments, capture with resolution, pending-sync drain, mode graduation, calendar unavailable.
- **Layer 3**: integration tests with downstream skills — deferred until #23 exists.

No automated CI. Test data isolation via memory MCP pointed at a test file.

---

## Composition Contract

This skill is the first writer to the knowledge graph. Its data shape becomes the de facto contract for all downstream onboarding skills:

| Consumer | What it reads |
|---------|--------------|
| #23 `/stakeholder-map` | Person entities, `reports_to` relations, `[relationship]` observations, `[noshow]` observations |
| #43 coaching dashboard | `[commitment]` and `[followup]` observations, `[resolved]` status |
| #42 org-chart builder | Person entities, `reports_to` relations, `[context]` observations |
| #44 transition tracker | `[mode:coaching]` markers, meeting frequency, `[opportunity]`/`[concern]` trends |

**Schema lock-in mitigation**: starting with only `Person` entities and tagged observations means migration later is cheap. No structural entities (Meeting, Team) to evolve.

---

## What Was Explicitly Decided

- `[resolved]` convention uses free-text `(ref YYYY-MM-DD)` rather than a structured `[closes:YYYY-MM-DD]` pointer tag
- No auto-generated relations from conversational content
- Skill lives in the repo at `skills/1on1-prep/` (version controlled, not personal `~/.claude/skills/`)
- 4h/24h calendar window for phase detection
- Three-signal graduation heuristic (3+ 1:1s + context + reports_to)
- Manual scenario checklist over automated tests
- Best-effort writes with pending-sync file on failure
- Auto-tag strictly by prompt bucket (no content interpretation even with a confirm step)
- No auto-creation of referenced Persons during bootstrap

---

## Related Artifacts

- [Design context brief](../decisions/2026-04-15-1on1-prep-skill.md)
- [ADR #0003: KG Memory storage](../../../adrs/0003-adopt-anthropic-kg-memory-mcp-for-onboarding-storage.md)
- [Storage decision brief](../decisions/2026-04-15-onboarding-memory-storage.md)
- Onboarding toolkit issues: #12, #20, #21, #23, #33, #35, #36, #40, #42, #43, #44
