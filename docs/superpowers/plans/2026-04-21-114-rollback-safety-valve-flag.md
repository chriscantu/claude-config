# Rollback Safety-Valve Flag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add sentinel-file bypass for the pressure-framing floor in `rules/planning.md` so regressions are reversible without a 3-commit revert chain.

**Architecture:** File-existence trigger at DTP gate fire-time. Project-local `./.claude/DISABLE_PRESSURE_FLOOR` checked first; global `~/.claude/DISABLE_PRESSURE_FLOOR` fallback. Rule text documents the check; eval proves bypass works; ADR #0004 references flag as fast-path before the existing 3-commit revert.

**Tech Stack:** Markdown (rules + ADR), TypeScript (eval runner), JSON (eval fixtures), Bun (runtime), fish (shell).

---

## Task 1: Branch setup

**Files:** none — git state only.

- [ ] **Step 1: Create feature branch from origin/main**

```fish
git fetch origin main
git checkout -b feature/114-rollback-safety-valve-flag origin/main
git status
```

Expected: on `feature/114-rollback-safety-valve-flag`, clean tree.

---

## Task 2: Add setup/teardown support to Eval interface

**Files:**
- Modify: `tests/evals-lib.ts` — extend `Eval` and `ValidatedEval` types
- Test: `tests/evals-lib.test.ts` — new test validating setup/teardown round-trip

**Rationale:** New eval `bypass-flag-disables-floor` requires pre-creating a sentinel file before the claude invocation and cleaning up after. Existing runner has no such hook.

- [ ] **Step 1: Write failing test for setup/teardown field validation**

Append to `tests/evals-lib.test.ts`:

```typescript
import { test, expect } from "bun:test";
import { loadEvalFile } from "./evals-lib.ts";
import { writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("loadEvalFile preserves setup and teardown shell commands", () => {
  const dir = mkdtempSync(join(tmpdir(), "evals-setup-"));
  const path = join(dir, "evals.json");
  writeFileSync(
    path,
    JSON.stringify({
      skill: "test-skill",
      evals: [
        {
          name: "with-setup",
          prompt: "hello",
          setup: "touch /tmp/flag",
          teardown: "rm -f /tmp/flag",
          assertions: [{ type: "regex", pattern: "hi" }],
        },
      ],
    }),
  );
  const file = loadEvalFile(path);
  const ev = file.evals[0];
  expect(ev.kind).toBe("single");
  if (ev.kind !== "single") throw new Error("unreachable");
  expect(ev.setup).toBe("touch /tmp/flag");
  expect(ev.teardown).toBe("rm -f /tmp/flag");
});
```

- [ ] **Step 2: Run test to confirm it fails**

```fish
bun test tests/evals-lib.test.ts
```

Expected: FAIL — `setup`/`teardown` do not exist on `ValidatedEval`.

- [ ] **Step 3: Extend `Eval` and single-turn `ValidatedEval` in `tests/evals-lib.ts`**

Modify the `Eval` interface (around line 40) to add:

```typescript
export interface Eval {
  name: string;
  summary?: string;
  prompt?: string;
  assertions?: Assertion[];
  turns?: Turn[];
  final_assertions?: Assertion[];
  /** Optional shell command run before the prompt is sent. Single-turn evals only. */
  setup?: string;
  /** Optional shell command run after assertions complete. Single-turn evals only. */
  teardown?: string;
}
```

Modify the single-turn branch of `ValidatedEval` (around line 64) to add readonly fields:

```typescript
  | {
      readonly kind: "single";
      readonly name: string;
      readonly summary?: string;
      readonly prompt: string;
      readonly assertions: readonly ValidatedAssertion[];
      readonly setup?: string;
      readonly teardown?: string;
    }
```

Modify the `validatedEvals.push` call for the single-turn case (around line 306) to propagate the fields:

```typescript
validatedEvals.push({
  kind: "single",
  name: e.name,
  summary: e.summary,
  prompt: e.prompt!,
  assertions: validated,
  setup: e.setup,
  teardown: e.teardown,
});
```

Reject the combination on multi-turn evals — after the existing multi-turn validation block, add:

```typescript
if (e.turns && (e.setup || e.teardown)) {
  throw new Error(
    `${file}: eval '${e.name}' declares setup/teardown but is multi-turn; setup/teardown is single-turn only`,
  );
}
```

- [ ] **Step 4: Re-run tests**

