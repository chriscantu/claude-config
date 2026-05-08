# /strategy-doc — Senior Eng Leader 90-Day Plan Authoring (Phase 1)

**Date**: 2026-05-07
**Issue**: #42 (re-scoped from "cross-org strategy / RFC authoring" to phased delivery; Phase 1 = `90-day-plan` mode)
**Status**: Design approved

## Problem Statement

**User**: Newly-hired senior engineering leader (Director / VP), days 60–90 of new role. Already has accumulated organizational notes (`/swot`, `/stakeholder-map`, `/architecture-overview` artifacts + free-form `notes/*.md`) inside an `/onboard <org>` workspace.

**Problem**: 90-day-plan deliverable is the artifact the entire onboarding arc feeds. It must distill scattered upstream evidence into a disciplined, evidence-grounded synthesis — without jumping to action before earning the right via observation. Writing it from scratch under W8 deadline pressure invites premature commitment, vague asks, and parking-by-omission rather than parking-by-rationale. Manual collation also re-reads the same upstream artifacts repeatedly across iterations.

**Impact**:
- Premature action commitment → loss of credibility when called to defend evidence behind a "what I am changing" line item.
- Implicit deferrals (problems seen but not addressed, never named) → manager reads as oversight, not discipline.
- Vague asks ("more headcount") → no traction with finance / peers.
- Re-read overhead across W4 interim and W8 final iterations → synthesis fatigue.

**Evidence**: Issue #42 was originally scoped to cross-org strategy / RFC authoring (priority 3-low). The 2026-04-15 onboarding-toolkit refinement comment bumped to priority 1-high after identifying the 90-day-plan as the **deliverable** of the entire onboarding arc — every Tier S / Tier A skill output feeds it.

**Constraints**:
- Lives inside the per-org `/onboard <org>` workspace (NDA boundary inherited).
- Synthesis is inherently LLM work (combining structured upstream + free-form notes into prose) — not scriptable.
- User is the primary reader; skill is collator + critic, not author of opinions.
- Iterative deliverable (W4 interim → W8 final per `/onboard` cadence) — must support re-runs without clobbering user edits.
- Discipline: evidence framing precedes intervention. Section ordering enforces "observe before act."

## Scope

**In scope (Phase 1)**:
- `--mode={draft|review|challenge}` skill at `skills/strategy-doc/SKILL.md`.
- Pulls upstream from SWOT memory entity, stakeholder-map memory entity, `arch/` bundle, `notes/*.md`.
- Writes single artifact `decisions/<YYYY-MM-DD>-90-day-plan.md` with section-fence sentinels for idempotent re-runs.
- Layered challenge pass: completeness → quality → consistency.
- `/present` handoff offered after challenge clean.
- Confidentiality refusal delegated to `skills/onboard/refusal-contract.md` + `onboard-guard.ts refuse-raw`.

**Out of scope (Phase 2+)**:
- Cross-org strategy / RFC mode (`--mode=rfc`).
- Multi-variant export (manager-view / peers-view / reports-view) — deferred until redaction rules designed.
- Memory entity for strategy doc (filesystem-only Phase 1; revisit if cross-session continuity surfaces real friction).
- Multi-org concurrent workspaces.
- Interactive note-capture (`--capture` flag) — user writes `notes/*.md` directly Phase 1.

## Approach

Markdown-driven skill (Pattern C). SKILL.md instructs Claude to perform synthesis, write skeleton, run challenge checks via natural-language steps. No new scripts Phase 1. Mirrors `/swot`, `/stakeholder-map`, `/architecture-overview` shape.

**Why this layer**: Synthesis (combining SWOT entries + stakeholder topology + arch facts + free-form notes into "What I learned" prose) cannot be deterministically scripted. A bash/TS orchestrator would still call out to LLM steps. Pattern C accepts that and avoids the harness overhead. Memory note `/onboard helper fish vs TS inflection` confirms: stay light Phase 1; promote to TS only when shell-tool sequencing or deterministic logic dominates.

## Invocation

```
/strategy-doc <org> [--mode=draft|review|challenge]
```

- `<org>` → resolves `~/repos/onboard-<org>/` workspace. Refuse if absent.
- `--mode=draft` (default) — emit/update skeleton populated from upstream; preserve user edits via section-fence sentinels.
- `--mode=review` — render section-by-section view; no mutation.
- `--mode=challenge` — layered pass; advance to next layer only if prior clean.

## Document Structure

`decisions/<YYYY-MM-DD>-90-day-plan.md` — single artifact per ramp (date in filename = creation date; same file mutated across W4 / W8 iterations).

**7 sections (canonical order):**

