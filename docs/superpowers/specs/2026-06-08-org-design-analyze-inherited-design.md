# /org-design — Inherited-Org Analysis (Phase 1: `analyze-inherited`)

**Date**: 2026-06-08
**Issue**: #35 (re-scoped from "org structure scenario modeling" to phased delivery; Phase 1 = `analyze-inherited` mode — descriptive only)
**Status**: Design approved

## Problem Statement

**User**: Newly-hired senior engineering leader (Director / VP), days 30–60 of a new role, working inside an `/onboard <org>` workspace. Has a populated stakeholder map and an architecture-overview bundle but has not yet earned the right to propose org changes.

**Problem**: A new leader inherits an org shape built by predecessors. Before proposing any reorg, they must *read* the inherited structure — span of control, single points of failure, on-call load, skill coverage, manager:IC ratios — and recognize where the current shape encodes a past decision worth understanding before touching. Doing this from memory or scattered notes produces premature reorg proposals that damage credibility and miss load-bearing structure.

**Impact**:
- Premature reorg → loss of trust ("changed things before understanding them").
- Missed SPOF → a single departure takes down a critical system or decision path the leader never mapped.
- Unseen on-call imbalance / span problems → attrition risk the leader can't yet name.
- No structured inherited-org read → the 90-day plan's "What I learned" (Section 1) and "Problems I have observed" (Section 3) start from a blank page.

**Evidence**: Issue #35 was originally scoped to scenario modeling (adds / reductions / splits / merges), priority unset. The 2026-04-15 onboarding-toolkit refinement comment added the `analyze-inherited` mode and bumped to priority 1-high, wiring it into Tier A (days 30–60): reads from #23 `/stakeholder-map`, feeds #42 `/strategy-doc`. Prioritization review (2026-06-08) confirmed `analyze-inherited` is the only unbuilt skill plugged into the active onboarding arc; #42's consumer already ships, #23's producer already ships.

**Constraints**:
- Lives inside the per-org `/onboard <org>` workspace (NDA boundary inherited — refuse `interviews/raw/`, consume only `interviews/sanitized/`).
- No HRIS integration (issue requirement). Org structure is supplied manually — conversationally or via a scaffolded seed file. Per memory `onboarding_toolkit_manual_first`, assume manual entry; Calendar is the only trusted auto-source and is not relevant here.
- Descriptive, not prescriptive. Phase 1 produces an analysis of what *is*, never a proposed change. Scenario modeling is Phase 2.
- User is the primary reader; skill is analyst + flag-raiser, not org architect.
- Re-runnable across the days-30–60 window without clobbering user annotations (section-fence sentinels, mirrors `/strategy-doc`).

## Scope

**In scope (Phase 1 — `analyze-inherited`)**:
- `--mode=analyze` (default) descriptive pass at `skills/org-design/SKILL.md`.
- Org-structure input: scaffold `org/structure.md` seed template on first run if absent; otherwise read it. Conversational entry also accepted (skill transcribes into the seed file).
- Cross-reference upstream: stakeholder graph in memory MCP (power / function tags) and `interviews/sanitized/` themes. (Arch-overview is NOT a source — see Inputs.)
- Analyses produced: span of control, single points of failure, on-call burden distribution, skill coverage gaps, manager:IC ratio by team, and "inherited-shape flags" (where the structure implies a prior decision to understand before changing).
- One Mermaid org chart of the **current** inherited structure, annotated with risk flags.
- Output artifact: `decisions/<YYYY-MM-DD>-org-analysis.md` with section-fence sentinels for idempotent re-runs.
- Confidentiality refusal delegated to `skills/onboard/refusal-contract.md` (same path `/strategy-doc` uses).

