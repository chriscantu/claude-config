---
name: swarm-batch-dispatcher
description: >
  Use when the user says /swarm-batch-dispatcher, "batch these issues", "ship N
  PRs in parallel from issues X Y Z", "run a parallel swarm batch", "dispatch
  builders for issues #N #M", or asks to take a list of GitHub issues from
  "ready" to "merged PRs" in one coordinated pass. Owns the full pipeline:
  worktree creation, parallel builder dispatch, coordinator-side commit / push
  / PR opening, CI-poll-with-branch-update loop, sequential merge in
  dependency order, and worktree teardown. Use even when the user names a
  single issue — the skill still applies (it just dispatches one builder).
  Do NOT use for one-shot code changes that don't start from a GitHub issue,
  and do NOT use for spec authoring alone (spec PRs ride a different
  workflow — see "When NOT to use" below).
---

# Swarm Batch Dispatcher

Takes a list of ready GitHub issues, ships each as its own PR through a
parallel builder swarm, and walks the batch to merge. Codifies the rote
coordination work that a manual swarm batch leaks tokens on: worktree
plumbing, builder briefs, fish-safe commit-msg writing, CI BEHIND ping-pong,
sequential merge order, and cleanup.

## Why this exists

A typical batch hits ~50 manual coordination steps for 4 issues — 4 worktree
creates, 4 builder briefs (~100 lines each), 4 commits via fish heredoc
temp-file pattern, 4 pushes, 4 PR opens, sequential merges with 2-3
`BEHIND`-state rebases mid-batch, plus teardown. The pattern recurs every
phase. This skill bundles it.

The skill also enforces three hard-learned constraints that a freshly-
dispatched coordinator easily forgets:

1. **Subagent sandbox**: builders cannot run `git` or `gh`, and cannot reach
   paths outside the project. Worktrees MUST live at `.worktrees/issue-N`
   inside the repo, and the coordinator is the only thing that pushes / opens
   PRs.
2. **Full local CI before push**: `lint + format:check + test + build` —
   spec-only PRs that touch `experiments/` or `eslint.config.*` still hit CI
   gates.
3. **Specs ship as their own PR first**: if an issue is `needs-spec`, the
   spec lands and merges before the implementation dispatch — don't run them
   back-to-back.

## Arguments

- `<issues>` — one or more GitHub issue numbers (e.g., `10 11 26 29`)
- `--topology <parallel|sequential>` — default `parallel`. Use `sequential` when
  issues touch overlapping files or have ordered dependencies.
- `--builder <agent-name>` — default project-configured builder. Common values:
  `chrome-extension-engineer`, `coder`, `backend-dev`. Read the project
  CLAUDE.md "Agent routing" table to pick the right default; if multiple
  apply, ask the user.
- `--base <branch>` — default `main`. The branch worktrees fork from and PRs
  target.
- `--repo <owner/name>` — optional; default = current git remote.

## Workflow

### Step 1: Read each issue

For every issue number, fetch the body and labels:

```
gh issue view <N> --json title,body,labels,assignees,milestone
```

Skim for:
- **Scope shape** — single file / single module / cross-boundary / new feature
- **`needs-spec` label** — triggers the spec-first detour in Step 2
- **Dependencies** — issues that reference other issues or PRs as
  prerequisites
- **Acceptance criteria** — used in Step 5 (commit message + PR body) and
  Step 8 (merge verdict)

Emit a one-line summary per issue so the user can intercept misreads cheaply:

> **#10**: "Bundle OpenDyslexic scaffold + fix WAR matches" — scope: src/chrome/manifest + WAR config, no spec needed.
> **#11**: "Real 16/48/128 PNG icons from Safari upstream" — scope: icons/, no spec needed.

### Step 2: Risk-tier each issue (delegate to ring-review-tiered)

Before dispatching builders, classify each issue's risk tier using the same
table the `ring-review-tiered` skill uses. The tier determines:

- **Builder brief intensity** — large/boundary/security issues get the
  full adversarial-self brief; trivial issues get a minimal brief
- **Post-PR ring intensity** — passed through to the eventual
  `ring-review-tiered` call so the same dispatch sees consistent calibration

If an issue is `needs-spec`, run the spec-first detour now: dispatch the
`architect` subagent on a `spec/<topic>` branch, open a spec-only PR, wait for
merge to `--base`, THEN proceed to Step 3 for the implementation issue.
Verify the architect's "wrote spec at X" claim by inspecting
`git log --oneline <branch>` before declaring the detour done — agent
summaries describe intent, not action.

### Step 3: Create worktrees

For each issue, create a worktree INSIDE the repo at `.worktrees/issue-<N>`:

```
git worktree add -b feat/issue-<N> .worktrees/issue-<N> <base>
```

Ensure `.worktrees/` is in `.gitignore` (add the line if missing). Do NOT use
`~/.config/superpowers/worktrees/` or any path outside the repo — the
subagent sandbox blocks those, and the symptom is a confusing
"sandbox-permission denial" mid-dispatch.

### Step 4: Dispatch builders in parallel

Spawn N builder subagents in a single tool-use batch. Each brief includes:

- **Working directory**: `.worktrees/issue-<N>` (absolute path)
- **Issue body**: paste the relevant scope, acceptance criteria
- **TDD discipline**: test-first for non-trivial logic
- **Full-CI verify gate** before reporting done:
  ```
  npm run lint && npm run format:check && npm run test && npm run build
  ```
  Plus any project-specific suite (e.g., `npm run test:d10`).