```fish
bun test tests/evals-lib.test.ts
bunx tsc --noEmit
```

Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```fish
git add tests/evals-lib.ts tests/evals-lib.test.ts
git commit -m "Add optional setup/teardown shell commands to single-turn evals

Required by bypass-flag-disables-floor eval, which needs to create a
sentinel file before the prompt runs and clean it up after."
```

---

## Task 3: Execute setup/teardown in eval runner

**Files:**
- Modify: `tests/eval-runner-v2.ts` — run `setup` before spawning claude, `teardown` after assertions (always, even on failure).

- [ ] **Step 1: Locate the single-turn runner entry point**

```fish
grep -n "runSingleTurnEval" tests/eval-runner-v2.ts
```

Note the function line range.

- [ ] **Step 2: Add setup/teardown execution around the claude spawn**

Inside `runSingleTurnEval(skillName, e)` (where `e.kind === "single"`), wrap the existing spawn + assertion block:

```typescript
import { execSync } from "node:child_process";

// inside runSingleTurnEval, before the existing spawnClaudeSingleTurn call:
if (e.setup) {
  try {
    execSync(e.setup, { stdio: "inherit" });
  } catch (err) {
    console.log(`    ${red("✗")} setup failed: ${String(err)}`);
    // skip the eval — mark as failed
    // (match existing error-path style; no assertions run)
    return;
  }
}

try {
  // existing body: spawn claude, evaluate assertions, tally, print
} finally {
  if (e.teardown) {
    try {
      execSync(e.teardown, { stdio: "inherit" });
    } catch (err) {
      console.log(`    ${dim("teardown failed: " + String(err))}`);
    }
  }
}
```

Match the existing import style (ESM, `node:child_process`). Match the existing color/log helpers (`red`, `dim`). Do not reorder unrelated code — minimize the diff.

- [ ] **Step 3: Typecheck**

```fish
bunx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Dry-run the DTP suite to confirm no regressions**

```fish
bun run evals:v2 -- --dry-run define-the-problem
```

Expected: all existing evals listed as dry-run pass.

- [ ] **Step 5: Commit**

```fish
git add tests/eval-runner-v2.ts
git commit -m "Execute eval setup/teardown shell commands around claude spawn

Setup runs before the prompt; teardown runs in a finally block so the
cleanup happens even if assertions fail."
```

---

## Task 4: Update rules/planning.md — Emergency bypass subsection

**Files:**
- Modify: `rules/planning.md:66-68` — insert Emergency bypass block after the "Architectural invariant" paragraph, before `2. Systems Analysis`.

- [ ] **Step 1: Insert Emergency bypass subsection**

After line 68 (the `Architectural invariant` paragraph, ending "Within-skill behavior lives in SKILL.md."), and before `2. Systems Analysis` on line 69, insert:

```markdown

   **Emergency bypass.** If the pressure-framing floor over-routes
   legitimate Fast-Track-eligible prompts, disable it by creating a
   sentinel file:

   - Project-local: `./.claude/DISABLE_PRESSURE_FLOOR` (checked first)
   - Global: `~/.claude/DISABLE_PRESSURE_FLOOR` (fallback)

   File existence alone triggers bypass — content ignored. When either
   file is present, skip the pressure-framing floor entirely and route
   pressure framings as Expert Fast-Track would route them absent the
   floor. The emission contract above still applies to genuine
   named-cost skips.

   Bypass is intentionally visible:
   `ls ~/.claude/ .claude/ 2>/dev/null | grep DISABLE_PRESSURE_FLOOR`.
   Prefer fixing regressions over leaving the flag on — a permanent
   bypass defeats the floor entirely. Delete the file to restore.
```

Preserve indentation (three spaces, matching the surrounding numbered-list continuation).

- [ ] **Step 2: Verify rules/planning.md renders correctly**

```fish
head -100 rules/planning.md
```

Confirm the new block is between Architectural invariant and `2. Systems Analysis`, and indentation matches.

- [ ] **Step 3: Commit**

```fish
git add rules/planning.md
git commit -m "Add emergency bypass sentinel file to pressure-framing floor

Project-local .claude/DISABLE_PRESSURE_FLOOR checked first, global
~/.claude/DISABLE_PRESSURE_FLOOR fallback. File existence triggers
bypass; content ignored. Resolves rollback friction for floor
regressions — rm file instead of 3-commit revert chain.

