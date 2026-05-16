# Rules Layer Bloat Prune — Design

**Date:** 2026-05-15
**Status:** approved by maintainer; pending plan + implementation
**Scope tier:** B (locked) — prune per-gate floor blocks + audit validators + add telemetry + governance

## Problem

Rules layer + validators accrete. No retirement. Per-gate floor blocks duplicated across 5 rules despite memory note `per_gate_floor_blocks_substitutable.md` + ADR #0006 proving substitutability. Validators at phase 1n. No deprecation mechanism.

Impact: ~20KB rules load per session; multi-file maintenance for one mechanic; drift risk grows with anchor edges; rule fatigue; blocks safe addition of agency mechanics.

User: claude-config single maintainer.

## Constraints

- No HARD-GATE regression (DTP front-door, sycophancy floor, disagreement, pr-validation)
- `validate.fish` keeps passing
- Existing evals keep passing
- All changes reversible
- Single-maintainer-friendly (no coordination)

## Sacred (no-touch)

- `rules/planning.md` (anchor)
- `rules/disagreement.md`
- `rules/pr-validation.md` HARD-GATE body
- `tests/validate-phase-1l.test.ts`
- sycophancy eval substrate
- `CLAUDE.md`

## Approach — Lean Prune + Telemetry + Mechanical Governance

Three coordinated work streams. Aggressive prune now. Telemetry-paired soft-retire for validator phases. Phase 1o mechanically surfaces future retirement candidates.

### Stream 1 — Floor-block prune

Delete per-gate floor blocks from 5 delegate rules. Keep single-line delegate prose to `planning.md` anchor → Phase 1l registry unaffected.

Target rules:
- `rules/fat-marker-sketch.md`
- `rules/goal-driven.md`
- `rules/pr-validation.md` (floor-block only; HARD-GATE body sacred)
- `rules/execution-mode.md`
- `rules/think-before-coding.md`

Net delete ~150-200 lines.

Evidence: memory note `per_gate_floor_blocks_substitutable.md` + ADR #0006. No new evals required; existing HARD-GATE eval suite catches regression.

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

Hard-delete deferred. Triggered by Phase 1o WARN (≥12mo + zero log activity).

Keep-list (lineage confirmed): 1f, 1g, 1j, 1l, 1n.
Audit-list (unknown): 1a-1e, 1h-1i, 1k. Decision made at commit-3 execution time; matrix logged in commit message.

### Stream 3 — Telemetry + mechanical governance

**Phase-log writer.** `validate.fish --log-path .claude/state/validate-phase-log.jsonl`. JSONL per phase per run:

```json
{"ts":"2026-05-15T20:30:00Z","commit":"abc123","phase":"1f","status":"pass","duration_ms":12}
```

Default path documented; auto-create on first run; `.claude/state/` already gitignored.

**Phase 1o — Retirement Signals.** New validator phase, 3 checks:

| Check | Severity | Logic |
|---|---|---|
| Tombstone format | HARD-FAIL | Commented `# function _phase_*` blocks must carry tombstone with date + reason + restore |
| Retirement candidate | WARN | Active phase with 0 firings in last 100 runs (silent if log <10 entries) |
| Hard-delete eligible | WARN | Soft-retired phase ≥12mo old + 0 log activity since |

WARN routes to `stderr` + `validate.fish` final summary section. HARD-FAIL exits non-zero.

**README governance.** New H2 in `rules/README.md` — "Retiring a rule or validator phase". Soft-retire procedure, hard-delete procedure, floor-block delegation note. ~30 lines. Thin pointer; Phase 1o owns enforcement.

## Architecture

