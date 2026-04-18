# /stakeholder-map — Design Spec

**Status**: Draft
**Date**: 2026-04-18
**Issue**: [#23](https://github.com/chriscantu/claude-config/issues/23)
**Related**: [#33 /1on1-prep](https://github.com/chriscantu/claude-config/issues/33) (exists), [#35 /org-design](https://github.com/chriscantu/claude-config/issues/35), [#42 /strategy-doc](https://github.com/chriscantu/claude-config/issues/42) (future consumers)

---

## Problem Statement

**User**: A new engineering leader (VP/Director) in their first 30-60 days in role.

**Problem**: New leaders walk into an unfamiliar org with no structured way to map its political topology (formal vs. informal power, veto holders, meet-order) and no way to audit whether their early relationship-building is covering the right surface area — leaving blind spots and echo chambers undetected until they cause a misstep.

**Impact**: Early missteps in a new leadership role compound. Misreading power dynamics, missing key stakeholders, or confirming bias from a narrow set of sources produces strategy documents and 90-day plans built on incomplete inputs. The downstream deliverable — the 90-day plan (#42) — is only as good as the stakeholder intelligence feeding it.

**Evidence**: Direct personal experience (user is currently preparing for this scenario). Issue #23 thread has rich, scoped requirements from a 2026-04-15 planning session. Pattern is well-documented in first-90-days leadership literature.

**Constraints**:
- Manual-first data entry (Calendar is the only trusted auto-integration)
- Must compose with existing 1on1-prep (#33) without coupling
- Sensitive data stays in local memory MCP; never committed to repo
- Skill-layer patterns: SKILL.md under `skills/stakeholder-map/`, markdown-driven

---

## Systems Analysis Summary

**Dependencies**: New skill. Persistent state lives in the existing memory MCP knowledge graph (same store 1on1-prep uses). Bidirectional composition with 1on1-prep via shared tag conventions. Excalidraw MCP for visual output. Calendar MCP as opt-in seed source. Feeds future consumers #35 (org-design) and #42 (strategy-doc).

**Second-order effects**:
- Schema choices here lock in #33/#35/#42 — the tag taxonomy must be designed once with all downstream needs in mind.
- Echo-chamber heuristic needs calibration to avoid alarm fatigue (flag, don't lecture).
- Storage decision creates privacy pressure — must stay out of repo.

**Failure modes**: Low blast radius. Silent staleness (mitigated via freshness prompt). Accidental commit of sensitive data (mitigated by memory MCP being out-of-repo + explicit guidance in SKILL.md).

**Org impact**: Solo user, manual-first, scales at 200-person org ceiling.

**Key risks addressed in design**:
1. Stakeholder schema shape — resolved by extending the memory graph's existing observation/relation conventions rather than inventing a new store.
2. Privacy/storage — resolved by using memory MCP (local, not in repo) + explicit guardrail note.
3. Composition with 1on1-prep — resolved by graph-as-integration-point (no direct skill-to-skill calls).

---

## Solution Shape (Fat Marker Sketch)

Rendered on excalidraw canvas during design. Key structural findings:

- Central: `/stakeholder-map` skill with two mode sub-regions (A: leader-onboarding, B: coverage-review)
- Inputs: Memory MCP (shared graph), Calendar MCP (opt-in seed)
- Outputs: Excalidraw chart (Mode A), Excalidraw heatmap (Mode B)
- Sibling: `/1on1-prep` (shares the memory graph, reads power/coverage tags)
- Future consumers (dashed): #35 /org-design, #42 /strategy-doc

FLOW:
- Mode A: manual bootstrap + optional `--seed-from-calendar` → tag people → chart
- Mode B: query graph by dimension → heatmap + echo-chamber flag + freshness prompt
- Shared graph: 1on1-prep reads power/coverage tags during prep; #35/#42 read map (future)

---

## Detailed Design

### 1. Architecture & Composition

**Skill location**: `skills/stakeholder-map/SKILL.md` (follows the 1on1-prep pattern — reference files loaded on demand).

**Reference files**:
- `graph-schema.md` — tag taxonomy, relations, observation formats (canonical shared reference, also linked from 1on1-prep's SKILL.md over time)
- `bootstrap.md` — manual form + calendar-seed flow
- `chart-render.md` — excalidraw rendering for Mode A
- `heatmap-render.md` — excalidraw rendering for Mode B
- `coverage-queries.md` — the five dimension queries + echo-chamber heuristic

**Invocation**:
```
/stakeholder-map --mode=leader-onboarding [--seed-from-calendar [--days=30]]
/stakeholder-map --mode=coverage-review
```
If `--mode` is omitted, detect from graph state (empty/sparse → leader-onboarding; populated → coverage-review) and ask the user to confirm.

**Prerequisites**:
- Verify `mcp__memory__*` availability. If unavailable, warn and set a session-wide flag so ALL writes route to `pending-sync/` for the remainder of the session (reuses 1on1-prep's pending-sync conventions).
- Verify excalidraw canvas reachable via Preview before rendering. On failure, produce text-based output and prompt the user to run `preview_start("excalidraw-canvas")`.

**Composition seams**:
- With 1on1-prep: shared entities in the memory graph. The `graph-schema.md` reference is what couples them — neither skill invokes the other.
- With #35/#42 (future): they read the same graph through the documented tag vocabulary. No API contract needed now.

### 2. Memory Graph Schema Extensions

All new tags documented in `graph-schema.md` as the canonical reference for both stakeholder-map and 1on1-prep.

**New observation tags**:

| Tag | Purpose | Example |
|-----|---------|---------|
| `[power:formal:<level>]` | Formal authority (`high\|medium\|low`) | `[power:formal:high]` |
| `[power:informal:<level>]` | Informal influence, independent of title | `[power:informal:medium]` |
| `[category:<type>]` | Relational category: `direct_report\|skip\|peer\|skip_up\|cross_functional` | `[category:peer]` |
| `[function:<name>]` | Functional domain: `engineering\|product\|design\|data\|security\|sre` | `[function:product]` |
| `[team:<name>]` | Team affiliation (free text) | `[team:platform]` |
| `[coverage:met]` | Meeting event marker (drives freshness; date comes from the leading observation-date prefix) | `[2026-04-18][coverage:met] in-person intro` |
| `[advice] <text>` | Append-only; captures concrete advice/caution/suggestion offered during intake | `[advice] focus on the payments rewrite first` |
| `[tenure:<long\|new>]` | Relative tenure in org | `[tenure:long]` |
| `[role:<manager\|ic>]` | Manager vs. IC axis (extensible to `exec`, `staff`) | `[role:manager]` |

**New relations** (in addition to 1on1-prep's `reports_to`):
- `reports_to_informally` — informal power line
- `influences` — broader influence link (mentor, back-channel, longtime collaborator)

**Conventions**:
- Power, category, function, team, tenure, role tags are **replaceable** — re-tagging deletes prior observations matching the same tag prefix before writing.
- `[advice]` and `[coverage:met:*]` are **append-only** — event records. Patterns are derived by counting/sorting.
- All tags are optional — a sparse entity (name only) is valid. Mode B queries tolerate missing tags (report as "unknown").

**Privacy note** (explicit in SKILL.md and `graph-schema.md`):
> These entities may contain sensitive assessments of individuals. Storage is local memory MCP only — never export to repo or share the raw graph.

### 3. Mode A: Leader-Onboarding

**Entry variants**:
- `--mode=leader-onboarding` with empty/sparse graph → full bootstrap
- `--mode=leader-onboarding` with populated graph → resume mode (incremental add/update)
- `--mode=leader-onboarding --seed-from-calendar [--days=30]` → calendar-assisted bootstrap

**Manual bootstrap form** (per stakeholder, 11 prompts):

1. Full name → entity name (collision check)
2. Role (full job title) → free-text `[context]` observation
3. Role axis (manager / ic) → `[role:*]`
4. Function (enum) → `[function:*]`
5. Team (free text) → `[team:*]`
6. Category (enum) → `[category:*]`
7. Tenure (long / new) → `[tenure:*]`
8. Formal power (high / medium / low) → `[power:formal:*]`
9. Informal power (optional, skippable) → `[power:informal:*]`
10. Advice captured? (optional free text) → `[advice]` observation if provided
11. Reports to / informal reports to / influences (optional) → relations if targets exist in graph

Always writes `[coverage:met:<today>]` as a final step.

**Calendar-seed variant** (`--seed-from-calendar`):

1. Query Calendar MCP: events in last N days where user was an attendee
2. Extract unique attendees (excluding the user)
3. Cross-check against existing memory graph entities — dedupe
4. Present candidates as picklist per name: `[add]`, `[skip]`, `[seen-but-skip]`
5. For `[add]`: run manual bootstrap form above, pre-filled with name
6. For `[seen-but-skip]`: write `[context] seen via calendar, not tracked` so name doesn't re-appear on next seed run

**Upgrade flow** (when person exists from 1on1-prep bootstrap):
- Detect entity has 1on1-prep shape (name + role + optional reports_to) but lacks stakeholder tags
- Offer: "Alice exists with 1on1-prep bootstrap data. Add stakeholder fields?"
- If yes: skip prompts 1-2 (name/role) and run the rest

**Chart output** (excalidraw, Mode A deliverable):

Five category columns (direct reports / skips / peers / skip-up / cross-functional). Each person is a node with:
- **Formal power** encoded as node size (high/medium/low = large/medium/small rectangle)
- **Informal power** encoded as a badge marker (filled dot, sized small/medium/large)
- **Name + function label** inside the node
- `reports_to` drawn as solid arrows; `reports_to_informally` as dashed arrows
- **Meet-in-what-order list** rendered below the chart: top 10, scored by `(formal_power × 2) + (informal_power × 3) + category_weight`. Power levels map to `high=3, medium=2, low=1`. Category weights in descending priority: `direct_report=5, skip=4, peer=3, skip_up=2, cross_functional=1`. Unmet stakeholders sort above already-met (tiebreak bonus of +10).

**Progressive render**: chart re-renders after every 5 bootstrap entries or on explicit `render` command.

**Idempotence**: re-running Mode A adds/updates without wiping. Replaceable tags overwrite; append-only tags accumulate.

### 4. Mode B: Coverage-Review

**Entry**: `/stakeholder-map --mode=coverage-review`

**Precondition**: graph has ≥10 tagged stakeholders (threshold configurable). Below threshold → "Graph is sparse ({count}). Coverage review works best with ≥10. Continue anyway or run leader-onboarding first?"

**Five dimension queries** (each produces one heatmap row):

| Dimension | Query | Gap signal |
|-----------|-------|-----------|
| Hierarchy | Group by `[category:*]` | Any category with zero entries; lopsided ratios |
| Team | Group by `[team:*]` | Known teams (from `reports_to` chains) with no one directly met |
| Function | Group by `[function:*]` | Functions in the org but missing from the met set |
| Role diversity | Group by `[role:*]` | All manager or all IC |
| Tenure diversity | Group by `[tenure:*]` | All long-tenured or all new |

**Echo-chamber check** (grounded in `[advice]` content):

- **Trigger**: ≥3 `[advice]` observations in the last 30 days
- **Cluster**: group advice by theme using an LLM pass — prompt the model in-context with the advice list and ask for themed groupings. No hand-rolled NLP or keyword matching.
- **Flag** (`echo-chamber: possible`): ≥70% of advice in 1-2 themes
- **Healthy diversity** (positive confirmation): ≥3 distinct themes AND no single theme >50%
- **In between** (1 dominant theme <70%): no flag — not enough signal
- **Tone**: "Advice has clustered around {theme}. Worth checking if you're hearing the full range." — not "WARNING: echo chamber detected."

**Freshness prompt** (one-line banner):
> Map last updated {date}. {N} stakeholders haven't had a fresh interaction in >30 days.

**Structural-gap detection**: regex pass for capitalized name-shaped strings in `[advice]` and `[context]` free-text that aren't existing entities. Prompt: "Name {X} came up in {count} observations but isn't tracked. Meet them?"

**Recommended-next-interviews output**:

- Top 5 scored by `gap_severity × category_weight` (reusing the category weights from Mode A: direct_report=5 through cross_functional=1). `gap_severity` = 1.0 if no entity covers the bucket, 0.5 if undercovered (<2 entries), 0.0 if well-covered.
- Each with rationale: "Meet {name}: fills {function} gap" or "Circle back to {name}: last met 45 days ago, advice worth revisiting"

**Heatmap render** (excalidraw):

- One row per dimension, one cell per bucket
- Cell shading via stroke width (outline-only convention): thick = well-covered, thin = gap, dashed = unknown/no data
- Gap cells labeled with the specific missing bucket
- Echo-chamber flag as a top banner when triggered
- Recommended interviews list rendered below

### 5. Composition with 1on1-prep

**Shared via graph conventions, not API calls**:

- **1on1-prep gains**: prep reads `[power:*]`, `[category:*]`, `[advice]` to surface richer context automatically — no code change needed, it already reads observations.
- **stakeholder-map gains**: `[1on1]` captures naturally populate `[advice]`; `[coverage:met:*]` freshness reads from any timestamped observation.

**Concrete seams**:

1. `graph-schema.md` is the single source of truth; both skills' SKILL.md files link to it.
2. Each skill is no-op-friendly — works with partial data from the other.
3. **Upgrade flow**: stakeholder-map's Mode A detects entities bootstrapped by 1on1-prep and offers to fill in stakeholder fields (skips name/role re-entry).
4. **Pending-sync**: stakeholder-map writes to the same `pending-sync/` directory 1on1-prep uses, following its file format. `--sync` works on both skills' files.

**Explicitly not doing**: shared CLI, event bus, cross-skill validation.

### 6. Edge Cases & Safeguards

**Memory MCP unavailable**:
- Session-wide flag — ALL writes route to `pending-sync/` for the remainder
- Mode A continues (writes to disk); Mode B exits with a sync-first prompt

**Calendar MCP unavailable (seed flag used)**:
- Warn, offer to continue with manual bootstrap only — calendar is an accelerator, not a dependency

**Excalidraw canvas unreachable**:
- Preflight at render time, not skill invocation
- Text fallback: formatted markdown with category groupings, power levels, meet-order list
- Print `preview_start("excalidraw-canvas")` hint in the fallback

**Empty graph**:
- `--mode=leader-onboarding`: expected, proceed
- `--mode=coverage-review`: exit with "Graph is empty. Run leader-onboarding first."
- No `--mode`: auto-detect → leader-onboarding with a one-line note

**Sparse graph (<10)**:
- Mode B warns and asks to continue
- Mode A runs in resume mode

**Duplicate-name collisions**: inherit 1on1-prep's disambiguation flow.

**Stale data**: freshness prompt is informational only — no automatic purge.

**Partial writes**: each observation/relation write is independent. Replaceable-tag flow (delete then write) is two ops — if delete succeeds and write fails, user sees a warning and is prompted to re-tag.

**Privacy**: single explicit note in SKILL.md and `graph-schema.md`. No PII in the skill's own example text (placeholders only: Alice, Bob).

**Evals**: deferred to v2. Track as a follow-up issue (per repo pattern, evals are scenario-based and best written after 2+ weeks of real use). Does not block v1 merge.

---

## Out of Scope for v1

- Automated dissent detection on a person — replaced by advice-content clustering
- Integration with Slack/Linear/Atlassian signals — user is not in those tools
- Shared CLI or cross-skill validation with 1on1-prep
- Evals (deferred; tracked separately)
- UI polish on the chart/heatmap beyond outline-only excalidraw conventions

---

## Open Questions (Resolved During Design)

All resolved. Nothing carried forward.

---

## Acceptance Criteria

1. `/stakeholder-map --mode=leader-onboarding` completes an end-to-end bootstrap for a new stakeholder, writing expected tags to the memory graph, and renders a chart.
2. `--seed-from-calendar` surfaces attendees from the last 30 days, dedupes against the graph, and walks the picklist flow.
3. `/stakeholder-map --mode=coverage-review` produces a heatmap with the five dimension queries and surfaces the echo-chamber flag when thresholds are met.
4. Running Mode A a second time updates replaceable tags (power, category, function) without wiping append-only observations (advice, coverage:met).
5. Memory MCP unavailable → all writes route to `pending-sync/`, skill does not crash.
6. Excalidraw unreachable → text fallback output, skill produces usable result.
7. An entity bootstrapped via 1on1-prep can be upgraded to a full stakeholder record without re-entering name/role.
8. `graph-schema.md` is the single reference consumed by both stakeholder-map and 1on1-prep (1on1-prep cross-link added as part of this PR).