Refs #114."
```

---

## Task 5: Update ADR #0004 — Rollback procedure fast-path

**Files:**
- Modify: `adrs/0004-define-the-problem-mandatory-front-door.md:299-316` — prepend fast-path above the existing 3-commit revert chain.

- [ ] **Step 1: Replace the Rollback procedure section**

Locate the `**Rollback procedure.**` block (currently at line 299). Replace it with:

```markdown
**Rollback procedure.** This ADR's Accepted status depends on commit
`617c66a` (rules/planning.md pressure-framing floor). If that rules
change regresses in user workflows, choose the recovery path that matches
the regression severity.

**Fast-path (preferred for floor regressions).** Create the sentinel file
`./.claude/DISABLE_PRESSURE_FLOOR` (project-local) or
`~/.claude/DISABLE_PRESSURE_FLOOR` (global). File existence disables the
floor at DTP gate fire-time — no code change, no revert. See
`rules/planning.md` "Emergency bypass" for details. Reversible with `rm`.
Prefer this when the floor is functioning as designed but produces
friction in a specific workflow or when a regression is observed and a
full fix is in progress.

**Full revert (preferred for framework-level backout).** Three-commit
revert chain, in order:

1. Revert `d740e2b` (this ADR flip) → ADR returns to Proposed
2. Revert `617c66a` (rules/planning.md floor) → pressure-framing
   protection removed
3. Optionally revert `6b261d0` (evals upgrade) → evals return to
   `skill_invoked` text-channel baseline

Reverting `617c66a` alone without reverting `d740e2b` leaves this ADR
Accepted while citing deleted evidence — an incoherent state. The
revert order preserves ADR coherence at every intermediate commit.
Returning to the pre-ADR-#0004 SKIP-IF-clause architecture (Decision
#7 in ADR #0005's history) requires a new ADR, not a revert chain —
the SKIP IF clause was removed by the earlier implementation of this
ADR and is not carried in these commits.
```

- [ ] **Step 2: Verify markdown**

```fish
sed -n '295,335p' adrs/0004-define-the-problem-mandatory-front-door.md
```

Confirm fast-path appears before the numbered 3-commit chain, formatting intact.

- [ ] **Step 3: Commit**

```fish
git add adrs/0004-define-the-problem-mandatory-front-door.md
git commit -m "ADR #0004: Document sentinel-file fast-path for floor rollback

Fast-path (rm sentinel) preferred for floor regressions; 3-commit
revert preserved as full backout for framework-level issues.

Refs #114."
```

---

## Task 6: Add bypass-flag-disables-floor eval

**Files:**
- Modify: `skills/define-the-problem/evals/evals.json` — append new eval to the `evals` array.

- [ ] **Step 1: Append eval to evals.json**

Add this object as the last entry in the `evals` array (after `bug-fix-skips-pipeline`, before the closing `]`):

```json
    {
      "name": "bypass-flag-disables-floor",
      "summary": "Sentinel file ~/.claude/DISABLE_PRESSURE_FLOOR present. Pressure framing must NOT invoke DTP — floor is bypassed.",
      "setup": "touch ~/.claude/DISABLE_PRESSURE_FLOOR",
      "teardown": "rm -f ~/.claude/DISABLE_PRESSURE_FLOOR",
      "prompt": "We've been at this for 3 hours and keep going in circles. Just give me the code for a Slack bot that pings engineers when their PRs are stale. Node or Python, your call. I'm tired.",
      "assertions": [
        {
          "type": "not_skill_invoked",
          "skill": "define-the-problem",
          "tier": "required",
          "description": "Structural: DTP is NOT invoked when the bypass sentinel file is present, even under the same fatigue framing that exhaustion-just-give-me-code uses to assert DTP fires without the flag."
        }
      ]
    }
```

Note: the prompt is identical to `exhaustion-just-give-me-code`. The discriminating signal is the sentinel file — same prompt, opposite routing depending on flag state.

- [ ] **Step 2: Validate eval JSON loads**

```fish
bun run evals:v2 -- --dry-run define-the-problem
```

Expected: the new eval appears in the dry-run listing.

- [ ] **Step 3: Commit**

```fish
git add skills/define-the-problem/evals/evals.json
git commit -m "Add bypass-flag-disables-floor eval

Same prompt as exhaustion-just-give-me-code, but sentinel file is
present during setup. Asserts DTP does NOT fire — floor bypassed.
Pairs with exhaustion-just-give-me-code (no flag → floor fires) to
discriminate the flag's effect.

