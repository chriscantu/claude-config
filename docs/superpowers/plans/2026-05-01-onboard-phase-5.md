# /onboard Skill — Phase 5 Implementation Plan (`--graduate` + reliability hardening)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` (single-implementer; see Execution Mode below for the rationale + re-flip criteria). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the final command in the `/onboard` surface — `/onboard --graduate <org>` — and harden the skill end-to-end before the user's first real ramp begins. The graduate command authors a retro, commits/tags it, pauses the cadence-nag scheduled task, and writes a `.graduated` sentinel. The cadence-nag autonomous session gains a parallel safety net that no-ops when the sentinel is present (defends the orphan-cron failure mode if the MCP pause fails). Reliability layer: a full-ramp lifecycle integration test, a recovery runbook, and a failure-mode audit pass over every MCP/git/file-write call-site. Phase 4 carry-overs (live Calendar MCP scan, attribution heuristics, email-match schema, theme clustering) are explicitly DEFERRED to Phase 6 — the user's reliability constraint (zero dev time during 90-day ramp) inverts the prior carry-over math: bundling unsharpened heuristics adds bug-surface over an already-shippable workflow. The attribution residual risk is mitigated WITHOUT code by adding a blind-spot doc + manual-pass checklist to `refusal-contract.md` and the SKILL.md pre-render gate.

**Architecture:** New TS module `bin/onboard-graduate.ts` exposes one subcommand — `graduate <workspace>` (end-to-end orchestration: detect prior graduation → verify clean tree → compose retro → commit → tag → push → unschedule cron via `mcp__scheduled-tasks__update_scheduled_task` with `enabled: false` → write `.graduated` sentinel → print summary). Each step is idempotent: re-running `--graduate` after partial failure walks the steps again, skipping work already done. `skills/onboard/cadence-nags.md` autonomous-session protocol gains a Step 0.5 `.graduated`-guard check that aborts the session with no-op on a graduated workspace (filesystem stat only — does not widen tool surface). `skills/onboard/SKILL.md` gains a `--graduate` dispatch and trims the final "(yet)" entry. `skills/onboard/refusal-contract.md` gains a "Known blind spots" section listing residual attribution gaps (nicknames, misspellings, pronouns) that a manual-pass checklist must catch — no code change. `bin/onboard-status.ts` extends the workspace summary to surface the graduated state. Phase 1+2+3+4 source untouched except for the additive `--graduate` dispatch and status-summary extension.

**Tech Stack:** TypeScript + `bun:test` (helper + tests; `bun run` executes `.ts` natively). Skill markdown edits for `/onboard` SKILL.md, `cadence-nags.md`, `refusal-contract.md`. New reference doc `skills/onboard/graduate.md`. New runbook `docs/superpowers/onboard-runbook.md`.

**Spec:** [docs/superpowers/specs/2026-04-30-onboard-design.md](../specs/2026-04-30-onboard-design.md). Phase 5 line: 174.

**Phase 1 reference:** [2026-04-30-onboard-phase-1.md](2026-04-30-onboard-phase-1.md).
**Phase 2 reference:** [2026-04-30-onboard-phase-2.md](2026-04-30-onboard-phase-2.md).
**Phase 3 reference:** [2026-04-30-onboard-phase-3.md](2026-04-30-onboard-phase-3.md).
**Phase 4 reference:** [2026-04-30-onboard-phase-4.md](2026-04-30-onboard-phase-4.md).

---

## Execution Mode

**[Execution mode: single-implementer]** — applies `rules/execution-mode.md` HARD-GATE.

Plan size:
- 6 tasks
- ~85 LOC production (`bin/onboard-graduate.ts` ~70, status extension ~10, cadence-nags guard ~5)
- ~150 LOC test (full-ramp integration + graduate unit tests)
- ~50 lines documentation (refusal-contract blind-spots, runbook, SKILL.md edits)
- No integration coupling between tasks — each is self-contained against the workspace fixture.

**Subagent-driven trigger evaluation (ALL of):**
- ≥5 tasks ✅
- ≥2 files ✅
- ≥300 LOC ❌ — total ~235 LOC across production + test, well under threshold

**Subagent-driven OR clause** (integration coupling): the graduate flow is 9 sequential steps within ONE module. The cadence-nags guard is a 5-line filesystem-stat insertion. The blind-spot doc is markdown only. None of these need per-task spec review — the integration test (Task 5) catches drift far more cheaply than per-task review on six near-independent tasks.

**Single-implementer triggers (ANY of):**
- "each task is a TDD increment ≤50 LOC" fires — Tasks 1+2 are sub-50-LOC TDD pair around the graduate helper; Task 3 is a 5-line markdown edit + 5-line guard; Task 4 is a markdown edit; Task 5 is the integration test; Task 6 is the runbook + audit doc.