- **Adversarial-self brief** (the key quality signal from the build-stage
  memos): "If the audit invalidates the premise of the issue, report findings
  and propose dispositions; do not fabricate work to satisfy the dispatch.
  Before claiming a test asserts the intended invariant, mutate the production
  code or gate condition to confirm the test flips red — if it stays green,
  the assertion is tautological."
- **Hard halt on `git`/`gh` step**: "Do all code + verify work. The
  coordinator handles commit + push + PR. Report back with: files changed,
  tests added, all verify command outputs, and a suggested commit message."
- **Sandbox awareness**: "Your Bash/Read sandbox is the project root only.
  Do not attempt paths outside the working directory."

### Step 5: Coordinator-side commit + push + PR

When a builder reports clean state:

1. **Verify the claim** before committing. Run `git status -s` in the
   worktree; the modified file list MUST match the builder's report. Builders
   sometimes probe source files and restore — verify the restoration.
2. **Write the commit message** using the fish-safe temp-file pattern (no
   bash heredocs — they break under fish):
   ```fish
   echo "feat(scope): subject

   Body paragraph.

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>" > /tmp/commit-<N>.msg
   git -C .worktrees/issue-<N> commit -F /tmp/commit-<N>.msg
   ```
3. **Push and open the PR**:
   ```
   git -C .worktrees/issue-<N> push -u origin feat/issue-<N>
   gh pr create --base <base> --head feat/issue-<N> --title "..." \
     --body "$(cat /tmp/pr-body-<N>.md)"
   ```
4. **PR body template** — fish-safe, written via temp file. Include:
   - Summary (1-3 bullets)
   - Closes #<N>
   - Test plan (the verify commands that ran + any manual smoke items)
   - Builder report excerpt

### Step 6: CI poll loop with branch-update

For each open PR in the batch:

1. `gh pr checks <PR>` — wait for CI verdict
2. `gh pr view <PR> --json mergeStateStatus` — read state
3. If `BEHIND`: `gh pr update-branch <PR>` then loop back to step 1
4. If `BLOCKED` / `DIRTY`: surface to user; do NOT auto-resolve conflicts
5. If `CLEAN` and CI green: ready for Step 7

This loop is the single biggest manual-coordination cost in batch work. The
ping-pong of "merge A → B goes BEHIND → update-branch → merge B → C goes
BEHIND → update-branch → ..." compounds. Run it tight.

### Step 7: Optional ring review

If the user invoked the batch with `--ring` (default off), pass the PR list
to `ring-review-tiered`. Calibrated tiers from Step 2 should match the tiers
that skill computes — if they don't, prefer the tier-skill's reading
(it's the canonical one).

If any PR returns BLOCK or HOLD-with-fixes from the ring, dispatch a
fix-builder subagent in the same worktree, then loop back to Step 5.

### Step 8: Sequential merge

Merge in dependency order (Step 1's "Dependencies" notes). After each merge,
the remaining PRs go BEHIND — run `gh pr update-branch` on each, then resume.
If a rebase triggers a regression (fixtures, snapshot tests), dispatch a
fixture-backfill subagent in the affected worktree before retrying.

Default merge mode: squash. Override with `--merge-mode <squash|rebase|merge>`
if the project's convention is different.

### Step 9: Teardown

For each merged PR:

```
git worktree remove .worktrees/issue-<N>
git branch -d feat/issue-<N>
```

Skip teardown for any PR that didn't merge — leave the worktree so the user
can resume from where it stalled.

Emit a final batch summary:

> **Batch summary**: 4 issues → 4 PRs → 4 merged.
> Wall time: 18 min. Worktrees torn down: 4. Branches deleted: 4.
> Follow-ups opened: #172, #173 (from ring findings).

## When NOT to use

- One-shot code changes with no GitHub issue. Just edit and commit.
- Spec authoring alone — that's an architect dispatch, not a batch. (A
  `needs-spec` issue inside a batch IS handled; pure spec PRs aren't.)
- Issues that need genuine human design discussion — `superpowers:brainstorming`
  first, file an issue with the resolved approach, THEN batch.
- Cross-repo work — this skill assumes a single repo. Use `cross-project`
  for impact analysis first if changes ripple beyond one repo.

## Common mistakes

- **Putting worktrees outside the repo**. `~/.config/superpowers/worktrees/`
  is the default of an adjacent skill and it fails silently in subagents.
  Pin worktrees to `.worktrees/issue-N` always.
- **Briefing builders to run `git`/`gh`**. They can't. The brief MUST say
  "coordinator finalizes" — otherwise the builder halts mid-task with a
  sandbox denial and the user has to unstick it.
- **Skipping `format:check` locally**. CI runs it; local "just tests" misses
  it. The verify gate must include all four (lint + format + test + build).
- **Running spec + implementation back-to-back**. The spec file vanishes if it
  was written in an agent worktree that gets cleaned up. Spec → PR → merge,
  THEN dispatch.
- **Trusting builder summaries without `git status` verification**. Agent
  summaries describe intent, not action.

## Linked policies

- `feedback-subagent-sandbox-constraints` — `.worktrees/` inside repo;
  coordinator owns `git`/`gh`
- `feedback-run-full-ci-locally` — `lint + format:check + test + build`
  before push
- `feedback-specs-ship-as-pr-first` — spec → PR → merge → implement
- `feedback-builders-self-pushback` — adversarial-self brief at build stage
- `ring-review-tiered` — risk-tier classifier used in Step 2 and (optionally)
  Step 7
- `superpowers:dispatching-parallel-agents` — generic parallel-dispatch
  primitives this skill specializes for the batch-to-PR pipeline