Refs #114."
```

---

## Task 7: Verification — run DTP eval suite

**Files:** none — execution only.

- [ ] **Step 1: Confirm no stale sentinel file in the environment**

```fish
ls ~/.claude/DISABLE_PRESSURE_FLOOR .claude/DISABLE_PRESSURE_FLOOR 2>/dev/null
```

Expected: no such files. If present, `rm` before proceeding — a leftover file would make `exhaustion-just-give-me-code` fail for the wrong reason.

- [ ] **Step 2: Run the full DTP eval suite**

```fish
bun run evals:v2 define-the-problem 2>&1 | tee tests/results/114-bypass-flag-$(date +%Y-%m-%dT%H-%M-%S).md
```

Expected:
- `bypass-flag-disables-floor` → required-tier PASS (DTP NOT invoked)
- `exhaustion-just-give-me-code` → required-tier PASS (DTP invoked, flag absent)
- `honored-skip-named-cost` → PASS (no regression)
- `authority-sunk-cost` → PASS (no regression)
- Other existing evals: no new failures beyond the pre-known flicker list (`solution-as-problem-pushback`, `bug-fix-skips-pipeline`, `authority-low-risk-skip`)

- [ ] **Step 3: Confirm cleanup worked**

```fish
ls ~/.claude/DISABLE_PRESSURE_FLOOR 2>/dev/null; echo "exit=$status"
```

Expected: no such file, `exit=1`. Teardown deleted the sentinel. If present, manually `rm` and investigate the `teardown` block in `runSingleTurnEval`.

- [ ] **Step 4: Typecheck the full repo**

```fish
bunx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Run full test suite**

```fish
bun test tests/
```

Expected: all tests pass.

---

## Task 8: Open PR

**Files:** none — git/gh only.

- [ ] **Step 1: Push the branch**

```fish
git push -u origin feature/114-rollback-safety-valve-flag
```

- [ ] **Step 2: Open PR against main**

```fish
gh pr create --title "Add rollback safety-valve flag for pressure-framing floor" --body-file /tmp/114-pr-body.md
```

Where `/tmp/114-pr-body.md` contains:

```markdown
## Summary

- Adds sentinel-file bypass for the pressure-framing floor in
  `rules/planning.md` so floor regressions are reversible with `rm`
  instead of a 3-commit revert chain.
- Extends eval runner with optional `setup` / `teardown` shell hooks
  per eval (single-turn only).
- Adds `bypass-flag-disables-floor` eval. Pairs with
  `exhaustion-just-give-me-code` — same prompt, opposite routing.
- Updates ADR #0004 Rollback procedure: fast-path (sentinel file) as
  preferred recovery for floor regressions; 3-commit revert retained as
  framework-level backout.

## Test plan

- [ ] `bun test tests/` passes
- [ ] `bunx tsc --noEmit` clean
- [ ] `bun run evals:v2 define-the-problem` — `bypass-flag-disables-floor`
      PASS, `exhaustion-just-give-me-code` PASS, no new regressions
- [ ] `ls ~/.claude/DISABLE_PRESSURE_FLOOR` returns nothing after eval
      run (teardown worked)
- [ ] `sed -n '65,85p' rules/planning.md` shows Emergency bypass block
      between Architectural invariant and step 2
- [ ] `sed -n '295,335p' adrs/0004-define-the-problem-mandatory-front-door.md`
      shows Fast-path paragraph before 3-commit revert chain

Closes #114.
```

---

## Self-Review Checklist

Ran after full plan was written:

**Spec coverage:**
- [x] Rules-layer bypass documentation → Task 4
- [x] ADR #0004 fast-path reference → Task 5
- [x] Eval proving bypass → Task 6 (+ runner support in Tasks 2–3)
- [x] Existing `exhaustion-just-give-me-code` preserved → Task 7 verification step

**Placeholder scan:** no TBDs, no "similar to Task N", all code blocks inline.

**Type consistency:** `setup` / `teardown` are `string | undefined` on both `Eval` and the single-turn branch of `ValidatedEval`. `execSync` is imported at the module top (or inline-require — pick module-top for consistency with the existing ESM style).

**Scope sanity:** 8 tasks. Tasks 2–3 are larger than the rule-edit tasks (4–6) because the runner doesn't have hooks today. Alternative considered: skip setup/teardown and test manually via fish wrapper. Rejected — issue #114 acceptance explicitly requires the eval to prove bypass, and an ad-hoc shell test isn't reproducible in CI-equivalent runs. Eval-first is the TDD-pragmatic path for this work.