**Tie-break:** "when both modes' triggers fire, single-implementer wins." Subagent-driven ALL-of trigger fails on LOC threshold; single-implementer wins clearly.

The load-bearing verify (Task 5 full-ramp integration test) replaces what per-task spec review would catch — a regression in any step of the graduate flow OR in the cadence-nags guard fails the integration test loudly. Single-implementer + thorough Self-Review Checklist run at the end is the right cost/coverage trade.

**Re-flip to subagent-driven if:** the plan grows beyond 300 LOC during execution (e.g., retro composition is expanded into a sub-skill), OR a Phase 6 carry-over surfaces that needs per-task spec review, OR the failure-mode audit (Task 6) discovers a load-bearing regression in Phase 1–4 source that requires substantial fix work.

---

## Decision Log

### Think-before-coding preamble

**Assumptions** (load-bearing):
- `mcp__scheduled-tasks__update_scheduled_task` with `enabled: false` is the canonical pause mechanism (verified at plan time — `references/copilot-tools.md`-style contract: tool surface lists no delete; pause-via-update is the documented pattern). The cadence-nag autonomous session does NOT need to be modified to honor `enabled: false` — the MCP scheduler skips disabled tasks at fire time. The Step 0.5 `.graduated` guard in `cadence-nags.md` is a defense-in-depth safety net, not the primary mechanism.
- Retro authoring is an inline prompt in `graduate.md` reference doc (no sub-skill) — keeps Phase 5 within ~70 LOC for the helper itself. Sub-skill composition is reserved for Phase 6 if retro complexity grows.
- Reversibility: graduation is reversible by deleting `.graduated`, deleting the git tag (`git tag -d`), and re-enabling the scheduled task via `update(taskId, enabled: true)`. No `--ungraduate` flag; manual recovery is documented in the runbook.
- User has zero shipped ramps today — no migration concern; first real ramp will be the canonical end-to-end test.

**Interpretations** (the carry-over fork — resolved):
The user's stated constraint — "zero dev time during 90-day ramp; tool must be feature-complete and reliable; bugs are worse than missing features" — inverts the bundling math from the prior phase. Phase 4's "bundle if cheap" heuristic does not apply when reliability dominates feature completeness. Each Phase 4 carry-over is re-evaluated against this constraint:

| Carry-over | Manual work saved during ramp | Reliability risk introduced | P5 disposition |
|---|---|---|---|
| Live Calendar MCP scan | ~30 sec/week × 13 weeks = ~6 minutes total | OAuth expiry, MCP disconnects, network errors during ramp = unrecoverable (no dev time to debug) | **DEFER → Phase 6** — paste path is reliable; live scan trades 6 min saved for an unbounded debugging surface |
| Attribution residuals (alias/Levenshtein/pronoun) | Fewer false-flags during sanitize | False-positive REFUSE on valid content = worse failure mode than current false-pass; memory-MCP entity shape unknown | **DEFER → Phase 6 (heuristics); IN → Phase 5 (doc + checklist)** — close the risk via documentation, not heuristics |
| Cross-1:1 theme clustering | Synthesis aid at W6 SWOT | Belongs in `/swot`, not `/onboard` — bolting it on violates orchestrator scope | **PUNT → /swot** (architectural; per `memory/onboard_skill_rescoped.md`) |
| `map.md` email-match schema | Paired with live Calendar scan only | Standalone has no value | **DEFER → Phase 6** (paired with live Calendar) |
| Refusal contract for non-repo skills | Future-proofing | Zero consumers today | **DEFER (no-op)** |

Proceeding with: **A (minimal core + reliability hardening + attribution doc/checklist).** All feature-bundle alternatives DEFER.

**Switch to a feature-bundle alternative if:** the user encounters demonstrable workflow friction during ramp #1 dogfood OR establishes a memory-MCP entity-shape investigation result that lowers Phase 6 attribution-heuristic risk.

**Simpler-Path Challenge:** A simpler path is "skip retro entirely; just unschedule + tag." Reason not recommended: retro is THE deliverable per spec line 174; the 90-day learning artifact is the load-bearing value, not cron cleanup. Skipping retro retains ~30% of Phase 5's user value.

### Carry-over bundle-vs-defer table (explicit)

