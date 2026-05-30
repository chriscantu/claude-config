# Skill recommendations from 2026-05-29 swarm batch

Handoff for next session. Three skill candidates surfaced by friction during a 4-PR parallel swarm batch on `speedreader-chrome`. Captured here so a fresh session can pick up with clean context.

## Session source

- Project: `speedreader-chrome`
- Work: phase-1 parity batch — issues #10/#11/#26/#29 → PRs #168/#170/#171/#169 → all merged to `main` at `4a856bb`
- Ring review: 16 critic dispatches (4 critics × 4 PRs), full arbiter synthesis done by coordinator
- Post-ring fixes: 2 fix builders → 1 fixture-regression backfill → sequential merge w/ branch-update loop
- Follow-ups opened: #172 (use_dynamic_url), #173 (OpenDyslexic binary + SHA pin), #174 (e2e CSP smoke)
- New memory landed: `feedback_ring_calibration_by_risk.md` (alongside existing `feedback_antagonistic_ring_patterns`, `feedback_builders_self_pushback`, `feedback_subagent_sandbox_constraints`)

## Recommendation 1 — `swarm-batch-dispatcher` (global)

### Friction observed

Manually coordinated, this session:
- 4 worktree creations at `.worktrees/issue-N`
- 3 subagent dispatches with ~100-line briefs each (TDD + verify + adversarial-self)
- 4 commit messages drafted via fish-safe temp-file heredoc pattern
- 4 branch pushes
- 4 `gh pr create` invocations with templated bodies
- Sequential merge loop hitting `mergeStateStatus: BEHIND` 3 times → `gh pr update-branch` × 3
- Worktree teardown × 3 + local branch delete × 3

~50 manual steps per batch. Repeated this pattern several times per project memory.

### Skill scope

Inputs:
- `issues: number[]` — GitHub issue numbers to batch
- `topology: "parallel" | "sequential"` — default parallel
- `builder_agent: string` — default `chrome-extension-engineer` (configurable per project)
- `base: string` — default `main`

Behavior:
1. Read each issue body via `gh issue view`
2. Risk-tier each (LOC estimate from issue scope, file count, boundary crossings) — feeds into recommendation 2
3. Create `.worktrees/issue-N` branches off `base`
4. Dispatch N builder subagents in parallel (or serial) with templated brief:
   - Working dir = worktree path
   - TDD + lint + format:check + test + build verify
   - Adversarial-self brief (per `feedback_builders_self_pushback` memo)
   - Report-back contract: files + tests + suggested commit msg
5. Coordinator: stage + commit (fish heredoc temp-file pattern) + push + `gh pr create` with templated body + test plan
6. CI poll loop with branch-update-on-BEHIND
7. Sequential merge in topological order (resolves rebase regressions via fixture backfill subagent if needed)
8. Worktree teardown + branch cleanup

### Replaces

- Manual subagent brief authoring
- Manual fish-safe commit-msg writing
- Manual CI/update-branch ping-pong
- Worktree teardown rote

### Relevant memories

- `feedback_subagent_sandbox_constraints.md` — `.worktrees/` lives inside repo; coordinator handles git/gh
- `feedback_run_full_ci_locally.md` — verify gates required
- `feedback_specs_ship_as_pr_first.md` — for spec-shaped issues

## Recommendation 2 — `ring-review-tiered` (global)

### Friction observed

Today's ring dispatched uniform 4 critics × 4 PRs = 16 subagents. Net hit rate ~30-40% signal. Real defects converged on only 3 findings. #168 (binary-only) and #170 (2-file surgical) burned 8 critic dispatches for 1 real catch each.

User asked: "why so many findings?" → answer: builders had weak self-pushback + uniform-ring on trivial PRs is theater. Memo landed: `feedback_ring_calibration_by_risk.md`.

### Skill scope

Inputs:
- `pr_numbers: number[]`

Behavior:
1. For each PR, classify risk tier via:
   - `gh pr diff --name-only | wc -l` (file count)
   - `git diff --stat` total LOC delta
   - Boundary detection: paths crossing `src/core/` ↔ `src/chrome/` or touching `manifest`, `storage`, `messaging`, `WAR`
   - Security-adjacent heuristics: storage/auth/permissions/IPC keywords
