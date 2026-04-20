# Pressure-Framing Floor Rule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `~/.claude/rules/pressure-framing-floor.md` rule (via in-repo file + symlink) that enforces ADR #0004's DTP front door against pressure framings (sunk cost, fatigue, authority, time-pressure, cosmetic minimizer) using an enumerate-and-route mechanism.

**Architecture:** Three artifacts — (1) new markdown rule at `rules/pressure-framing-floor.md`, (2) symlink from `~/.claude/rules/pressure-framing-floor.md` to the in-repo file (matches existing pattern for 4 current rule files), (3) static contract test in `tests/evals-lib.test.ts` asserting the rule file exists and contains the enumerated mechanism keywords. No skill, CLAUDE.md, or eval-prompt edits. Verification is three-layered: static (`bun test`), live-suite delta (3 target evals flip green, 17 stay green), qualitative transcript skim.

**Tech Stack:** Markdown (rule), Bun test runner + `node:fs`/`node:path` (contract test), fish shell (symlink creation), `bun run tests/eval-runner-v2.ts` (live suite).

**Spec:** [docs/superpowers/specs/2026-04-20-pressure-framing-floor-rule-design.md](../specs/2026-04-20-pressure-framing-floor-rule-design.md)

---

## File Structure

- **Create:** `/Users/cantu/repos/claude-config/rules/pressure-framing-floor.md` — the rule content. Single responsibility: enumerate pressure-framing mechanisms and prescribe the procedural response (acknowledge → run DTP Fast-Track → honor skip only if user names cost).
- **Create (symlink):** `/Users/cantu/.claude/rules/pressure-framing-floor.md` → the in-repo file above. No independent content; mirrors the existing pattern for `fat-marker-sketch.md`, `planning.md`, `tdd-pragmatic.md`, `verification.md`.
- **Modify:** `/Users/cantu/repos/claude-config/tests/evals-lib.test.ts` — append one `describe` block at the bottom of the file (after the existing `planning.md stage markers contract` block, line 1224-1234). Single responsibility for the new block: prove the rule file exists and contains the five mechanism keywords.
- **Create (artifact):** `tests/results/pressure-framing-floor-live-suite-2026-04-20.log` — live-suite transcript captured during Task 5.

No other files touched. No edits to `skills/*/SKILL.md`, `rules/planning.md`, `global/CLAUDE.md`, `superpowers:using-superpowers`, or any eval fixture.

---

## Task 1: Write the failing contract test

**Files:**
- Modify: `tests/evals-lib.test.ts` (append after line 1234)

- [ ] **Step 1.1: Append the failing test**

Add the following block to the end of `/Users/cantu/repos/claude-config/tests/evals-lib.test.ts`, after the closing `});` of the existing `planning.md stage markers contract` describe block:

```typescript
describe("pressure-framing-floor.md rule contract", () => {
  test("rules/pressure-framing-floor.md exists and enumerates all five mechanisms", () => {
    const rule = readFileSync(
      join(import.meta.dir, "..", "rules", "pressure-framing-floor.md"),
      "utf8",
    );
    // Each enumerated mechanism must appear at least once. These are the
    // five cognitive mechanisms the rule routes through the DTP Fast-Track
    // floor; a silent deletion of any row in the enumeration table must
    // fail this test rather than regressing evals months later.
    expect(rule).toMatch(/sunk cost/i);
    expect(rule).toMatch(/fatigue/i);
    expect(rule).toMatch(/authority/i);
    expect(rule).toMatch(/time[- ]pressure/i);
    expect(rule).toMatch(/cosmetic/i);
  });
});
```

- [ ] **Step 1.2: Run the test to verify it fails**

Run: `bun test tests/evals-lib.test.ts 2>&1 | tail -30`

Expected: FAIL with `ENOENT: no such file or directory` pointing at `rules/pressure-framing-floor.md`. The other 104 tests in the file should still pass.

- [ ] **Step 1.3: Commit the failing test**

```fish
git add tests/evals-lib.test.ts
git commit -m "Add failing contract test for pressure-framing-floor rule

TDD red step — rule file does not exist yet. Next commit adds the
rule file and the test flips green.

Refs #90."
```

---

## Task 2: Create the rule file (make the contract test pass)

**Files:**
- Create: `rules/pressure-framing-floor.md`

- [ ] **Step 2.1: Write the rule file**