| Carry-over | Phase 4 disposition | Phase 5 decision | Rationale |
|---|---|---|---|
| `--graduate` core (retro + tag + push + unschedule + sentinel) | core Phase 5 | **IN** | spec line 174; load-bearing |
| Re-invoke detection (warn + skip unless `--force`) | n/a | **IN** (~5 LOC bundled) | edge state from systems analysis; cheap |
| `.graduated` guard in cadence-nags autonomous session | n/a | **IN** (~5 LOC) | defense-in-depth against MCP pause failure |
| Attribution residuals — heuristics (alias/Levenshtein/pronoun) | DEFER → P5 | **DEFER → Phase 6** | unknown investigation, asymmetric failure mode (false-positive REFUSE worse than false-pass) |
| Attribution residuals — blind-spot doc + manual-pass checklist | n/a | **IN** (zero code) | closes ~80% of risk via documentation + 5-min author-side scan; zero bug surface |
| Cross-1:1 theme clustering | PUNT → /swot | **DEFER → /swot** | not `/onboard` orchestrator scope |
| Live Calendar MCP scan (`--calendar-scan`) | DEFER → P5+ | **DEFER → Phase 6** | paste path works; OAuth surface is unrecoverable failure during ramp |
| `map.md` email-match schema | DEFER → P5+ | **DEFER → Phase 6** | paired with live Calendar |
| Refusal contract for non-repo skills | DEFER (no-op) | **DEFER (no-op)** | zero consumers |

### Order-of-operations decision (load-bearing)

The graduate flow MUST execute in this order, and each step MUST check its own done-state before running. This makes the entire flow idempotent under partial failure — re-running `--graduate` from any failure point picks up where it left off:

```
1. ENTRY: parse arg, locate workspace
2. CHECK .graduated exists?         [yes → warn + exit unless --force]
2a. ABORT if dirty tree              [git status --porcelain non-empty]
3. COMPOSE retro                     [skip if decisions/retro.md exists]
4. COMMIT retro                      [skip if HEAD already contains decisions/retro.md]
5. TAG ramp-graduated-<ISO>          [skip if tag exists]
6. PUSH --tags                       [skip+warn if no remote configured]
7. UNSCHEDULE cron                   [list → find by name → update enabled:false; on fail: log to .graduate-warnings.log + continue]
8. WRITE .graduated sentinel         [final marker; ISO date]
9. PRINT summary
```

Reverse order would create orphan-cron-with-no-graduation-marker scenarios. Forward order with done-state skips creates idempotent retry semantics. **Step 8 is intentionally last** — the `.graduated` sentinel is the visible "done" signal AND the cadence-nags safety net's input. Writing it before earlier steps complete would fire the safety-net pre-emptively and silence cron nags during a partial graduation.

---

## File Structure

| File | Status | Responsibility | Cross-skill flag |
|---|---|---|---|
| `bin/onboard-graduate.ts` | **new** | Single subcommand `graduate <workspace>`. Orchestrates the 9-step sequence. Pure functions exported for unit test (`hasGraduated`, `isCleanTree`, `findCadenceTask`, `composeRetroPrompt`, `writeSentinel`). The `main` entry point composes them and handles MCP/git side effects. | — |
| `tests/onboard-graduate.test.ts` | **new** | `bun:test` suite with `mkdtempSync` fixtures. Covers each helper individually + the orchestrator under happy path, prior-graduation skip (with and without `--force`), dirty-tree abort, partial-failure retry (kill after step 5 → re-run completes), no-remote skip, MCP-unschedule failure → log+continue. | — |
| `tests/onboard-integration.test.ts` | **modify** | Add ONE new describe block: "Phase 5 full-ramp lifecycle". Scaffold a workspace via `bin/onboard-scaffold.fish`, simulate Phase 2 cron registration (mock the MCP), simulate Phase 3 sanitize (write a sanitized note), simulate Phase 4 calendar paste (write `.calendar-last-paste`), then run `bin/onboard-graduate.ts graduate <ws>`, assert (a) `decisions/retro.md` exists with the retro template populated by the test stub, (b) git tag `ramp-graduated-<today>` exists, (c) cadence task is in `enabled: false` state in the mock MCP store, (d) `<ws>/.graduated` exists with today's ISO date, (e) re-running `--graduate` exits clean with "already graduated" warning, (f) re-running with `--force` re-tags and re-pauses idempotently. Existing Phase 4 tests untouched. | **cross-skill** — load-bearing Phase 5 verify |
| `bin/onboard-status.ts` | **modify** | Extend the workspace-summary path to detect `<workspace>/.graduated` and print `Status: graduated <date>` instead of the live-ramp summary. ~10 LOC. | Phase 2/3 baseline; additive only |
| `skills/onboard/SKILL.md` | **modify** | Add `## Graduate (Phase 5)` section after `## Calendar paste (Phase 4)`. Body documents `/onboard --graduate <workspace>` invocation and links to `graduate.md`. Update `## What this skill deliberately does NOT do (yet)` — drop the `--graduate` entry (now done). Add a `## Pre-render attribution gate — manual-pass checklist` block listing the blind-spot scan items the user must perform before each W4/W8 deck render (nickname/misspelling/pronoun scan). | — |
| `skills/onboard/cadence-nags.md` | **modify** | Insert a new Step 0.5 BEFORE the existing Step 1 (RAMP.md presence check): **Graduated-workspace guard** (read `<workspace>/.graduated` mtime; if file exists, log `<ISO date>  graduated  no-op (graduated YYYY-MM-DD)` to NAGS.md subject to dedupe contract, then exit cleanly). Update § "What this doc deliberately does NOT cover" to drop the Phase 5 entry (now done). | **cross-skill** — graduated-guard call-site |
| `skills/onboard/refusal-contract.md` | **modify** | Add `## Known blind spots — manual scan required` section listing nicknames, misspellings, pronouns ("he"/"she"/"they") near quote contexts. State that the regex gate is high-precision/low-recall by design and the manual checklist closes recall gaps. Reference the SKILL.md pre-render checklist. Update § "What this contract deliberately does NOT cover": drop the Phase 4 residual entry, add a Phase 6 entry for heuristic carry-overs. | — |
| `skills/onboard/graduate.md` | **new** | Reference doc — the `/onboard --graduate` flow body. Documents the 9-step sequence, the retro prompt template (5 questions: what worked, what didn't, key relationships, top decisions, what I'd do differently), the recovery semantics (idempotent re-run), and the manual-recovery procedure if the helper fails outright (delete `.graduated`, `git tag -d`, manually `update_scheduled_task` to re-enable). SKILL.md links here from the `--graduate` dispatch; not restated. | graduate flow canonical home |
| `docs/superpowers/onboard-runbook.md` | **new** | Single-page recovery runbook for tired-you at month 2 of a real ramp. Sections: "Cron is firing on a graduated workspace" → check `.graduated`, run `--graduate` again with `--force`, manual MCP fallback. "Retro write failed" → re-run `--graduate`. "Tag exists but push failed" → `git push --tags` directly. "Cadence task ID lost" → `mcp__scheduled-tasks__list_scheduled_tasks` filter by name. "How to ungraduate (force re-open)" → 3-step manual procedure. ~50 lines, no code, terse. | self-rescue artifact |