2. Tier table (canonicalize from memo):

   | Tier | Trigger | Dispatch |
   |---|---|---|
   | Trivial | binary-only, single-line, typo, dep bump | Skip ring |
   | Surgical | ≤4 tasks, single file, ≤50 LOC, no boundary | 1 cross-dim critic |
   | Medium | 1 boundary, ~100-300 LOC, 2-5 files | 2 critics (most-relevant dimensions) |
   | Large/boundary/security | >10 files, >300 LOC, boundary cross, security-adjacent, load-bearing invariants | Full 4-critic ring + arbiter |

3. Dispatch the right N critics in parallel per PR
4. Convergence-rank findings: 2+ critics on same finding = HIGH, single critic = LOW
5. Arbiter synthesizes per-PR verdict (MERGE / HOLD-with-fixes / BLOCK)
6. Return ranked merge-readiness summary

### Replaces

- Manual ring-vs-skip decision tree
- 16 individual `Agent` calls per batch
- Coordinator-side convergence ranking

### Relevant memories

- `feedback_ring_calibration_by_risk.md` (canonical tier table)
- `feedback_antagonistic_ring_patterns.md` (convergence is primary signal)
- `feedback_builders_self_pushback.md` (builders should self-critique upstream)

## Recommendation 3 — `verify-extension-unpacked` (project — `speedreader-chrome`)

### Friction observed

PR validation HARD-GATE fired on `gh pr merge`. Test plans had manual items:
- #168: `chrome://extensions` toolbar render check
- #170: macOS Appearance dark↔light live flip
- #171: stepper button clicks + options-page round-trip + axe scan
- #169: CSP-strict page font injection via DevTools

None executable from CLI. Required user-emitted named-cost skip (`skip pr-validation, ci green is enough`). Pattern will recur every batch.

### Skill scope

Project-local (`/Users/cantu/repos/speedreader-chrome/.claude/skills/` or equivalent).

Inputs:
- `pr: number`
- `manifest_path: string` — default `dist/manifest.json`

Behavior:
1. `npm run build` → emit `dist/`
2. Spin up Playwright with extension persisted (`launchPersistentContext` w/ `--load-extension=dist/`)
3. Drive test-plan items mechanically:
   - Toolbar icon render → screenshot + image-presence check
   - Overlay activates on `activeTab` → command keybinding or popup click
   - Theme renders → match `--bg` to expected token
   - Stepper buttons present + clickable + persist via `chrome.storage.sync` round-trip
   - Axe scan on overlay shadow root
4. Update PR body test-plan checkboxes via `gh pr edit --body`
5. Close the PR validation HARD-GATE without skip

### Replaces

- Recurring named-cost skip (`skip pr-validation, ci green is enough`)
- Manual test-plan execution rotation

### Why project-local

Tightly coupled to this extension's overlay/popup/stepper UI surfaces. Wouldn't transfer to a different MV3 extension without rewrite.

## Existing skills — no critical revisions

- `pr-review-toolkit:review-pr` — could add tier classifier but `ring-review-tiered` supersedes
- `caveman-review` — single-PR scope, orthogonal
- `superpowers:dispatching-parallel-agents` — partial overlap with rec 1; doesn't handle worktrees/git/PR finishing per `feedback_subagent_sandbox_constraints`
- `superpowers:writing-skills` — invoke during next-session skill build for skill #1 and #2

## Build order

1. **Rec 2 first** — codifies a memo just written; small surface; immediate next batch reuses. Build via `superpowers:writing-skills` + `skill-creator`.
2. **Rec 1 second** — bigger lift; depends on Rec 2 internally for tier classification step. Build via `superpowers:writing-skills`.
3. **Rec 3 last** — only if user hits PR-validation gate often enough to justify Playwright maintenance. Lower priority.

## Next-session resume prompt

Copy-paste:

> Read `docs/superpowers/specs/2026-05-29-skill-recommendations-from-swarm-batch.md`. Build skill #2 (`ring-review-tiered`) first via `skill-creator`. Skill is global (`~/.claude/skills/` = `~/repos/claude-config/skills/`). Source the tier table verbatim from `feedback_ring_calibration_by_risk.md` in speedreader-chrome's auto-memory. After #2 lands w/ evals, build #1 (`swarm-batch-dispatcher`).
