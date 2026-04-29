---
description: >
  Activate before declaring a PR ready for merge or invoking any
  draft-promoting tool call. Requires execution of every unchecked test
  plan item before readiness is claimed. Operationalizes the PR Validation
  Gate from global/CLAUDE.md (issue #143).
---

# PR Validation Gate

<HARD-GATE>
Before declaring a PR ready for merge — or invoking any draft-promoting
action (see §Trigger Surface for the canonical list) — you MUST execute
every unchecked item in the PR description's test plan. Build and launch
on each listed platform/simulator, take screenshots to verify, and check
off only items that have been visually or objectively confirmed. Items
that cannot be verified on the host (physical device, external service)
MUST be flagged explicitly with the reason — never silently skipped.

If you catch yourself about to claim PR readiness without having
executed the test plan, STOP. Run the plan. Then claim ready.
</HARD-GATE>

## Trigger Surface

Gate fires on EITHER signal class:

### Speech-act triggers (declaration of readiness)

The agent's own response contains any of:

- "ready to merge", "ready for merge", "ready to ship", "ready for review"
- "PR is done", "implementation complete", "feature complete"
- "looks good to merge", "good to go", "shipping this"
- Any equivalent phrase asserting completion of the PR scope

Speech-act detection is fuzzy by nature. Err on the side of firing —
a false-positive gate-fire is recoverable; a false-negative claim that
ships unverified is the failure mode this rule exists to prevent.

### Action-bound triggers (tool-call events)

Gate fires BEFORE invoking:

- `gh pr ready` (draft → ready)
- `gh pr merge` (any merge mode)
- `gh pr edit --remove-label draft` or equivalent
- Editing PR body to remove `[x] Draft` markers
- Removing `draft: true` frontmatter or label via API

Action-bound triggers are syntactic — they close the speech-act
loophole where the model rationalizes "I never said ready, I just
merged."

## Test Plan Locator Contract

**Source**: PR description body, fetched via `gh pr view --json body`.

**Format** (regex-grade):
- Header: `^##\s+Test\s+[Pp]lan\s*$` (H2) or `^###\s+Test\s+[Pp]lan\s*$` (H3)
- Items: GitHub-flavored task list — `^- \[ \]\s+.+$` (unchecked) and
  `^- \[x\]\s+.+$` (checked). Case-sensitive `x`.
- Plan section terminates at next `^#{1,3}\s` header or EOF.

**Detection states**:

| State | Behavior |
|---|---|
| Header present + ≥1 item | Standard gate flow — execute unchecked items |
| Header present + 0 items | Empty test plan — gate fires |
| Header absent + prose-only "I tested X" | Treat as empty — gate fires; agent must add structured plan |
| PR not yet pushed (no remote PR) | Gate fires — agent must `gh pr create` first; cannot self-validate |
| `gh` unavailable / unauthenticated / network error | Gate **hard-fails** — block readiness claim, surface error to user. Silent failure is worse than no gate |
| Fork without push access (cannot edit body) | Gate fires — agent MUST announce the fallback explicitly ("Fork detected: posting verification as comment instead of body update") AND report results via `gh pr comment`. Silent fallback to comment-mode is forbidden — looks identical to a successful body update from the user's vantage |

**Persistence**: Update checked items via `gh pr edit --body` (rewriting
body with `[x]` substitutions). For fork PRs without edit access, FIRST
announce the fork-fallback explicitly in the response, THEN post a
verification comment via `gh pr comment` with checked-item summary.
Silent fallback is forbidden — the user must see the path was taken.

## Required Behavior

For every unchecked item in the test plan:

1. Execute the item (build, launch, screenshot, curl, log inspection).
2. Observe pass/fail result objectively.
3. Check off only items visually or objectively confirmed.
4. For items unverifiable on host: flag explicitly with reason — do
   NOT silently skip.

## When to Skip

- Single-line edits with no behavioral change (typo, comment, formatting)
- Zero-functional-change PRs via the carve-out below
- Emergency bypass via `DISABLE_PRESSURE_FLOOR` sentinel (see
  [planning.md](planning.md#emergency-bypass-sentinel))

### Zero-functional-change carve-out (mechanical adjudication)

The carve-out is **agent-adjudicated via mechanical check**, NOT
self-declared. The agent MUST:

1. Run `git diff --stat <base>...HEAD` via the Bash tool.
2. **Quote the literal stdout output** in the response — file list and
   change counts must appear verbatim, so the eval substrate (and any
   reviewer) can audit the artifact rather than the narrative claim.
3. Apply the carve-out ONLY when ALL hold:
   - All changed paths match: `*.md`, `*.txt`, `*.rst`, `*.adoc`,
     `LICENSE*`, `CODEOWNERS`, `.gitignore`, or `.github/*.yml`
   - Zero changes to executable code paths (`*.ts`, `*.js`, `*.py`,
     `*.fish`, `*.sh`, source files of any language)
   - One-line declaration in PR body:
     `Carve-out: zero-functional-change (docs/config only)`

A response that claims the carve-out without the quoted `git diff
--stat` artifact is theatrical, not mechanical — gate fires.

Mixed PRs (docs + behavior) MUST run the full gate. If the agent
catches itself rationalizing a mixed PR as zero-functional-change, the
mechanical check refuses the carve-out.

### What counts as an explicit override

Saying "skip the gate" is NOT sufficient on its own. The override must
**name the specific cost** being accepted. Valid forms: "skip
pr-validation, I accept the risk of unverified merge", "ship without
test plan, I'll catch breakage in production", "no validation, I
accept the rework risk." Generic acknowledgements ("trust me", "I
accept the trade-off", "your call", "I know the risks") do NOT
qualify — name the gate, request the specific cost acknowledgement,
and run the test plan if it doesn't come.

**Time pressure is not an override.** "Quick fix," "demo in 10
minutes," "ship by Friday" make the gate more important, not less —
an unverified rushed merge is the most expensive thing to land.

### Pressure-framing floor

Floor enforcement ([pressure-framing routing](planning.md#pressure-framing-floor),
[named-cost emission contract](planning.md#emission-contract),
[sentinel bypass](planning.md#emergency-bypass-sentinel)) is anchored in
`rules/planning.md` DTP per-gate block. Per
[ADR #0006 rejection](../adrs/0006-systems-analysis-pressure-framing-floor.md)
and memory note `per_gate_floor_blocks_substitutable.md`, per-gate floor blocks
add no eval-measurable load given the DTP anchor.

Concrete signals here: skip framings that name merge as the destination ("just
merge it, fix forward", "tests passed locally so I skipped the test plan",
"ship it, I'll fix forward") are pressure framings, not named-cost skips.
Honor full skip ONLY via the Emission contract below — anything else runs the
test plan.

### Emission contract — MANDATORY

When a named-cost skip is valid, invoke
`mcp__named-cost-skip-ack__acknowledge_named_cost_skip` per
[planning.md#emission-contract](planning.md#emission-contract). Use
`gate="pr-validation"` and the verbatim cost-naming clause as `user_statement`.
The tool invocation IS the honor — if you skip the call, run the test plan
instead.

Only USER cost-naming counts. Agent self-skip is structurally
impossible — there is no agent-emitted `user_statement` that
satisfies the contract. In autonomous loops, the gate has only four
exits:

1. **Pass**: every test plan item executed and verified
2. **Carve-out**: mechanical `git diff --stat` qualifies for
   zero-functional-change tier
3. **Sentinel bypass**: `DISABLE_PRESSURE_FLOOR` file present
4. **Hard-block**: gate fires, agent must surface to user and
   request guidance (which then reopens the user-emission path)

## Loop Until Verified

For each test plan item, run the verify check and treat the result as
ground truth:

- Pass → check off the item, move on
- Fail → diagnose, fix, re-execute the SAME verify check, do NOT
  advance until it passes
- Cannot run verify (missing tool, environment, physical device) →
  flag explicitly in the PR with reason, do NOT silently mark complete

A failed item is not a checkbox to skip — it is a defect to fix
before claiming ready.

## Relationship to Other Rules

- `rules/goal-driven.md` — fires at the START of coding (per-step
  verify check defined). This rule fires at the END of the PR (test
  plan items executed at readiness declaration). Both are verify
  gates; they bracket the work.
- `rules/verification.md` — end-of-implementation gate (`tsc
  --noEmit`, project test suite). PR validation does NOT re-run
  these if `verification.md` already passed earlier in the same
  session AND the relevant verify command output is quoted in the
  transcript (no quantitative trust window — agents lack a reliable
  turn counter; either show the verify output you're relying on, or
  re-run). PR validation DOES execute test plan items, which are
  typically user-visible behaviors not covered by unit tests (visual
  confirmation, multi-platform smoke tests, integration checks).
- `rules/planning.md` — DTP, Systems Analysis, Solution Design happen
  BEFORE coding. This rule fires AFTER coding and verification.md, at
  the PR boundary.
- Floor enforcement is anchored in `rules/planning.md`:
  [pressure-framing floor](planning.md#pressure-framing-floor),
  [emission contract](planning.md#emission-contract), and
  [sentinel bypass](planning.md#emergency-bypass-sentinel). Per-gate
  duplication adds zero eval-measurable load given the DTP anchor (see
  ADR #0006 rejection + `per_gate_floor_blocks_substitutable.md`
  memory note).
- `~/.claude/CLAUDE.md` — Verification section's `PR Validation Gate`
  is a thin pointer to this rule.