Create `/Users/cantu/repos/claude-config/rules/pressure-framing-floor.md` with the following exact content:

```markdown
# Pressure-Framing Floor

<HARD-GATE>
When a user prompt contains a pressure framing (sunk cost, fatigue,
authority, time-pressure, cosmetic minimizer), do NOT bypass the DTP
front door. Run the DTP Fast-Track floor (~30s) regardless.

A skip request is honored only when the user explicitly names the
specific cost being accepted (e.g., "skip DTP, I accept the risk of
building on an unstated problem"). Bare skip requests and generic
framings ("just give me code", "contract is signed", "CTO approved",
"ship by Friday", "just a column") are NOT overrides — route them to
the floor.
</HARD-GATE>

## Why This Rule Exists

ADR #0004 makes DTP the mandatory front door to the planning pipeline,
but the `superpowers:using-superpowers` priority ordering places
CLAUDE.md and direct user requests at the same tier 1. Under pressure
framings, in-prompt instructions were winning the skill picker and DTP
was being skipped — reproducibly, across the `sunk-cost-migration`,
`sunk-cost-migration-multi-turn`, and `exhaustion-just-give-me-code`
regression evals. Three attempts on 2026-04-17 to fix at the
skill-description or `rules/planning.md` pressure-stacking layer were
all reverted; see the 2026-04-17 decision doc. The multi-turn eval
substrate (PR #106) and tiered-channel assertion model (PR #107)
produce the discriminating signal this rule is validated against.
This rule lands the fix at the loading-order layer — rules load at
session start, before the skill picker runs — not by asserting
precedence over user instructions.

## Enumerated Framings

| Mechanism | Example triggers |
|---|---|
| sunk cost / consistency bias | "contract signed", "we already decided", "don't re-analyze", "already committed" |
| fatigue-driven bypass | "just give me the code", "been at this for hours", "too tired to go through this" |
| authority bias | "CTO/VP/principal said it's low-risk", "leadership already approved" |
| time-pressure bypass | "ship by Friday", "meeting in 10 minutes", "no time for this" |
| cosmetic minimizer | "just a column", "just a toggle", "small change", "it's tiny" |

## Procedural Response

When a phrase from the enumeration is detected:

1. Acknowledge the framing in one sentence. Name the **mechanism**, not the user.
   (e.g., "That reads as a sunk-cost framing — the committed decision fixes
   scope but doesn't remove the surface area we need to map.")
2. Run DTP Fast-Track regardless (~30s). Invoke `/define-the-problem`.
3. If the user responds by naming the specific cost being accepted (per the
   skip contract in `skills/define-the-problem/SKILL.md`), honor the full
   skip. If they repeat the framing without naming a cost, the floor stays.

## What This Rule Does NOT Do

- Does not override ADR #0004 — it enforces ADR #0004.
- Does not modify `superpowers:using-superpowers` priority ordering.
- Does not gate bug-fix or refactor prompts (DTP already routes those past
  per its "When This Skill Routes Elsewhere" section).
- Does not require specific wording to honor a named-cost skip — the user's
  phrasing can vary as long as the specific cost is named.

## Relationship to Existing Artifacts

- `rules/planning.md` — this rule enforces planning.md's HARD-GATE step 1
  "Skip contract" clause at the session-context layer. No new gate is
  introduced; the enforcement layer moves earlier in the loading order.
- `skills/define-the-problem/SKILL.md` — the skip contract lives there;
  this rule routes pressure framings through it rather than duplicating
  the contract.
- `skills/systems-analysis/SKILL.md` — systems-analysis has its own
  rationalization table for stage 2 of the pipeline. This rule covers the
  pipeline front door (stage 1 / DTP). The two are complementary, not
  redundant.
```

- [ ] **Step 2.2: Run the contract test to verify it passes**

Run: `bun test tests/evals-lib.test.ts 2>&1 | tail -15`

Expected: PASS for `pressure-framing-floor.md rule contract > rules/pressure-framing-floor.md exists and enumerates all five mechanisms`. All 105 tests in the file green.

- [ ] **Step 2.3: Commit the rule file**