Phase 5 introduces zero modifications to Phase 1 source (`bin/onboard-scaffold.fish`) and zero modifications to Phase 3 source (`bin/onboard-guard.ts`) and zero modifications to Phase 4 source (`bin/onboard-calendar.ts`). The only Phase 2 source touch is `bin/onboard-status.ts` (additive `.graduated` detection).

---

## Tasks

Each task is a TDD pair (failing test → implementation) per `rules/tdd-pragmatic.md`. Verify checks per `rules/goal-driven.md`.

### Task 1 — Failing tests for `bin/onboard-graduate.ts` helpers

**Files:**
- `tests/onboard-graduate.test.ts` (new)

**Steps:**
- [ ] **Step 1.a:** Create `tests/onboard-graduate.test.ts` with `bun:test` `describe` blocks for each helper:
  - `hasGraduated(workspace)` — returns true if `<ws>/.graduated` exists; false otherwise.
  - `isCleanTree(workspace)` — returns true if `git status --porcelain` is empty; false otherwise.
  - `findCadenceTask(orgSlug, mcpListFn)` — given a stub of `list_scheduled_tasks` output, returns the `taskId` for `onboard-<slug>-cadence`, or null.
  - `composeRetroPrompt()` — returns a string containing all 5 retro questions in order (what-worked, what-didn't, key-relationships, top-decisions, what-i-would-do-differently).
  - `writeSentinel(workspace, isoDate)` — writes `<ws>/.graduated` with the given ISO date as content; returns the path written.
- [ ] **Step 1.b:** Each describe uses `mkdtempSync` to create a fresh workspace, initializes a git repo, exercises the helper, and asserts behavior.
- [ ] **Step 1.c:** Run the tests — they MUST fail (helpers don't exist yet).
- [ ] **Verify:** `bun test tests/onboard-graduate.test.ts 2>&1 | grep -E "fail|error"` returns non-empty (expected failures); test discovery works (no syntax errors).

### Task 2 — Implement `bin/onboard-graduate.ts` helpers + orchestrator

**Files:**
- `bin/onboard-graduate.ts` (new)

**Steps:**
- [ ] **Step 2.a:** Implement the 5 pure helpers from Task 1 in `bin/onboard-graduate.ts`. Export each.
- [ ] **Step 2.b:** Implement `main()` orchestrator that walks the 9-step sequence:
  1. Parse arg, resolve workspace.
  2. `hasGraduated()` → if true and no `--force`, warn + exit 0.
  3. `isCleanTree()` → if false, abort exit 2.
  4. If `decisions/retro.md` does NOT exist, prompt user with `composeRetroPrompt()` to stderr, read stdin, write the response to `decisions/retro.md`. (For non-interactive test mode, accept `--retro-from <path>` flag.)
  5. If `git log --oneline -- decisions/retro.md` is empty, `git add decisions/retro.md && git commit -m "graduate: retro for <slug>"`.
  6. If `git tag` does NOT list `ramp-graduated-<ISO>`, run `git tag ramp-graduated-<ISO>`.
  7. If `git remote` is non-empty, run `git push --tags`. If push fails, log to `<ws>/.graduate-warnings.log` and continue.
  8. List scheduled tasks via MCP; find by name; call `update_scheduled_task(taskId, enabled: false)`. On any error, log to `.graduate-warnings.log` and continue. **(For test mode, accept an injected MCP-stub callback so tests do not require live MCP.)**
  9. `writeSentinel(workspace, ISO)`.
  10. Print summary to stdout: tag name, retro path, cron status (paused / pause-failed-see-warnings), workspace path.
- [ ] **Step 2.c:** Re-run Task 1's tests — they MUST pass.
- [ ] **Verify:** `bun test tests/onboard-graduate.test.ts` — all green; `bunx tsc --noEmit` — clean.

### Task 3 — `cadence-nags.md` graduated-guard + `bin/onboard-status.ts` extension

**Files:**
- `skills/onboard/cadence-nags.md` (modify)
- `bin/onboard-status.ts` (modify)

**Steps:**
- [ ] **Step 3.a:** Edit `skills/onboard/cadence-nags.md` — insert Step 0.5 between the file header and Step 1 (RAMP.md presence check):
  ```markdown
  ## Step 0.5: Graduated-workspace guard

  Before doing anything else, check whether the workspace has been graduated:

  - Read `<workspace>/.graduated` — if the file exists, the autonomous session
    must NOT proceed. Log a single line to NAGS.md:

        <ISO date>  graduated  no-op (graduated YYYY-MM-DD)

    Subject to the existing dedupe contract (Step 5). Then exit the autonomous
    session cleanly. Do NOT read RAMP.md, do NOT fire any milestone or velocity
    or calendar checks.

  This is a defense-in-depth safety net: the primary mechanism for stopping
  cron fires on a graduated ramp is `mcp__scheduled-tasks__update_scheduled_task`
  with `enabled: false` (called from `bin/onboard-graduate.ts` Step 8). If that
  MCP call fails or is reverted, the on-disk sentinel still silences fires.
  ```
- [ ] **Step 3.b:** Update § "What this doc deliberately does NOT cover" — drop the `--graduate` Phase 5 entry. The autonomous session now handles graduated workspaces directly via Step 0.5.
- [ ] **Step 3.c:** Edit `bin/onboard-status.ts` — extend the workspace-summary function to read `<ws>/.graduated`. If present, output `Status: graduated <ISO date>` and skip the live-ramp summary (NAGS.md tail, milestone progress, velocity status). If absent, fall through to existing behavior.
- [ ] **Verify:** `bun test tests/onboard-status.test.ts` — Phase 2/3 baseline tests still pass (graduated-detection is additive, never changes behavior on a non-graduated workspace). `bunx tsc --noEmit` — clean.

### Task 4 — `SKILL.md` + `refusal-contract.md` doc edits

**Files:**
- `skills/onboard/SKILL.md` (modify)
- `skills/onboard/refusal-contract.md` (modify)
- `skills/onboard/graduate.md` (new)

**Steps:**
- [ ] **Step 4.a:** Create `skills/onboard/graduate.md` — the canonical home for the graduate flow body. Sections:
  - **Synopsis** — `/onboard --graduate <workspace>`
  - **9-step sequence** — copy from this plan's "Order-of-operations decision" section
  - **Retro prompt template** — the 5 questions verbatim
  - **Recovery semantics** — re-running is idempotent; each step skips if its work is done
  - **Manual recovery** — three procedures: (1) ungraduate (delete sentinel, delete tag, re-enable MCP task); (2) cron-pause failed (manual MCP update); (3) tag-push failed (re-run `--graduate` OR `git push --tags` directly)
- [ ] **Step 4.b:** Edit `skills/onboard/SKILL.md`:
  - Add `## Graduate (Phase 5)` section after `## Calendar paste (Phase 4)`. Body: 3–5 sentences documenting the dispatch + linking to `graduate.md`.
  - Update `## What this skill deliberately does NOT do (yet)` — drop `--graduate retro + archive`. Replace with a Phase 6 placeholder line: `Live Calendar MCP scan, attribution heuristics, email-match schema (Phase 6 — pending real-ramp evidence).`
  - Add `## Pre-render attribution gate — manual-pass checklist` section before the References block. List 4 items: (1) scan deck for short-form names of mapped stakeholders ("Jon" if `map.md` has "Jonathan"); (2) scan for misspellings within edit distance 2 of mapped names; (3) scan for pronouns ("he"/"she"/"they") near quote-shaped content; (4) scan for organizational shorthand ("the CFO", "my manager") that maps to a single identifiable person. State explicitly that this is a manual scan because the regex gate is high-precision/low-recall by design.
- [ ] **Step 4.c:** Edit `skills/onboard/refusal-contract.md`:
  - Add `## Known blind spots — manual scan required` section after the existing `## Attribution` section. State the high-precision/low-recall design choice. List the same 4 manual-scan items from SKILL.md. Reference the SKILL.md checklist as the canonical author-side procedure.
  - Update § "What this contract deliberately does NOT cover": drop the Phase 4 residual-risks entry; add a Phase 6 entry: `Heuristic attribution coverage (alias tables from memory-MCP, Levenshtein matching, pronoun heuristics) — Phase 6 if real-ramp evidence demands.`
- [ ] **Verify:** Read `skills/onboard/SKILL.md` end-to-end — verify the Graduate section, the manual-pass checklist, and the updated "does NOT do (yet)" block are all consistent with `graduate.md` and `refusal-contract.md`. Read `skills/onboard/refusal-contract.md` — verify the blind-spots section names the same 4 items as SKILL.md.

### Task 5 — Full-ramp lifecycle integration test

**Files:**
- `tests/onboard-integration.test.ts` (modify)

**Steps:**
- [ ] **Step 5.a:** Add a new `describe` block: `"Phase 5 full-ramp lifecycle"`. Scaffold a workspace via `bin/onboard-scaffold.fish` with `aggressive` cadence preset. Stub the `mcp__scheduled-tasks__create_scheduled_task` call (record taskId for later lookup). Write a sample sanitized note to `<ws>/interviews/sanitized/2026-05-W2-stakeholder-x.md`. Write `<ws>/.calendar-last-paste` with today's mtime. Run `bin/onboard-graduate.ts graduate <ws> --retro-from <fixture>` (the fixture is a markdown file with the 5 retro answers populated).
- [ ] **Step 5.b:** Assert post-conditions:
  - `<ws>/decisions/retro.md` exists and contains all 5 retro fixture answers.
  - `git tag --list` in `<ws>` contains `ramp-graduated-<today-ISO>`.
  - The MCP-stub records an `update_scheduled_task` call with `taskId === <recorded-id>` and `enabled: false`.
  - `<ws>/.graduated` exists; contents are today's ISO date.
- [ ] **Step 5.c:** Re-run the same `--graduate` invocation (without `--force`). Assert:
  - Exit code 0.
  - stdout contains `already graduated`.
  - No new tag created (still single `ramp-graduated-<today-ISO>`).
  - MCP-stub records no new `update_scheduled_task` call.
- [ ] **Step 5.d:** Re-run with `--force`. Assert:
  - Exit code 0.
  - Tag re-applied (idempotent: `git tag` does not duplicate).
  - MCP-stub records a second `update_scheduled_task` call (idempotent: target state is already `enabled: false`, but the call is made regardless to ensure consistency).
- [ ] **Step 5.e:** Run `bin/onboard-status.ts <ws>` — assert stdout contains `Status: graduated <today-ISO>` and does NOT contain milestone or NAGS tail.
- [ ] **Verify:** `bun test tests/onboard-integration.test.ts` — all describe blocks green (Phase 3 + Phase 4 + new Phase 5). `bunx tsc --noEmit` — clean.

### Task 6 — Recovery runbook + failure-mode audit

**Files:**
- `docs/superpowers/onboard-runbook.md` (new)
- (audit-only) `bin/onboard-scaffold.fish`, `bin/onboard-status.ts`, `bin/onboard-guard.ts`, `bin/onboard-calendar.ts`, `bin/onboard-graduate.ts`

**Steps:**
- [ ] **Step 6.a:** Create `docs/superpowers/onboard-runbook.md`. Sections (one per failure scenario, ~5 lines each, terse imperative):
  1. **Cron firing on graduated workspace** — verify `.graduated` exists; run `--graduate --force`; if cron still fires, manually call `mcp__scheduled-tasks__update_scheduled_task(taskId, enabled: false)`; if MCP unreachable, the `cadence-nags.md` Step 0.5 guard silences the session anyway (no nag lines added).
  2. **Retro write failed mid-flight** — re-run `--graduate`; the `decisions/retro.md` skip-if-exists check picks up where the previous run left off.
  3. **Tag exists locally, push failed** — `git -C <ws> push --tags`; or re-run `--graduate` (skip-if-tagged + push retry).
  4. **Cadence task ID lost / scaffold partial** — `mcp__scheduled-tasks__list_scheduled_tasks` filter by name `onboard-<slug>-cadence`; manually `update_scheduled_task(taskId, enabled: false)` if found; if not found, the task was never registered → `--graduate` will log "task not found" warning and proceed to write `.graduated` (acceptable: the task that doesn't exist can't fire).
  5. **How to ungraduate (force re-open)** — `rm <ws>/.graduated`; `git -C <ws> tag -d ramp-graduated-<date>`; `mcp__scheduled-tasks__update_scheduled_task(taskId, enabled: true)`. Cron resumes on next fire.
  6. **Workspace dirty when graduate runs** — `git -C <ws> status` to inspect; commit or stash; re-run `--graduate`.
- [ ] **Step 6.b:** Failure-mode audit — read each `bin/onboard-*.ts` file end-to-end and verify the following invariants:
  - Every MCP call is wrapped in try/catch with explicit log-and-continue OR explicit log-and-abort behavior. No silent catches.
  - Every `git` invocation captures stdout/stderr and surfaces non-zero exit to the caller. No silent failures.
  - Every file write logs the path on success and the error+path on failure.
  - Every user-input read (stdin, arg) validates the input before consuming it.
  Document any deviations found as a list at the bottom of the runbook (`## Known invariant deviations` — empty if none).
- [ ] **Step 6.c:** Dogfood pass — scaffold a fake org `acme-test` with `aggressive` cadence preset. Manually walk all 6 commands: scaffold ✓ status ✓ mute milestone ✓ unmute milestone ✓ sanitize (with a 1-line raw note) ✓ calendar paste (with a 2-line invitee paste) ✓ graduate (with a fixture retro). Note any friction points or unclear UI in the runbook's `## Dogfood findings` section. Then `rm -rf` the fake workspace.
- [ ] **Verify:** `wc -l docs/superpowers/onboard-runbook.md` shows ≤80 lines (terse imperative, not a treatise). Read the runbook end-to-end — verify each scenario is actionable in ≤3 commands. Audit findings (Step 6.b) are either zero deviations OR each deviation has a follow-up issue filed.

---

## Self-Review Checklist

Before opening the PR, walk this checklist explicitly. Each item must be answered `✅` or `⚠️ + remediation`.

1. **Spec coverage** — Phase 5 spec line 174 (`--graduate` retro + archive, ~60 LOC) is met by Task 2; the LOC budget is ~70 (5 over) which is acceptable for the safety-net guard inclusion.
2. **Placeholder scan** — no `TBD` / `TODO` in production code, plan, or new reference docs (`graduate.md`, `onboard-runbook.md`).
3. **Carry-over decisions traceable** — bundle-vs-defer table (in interpretation anchors) is mirrored by:
   - Live Calendar MCP: DEFER → `What Phase 6 picks up` section + SKILL.md "does NOT do (yet)"
   - Attribution heuristics: DEFER → `What Phase 6 picks up` + `refusal-contract.md` Phase 6 entry
   - Attribution doc/checklist: IN → Task 4 SKILL.md + Task 4 refusal-contract.md edits
   - Theme clustering: PUNT → `What Phase 6 picks up` (architectural; belongs in `/swot`)
   No silent bundling.
4. **Reliability invariants honored** — every MCP call has explicit failure handling; every git op surfaces non-zero exit; every file write logs path. Audit findings in runbook section.
5. **Idempotency invariant** — re-running `--graduate` on a graduated workspace exits 0 with "already graduated" warning; with `--force`, re-applies all steps without duplicating state. Verified in Task 5 Steps 5.c + 5.d.
6. **Order-of-ops respected** — sentinel write is the FINAL step; never written before tag/push/unschedule. Verified in code review of Task 2 and Task 5 integration test.
7. **Phase boundary respected** — no Calendar live MCP scan code (Phase 6), no attribution heuristics (Phase 6), no `map.md` schema extension (Phase 6), no theme clustering (`/swot`'s job). `/1on1-prep`, `/swot`, `/present` SKILL.md NOT modified.
8. **No Phase 1–4 regression** — `tests/onboard-scaffold.test.ts`, `tests/onboard-status.test.ts`, `tests/onboard-guard.test.ts`, `tests/onboard-calendar.test.ts` all run unchanged in scope; the only modifications are ADDITIVE (new tests + Task 3's status-summary extension which only adds a code path on the graduated branch).
9. **Memory invariants honored**:
   - `onboarding_toolkit_manual_first.md` — graduate is a user-initiated command; no SaaS coupling; manual-first preserved ✅
   - `onboard_skill_rescoped.md` — graduate is `/onboard`-internal; no leakage into `/swot`/`/present` orchestration ✅
   - `user_situation.md` — no integration with services beyond the existing scheduled-tasks MCP ✅
   - `onboard_fish_vs_ts_inflection.md` — `bin/onboard-graduate.ts` is TypeScript per the inflection rule ✅
10. **`bin/link-config.fish --check` passes** — no new symlinks needed (Phase 5 adds source files, not commands or rules).
11. **`fish validate.fish` passes** — no new rule anchors or skill manifests added.
12. **PR description test plan** — every workflow surface listed and verified per `rules/pr-validation.md`.

---

## PR Description (draft for execute prompt)

```markdown
## Summary

- `/onboard --graduate <workspace>` — final command in the /onboard surface
  (#12). 9-step idempotent flow: detect prior graduation → verify clean tree →
  compose retro → commit → tag → push → pause cron via MCP → write `.graduated`
  sentinel → print summary. Re-running on a graduated workspace exits clean
  with a warning; `--force` re-applies all steps idempotently.
- Defense-in-depth safety net: `cadence-nags.md` Step 0.5 guard silences the
  autonomous session if `.graduated` exists, even if the MCP pause failed.
- `bin/onboard-status.ts` extension surfaces graduated state.
- Reliability layer: full-ramp lifecycle integration test, recovery runbook,
  failure-mode audit pass.
- Attribution residual risks closed via blind-spot doc + manual-pass checklist
  in SKILL.md + refusal-contract.md (zero code; ~80% of risk closed via author-
  side scan procedure). Heuristics (alias / Levenshtein / pronoun) DEFERRED
  to Phase 6 pending real-ramp evidence.
- All other Phase 4 carry-overs (live Calendar MCP, email-match schema, theme
  clustering) DEFERRED to Phase 6.

## Test plan

- [ ] `bun test tests/onboard-graduate.test.ts` — green (helpers + orchestrator)
- [ ] `bun test tests/onboard-integration.test.ts` — green (Phase 3 + 4 + 5)
- [ ] `bun test tests/onboard-status.test.ts` — green (Phase 2/3 baseline + graduated detection)
- [ ] `bunx tsc --noEmit` — clean
- [ ] Dogfood: scaffold `acme-test`, walk all 6 commands, graduate, verify cron stops firing across one cron-tick window
- [ ] `bin/link-config.fish --check` — passes
- [ ] `fish validate.fish` — passes
- [ ] Read `docs/superpowers/onboard-runbook.md` end-to-end — every scenario is actionable in ≤3 commands

## Out of scope (Phase 6+)

- Live Calendar MCP scan (`--calendar-scan` foreground wrapper)
- `map.md` email-match schema extension
- Attribution heuristics (alias from memory-MCP, Levenshtein, pronoun)
- Cross-1:1 theme clustering (PUNT → `/swot`)
- Refusal contract for non-repo skills (no consumers today)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

---

## What Phase 6 picks up

- **Live Calendar MCP scan** (`bin/onboard-calendar.ts scan` subcommand or a foreground `--calendar-scan` wrapper) — eliminates the weekly paste step. Requires OAuth surface + MCP failure-mode handling. DEFERRED until real-ramp evidence shows paste is genuinely too heavy.
- **`map.md` schema extension for email-match** — paired with live Calendar scan; standalone has no value.
- **Attribution heuristics** — pull aliases from memory-MCP person entity; Levenshtein-distance matching for misspellings; pronoun heuristics with clause-context model. Requires investigation of `/stakeholder-map`'s entity shape. DEFERRED until real-ramp evidence shows the manual checklist (Phase 5 Task 4) is insufficient.
- **Cross-1:1 theme clustering** — implement in `/swot` at W6 synthesis, NOT in `/onboard --sanitize`. Architectural: belongs in `/swot`.
- **Refusal contract surfaced to non-repo skills** — when (if) a marketplace plugin or external skill consumes `interviews/sanitized/`, the contract must be re-asserted. No-op today.

Phase 6's plan ships in `docs/superpowers/plans/<date>-onboard-phase-6.md` only if real-ramp evidence (from ramp #1 dogfood) demonstrates the deferred items are necessary.

---

## Update ROADMAP.md (if applicable)

After Phase 5 ships, update `ROADMAP.md`:

```markdown
- [/onboard skill — Phase 5 (graduate + reliability hardening)](#) — shipped <date>
- [/onboard skill — Phase 6 (carry-overs)](#) — pending real-ramp evidence
```
