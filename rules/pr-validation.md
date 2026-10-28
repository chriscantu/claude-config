---
description: >
  Activate before declaring a PR ready for merge or invoking any
  draft-promoting tool call. Requires execution of every unchecked test
  plan item before readiness is claimed. Core only since rules-reduction
  Phase 2; the full procedure is in references/pr-validation-procedure.md.
---

# PR Validation Gate

<HARD-GATE>
Before declaring a PR ready for merge — or invoking any draft-promoting
action (`gh pr ready`, `gh pr merge`, removing a draft label) — you MUST
execute every unchecked item in the PR description's test plan. Build and
launch on each listed platform/simulator, take screenshots to verify, and
check off only items that have been visually or objectively confirmed.
Items that cannot be verified on the host (physical device, external
service) MUST be flagged explicitly with the reason — never silently
skipped.

A readiness claim is any wording that tells the user a PR can go in:
"ready to merge", "ready for your review", "it's mergeable", "waiting for
you to merge it", "good to go", "implementation complete", or an
equivalent. Err on the side of treating a phrase as a claim.

If you catch yourself about to claim PR readiness without having
executed the test plan, STOP. Run the plan. Then claim ready.

A hook blocks the first merge or ready per PR in a session and repeats
this gate. The test-plan format, detection states and fork fallback live
in [`references/pr-validation-procedure.md`](references/pr-validation-procedure.md).

Before `gh pr create`, `gh issue create`, or any edit that rewrites a
PR or issue body, the body MUST follow [Body Format](#body-format).
Do not create or edit the PR or issue until it does.
</HARD-GATE>

<a id="body-format"></a>
## Body Format (PRs and Issues)

Every PR and issue body uses the format for its type. Under each label,
write one-line bullets with concrete details (file, command, value),
not paragraphs.

- **Bug** (existing behavior is wrong): `**EXPECTED RESULT**`,
  `**ACTUAL RESULT**`, `**STEPS TO REPRODUCE**`, each with its bullets.
- **Everything else** (feature, refactor, docs, chore): `**AS A**
  <role>`, `**I WANT TO** <capability>`, `**SO THAT** <outcome>`, then
  bullets of what changes. Refactors and chores name the maintainer as
  the role.
- **Mixed** (a bug fix that also adds capability): include both.

Other sections (Summary, Root cause, Trade-offs) may follow; they don't
replace the required labels. PRs still need `## Test Plan` per the
locator contract in the procedure reference. The When to Skip carve-outs apply to the
test-plan gate only; Body Format has none.

This section rides on this file's symlink. If the rules-reduction
program (claude-config #527) drops `pr-validation.md`, move this
section to a surviving rule first.

## When to Skip

- Single-line edits with no behavioral change (typo, comment, formatting)
- Zero-functional-change PRs via the mechanical carve-out (see below)
- Emergency bypass via `DISABLE_PRESSURE_FLOOR` sentinel (see
  [pressure-framing-floor.md](pressure-framing-floor.md#emergency-bypass-sentinel))

### Zero-functional-change carve-out (mechanical adjudication)

The zero-functional-change carve-out is **agent-adjudicated via a
mechanical `git diff --stat` check**, NOT self-declared — the agent MUST
quote the literal diff stat, all changed paths must match the docs/config
allowlist, and mixed PRs (docs + behavior) MUST run the full gate. The
full procedure (allowlist, quoting requirement, mixed-PR refusal) lives in
[`references/pr-validation-carveout.md`](references/pr-validation-carveout.md#zero-functional-change-carve-out-mechanical-adjudication).

### What counts as an explicit override

See [Skip override — what counts](skip-contract.md#override-skip-contract).
Time pressure is not an override.

### Pressure-framing floor

See [pressure-framing routing](pressure-framing-floor.md#pressure-framing-floor),
[emission contract](skip-contract.md#emission-contract), and
[sentinel bypass](pressure-framing-floor.md#emergency-bypass-sentinel) — canonical mechanics
live in `rules/skip-contract.md` and `rules/pressure-framing-floor.md`.

### Emission contract — MANDATORY

See [Emission contract — per-gate skip honor](skip-contract.md#emission-contract-per-gate). Use `gate="pr-validation"`.

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

<!-- Inter-rule map lives in rules/README.md (not loaded). -->
<!-- Interaction with verification.md: PR validation does not re-run the type-check/test suite if verification.md passed earlier in the same session AND that verify output is quoted in the transcript; it DOES execute test-plan items (user-visible behaviors unit tests don't cover). -->

