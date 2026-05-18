# Rules Layer Bloat Prune — Design

**Date:** 2026-05-15 (re-measured 2026-05-18)
**Status:** re-measured 2026-05-18; pending plan + implementation
**Scope tier:** B (locked) — consolidate duplicated skip-override prose + audit validators + add telemetry + governance

## Drift note (2026-05-18)

Re-measure at plan-writing time found Stream 1 partially done:

- Per-gate "Pressure-framing floor" and "Skip contract" blocks already trimmed to 5-8 line delegates in all 5 target rules (Phase 1l guard preserved).
- Phase 1o now taken by scope-tier hook artifacts (`validate.fish:931`, `tests/validate-phase-1o.test.ts`, landed 2026-05-17 via #332 chain). New retirement-signals phase reassigned to **1p**.
- Actual remaining duplication = override-clause + time-pressure + emission-contract boilerplate ≈ 74 lines, not 150-200.

Scope adjusted below.

## Problem

Rules layer + validators accrete. No retirement. Skip-override prose ("What counts as an explicit override" + "Time pressure is not an override" + per-rule "Emission contract — MANDATORY" boilerplate) duplicated across 3-4 rules despite memory note `per_gate_floor_blocks_substitutable.md` + ADR #0006 proving substitutability of equivalent boilerplate. Validators at phase 1o. No deprecation mechanism.

Impact: ~7KB rules load per session from this duplication; multi-file maintenance for one mechanic; drift risk grows with anchor edges; rule fatigue; blocks safe addition of agency mechanics.

User: claude-config single maintainer.

## Constraints

- No HARD-GATE regression (DTP front-door, sycophancy floor, disagreement, pr-validation)
- `validate.fish` keeps passing
- Existing evals keep passing
- All changes reversible
- Single-maintainer-friendly (no coordination)

## Sacred (no-touch)

- `rules/planning.md` (anchor — except adding canonical homes for consolidated override + time-pressure + emission-contract content per Stream 1)
- `rules/disagreement.md`
- `rules/pr-validation.md` HARD-GATE body
- `rules/pr-validation.md` L156-166 autonomous-loop-exits block (unique content)
- `tests/validate-phase-1l.test.ts`
- `tests/validate-phase-1o.test.ts` (scope-tier hook, issue #332 chain)
- sycophancy eval substrate
- `CLAUDE.md`

## Approach — Lean Prune + Telemetry + Mechanical Governance

Three coordinated work streams. Aggressive prune now. Telemetry-paired soft-retire for validator phases. Phase 1p mechanically surfaces future retirement candidates.

### Stream 1 — Override-clause + time-pressure + emission-boilerplate consolidation

Delete duplicated skip-override prose from delegate rules. Move canonical text to new anchors in `rules/planning.md`. Keep pressure-framing-floor delegate (already minimal, Phase 1l-guarded) and unique per-rule content.

Target rules + blocks to delete:

| Rule | Block | Approx lines |
|---|---|---|
| `rules/fat-marker-sketch.md` | "What counts as an explicit override" L26-36 + "Time pressure is not an override" L38-41 | 15 |
| `rules/goal-driven.md` | "What counts as an explicit override" L51-59 + "Time pressure is not an override" L61-63 + "Emission contract — MANDATORY" L74-81 | 20 |
| `rules/pr-validation.md` | "What counts as an explicit override" L123-132 + "Time pressure is not an override" L134-136 + "Emission contract — MANDATORY" L147-154 (KEEP L156-166 autonomous-loop-exits) | 21 |
| `rules/think-before-coding.md` | "What counts as an explicit override" L104-110 + "Time pressure is not an override" L112-113 + "Emission contract — MANDATORY" L115-123 | 18 |
| `rules/execution-mode.md` | (no override/time-pressure block present; touch only if pressure-framing-floor delegate needs delegate-link refresh after planning.md anchor add) | 0 |

Net delete ~74 lines across 4 rules. Each deleted block replaced by one-line delegate-link to new anchor in `rules/planning.md` (~5 lines added net per rule → ~20 lines added; net file delta ~54 lines).

Anchors to add in `planning.md`:
- `#override-skip-contract` — canonical "What counts as an explicit override" + "Time pressure is not an override" text (single section)
- `#emission-contract-per-gate` — canonical "Emission contract — MANDATORY" boilerplate with gate-name table (gate / verbatim clause / tool call pattern)

Evidence: memory note `per_gate_floor_blocks_substitutable.md` + ADR #0006. No new evals required; existing HARD-GATE eval suite catches regression. Phase 1l registry expanded with two new anchors.

### Stream 2 — Validator audit + soft-retire

Per-phase 3-evidence rule:

1. README documented lineage (Phase 1f→#135 pattern)
2. Git blame on phase code → origin commit → PR description
3. Code-read → name regression class

Decision:
- ≥1 of 3 → KEEP (file follow-up doc-task if README lineage missing)
- 0 of 3 → soft-retire

Soft-retire = tombstone + comment-out + `.skip()` on TS test. Tombstone format:

```fish
# RETIRED YYYY-MM-DD — <reason>
# Restore: uncomment block + drop .skip on tests/validate-phase-1X.test.ts
```

Hard-delete deferred. Triggered by Phase 1p WARN (≥12mo + zero log activity).

Keep-list (lineage confirmed): 1f, 1g, 1j, 1l, 1n.
Audit-list (unknown): 1a-1e, 1h-1i, 1k. Decision made at commit-3 execution time; matrix logged in commit message.

### Stream 3 — Telemetry + mechanical governance

**Phase-log writer.** `validate.fish --log-path .claude/state/validate-phase-log.jsonl`. JSONL per phase per run:

```json
{"ts":"2026-05-15T20:30:00Z","commit":"abc123","phase":"1f","status":"pass","duration_ms":12}
```

Default path documented; auto-create on first run; `.claude/state/` already gitignored.

**Phase 1p — Retirement Signals.** New validator phase (note: 1o already taken by scope-tier hook artifacts; this is the next free slot), 3 checks:

| Check | Severity | Logic |
|---|---|---|
| Tombstone format | HARD-FAIL | Commented `# function _phase_*` blocks must carry tombstone with date + reason + restore |
| Retirement candidate | WARN | Active phase with 0 firings in last 100 runs (silent if log <10 entries) |
| Hard-delete eligible | WARN | Soft-retired phase ≥12mo old + 0 log activity since |

WARN routes to `stderr` + `validate.fish` final summary section. HARD-FAIL exits non-zero.

**README governance.** New H2 in `rules/README.md` — "Retiring a rule or validator phase". Soft-retire procedure, hard-delete procedure, override-clause delegation note. ~30 lines. Thin pointer; Phase 1p owns enforcement.

## Architecture

```
        rules/planning.md (anchor + new override + emission anchors)
                          │
                          │ delegate-link (single line per rule, expanded)
                          ▼
        4 delegate rules — override + time-pressure + emission
        boilerplate consolidated (~74 lines duplicated prose gone,
        ~20 lines delegate added → ~54 net delete)
                          │
                          │ validation
                          ▼
                    validate.fish
                          │
              ┌───────────┼───────────┐
              ▼           ▼           ▼
        Phases 1a-1o   Phase 1p   Log writer
        (audited;     (retirement (.claude/state/
         some soft-    signals)    validate-phase-
         retired)                  log.jsonl)
                          │
                          │ reads log + scans tombstones
                          ▼
                  WARN/FAIL output → maintainer
```

## Components

| Component | Type | Touched | Responsibility |
|---|---|---|---|
| 4 delegate rules (fms, gd, pr-val, tbc) | edit | strip override + time-pressure + emission boilerplate | Body, HARD-GATE, unique content preserved |
| `rules/execution-mode.md` | edit (minor) | only if delegate-link refresh needed | Already has no override block |
| `rules/planning.md` | edit | add `#override-skip-contract` + `#emission-contract-per-gate` anchors | Canonical home for consolidated content |
| `validate.fish` | edit | major | Phase 1l registry update (2 new anchors) + log writer + Phase 1p |
| `tests/validate-phase-1l.test.ts` | edit | minor | Registry mirror |
| `tests/validate-phase-1p.test.ts` | new | full | Synthetic fixtures for 3 checks |
| `tests/validate-phase-1X.test.ts` (retired) | edit | per-phase | `.skip()` + tombstone |
| `.claude/state/validate-phase-log.jsonl` | new | bootstrap | Append-only telemetry |
| `.claude/memory/per_gate_floor_blocks_substitutable.md` | edit | past-tense | Cite prune commit SHA |
| `rules/README.md` | edit | new section | Governance + Phase 1p reference |

## Data flow

1. Maintainer runs `validate.fish` (pre-commit or CI)
2. Each phase fires → status + duration written to JSONL log
3. Phase 1p (last in order) reads log + scans validate.fish for tombstones
4. Phase 1p emits WARN for retirement candidates + aging soft-retires; HARD-FAIL on malformed tombstones
5. Maintainer reads output; acts on warnings via Retirement procedures in README

## Error handling

| Failure | Detection | Response |
|---|---|---|
| Phase 1l registry desync | Phase 1l fails in commit 1 | Atomic update — registry edit in same commit as floor-block delete |
| Floor-block load-bearing (eval regression) | HARD-GATE eval fails post-commit 1 | Revert commit 1; investigate which floor block was load-bearing |
| Soft-retired phase silently load-bearing | Future incident OR Phase 1p never warns | Uncomment + drop `.skip` (one-line revert) |
| Phase 1p false-positive WARN | CI noise | Tune threshold (silent-below-N-entries) |
| Log writer perf regression | Pre-push validate.fish timing | Async write or batch flush |
| Log file growth unbounded | Disk usage | Defer; rotate at >1MB in follow-up |

## Testing

Per-commit verification:

```bash
fish validate.fish              # exit 0
bun test tests/                 # exit 0; skipped tests named
# HARD-GATE eval suite: sycophancy, DTP front-door, disagreement, pr-validation, agency
```

Phase 1p test fixtures (`tests/validate-phase-1p.test.ts`):
- Synthetic log with 0-firing phase → expect WARN
- Synthetic tombstoned phase aged ≥12mo + 0 firings → expect hard-delete WARN
- Synthetic commented `# function _phase_*` without tombstone → expect HARD-FAIL
- Synthetic log <10 entries → expect silent (no WARN)

PR-level test plan (executed at readiness):

- [ ] `fish validate.fish` exits 0 from clean checkout
- [ ] `bun test tests/` exits 0
- [ ] HARD-GATE evals pass
- [ ] Token delta measured (`wc -c rules/*.md` before/after)
- [ ] Phase 1p WARN output sanity-checked against scratch log
- [ ] `git diff --stat main...HEAD` quoted in PR body

## Execution mode

**[Execution mode: single-implementer]** Plan: 4 atomic commits, ~110 LOC new (Phase 1p + tests), mostly deletions/comment-outs, low integration coupling. Final comprehensive review only.

## Commit shape

```
Commit 1: Rule prune + Phase 1l registry + memory note
Commit 2: Phase-log writer + .claude/state confirm + initial log
Commit 3: Validator audit — soft-retire phases via tombstone + .skip
Commit 4: Phase 1p + tests/validate-phase-1p.test.ts + README governance
```

Each commit independently revertable. No one-way doors.

## Acceptance criteria

1. `wc -l rules/*.md` shows ≥50-line net reduction across 4 target rules; measured delta reported in commit 1 body (target ~54 lines net; floor 50)
2. `fish validate.fish` exits 0 on clean tree
3. `bun test tests/` exits 0 (`.skip` reports acceptable)
4. HARD-GATE eval suite passes unchanged
5. `tests/validate-phase-1p.test.ts` covers all 3 retirement-signal checks
6. `rules/README.md` includes governance H2 with retirement procedure
7. `.claude/memory/per_gate_floor_blocks_substitutable.md` past-tense + cites commit 1 SHA
8. `validate.fish --log-path …` produces valid JSONL
9. `rules/planning.md` contains `<a id="override-skip-contract">` and `<a id="emission-contract-per-gate">` anchors; Phase 1l registry includes both

## Open questions — defaults accepted

- Phase 1p WARN routing → `stderr` + final-summary section
- Log retention → no rotation initially; revisit at >1MB
- Phase ordering → last (observes other phases)
- Eval coverage for Phase 1p → TS test only; no separate eval suite entry
- Audit decision matrix → runtime in commit 3; table logged in commit message
- Schedule reminder → none; trust Phase 1p WARN

## Out of scope

- ADR retrospective
- Rule-firing telemetry (session-log grep / per-rule eval coverage)
- New-phase metadata enforcement (Phase 1q preventive — defer)
- Rule budget cap rule
- Agency mechanics (separate work stream)

## Risk → Mitigation summary

| Risk (from systems-analysis) | Mitigation |
|---|---|
| Phase 1l atomic update | Commit 1 bundles registry edit (2 new anchors) with prune |
| Validator retirement silent regression | 3-evidence audit + soft-retire (commit 3) + Phase 1p monitoring (commit 4) |
| Governance form bloat-or-invisible | Phase 1p mechanical enforcement; README thin pointer |
| Spec drift between authoring + execution | Re-measure at plan-time (this revision, 2026-05-18); planner re-measures on each subsequent revisit; acceptance criterion #1 reports measured delta, not absolute target |
| Phase number collision (1o taken post-spec) | Reassigned to 1p; 1p preventive concept renamed to 1q (out-of-scope) |

## Next

Spec self-review → user review → invoke `superpowers:writing-plans` for implementation plan.