```fish
git add rules/pressure-framing-floor.md
git commit -m "Add pressure-framing-floor rule

Enumerates sunk cost, fatigue, authority, time-pressure, and cosmetic
minimizer framings; routes each through DTP Fast-Track via the skip
contract in skills/define-the-problem/SKILL.md. Loading-order mechanism
— rules load before the skill picker runs, so no precedence claim over
user instructions is made.

Contract test flips green with this commit.

Refs #90."
```

---

## Task 3: Create the symlink into `~/.claude/rules/`

**Files:**
- Create (symlink): `/Users/cantu/.claude/rules/pressure-framing-floor.md` → `/Users/cantu/repos/claude-config/rules/pressure-framing-floor.md`

The symlink is what actually wires the rule into Claude Code's session-start rule loading. Without it, the rule exists in the repo but Claude Code never reads it.

- [ ] **Step 3.1: Create the symlink**

Run (fish shell):

```fish
ln -s /Users/cantu/repos/claude-config/rules/pressure-framing-floor.md /Users/cantu/.claude/rules/pressure-framing-floor.md
```

- [ ] **Step 3.2: Verify the symlink is correct**

Run: `ls -la /Users/cantu/.claude/rules/`

Expected output: five symlinks including the new one pointing at the in-repo path. The new line should read:

```
lrwxr-xr-x@  1 cantu  staff   ... pressure-framing-floor.md -> /Users/cantu/repos/claude-config/rules/pressure-framing-floor.md
```

Also run: `cat /Users/cantu/.claude/rules/pressure-framing-floor.md | head -5`

Expected: the first five lines of the rule file (starts with `# Pressure-Framing Floor`). Proves the symlink resolves.

- [ ] **Step 3.3: No commit**

Symlinks under `~/.claude/rules/` are outside the repo. The in-repo file (Task 2) is what ships; the symlink is local-machine wiring that each user of this config replicates. Skip the commit step.

---

## Task 4: Layer 1 — Static verification

**Files:**
- None modified; runs existing tooling.

- [ ] **Step 4.1: Run the full test suite**

Run: `bun test tests/evals-lib.test.ts 2>&1 | tail -20`

Expected: 105 tests pass, 0 fail. Pay attention to:
- `pressure-framing-floor.md rule contract` — PASS
- `planning.md stage markers contract` — PASS (must not regress)
- All existing 103 tests — PASS

- [ ] **Step 4.2: Dry-run the eval runner schema loader**

Run: `bun run tests/eval-runner-v2.ts --dry-run 2>&1 | tail -10`

Expected: JSON loads cleanly for all 22 evals, zero schema errors. This confirms the rule addition did not accidentally affect eval parsing (belt-and-suspenders — no eval files were touched, so this should trivially hold).

- [ ] **Step 4.3: Type-check**

Run: `bunx tsc --noEmit 2>&1 | tail -10`

Expected: no errors. Confirms the contract test block type-checks.

---

## Task 5: Layer 2 — Live-suite delta

**Files:**
- Create (artifact): `tests/results/pressure-framing-floor-live-suite-2026-04-20.log`

The live suite runs 22 evals via `claude --print` / `claude --resume` and takes ~30 minutes. This is the load-bearing verification: it proves the rule actually flips the 3 failing evals green without regressing the 17 currently green.

- [ ] **Step 5.1: Run the full live suite**

Run (background recommended; ~30 min):

```fish
bun run tests/eval-runner-v2.ts 2>&1 | tee tests/results/pressure-framing-floor-live-suite-2026-04-20.log
```

When it finishes, grep the log for the summary line:

```fish
grep -E "^(PASS|FAIL|evals passed|assertions passed)" tests/results/pressure-framing-floor-live-suite-2026-04-20.log | tail -20
```

- [ ] **Step 5.2: Confirm the 3 target evals flipped green**

Run:

```fish
grep -E "^(PASS|FAIL).*(sunk-cost-migration|sunk-cost-migration-multi-turn|exhaustion-just-give-me-code)" tests/results/pressure-framing-floor-live-suite-2026-04-20.log
```

Expected: three `PASS` lines, one per target eval. If any line reads `FAIL`, the rule wording is not winning against the in-prompt framing for that eval. Go to Step 5.4.

- [ ] **Step 5.3: Confirm no regressions in the 17 previously green evals**

Run:

```fish
grep -E "^FAIL" tests/results/pressure-framing-floor-live-suite-2026-04-20.log
```

