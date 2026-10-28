# PR Validation — Full Procedure

Not loaded on every prompt. `rules/pr-validation.md` keeps the always-loaded
core. The gate hook (`hooks/rules-shadow.sh`) blocks the first `gh pr merge` or
`gh pr ready` per PR in a session and points here. Moved out of the rule in
rules-reduction Phase 2 (`docs/rules-reduction-rollback-triggers.md`).

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
