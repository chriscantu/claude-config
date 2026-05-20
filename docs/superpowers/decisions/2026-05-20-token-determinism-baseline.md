# Token-load + Determinism Baseline

**Date:** 2026-05-20
**Scope:** claude-config single-repo. Measurement-first artifact before any optimization PR.
**Method:** static byte-count of auto-injected context + dry-run eval substrate. No live API spend (per user constraint).

## Problem

User asked whether to use `code-review-swarm` (ruflo) for project-wide architectural analysis + token-usage optimization. Pushed back: ruflo is diff-shaped, not measurement-shaped. Agreed to scope a baseline first — without numbers, "optimize" is guesswork.

## Per-prompt token budget

| Component | Tokens | % of measured |
|---|---|---|
| `~/.claude/rules/*.md` (10 files) | ~17,794 | 38% |
| Skill enumeration (~200 plugin + 19 local) | ~7,500 | 16% |
| `rules/README.md` (largest single rule) | ~3,951 | 8% |
| `~/.claude/CLAUDE.md` | ~2,058 | 4% |
| Project `CLAUDE.md` | ~1,607 | 3% |
| Memory index + hook output + resume pack | ~1,512 | 3% |
| **Subtotal measured** | **~32,471** | **70%** |
| Claude Code core system prompt (unmeasured) | ~10,000-15,000 | ~30% |
| **Estimated per-prompt baseline** | **~42,000-48,000 tok** | 100% |

**Implication:** ~22-24% of 200K context consumed before user input. ~28-32% of usable budget after typical 150K compression trigger.

## Top rule offenders

| File | Tokens | % of rules |
|---|---|---|
| `planning.md` | 5,272 | **27%** |
| `rules/README.md` | 3,951 | 20% |
| `pr-validation.md` | 2,070 | 10% |
| `think-before-coding.md` | 1,528 | 8% |
| `execution-mode.md` | 1,110 | 6% |
| `goal-driven.md` | 1,018 | 5% |

`planning.md` + `rules/README.md` = 47% of rule budget. Both anchor multiple downstream rules — high read-frequency, low prune ROI without breaking the substrate.

## Structural inventory

| Area | Files | LOC |
|---|---|---|
| rules/ | 11 | 1,436 |
| skills/ | 19 | 12,231 |
| agents/ | 5 | 496 |
| commands/ | 2 | 79 |
| hooks/ | 2 | 814 |
| rules-evals/ | 7 suites | 1,263 |
| adrs/ | 13 | 2,464 |
| docs/ | — | 7,437 |
| tests/ | 22 ts | 25,063 |

**Delegation graph:** `planning.md` is the hub. `#pressure-framing-floor` referenced by 6 rules; `#emission-contract` by 5; `#emergency-bypass-sentinel` by 4. Validates `per_gate_floor_blocks_substitutable.md` memory — single anchor sufficient, no layered duplication.

## Eval substrate

- 136 evals / 415 assertions across 7 rules-evals suites + 7+ skill-evals suites
- Dry-run: 100% schema validity, 18ms @ `--concurrency=4` (PR #363 substrate)
- Live determinism baseline: **NOT MEASURED** — requires API spend, deferred

## Top-5 token-load reduction candidates (ranked by ROI)

1. **rules/README.md trim or split (3,951 tok)** — 8-cap policy + retroactive audit + Stable anchor pattern + Phase descriptions are concatenated. Split governance (cap policy) from operational (Phase descriptions). Audit could move to ADR. Est. -1,500 tok with no semantic loss. **Discriminating eval:** would need to show no regression in HARD-GATE cap enforcement after split.
2. **planning.md DTP block consolidation (5,272 tok)** — DTP step alone is ~1,800 tokens with nested scope-tier hook + pressure-framing floor + emission contract + sentinel bypass + bare-brainstorm carve-out. Sub-blocks already delegate via anchors but the inline expansion repeats logic. Est. -800 tok. **Risk:** high — this is the most-load-bearing rule. Discriminating eval gap exists per memory note `per_gate_floor_blocks_substitutable.md`.
3. **Skill enumeration auto-load (~7,500 tok)** — every session lists ~200 plugin skills with descriptions. Only a fraction are used per session. Lazy-load via ToolSearch already exists for tools; explore extending to skill descriptions. **Blocker:** Claude Code core behavior, not repo-controlled. File as upstream feedback, not a local change.
4. **Auto-memory resume pack (~500 tok per session)** — currently includes "Also Recently in This Project" block with last 3 session digests. Low signal density. Trim to 1 latest, or make on-demand. Est. -300 tok per session.
5. **pr-validation.md trigger-surface table (2,070 tok)** — speech-act + action-bound triggers + locator contract + per-state behavior table are verbose. Could compress without losing enforceability. Est. -400 tok.

**Total estimated reduction from #1, #2, #4, #5: ~3,000 tok per session (~7% of measured baseline).** Not transformative, but compounds across high-frequency sessions.

## Top-5 determinism risks (without live eval data)

1. **No live-run cost telemetry** — eval substrate measures pass/fail but not cost-per-eval. Optimizing prompts blind to cost regression.
2. **136-eval suite not run in CI** — local-only dry-run gates merge per `rules/pr-validation.md`. Live eval runs are manual + cost-gated.
3. **Skill enumeration drift** — plugin skills update independently of repo. Auto-memory baseline drift undetected.
4. **`scope-tier-memory-check.sh` hook fires before rule load** — no test coverage for hook + rule interaction under sentinel-bypass conditions (rules-evals/scope-tier-memory-check has 10 evals; covers routing but not hook-absence/sentinel combinatorics).
5. **Tier-criteria canonical-string** — Phase 1g validator guards restatement but not semantic drift (could legally rephrase + change meaning).

## Candidate ADRs (each requires discriminating eval per ADR #0005)

| Candidate | Discriminating eval shape |
|---|---|
| Split `rules/README.md` governance vs operational | Eval suite proves HARD-GATE cap enforcement unchanged after split |
| Lazy-load auto-memory "Also Recently" block | Eval proves memory-discipline rule still fires on stored entries when deferred-loaded |
| Add cost-per-eval telemetry to `eval-runner-v2.ts` | Eval proves cost field appears in summary output for live runs |
| Compress pr-validation.md locator-contract table | Eval proves all PR-readiness assertions still pass after compression |

## Side-finding

Skill `improve-codebase-architecture` (211 LOC) exists in this repo and is the canonical single-repo arch tool per `architecture-overview` description ("Do NOT use for single-repo grading"). Initial recommendation to use `architecture-overview` was wrong. Manual structural inventory above substitutes; running `improve-codebase-architecture` is the proper next step if deeper structural review wanted.

## Next steps

1. User decides which of the top-5 reduction candidates to pursue. Each gets its own `/adr` + discriminating eval per [ADR #0005](../../adrs/0005-behavioral-adr-promotion-requires-discriminating-signal.md).
2. Phase 3 live determinism baseline deferred until cost authorized.
3. If deeper structural review wanted: run `improve-codebase-architecture` skill (not done here).

## Constraint reminder

User declined live API spend for PR #363 (~$0.50-2). Same constraint applied to this baseline — Phase 3 live-run not executed. Any optimization PR that touches eval-substrate logic should re-evaluate this constraint at merge time.