Expected: ≤2 FAIL lines, and only for `self-contained-shell-completions` and/or `bug-fix-skips-pipeline` (both explicitly out of scope per the spec's Non-goals section).

If any of the 17 previously green evals shows `FAIL`, that is a regression — the rule is over-reaching. Do NOT proceed. Most likely culprit: the rule is gating a legitimate bug-fix or named-cost-skip prompt. Re-read the rule's "What This Rule Does NOT Do" section and revise the rule wording to tighten scope.

**Critical regression to check:** `honored-skip-named-cost` — this eval verifies that a user who names the cost ("skip DTP, I accept the risk of building on an unstated problem") is honored. If this flips red, the rule is too absolute. Revise by re-emphasizing step 3 of the "Procedural Response" section.

- [ ] **Step 5.4: Iteration budget (if needed)**

If Step 5.2 or 5.3 shows a problem, the iteration budget is **1-2 re-runs** within the same PR:

1. Revise `rules/pressure-framing-floor.md` based on transcript evidence (read the failing eval's transcript in `tests/results/` for the specific skill/mechanism the model invoked instead of DTP).
2. Amend the Task 2 commit: `git add rules/pressure-framing-floor.md && git commit --amend --no-edit`.
3. Re-run Step 5.1 → Step 5.3.

If after 2 iterations the 3 target evals still do not flip green, STOP. The loading-order hypothesis may be wrong, or the rule wording is structurally insufficient. Surface this in a comment on the spec and escalate — do not bundle a 3rd iteration or drop target evals from the success criteria.

- [ ] **Step 5.5: Commit the live-suite transcript**

```fish
git add tests/results/pressure-framing-floor-live-suite-2026-04-20.log
git commit -m "Add live-suite transcript for pressure-framing-floor rule

3 target evals green (sunk-cost-migration,
sunk-cost-migration-multi-turn, exhaustion-just-give-me-code), 17
previously green evals stay green. self-contained-shell-completions
and bug-fix-skips-pipeline remain red (out of scope per spec).

Refs #90."
```

---

## Task 6: Layer 3 — Qualitative transcript skim

**Files:**
- None modified; reads transcripts from Task 5.

The qualitative pass catches **pipeline theater** — the model announcing stages without running them. Structural `tool_input_matches` assertions on turn 1 catch the most egregious cases, but turns 2-3 on `--resume` depend on text markers that can be spoofed by a sufficiently fluent model that is not actually executing the pipeline.

- [ ] **Step 6.1: Read each of the 3 flipped transcripts**

For each of the three target evals, open the per-run transcript:

```fish
ls tests/results/systems-analysis-sunk-cost-migration-v2-*.md | tail -1
ls tests/results/systems-analysis-sunk-cost-migration-multi-turn-v2-*.md | tail -1
ls tests/results/systems-analysis-exhaustion-just-give-me-code-v2-*.md | tail -1
```

Read each file end-to-end. Look for:

1. **Mechanism named in one sentence.** The model should acknowledge the framing explicitly — "that reads as a sunk-cost framing" or "that's a fatigue bypass" — before running DTP. If the acknowledgement is missing or buried, the rule's Procedural Response step 1 is not landing.
2. **DTP actually runs.** The transcript should show either a `Skill` tool-use with `skill="define-the-problem"` OR the expected `[Stage: Problem Definition]` marker followed by problem-statement content (user, problem, impact, evidence). A transcript that announces the stage without producing the content is theater.
3. **Skip contract honored only when cost named.** If the prompt includes a bare skip, the transcript should NOT honor it — it should route to the floor. If the prompt includes a named-cost skip, the transcript SHOULD honor it (single-turn passthrough).

- [ ] **Step 6.2: Record findings**

If all three transcripts clear the qualitative check, the ship criterion is met. If any transcript shows theater symptoms, revise the rule (most likely: tighten step 2 of "Procedural Response" to require structural tool invocation, not just a textual marker) and return to Task 5 Step 5.4 for a re-run.

- [ ] **Step 6.3: No commit**

Qualitative findings live in the PR description, not in-repo. If revisions were needed, they're captured in the Task 2 amend.

---

## Task 7: PR preparation and description

**Files:**
- None modified; produces PR description.

- [ ] **Step 7.1: Push the branch**

Branch is `feature/pressure-framing-floor-rule`.

```fish
git checkout -b feature/pressure-framing-floor-rule 2>/dev/null; or git checkout feature/pressure-framing-floor-rule
git push -u origin feature/pressure-framing-floor-rule
```

- [ ] **Step 7.2: Draft the PR description**

Write the PR description to `/tmp/pr-pressure-framing-floor.md` with the following content:

```markdown
## Summary

- Adds `rules/pressure-framing-floor.md` — an enumerate-and-route rule
  that routes sunk-cost, fatigue, authority, time-pressure, and
  cosmetic-minimizer framings through the DTP Fast-Track floor instead
  of letting them bypass the front door.
- Adds a static contract test that fails if the rule file is deleted or
  any of the five enumerated mechanisms goes missing.
- Closes the behavioral side of #90. Infrastructure side was closed by
  PR #106 (multi-turn substrate) and PR #107 (tiered-channel assertion
  model).

## Mechanism

The rule is loaded at session start via the `~/.claude/rules/` symlink
— **before** the skill picker sees the prompt. This is the lever: not a
precedence claim over user instructions (the 2026-04-17 rake), but an
earlier loading moment. External convergence: Constitutional AI,
informed consent, jailbreak-resistance, defense-in-depth all favor
enumerate-and-route over precedence-claim.

## Verification

**Layer 1 — static** (PASS)
- `bun test tests/evals-lib.test.ts` — 105/105 green
- `bunx tsc --noEmit` — clean
- `bun run tests/eval-runner-v2.ts --dry-run` — clean

**Layer 2 — live-suite delta** (PASS)
- 3 target evals flipped green: `sunk-cost-migration`,
  `sunk-cost-migration-multi-turn`, `exhaustion-just-give-me-code`.
- 17 previously green evals stay green — including
  `honored-skip-named-cost` (critical: rule must not gate named-cost
  overrides).
- 2 evals stay red (explicitly out of scope per spec Non-goals):
  `self-contained-shell-completions`, `bug-fix-skips-pipeline`.
- Transcript: `tests/results/pressure-framing-floor-live-suite-2026-04-20.log`

**Layer 3 — qualitative** (PASS)
- All 3 flipped transcripts show: mechanism named in one sentence, DTP
  actually runs (not theater), skip contract honored only on
  named-cost retraction.

## Spec & Design

- Spec: [docs/superpowers/specs/2026-04-20-pressure-framing-floor-rule-design.md](docs/superpowers/specs/2026-04-20-pressure-framing-floor-rule-design.md)
- Plan: [docs/superpowers/plans/2026-04-20-pressure-framing-floor-rule.md](docs/superpowers/plans/2026-04-20-pressure-framing-floor-rule.md)

## Follow-ups (not bundled per G2)

- **PR B:** governance ADR codifying "ADR status promotes from Proposed
  → Accepted only after regression eval produces a discriminating
  required-channel signal."
- **PR C:** flip ADR #0004 from `Proposed` → `Accepted` citing this PR's
  transcript and PR B as governance basis.

## Test plan

- [x] Layer 1 (static) green
- [x] Layer 2 (live-suite) transcript attached
- [x] 3 target evals flipped green; no regressions in the 17
- [x] Layer 3 qualitative skim: no pipeline-theater symptoms
- [x] Spec and plan referenced in PR body

Refs #90.
```

- [ ] **Step 7.3: Create the PR**

```fish
gh pr create --title "Add pressure-framing-floor rule (closes #90 behavioral side)" --body-file /tmp/pr-pressure-framing-floor.md
```

- [ ] **Step 7.4: Verify PR created and CI green**

Run: `gh pr view --json url,state,statusCheckRollup | tail -30`

Expected: `state: OPEN`, CI checks passing. Post the PR URL back to the user.

---

## Done Criteria

All of the following must hold before marking this plan complete:

1. `rules/pressure-framing-floor.md` exists with all five enumerated mechanisms.
2. `~/.claude/rules/pressure-framing-floor.md` symlink resolves to the in-repo file.
3. Contract test in `tests/evals-lib.test.ts` passes (105/105 tests green).
4. Live-suite log committed to `tests/results/`.
5. `sunk-cost-migration`, `sunk-cost-migration-multi-turn`, and `exhaustion-just-give-me-code` all green.
6. 17 previously green evals — including `honored-skip-named-cost` — stay green.
7. Qualitative skim of the 3 flipped transcripts shows no pipeline-theater.
8. PR open, CI green, description references the spec and plan.