```
                  rules/planning.md (anchor — sacred)
                          │
                          │ delegate-link (single line, kept)
                          ▼
        5 delegate rules — floor blocks deleted (~150 lines gone)
                          │
                          │ validation
                          ▼
                    validate.fish
                          │
              ┌───────────┼───────────┐
              ▼           ▼           ▼
        Phases 1a-1n   Phase 1o   Log writer
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
| 5 delegate rules | edit | strip floor blocks | Body + delegate prose preserved |
| `validate.fish` | edit | major | Phase 1l registry update + log writer + Phase 1o |
| `tests/validate-phase-1l.test.ts` | edit | minor | Registry mirror |
| `tests/validate-phase-1o.test.ts` | new | full | Synthetic fixtures for 3 checks |
| `tests/validate-phase-1X.test.ts` (retired) | edit | per-phase | `.skip()` + tombstone |
| `.claude/state/validate-phase-log.jsonl` | new | bootstrap | Append-only telemetry |
| `.claude/memory/per_gate_floor_blocks_substitutable.md` | edit | past-tense | Cite prune commit SHA |
| `rules/README.md` | edit | new section | Governance + Phase 1o reference |

## Data flow

1. Maintainer runs `validate.fish` (pre-commit or CI)
2. Each phase fires → status + duration written to JSONL log
3. Phase 1o (last in order) reads log + scans validate.fish for tombstones
4. Phase 1o emits WARN for retirement candidates + aging soft-retires; HARD-FAIL on malformed tombstones
5. Maintainer reads output; acts on warnings via Retirement procedures in README

## Error handling

| Failure | Detection | Response |
|---|---|---|
| Phase 1l registry desync | Phase 1l fails in commit 1 | Atomic update — registry edit in same commit as floor-block delete |
| Floor-block load-bearing (eval regression) | HARD-GATE eval fails post-commit 1 | Revert commit 1; investigate which floor block was load-bearing |
| Soft-retired phase silently load-bearing | Future incident OR Phase 1o never warns | Uncomment + drop `.skip` (one-line revert) |
| Phase 1o false-positive WARN | CI noise | Tune threshold (silent-below-N-entries) |
| Log writer perf regression | Pre-push validate.fish timing | Async write or batch flush |
| Log file growth unbounded | Disk usage | Defer; rotate at >1MB in follow-up |

## Testing

Per-commit verification:

```bash
fish validate.fish              # exit 0
bun test tests/                 # exit 0; skipped tests named
# HARD-GATE eval suite: sycophancy, DTP front-door, disagreement, pr-validation, agency
```

Phase 1o test fixtures (`tests/validate-phase-1o.test.ts`):
- Synthetic log with 0-firing phase → expect WARN
- Synthetic tombstoned phase aged ≥12mo + 0 firings → expect hard-delete WARN
- Synthetic commented `# function _phase_*` without tombstone → expect HARD-FAIL
- Synthetic log <10 entries → expect silent (no WARN)

PR-level test plan (executed at readiness):

- [ ] `fish validate.fish` exits 0 from clean checkout
- [ ] `bun test tests/` exits 0
- [ ] HARD-GATE evals pass
- [ ] Token delta measured (`wc -c rules/*.md` before/after)
- [ ] Phase 1o WARN output sanity-checked against scratch log
- [ ] `git diff --stat main...HEAD` quoted in PR body

## Execution mode

**[Execution mode: single-implementer]** Plan: 4 atomic commits, ~110 LOC new (Phase 1o + tests), mostly deletions/comment-outs, low integration coupling. Final comprehensive review only.

## Commit shape

```
Commit 1: Rule prune + Phase 1l registry + memory note
Commit 2: Phase-log writer + .claude/state confirm + initial log
Commit 3: Validator audit — soft-retire phases via tombstone + .skip
Commit 4: Phase 1o + tests/validate-phase-1o.test.ts + README governance
```

Each commit independently revertable. No one-way doors.

## Acceptance criteria

1. `wc -c rules/*.md` shows ≥150-line reduction
2. `fish validate.fish` exits 0 on clean tree
3. `bun test tests/` exits 0 (`.skip` reports acceptable)
4. HARD-GATE eval suite passes unchanged
5. Phase 1o test fixture covers all 3 checks
6. `rules/README.md` includes governance H2 with retirement procedure
7. `.claude/memory/per_gate_floor_blocks_substitutable.md` past-tense + cites commit 1 SHA
8. `validate.fish --log-path …` produces valid JSONL

## Open questions — defaults accepted

- Phase 1o WARN routing → `stderr` + final-summary section
- Log retention → no rotation initially; revisit at >1MB
- Phase ordering → last (observes other phases)
- Eval coverage for Phase 1o → TS test only; no separate eval suite entry
- Audit decision matrix → runtime in commit 3; table logged in commit message
- Schedule reminder → none; trust Phase 1o WARN

## Out of scope

- ADR retrospective
- Rule-firing telemetry (session-log grep / per-rule eval coverage)
- New-phase metadata enforcement (Phase 1p preventive — defer)
- Rule budget cap rule
- Agency mechanics (separate work stream)

## Risk → Mitigation summary

| Risk (from systems-analysis) | Mitigation |
|---|---|
| Phase 1l atomic update | Commit 1 bundles registry edit with prune |
| Validator retirement silent regression | 3-evidence audit + soft-retire (commit 3) + Phase 1o monitoring (commit 4) |
| Governance form bloat-or-invisible | Phase 1o mechanical enforcement; README thin pointer |

## Next

Spec self-review → user review → invoke `superpowers:writing-plans` for implementation plan.