1. **What I learned** — synthesis from `/swot` + `/stakeholder-map` + `/architecture-overview` + `notes/*.md`.
2. **What is working** — preserve + amplify; sourced from SWOT strengths + stakeholder allies.
3. **Problems I have observed** — evidence sources + confidence (confirmed / likely). No proposed action; intervention belongs in Section 6.
4. **Problems I suspect** — hunches + what evidence would confirm/refute. Section 6 milestones may target validation directly.
5. **Specific asks** — headcount, budget, scope, authority. Quality gate: numbers + dates required.
6. **30/60/90 milestones** — action commitments with timeline + success criteria. Sole locus of "what I am changing." Problems from Section 3 with sufficient evidence earn slots; Section 4 problems may earn validation milestones.
7. **Risks and dependencies** — owned risks (each with named owner) + cross-team dependencies.

**Discipline rationale**: Sections 3 / 4 / 6 enforce evidence-grounded framing before intervention. Mirrors `rules/planning.md` HARD-GATE (DTP precedes solution design). "Parking" is implicit via Section 3 entries that earn no Section 6 milestone — disciplined non-action, not omission.

**Section-fence sentinels:**

```markdown
## 1. What I learned

<!-- strategy-doc:auto -->
- [SWOT/Strength: Engineering velocity high — see swot/2026-05-04-acme.md L12]
- [Stakeholder: 3 of 8 directors interviewed; engineering ↔ product alignment confirmed]
- [TODO: read arch/data-flow.md and synthesize 1-2 lines]
<!-- /strategy-doc:auto -->

User-written prose lives below the closing fence and is preserved across re-runs.
```

Auto-populated content lives strictly inside fence pairs. Outside-fence content is user-owned and never mutated. Malformed fences (unclosed, mismatched) refuse mutation and emit a damage report.

## Inputs

- **SWOT entity**: `mcp__memory__search_nodes("<Org> SWOT")` → entries by quadrant (S/W/O/T) + landscape tags.
- **Stakeholders entity**: `mcp__memory__search_nodes("<Org> Stakeholders")` → people, roles, relationships, coverage gaps.
- **Architecture bundle**: `arch/{inventory,dependencies,data-flow,integrations}.md` (per `/architecture-overview` 4-file output).
- **Free-form notes**: glob `notes/*.md` (excluding `notes/raw/` if present — refusal-contract).

**Synthesis routing** (formalized in `synthesis.md`):
- SWOT weaknesses + threats → Section 3 if multi-source, Section 4 if single-observation.
- Stakeholder gaps → Section 3 if confirmed (no 1on1 with X yet), Section 4 if pattern-from-thin-data.
- Arch findings → Section 3 (code-grounded).
- Notes hunches → Section 4 default; promote to Section 3 once corroborated by SWOT/stakeholder/arch.

## Modes

### `--mode=draft`

1. Resolve workspace; refuse if missing.
2. Read `decisions/<date>-90-day-plan.md` if exists; identify [TODO] markers + new upstream evidence since last draft.
3. Pull upstream (memory MCP + filesystem).
4. For each [TODO] inside `<!-- strategy-doc:auto -->` fences, populate per `synthesis.md` rules.
5. Write file; preserve outside-fence content.
6. Report: "N sections populated. M [TODO] remain — fill before `--mode=challenge`."

### `--mode=review`

Read-only. Renders section-by-section view to terminal. No mutation. No checks. Visibility pass.

### `--mode=challenge`

Layered pass. Advance only if prior layer clean.

| Layer | Checks | Stop semantics |
|---|---|---|
| 1. Completeness | [TODO] markers? empty sections? | Fail → emit list w/ section anchors. Skip layers 2-3. |
| 2. Quality | Section 5 asks specific (numbers + dates)? Section 6 milestones measurable? Section 7 risks owned? Section 4 has confirm/refute criteria? Section 3 has evidence sources cited? | Fail → emit per-section findings. Layer 3 only on `--continue`. |
| 3. Consistency | Section 6 milestones reference Section 3 / 4 problems? Section 5 asks support Section 6 milestones? 30/60/90 sequencing valid (no W6 dep on W9)? Section 2 + 3 don't contradict each other? | Advisory; emits findings, no fail-stop. |

All 3 clean → offer `/present` handoff for Slidev export.

## Error Handling

**Workspace prereqs:**
- `~/repos/onboard-<org>/` missing → refuse: "Workspace not found. Run `/onboard <org>` first."
- `decisions/` missing → create defensively (matches `/onboard` Phase 1 contract).

**Upstream-input degradation (graceful):**
- Memory MCP unavailable → warn, continue filesystem-only.
- SWOT entity missing → [TODO] in Sections 1-3 with hint "run `/swot <org> --mode=add`".
- Stakeholders entity missing → [TODO] in Sections 1, 7.
- `arch/` empty → skip arch synthesis; [TODO] in Section 1.
- `notes/*.md` empty → skip notes pass; no error.
- **Rule**: missing input never aborts draft. Skill emits whatever skeleton it can; [TODO] markers signal gaps.

**Confidentiality refusal:**
- Read paths resolving inside `notes/raw/` → refuse via `bun run skills/onboard/scripts/onboard-guard.ts refuse-raw <path>`. Same exit-code contract as `/swot`.
- Override policy: see `skills/onboard/refusal-contract.md` (canonical).

