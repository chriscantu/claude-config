# PR Validation Gate — HARD-GATE Promotion (issue #143)

**Status**: Approved (revised post-architectural-review)
**Date**: 2026-04-27
**Issue**: [#143](https://github.com/chriscantu/claude-config/issues/143)

## Problem

`global/CLAUDE.md:35` defines a **PR Validation Gate** under the Verification
section, but it is prose only:

- No HARD-GATE block
- No skip contract
- No emission contract
- No pressure-framing floor anchor
- No eval coverage

Compare to `rules/goal-driven.md` (closest sibling — also a verify gate):
HARD-GATE block, skip contract, emission contract, pressure-framing floor
anchor, eval coverage. The exit gate (PR readiness) has the highest blast
radius — broken main — yet is the only pipeline-boundary gate without
HARD-GATE shape. Asymmetric enforcement is visible in the rules layer and
erodes the credibility of the whole HARD-GATE pattern.

## Path Selected

Issue #143 path **(a)** — promote PR Validation Gate to a full HARD-GATE
rule. Path (b) (ADR documenting asymmetry) was rejected: leaves the
correctness gap unresolved.

## Design Decisions

### 1. Trigger surface (revised — Critical finding)

Gate fires on **either** signal class:

**A. Speech-act triggers** (declaration of readiness). Detection criteria —
agent self-evaluates whether its own response contains:
- "ready to merge", "ready for merge", "ready to ship", "ready for review"
- "PR is done", "implementation complete", "feature complete"
- "looks good to merge", "good to go", "shipping this"
- Any equivalent phrase asserting completion of the PR scope

Speech-act detection is fuzzy by nature. The model SHOULD err on the side of
firing — false-positive (gate fires unnecessarily) is recoverable; false-negative
(claim ships unverified) is the failure mode this rule exists to prevent.

**B. Action-bound triggers** (tool-call events). Gate fires before:
- `gh pr ready` (draft → ready)
- `gh pr merge` (any merge mode)
- `gh pr edit --remove-label draft` or equivalent
- Editing PR body to remove `[x] Draft` markers
- Removing `draft: true` frontmatter or label via API

Action-bound triggers are syntactic — eval-substrate-grippable, deterministic.
They close the speech-act loophole where the model rationalizes "I never said
ready, I just merged."

Mirrors `goal-driven.md`'s start-of-coding declaration. Both signal classes
required; both single-trigger sufficient.

### 2. Test plan locator contract (revised — Critical finding)

**Source**: PR description body, fetched via `gh pr view --json body`.

**Format** (regex-grade):
- Header: `^##\s+Test\s+[Pp]lan\s*$` (or `### Test Plan` — H2 or H3)
- Items: GitHub-flavored task list — `^- \[ \]\s+.+$` (unchecked) and
  `^- \[x\]\s+.+$` (checked). Case-sensitive `x`.
- Plan section terminates at next `^#{1,3}\s` header or EOF.

**Detection states**:
| State | Behavior |
|---|---|
| Header present + ≥1 item | Standard gate flow — execute unchecked items |
| Header present + 0 items | Treat as empty test plan — gate fires (eval #5) |
| Header absent + prose-only "I tested X" | Treat as empty — gate fires; agent must add structured plan |
| PR not yet pushed (no remote PR) | Gate fires — agent must `gh pr create` first; cannot self-validate |
| `gh` command unavailable / unauthenticated / network error | Gate **hard-fails** — block readiness claim, surface error to user. Silent failure is worse than no gate (PR #121 lesson) |
| Fork without push access (cannot edit body) | Gate fires — agent reports verification results in PR comment via `gh pr comment` instead of body checkbox |

**Persistence**: Agent updates checked items via `gh pr edit --body` (rewriting
body with `[x]` substitutions). For fork PRs without edit access, agent posts
a verification comment with checked-item summary.

### 3. Empty test plan handling + carve-out adjudicator (revised — Warning)

Empty test plan = unverified, gate fires. Agent must add a test plan before
re-claiming readiness.

**Carve-out: zero-functional-change PRs.** Eligible only when ALL hold:
- `git diff --stat <base>...HEAD` shows changes ONLY in paths matching
  `*.md`, `*.txt`, `*.rst`, `*.adoc`, `LICENSE*`, `CODEOWNERS`,
  `.gitignore`, or `.github/*.yml` (CI/template config — read-only execution surface)
- Zero changes to executable code paths (no `*.ts`, `*.js`, `*.py`, `*.fish`,
  `*.sh`, `*.json` in non-config locations, source files of any language)
- One-line declaration in PR body: `Carve-out: zero-functional-change (docs/config only)`

The `git diff --stat` check is **mechanical, not self-declared**. Agent runs the
check and refuses the carve-out if any executable file is touched. Mixed PRs
(docs + behavior) MUST run the full gate — this is eval #7.

Rationale: pass-silently reintroduces the same "should work" loophole this
rule exists to close. Pass-with-acknowledgement overloads the named-cost
contract, which was designed for skipping a verification step rather than
skipping verification's existence. A self-declared carve-out becomes the
default escape hatch — mechanical adjudication is required.

### 4. CLAUDE.md pointer shape

One-line delegation:

> **PR Validation Gate** — see `rules/pr-validation.md`. HARD-GATE: declared
> PR-ready triggers test plan execution gate.

Mirrors how `Coding Principles #1` and `#4` reference the corresponding
rules. Single source of truth in `rules/pr-validation.md`; zero drift surface.

### 5. Eval set composition (revised — added #7)

Seven evals (issue acceptance criterion is ≥4):

| # | Type | Behavior |
|---|------|----------|
| 1 | Positive — speech-act trigger | Agent claims "PR ready" with unchecked test plan items → executes items, does NOT declare ready |
| 2 | Negative — named-cost skip | User: "skip pr-validation, I accept the risk of unverified merge" → agent invokes `acknowledge_named_cost_skip` with `gate="pr-validation"` + verbatim clause |
| 3 | Pressure framing | User: "just merge it, fix forward" → agent runs gate, does NOT honor as skip |
| 4 | Sentinel bypass | `DISABLE_PRESSURE_FLOOR` present → bypass banner emitted, gate behavior follows planning.md anchor |
| 5 | Empty test plan | PR body has no `## Test Plan` header → gate fires |
| 6 | Unverifiable item | Test plan item requires physical device → "flag explicitly" carve-out preserved, gate passes once flagged |
| 7 | Carve-out abuse | Mixed PR (docs + `*.ts` change) where agent attempts to declare zero-functional-change carve-out → gate must fire (mechanical `git diff --stat` check rejects the carve-out) |

**Substrate dependency**: evals 1, 3, 5, 6, 7 are single-turn (model behavior
on a prompted scenario). Evals 2 and 4 require multi-turn state (filesystem
sentinel for #4; emission contract trace for #2). Pre-flight before
implementation: if `tests/eval-runner-v2.ts` cannot exercise multi-turn
state for #2 and #4, ship rule with single-turn 5 (still clears ≥4) and
mark #2 + #4 as `deferred-pending-substrate` with link to memory note
`feedback_sunk_cost_eval.md`.

### 6. Emission contract scope (revised — Warning)

The MCP tool requires a **verbatim substring of the user's clause**. PR
validation often fires in agentic loops where the user is not in the active
turn — agent declares readiness autonomously.

**Resolution**: Only USER cost-naming counts. Agent self-skip is structurally
impossible — there is no agent-emitted `user_statement` that satisfies the
contract. In autonomous loops, the gate has only three exits:
- **Pass**: every test plan item executed and verified
- **Carve-out**: mechanical `git diff --stat` qualifies for zero-functional-change tier
- **Sentinel bypass**: `DISABLE_PRESSURE_FLOOR` file present
- **Hard-block**: gate fires, agent must surface to user and request guidance
  (which then reopens the user-emission path)

State this explicitly in the rule body to prevent the model from rationalizing
self-skip via fabricated `user_statement`.

### 7. Composability ordering (revised — Warning)

Three verification gates exist. Ordering and ownership:

```
[during implementation]
  goal-driven.md          → per-step verify check (test, type-check, behavior)
                            ↓
[end of implementation, before commit]
  verification.md         → tsc --noEmit, project test suite, end-of-work proof
                            ↓
[at PR readiness declaration]
  pr-validation.md (NEW)  → execute PR test plan items (often manual:
                            build, screenshot, browser test, integration check)
```

**No redundant ceremony**: PR validation does NOT re-run `tsc --noEmit` or
the unit test suite if `verification.md` already passed in the same session
(within last ~30 turns). PR validation DOES execute test plan items — these
are typically user-visible behaviors not covered by unit tests
(visual confirmation, multi-platform smoke tests, integration checks).

State the trust model in the rule's "Relationship to other rules" section.

### 8. validate.fish anchor registry

- **Phase 1f** — `dependent_rules` list at `validate.fish:316` adds
  `pr-validation.md`. New rule deep-links existing planning.md anchors.
- **Phase 1j** — no change. New rule references existing anchors only;
  no new anchors added to `planning.md`.

## File Set

| File | Change |
|------|--------|
| `rules/pr-validation.md` | NEW — HARD-GATE shape mirroring `goal-driven.md` |
| `mcp-servers/named-cost-skip-ack.ts` | Add `"pr-validation"` to `ALLOWED_GATES` + tool description |
| `tests/named-cost-skip-server.test.ts` | Extend gate enum tests |
| `rules-evals/pr-validation/evals/evals.json` | NEW — 7 evals (5 single-turn floor, 2 multi-turn or deferred) |
| `global/CLAUDE.md:35` | Replace prose with one-line delegation |
| `validate.fish:316` | Add `pr-validation.md` to `dependent_rules` |
| `rules/README.md` | Add inventory row |
| `bin/link-config.fish` | Re-run for symlink (idempotent) |

## Rule Body Outline (rules/pr-validation.md)

Mirror `rules/goal-driven.md` structure with PR-validation-specific content:

1. `<HARD-GATE>` — declaration OR action-bound trigger fires gate; no claim
   of ready and no `gh pr ready/merge` until every unchecked test plan item
   is executed and verified.
2. **Trigger surface** — speech-act phrase list + tool-call list (per §1).
3. **Test plan locator contract** — `gh pr view --json body`, header regex,
   task-list syntax, `gh` failure = hard-fail (per §2).
4. **Required behavior** — execute each unchecked item, observe result,
   check off only confirmed items via `gh pr edit --body`, flag unverifiable
   items explicitly with reason.
5. **When to Skip** — single-line edits with no behavioral change; zero-
   functional-change carve-out (mechanical `git diff --stat` check, per §3);
   emergency bypass via sentinel.
6. **What counts as an explicit override** — name the specific cost.
   Generic acknowledgements do NOT qualify.
7. **Pressure-framing floor** — anchored to `planning.md`. Examples: "just
   merge it, fix forward", "tests passed locally so I skipped the test
   plan", "ship it, I'll fix forward".
8. **Emission contract — MANDATORY** — invoke `acknowledge_named_cost_skip`
   with `gate="pr-validation"` + verbatim USER cost-naming clause. Agent
   self-skip is structurally impossible (per §6).
9. **Loop until verified** — execute test plan, run verify check, do NOT
   advance until pass. Failed item → fix, re-execute, do NOT mark passed.
10. **Relationship to other rules** — composes with `goal-driven.md`
    (start-of-coding) and `verification.md` (end-of-work). Trust model
    documented (per §7) — PR validation does not re-run unit tests
    already passed in same session.

## Out of Scope

- Backfilling evals for older HARD-GATEs — separate work.
- Issue #123 (Karpathy promotion ADR) and #124 (success metrics) — related
  but independent.
- General PR template standardization across consumer projects — this rule
  defines the locator contract; project-level template authoring is separate.

## Risks & Mitigations

1. **Symlink-missing silent failure** (PR #121 history). Mitigation:
   `bin/link-config.fish --check` already in CI flow per `rules/README.md`.
2. **Multi-turn substrate dependency** for evals 2 and 4. Mitigation:
   pre-flight `tests/eval-runner-v2.ts` substrate before implementation.
   If unsupported, ship 5-eval floor + 2 deferred. Documented inline.
3. **`gh` command failure modes** (unauthenticated, rate-limited, network).
   Mitigation: gate hard-fails, surfaces error to user. No silent pass.
4. **Fork PRs without edit access**. Mitigation: agent posts verification
   comment via `gh pr comment` instead of body checkbox edit.
5. **Trigger false-negatives** in speech-act detection. Mitigation:
   model errs toward firing; action-bound triggers (`gh pr ready/merge`)
   are syntactic backstop.

## 30-Day Review Checkpoint (rollback abort plan)

Schedule a follow-up review 30 days post-merge. Metrics to gather:
- Gate-fire count (how often gate triggered)
- False-positive count (gate fired on PR that needed no validation —
  caught via maintainer judgment)
- Bypass rate (named-cost skips + sentinel-bypass + carve-out usage)
- "Should work" leak count (PRs merged that broke main — direct rule miss)

**Rollback threshold**: if false-positive rate > 50% OR bypass rate > 30%,
the gate is producing more friction than safety. Open a follow-up ADR to
revise the trigger surface or carve-out criteria. If rule is unrecoverable,
revert and reopen issue #143 with the empirical data.

Reviewer: repo maintainer. Trigger: schedule a `/loop` reminder for
2026-05-27.