**Out of scope (Phase 2+)**:
- Scenario modeling — `add-headcount` / `reduce-headcount` / `split-team` / `merge-teams` / `change-reporting`.
- Multi-scenario trade-off matrix + recommended-option output (the issue's original prescriptive capabilities).
- Side-by-side before/after org-chart comparison rendering.
- Deterministic TS scorer for span / ratio math (Phase 1 is LLM counting over a small table; promote only if the math grows — see memory `onboard_fish_vs_ts_inflection`).
- HRIS / directory auto-import.
- Excalidraw rendering (Mermaid only Phase 1; Excalidraw is a Phase 2 option if charts get dense).

## Approach

Markdown-driven skill (Pattern C). SKILL.md instructs Claude to scaffold/read the structure file, cross-reference upstream artifacts, run the six analyses as natural-language reasoning steps, and emit the annotated Mermaid chart. No new scripts Phase 1. Mirrors `/swot`, `/stakeholder-map`, `/strategy-doc` shape.

**Why this layer**: Every Phase-1 analysis is reasoning over a small manually-entered table plus prose upstream artifacts — SPOF inference, skill-gap reading, and inherited-shape flags are inherently LLM judgment, not scriptable. Span-of-control and manager:IC counts are trivially small (a handful of teams); a TS orchestrator would still hand the qualitative work back to an LLM step. Pattern C avoids the harness overhead. Promote to TS in Phase 2 only if scenario math (rebalancing across many moves) makes determinism worth it.

## Invocation

```
/org-design <org> [--mode=analyze]
```

- `<org>` → resolves `~/repos/onboard-<org>/` workspace. Refuse if absent (delegates to onboard workspace-resolution, same as `/strategy-doc`).
- `--mode=analyze` (default, and the only Phase-1 mode) — scaffold-or-read `org/structure.md`, cross-reference upstream, emit/update `decisions/<date>-org-analysis.md`. Scenario modes (`--mode=scenario` et al.) are Phase 2 and refuse with a "Phase 2 — not yet implemented" message.

## Inputs

| Source | Surface | Used for |
|---|---|---|
| Org structure (**sole structural source**) | `org/structure.md` (scaffolded seed) — incl. `Critical systems owned` + `Key skills` columns | span, ratios, on-call, system-ownership SPOF, skill gaps, the chart |
| Stakeholder graph | **local memory MCP** (`mcp__memory__read_graph` / `search_nodes`) — person entities with power/category/function tags | authority/decision-path SPOF (concentration of power) |
| Interview themes | `interviews/sanitized/` (aggregate only) | corroborating signals (e.g. "two teams flag the same overloaded lead") |

**Not an input**: `/architecture-overview` is a **code** landscape (service inventory / dependencies / data-flow / integrations). It carries **no human/team ownership**, so it does NOT source system-ownership SPOF or skill gaps — those come from the manual `org/structure.md` columns. (Verified 2026-06-08 surface scan.) Arch-overview may be read later as Phase-2 corroboration only.

`interviews/raw/` is **never** read — refusal inherited from onboard NDA contract. Stakeholder reads use the same memory MCP that `/stakeholder-map` writes; if memory MCP is unavailable, degrade (see Error Handling).

**`org/structure.md` seed template** (scaffolded on first run; user fills manually):

```markdown
<!-- org-design:structure -->
| Person | Role (M/IC) | Team | Reports to | Critical systems owned | On-call rotation | Key skills |
|--------|-------------|------|------------|------------------------|------------------|-----------|
|        |             |      |            |                        |                  |           |
<!-- /org-design:structure -->
```

## Document Structure

`decisions/<YYYY-MM-DD>-org-analysis.md` — single artifact per analysis (date = creation date; same file re-run across the 30–60 window).

**Sections (canonical order):**

1. **Inherited structure** — annotated Mermaid org chart + one-paragraph plain read of the current shape.
2. **Span of control** — per-manager direct-report counts; flag too-wide (>~7) and too-narrow (1–2, possible layer bloat).
3. **Single points of failure** — per person/role where critical *system* ownership OR *authority/decision* concentration means one departure is load-bearing. Sourced from `org/structure.md` (`Critical systems owned`) × stakeholder power tags (memory).
4. **On-call burden distribution** — rotation load per person/team; flag imbalance.
5. **Skill coverage gaps** — capabilities owned by exactly one person; teams thin on a needed skill. Sourced from structure `Key skills` × arch system needs.
6. **Manager:IC ratio by team** — ratio per team; flag outliers against an org-typical band (stated as observation, not target).
7. **Inherited-shape flags** — places the current structure implies a past decision worth understanding *before* proposing change. Descriptive prompts ("why does Team X own both A and B?"), never recommendations.

**Discipline rationale**: Sections 3–7 describe and flag; none prescribes. The "before changing" framing in Section 7 is the explicit guardrail against premature reorg — mirrors `rules/planning-pipeline.md` (observe before act). Prescription is Phase 2.

**Section-fence sentinels** (idempotent re-runs, same mechanism as `/strategy-doc`):

```markdown
## 3. Single points of failure

<!-- org-design:auto -->
- [SPOF: Jane Doe owns billing-service deploy keys (org/structure.md) AND is sole approver (memory: power=high) — single departure is load-bearing]
- [TODO: confirm secondary owner for payments on-call]
<!-- /org-design:auto -->

User annotations live below the closing fence and survive re-runs.
```

## Modes

### `--mode=analyze` (default)
Scaffold `org/structure.md` if absent (emit seed, instruct user to fill, stop). If present and populated: cross-reference upstream, regenerate `<!-- org-design:auto -->` blocks in `decisions/<date>-org-analysis.md`, preserve user prose below fences, emit the annotated chart.

### Phase 2 modes (refuse in Phase 1)
`--mode=scenario` and named scenario flags emit: `"Scenario modeling is Phase 2 — not yet implemented. Phase 1 supports --mode=analyze (descriptive read of the inherited org) only."`

## Visual Output

One Mermaid org chart of the current structure (reporting lines from the `Reports to` column). Risk annotations inline via node styling/labels: SPOF nodes flagged, too-wide spans marked. Single current-state chart only — before/after comparison is Phase 2. Excalidraw deferred to Phase 2.

## Error Handling

| Condition | Behavior |
|---|---|
| Workspace `~/repos/onboard-<org>/` absent | Refuse; instruct `/onboard <org>` first |
| `org/structure.md` absent | Scaffold seed, instruct fill, stop (not an error) |
| `org/structure.md` present but empty/template-only | Refuse analysis; "structure file has no rows — fill it first" |
| Memory MCP unavailable (no stakeholder graph) | Degrade: run structure-only analyses; flag that authority-SPOF (Section 3) is weaker without power tags. Same memory-down handling `/stakeholder-map` uses |
| `interviews/raw/` access attempted | Hard refuse via onboard refusal-contract |
| Scenario mode requested | Phase-2 refusal message (see Modes) |

Degradation is announced, never silent (memory `feedback_eval_silent_path_prompts` discipline).

## File Layout

```
skills/org-design/
├── SKILL.md                  # Pattern C, mode routing, the 6 analyses + chart steps
├── structure-template.md     # the org/structure.md seed scaffolded on first run
└── analysis-checks.md        # per-section reasoning rules (span thresholds, SPOF inference, ratio bands)
```

Writes into the per-org workspace only:
```
~/repos/onboard-<org>/
├── org/structure.md                          # scaffolded seed, user-filled
└── decisions/<YYYY-MM-DD>-org-analysis.md     # the analysis artifact
```

## Acceptance Criteria

Maps issue #35 body + comment (`analyze-inherited`). Original prescriptive criteria (scenario modeling, trade-off matrix, recommended option) move to Phase 2.

- [ ] Accepts org structure as input — scaffolded `org/structure.md` seed OR conversational entry transcribed into it
- [ ] Produces span-of-control analysis with too-wide / too-narrow flags
- [ ] Surfaces single points of failure (system-ownership AND authority concentration)
- [ ] Reports on-call burden distribution with imbalance flags
- [ ] Reports skill coverage gaps (single-owner capabilities)
- [ ] Reports manager:IC ratio by team
- [ ] Raises inherited-shape flags — descriptive ("understand before changing"), never prescriptive
- [ ] Emits one Mermaid org chart of the current structure, risk-annotated
- [ ] Idempotent re-runs preserve user annotations (section-fence sentinels)
- [ ] Refuses `interviews/raw/`; degrades gracefully (announced) when memory MCP / stakeholder graph unavailable
- [ ] Scenario modes refuse with a Phase-2 message

## Phases

- **Phase 1 (this spec)** — `analyze-inherited` descriptive read. Tier A, days 30–60. **Manual** hand-off to `/strategy-doc` Sections 1 + 3 — the user folds the org-analysis artifact into their notes; strategy-doc does NOT auto-read it. Automated ingestion is a possible Phase 2 of *strategy-doc*, out of scope here (verified 2026-06-08: no strategy-doc read path for org output exists).
- **Phase 2** — scenario modeling (adds / reductions / splits / merges / reporting changes), trade-off matrix, recommended-option output, before/after chart comparison. Days 60+ (once the leader has earned context to propose responsibly). Separate spec.

## Out-of-Scope Notes

- The original #35 prescriptive capabilities are not dropped — they are Phase 2. This spec inverts the issue's original emphasis (scenario-first) to match the onboarding arc: descriptive read at days 30–60 precedes prescriptive modeling at days 60+.
- No memory entity Phase 1 — filesystem artifact only, consistent with `/strategy-doc` Phase 1. Revisit if cross-session continuity friction surfaces.
- TS promotion of span/ratio math deferred to Phase 2 per `onboard_fish_vs_ts_inflection` (stay light until logic dominates).