**Doc-state errors:**
- Malformed section fences → refuse mutation, emit diff-style damage report, ask user to repair manually. No auto-fix.
- Multi-day overlap (run `--mode=draft` after creation date): glob `decisions/*-90-day-plan.md`; mutate the existing file (latest by mtime if multiple). Do not create a new dated file. Date in filename = creation date only. One artifact per ramp.
- Glob returns multiple files (e.g., user manually created `2026-05-07-90-day-plan.md` and `2026-05-21-90-day-plan.md`): refuse mutation, emit list, ask user to consolidate. One artifact per ramp is invariant.

**Challenge-pass failures:**
- Layer 1 fail → emit [TODO] list, skip 2-3.
- Layer 2 fail → per-section findings; Layer 3 only on `--continue`.
- Layer 3 fail → advisory findings; no stop.

**Export handoff:**
- `/present` unavailable → skip prompt with notice; doc still written.
- Challenge not clean → refuse handoff: "Run `--mode=challenge` to clean before export."

**Conflicting upstream evidence:**
- e.g., SWOT-strength vs notes/X.md-weakness → inline `[CONFLICT: source-A says ..., source-B says ...; resolve before challenge]`. Blocks challenge layer 1.

## File Layout

```
skills/strategy-doc/
  SKILL.md                       # entry: mode routing, prereq check, workspace resolve
  90-day-plan-template.md        # 7-section template w/ [TODO] markers + populate-from-upstream rules
  synthesis.md                   # combine /swot + /stakeholder-map + /arch-overview + notes/*.md
  challenge-checks.md            # layered: completeness → quality → consistency
  export-present.md              # /present handoff Slidev shape
  evals/
    evals.json                   # multi-turn fixtures
  references/                    # deep-dive content as needed
  (no scripts/ Phase 1 — pure markdown)
```

**Reuse:**
- Confidentiality: delegates to `skills/onboard/refusal-contract.md`; reuses `onboard-guard.ts refuse-raw`.
- Workspace resolution: same `~/repos/onboard-<org>/` convention as `/onboard`.
- Memory MCP: reads `<Org> SWOT` + `<Org> Stakeholders` entities (existing).

## Acceptance Criteria

- [ ] `/strategy-doc <org>` refuses if `~/repos/onboard-<org>/` absent.
- [ ] `--mode=draft` emits 7-section skeleton with section-fence sentinels and [TODO] markers populated from upstream evidence.
- [ ] Re-run `--mode=draft` preserves outside-fence user content; refreshes inside-fence auto content.
- [ ] `--mode=review` renders section-by-section; no mutation.
- [ ] `--mode=challenge` runs layered pass; layer 1 fail skips 2-3; layer 2 fail gates layer 3 behind `--continue`; all clean → `/present` handoff.
- [ ] Refusal-contract: paths in `notes/raw/` refused via `onboard-guard.ts refuse-raw`.
- [ ] Memory MCP unavailable → graceful filesystem-only fallback; no abort.
- [ ] Conflicting upstream evidence flagged inline; blocks challenge.
- [ ] Malformed section fences refuse mutation with damage report.
- [ ] Eval suite (`skills/strategy-doc/evals/evals.json`) covers 14 scenarios; `validate.fish` Phase 1n passes (fixture↔eval integrity).
- [ ] All evals tagged `mode:90-day-plan` for filtered runs (Phase 2 RFC mode regression guard).
- [ ] `bin/link-config.fish --check` passes after install.
- [ ] `fish validate.fish` passes.

## Phases

1. **Phase 1 (this spec)**: 90-day-plan mode end-to-end — synthesis, modes, challenge layers, refusal, export handoff.
2. **Phase 2** (separate spec, separate issue): `--mode=rfc` cross-org strategy authoring; multi-variant audience export with redaction rules.
3. **Phase 3+**: interactive `--capture` flag, memory entity if cross-session continuity friction surfaces, multi-org concurrent workspaces.

## Out-of-Scope Notes

- **Cross-org RFC mode**: out of scope Phase 1; the audience, structure (executive summary / problem / landscape / approach / alternatives / trade-offs / ask / success / timeline), and challenge-pass shape differ enough to warrant a separate `--mode=rfc` design.
- **Multi-variant export**: manager-view / peers-view / reports-view requires redaction rules (which asks are confidential? which observations name names?). Defer until Phase 1 doc shape validated against real org.
- **Note-capture UX**: `notes/*.md` filesystem editing is sufficient Phase 1. Revisit if friction surfaces.
- **Memory entity for strategy doc**: filesystem-only Phase 1. Add memory entity only if cross-session continuity ("what did challenge-pass last flag?") becomes a real recurring friction.

---

Source: Issue #42 + 2026-04-15 onboarding-toolkit refinement comment + 2026-05-07 brainstorming session.
