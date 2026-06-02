---
name: ring-review-tiered
description: >
  Use when the user says /ring-review-tiered, "ring review these PRs", "antagonistic
  ring on this batch", "review PR #N with the ring", or asks to run adversarial /
  critic review across one or more pull requests. Calibrates critic count to per-PR
  risk tier — trivial PRs skip the ring, surgical PRs get one cross-dimension critic,
  medium PRs get two dimension-targeted critics, large/boundary/security PRs get the
  full 4-critic ring plus arbiter. Use even when the user names a uniform critic
  count — surface the tier and let them override. Do NOT use for solo single-PR
  review where the user explicitly asks for the full ring; that's `pr-review-toolkit:review-pr`.
---

# Tiered Antagonistic Ring Review

Dispatches the antagonistic ring (security, performance, scope, test-gap critics
plus an arbiter) at a per-PR risk-calibrated intensity. The uniform 4-critic ring
on every PR is theater on trivial work — burns tokens and produces low marginal
signal. This skill picks the right N critics per PR, runs them in parallel,
ranks findings by convergence, and emits a per-PR merge verdict.

## Why this exists

A real batch ran the uniform 4×4 ring across mixed-size PRs and hit ~30-40 %
signal: real defects converged on 3 findings across 16 critic dispatches. The
binary-only and 2-file surgical PRs burned 8 critic dispatches for one real
catch each. Calibrating intensity to risk recovers the wasted critic budget for
work that actually moves the merge decision.

The tier table below is canonical. It comes from a project-memory entry, and
both copies must stay in sync. If you find yourself wanting to "improve" the
table, update the source memo first.

## Arguments

- `<pr-numbers>` — one or more PR numbers (e.g., `168 170 171 169`)
- `--repo <owner/name>` — optional override; default uses the current git remote
- `--force-tier <trivial|surgical|medium|large>` — optional per-batch override
  when the user explicitly disagrees with the auto-classification. Announce the
  override; do not silently honor it.

## Workflow

### Step 1: Classify each PR

For each PR, gather signals via `gh`:

```
gh pr diff <N> --name-only
gh pr diff <N> | git apply --numstat -
gh pr view <N> --json files,additions,deletions,title,labels
```

Compute:

- **File count** — number of changed paths
- **LOC delta** — `additions + deletions` from the JSON view
- **Boundary crossing** — any changed path matching the project's documented
  boundary list. For a Chrome / Safari MV3 codebase that means: `src/core/` ↔
  `src/chrome/` cross, anything under `manifest`, `background/`, `content/`,
  `storage`, `messaging`, `WAR` (web-accessible resources), `permissions`. If
  the project has its own boundary doc (CLAUDE.md, ARCHITECTURE.md), prefer
  that list — ask once, then cache the answer for the batch.
- **Security-adjacent** — paths or titles touching auth, permissions, storage,
  IPC, CSP, content-security-policy, sandbox, eval, innerHTML, postMessage,
  cookies, secrets, env vars.
- **Load-bearing invariant** — keywords in title / changed files for debounce,
  idempotency, listener cleanup, race, retry, lock, queue.

### Step 2: Map signals to tier (canonical table)

This table is sourced verbatim from `feedback-ring-calibration-by-risk` in
project auto-memory. Do not paraphrase. If the project carries no such memo,
default to this table.

| Tier | Trigger | Dispatch |
|---|---|---|
| Trivial | binary-only, single-line edit, typo, dep bump | Skip ring. CI + adversarial-self brief suffice. |
| Surgical | ≤4 tasks, single file, ≤50 LOC TDD increment, no boundary crossing | 1 cross-dim critic (combined security/perf/scope/test-gap pass). |
| Medium | 1 boundary cross, ~100-300 LOC, 2-5 files | 2 critics: pick the 2 dimensions most relevant (e.g., security+test-gap for storage, perf+scope for hot-path) |
| Large/boundary/security | >10 files, >300 LOC, core↔chrome boundary, messaging, manifest, storage, load-bearing invariants (debounce/idempotency/listener cleanup) | Full 4-critic ring + arbiter |

Tie-break when multiple tiers fit: pick the **higher** tier. Convergence is
the primary signal; missing a critic on a security PR is worse than running a
needless one on a docs PR.

### Step 3: Announce the tier per PR

Before dispatching, emit one line per PR so the user can intercept a
miscalibration cheaply:

> **PR #168** → tier: trivial (binary-only icon PNGs, 4 files, 0 LOC functional). **Skip ring.**
> **PR #170** → tier: surgical (2 files, 18 LOC, no boundary). **1 cross-dim critic.**
> **PR #171** → tier: medium (3 files, 142 LOC, popup ↔ storage boundary). **2 critics: security + test-gap.**
> **PR #169** → tier: large (16 files, 312 LOC, manifest + WAR + CSP). **Full ring + arbiter.**

If `--force-tier` was passed, name it explicitly:

> **PR #170** → auto-tier: surgical; **user override: medium**. 2 critics dispatched.

### Step 4: Dispatch in parallel

Spawn the right N critics per PR in a single tool-use batch. Each critic is a
subagent (`Agent` tool) with the appropriate `subagent_type`:

| Dimension | `subagent_type` |
|---|---|
| Security | `security-adversary` |
| Performance | `perf-adversary` |
| Scope (Karpathy #3) | `scope-adversary` |
| Test gap | `test-gap-adversary` |

For surgical-tier (single cross-dim critic), use `code-analyzer` with a brief
asking it to apply security / perf / scope / test-gap heuristics in one pass —
this is cheaper than 4 separate adversaries when there's almost certainly only
one finding to catch.

Each critic brief includes:
- PR number and diff fetch instructions
- The dimension(s) it owns
- "Convergence is the primary signal — flag a finding only if you'd defend it
  under cross-examination from the other critics"
- Output contract: a ranked finding list `{severity, location, claim, fix}`

### Step 5: Convergence-rank findings

Once critics return, merge their finding lists. Rank by convergence:

- **HIGH** — 2+ critics named the same location / claim
- **MEDIUM** — 1 critic, severity high, defensible reasoning
- **LOW** — 1 critic, severity low, or speculative

Drop LOW unless the PR is large/boundary/security (where weak signals deserve
a second look).

### Step 6: Arbiter pass (large tier only)

Spawn `arbiter` subagent with the merged finding list. Arbiter de-duplicates,
ranks top-N, and emits a single `SUMMARY.md`. On surgical/medium tiers the
coordinator does this inline — an arbiter dispatch costs more than it saves on
small finding lists.

### Step 7: Emit per-PR verdict

For each PR, emit one of:

- **MERGE** — no findings ≥ MEDIUM
- **HOLD-with-fixes** — MEDIUM findings exist; list them and the suggested fix
- **BLOCK** — HIGH findings exist; merging would land a known defect

Group by verdict for the batch summary so the user can act on MERGE PRs first
and route HOLD/BLOCK PRs to a fix builder.

## When NOT to use

- Solo single-PR review where the user has explicitly asked for the full ring
  — that's `pr-review-toolkit:review-pr`. Skipping the calibration step is the
  whole point of that command.
- Pre-merge sanity checks that don't need adversarial framing — use
  `caveman-review` for terse single-PR review.
- Cross-repo impact questions — use `cross-project`.

## Common mistakes

- **Treating "user said run the ring" as a license to skip Step 1**. The
  calibration is the value-add; emit the tier even when overriding to full.
- **Letting one critic's verbose finding list inflate the verdict**. A wall of
  LOW findings from one critic is not BLOCK material — convergence is the
  signal.
- **Forgetting the surgical-tier `code-analyzer` route**. Dispatching 4 separate
  adversaries on a 2-file PR is exactly the theater this skill exists to
  prevent.
- **Silently honoring `--force-tier`**. The override is fine; hiding it from the
  user defeats the audit trail.

## Linked policies

- `feedback-ring-calibration-by-risk` — canonical tier table source
- `feedback-antagonistic-ring-patterns` — convergence is primary signal
- `feedback-builders-self-pushback` — builders' adversarial-self brief reduces
  critic load upstream; if a builder ran self-pushback, drop one tier
- `superpowers:requesting-code-review` — composes with this skill at the
  pre-merge gate
