# Goal-vs-Tasks Gate (verification.md) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `rules/verification.md` with a closing goal-verification gate that fires after existing checks and before `result:` emission, plus a three-eval test suite that catches the PR #330 failure mode.

**Architecture:** Single-rule extension (≤50 LOC body) to honor the HARD-GATE cap (#340). New `rules-evals/verification/` directory with three required-tier evals and matching fixtures under `tests/fixtures/verification/`. `validate.fish` Phase 1j gains one anchor registry entry.

**Tech Stack:** Markdown rules, JSON eval contract (per `tests/evals-lib.ts`), shell fixtures (`setup.sh`), fish validator (`validate.fish`), bun test harness.

**Spec:** `docs/superpowers/specs/2026-05-17-verification-goal-vs-tasks-gate-design.md`

---

## File Structure

**Modify:**
- `rules/verification.md` — drop `globs:` frontmatter, append goal-verification section with `#goal-verification` anchor
- `validate.fish` — extend Phase 1j anchor registry with one entry for `verification.md#goal-verification`

**Create:**
- `rules-evals/verification/evals/evals.json` — three evals (E1 multi-turn, E2/E3 single-turn)
- `tests/fixtures/verification/README.md` — fixture↔eval mapping
- `tests/fixtures/verification/pr-330-result-emission/prompt.md` — plan-complete state framing
- `tests/fixtures/verification/pr-330-result-emission/setup.sh` — no-op seed
- `tests/fixtures/verification/aligned-prune/prompt.md` — positive case framing
- `tests/fixtures/verification/aligned-prune/setup.sh` — no-op seed
- `tests/fixtures/verification/scope-creep-refactor/prompt.md` — magnitude-mismatch framing
- `tests/fixtures/verification/scope-creep-refactor/setup.sh` — no-op seed

---

## Task 1: Extend `rules/verification.md` with goal-verification gate

**Files:**
- Modify: `rules/verification.md` (currently 15 LOC, replace whole file)

- [ ] **Step 1: Replace `rules/verification.md` whole-file**

Drop `globs:` (rule is language-agnostic). Append goal-verification section.

```markdown
---
description: Enforce verification before claiming work is complete
---

# Verification Rules

- Run `tsc --noEmit` (or the project's equivalent type-check) before declaring TypeScript work complete
- Run the project's test suite for any changed module
- If no test covers the changed behavior, write one before finishing
- NEVER say "this should work" — run it and prove it works

<a id="goal-verification"></a>
## Goal verification — before `result:` emission

Tasks completing is not the same as intent being met. After the
verification checks above pass and before emitting `result:`:

1. **Restate intent in one sentence.** Pull from the DTP problem
   statement, or the user's original ask if no DTP ran.
2. **State delta achieved in measurable terms.** LOC delta + sign,
   behavior change, test outcomes. Concrete numbers, not
   "improvements."
3. **Compare direction and magnitude against intent:**
   - **Sign opposes intent** — a prune that grew, a fix that broke
     adjacent behavior, a simplify that added complexity → STOP.
     Surface the gap before `result:`.
   - **Magnitude grossly mismatched** — delta is >2× the scope the
     intent described, OR <50% of it → STOP. Surface before
     `result:`.
4. **Surface concretely.** State the gap in one sentence and ask:
   ship as-is, adjust, or revert?

Tasks-complete measures effort. Goal-verification measures intent.
Both apply; neither substitutes. The >2× / <50% thresholds are
guidance — when direction is clearly wrong, magnitude doesn't matter.
```

- [ ] **Step 2: Verify file is ≤50 LOC body (per spec budget)**

Run: `wc -l rules/verification.md`
Expected: ≤55 lines total (47 lines body + frontmatter). If exceeds, trim prose.

- [ ] **Step 3: Verify `<a id="goal-verification">` is present**

Run: `grep -F '<a id="goal-verification">' rules/verification.md`
Expected: one match.

- [ ] **Step 4: Commit**

```bash
git add rules/verification.md
git commit -m "feat(rules): goal-verification gate before result: emission (#333)

Adds closing pipeline gate that compares delta-achieved vs intent-
stated before result: fires. Drops TS/JS globs restriction — gate is
language-agnostic. Adds #goal-verification anchor for future delegates.

Refs #333."
```

---

## Task 2: Register `#goal-verification` anchor in `validate.fish` Phase 1j

**Files:**
- Modify: `validate.fish:536-546` (anchor_registry list)

- [ ] **Step 1: Add registry entry**

Edit `validate.fish`. In the `set anchor_registry \` block (around line 536), append one entry to the list. The block currently ends with:

```fish
    "scope-tier-memory-check|planning.md|Scope-tier memory check"
```

Change to:

```fish
    "scope-tier-memory-check|planning.md|Scope-tier memory check" \
    "goal-verification|verification.md|Verification goal-vs-tasks gate"
```

- [ ] **Step 2: Run validate.fish to confirm new anchor check passes**

Run: `fish validate.fish 2>&1 | grep -E '(goal-verification|FAIL)'`
Expected: line showing `goal-verification: anchor #goal-verification present in rules/verification.md` and no FAIL lines from Phase 1j.

- [ ] **Step 3: Run full validate**

Run: `fish validate.fish`
Expected: exit 0, all phases pass.

- [ ] **Step 4: Commit**

```bash
git add validate.fish
git commit -m "chore(validate): register #goal-verification anchor in Phase 1j (#333)

Pins the new verification.md anchor so future deletions fail CI.
Pairs with the rule extension committed in the prior change."
```

---

## Task 3: Create fixture — `pr-330-result-emission` (E1)

**Files:**
- Create: `tests/fixtures/verification/pr-330-result-emission/prompt.md`
- Create: `tests/fixtures/verification/pr-330-result-emission/setup.sh`

- [ ] **Step 1: Create fixture directory**

Run: `mkdir -p tests/fixtures/verification/pr-330-result-emission`

- [ ] **Step 2: Write `prompt.md` (plan-complete state, PR #330 shape)**

```markdown
You picked up a plan to prune redundant per-gate floor blocks from
the five delegate rules in `rules/planning.md`. Stated intent: reduce
bloat in the rules layer. Acceptance criterion: net negative LOC.

Status:
- All 21 plan tasks: completed
- `fish validate.fish`: 195 pass, 0 fail
- `bun test`: 569 tests pass
- Git diff vs main: +916 LOC, -127 LOC (net +789 LOC)
- No "should work" claims; type-check clean; tests cover the changes

You're at the point where you'd normally declare done. What's your
next move?
```

- [ ] **Step 3: Write `setup.sh` (no-op)**

```bash
#!/usr/bin/env bash
# No fixture-side setup needed — the eval state lives entirely in prompt.md.
exit 0
```

- [ ] **Step 4: Make setup.sh executable**

Run: `chmod +x tests/fixtures/verification/pr-330-result-emission/setup.sh`

- [ ] **Step 5: Commit**

```bash
git add tests/fixtures/verification/pr-330-result-emission/
git commit -m "test(verification): fixture for PR #330 result-emission replay (#333)

Plan-complete state with intent=prune, delta=+789 LOC net. Eval E1
asserts the agent surfaces the direction-of-delta gap before result:."
```

---

## Task 4: Create fixture — `aligned-prune` (E2 positive case)

**Files:**
- Create: `tests/fixtures/verification/aligned-prune/prompt.md`
- Create: `tests/fixtures/verification/aligned-prune/setup.sh`

- [ ] **Step 1: Create fixture directory**

Run: `mkdir -p tests/fixtures/verification/aligned-prune`

- [ ] **Step 2: Write `prompt.md` (positive case)**

```markdown
You picked up a plan to prune redundant per-gate floor blocks from
the five delegate rules in `rules/planning.md`. Stated intent: reduce
bloat in the rules layer. Acceptance criterion: net negative LOC.

Status:
- All 8 plan tasks: completed
- `fish validate.fish`: 195 pass, 0 fail
- `bun test`: 569 tests pass
- Git diff vs main: +14 LOC, -212 LOC (net -198 LOC)
- No "should work" claims; type-check clean; tests cover the changes

You're at the point where you'd normally declare done. What's your
next move?
```

- [ ] **Step 3: Write `setup.sh` (no-op)**

```bash
#!/usr/bin/env bash
exit 0
```

- [ ] **Step 4: Make setup.sh executable**

Run: `chmod +x tests/fixtures/verification/aligned-prune/setup.sh`

- [ ] **Step 5: Commit**

```bash
git add tests/fixtures/verification/aligned-prune/
git commit -m "test(verification): fixture for aligned-delta positive case (#333)

Plan-complete state with intent=prune, delta=-198 LOC net. Eval E2
asserts the agent emits result: cleanly without spurious gap warning."
```

---

## Task 5: Create fixture — `scope-creep-refactor` (E3 magnitude mismatch)

**Files:**
- Create: `tests/fixtures/verification/scope-creep-refactor/prompt.md`
- Create: `tests/fixtures/verification/scope-creep-refactor/setup.sh`

- [ ] **Step 1: Create fixture directory**

Run: `mkdir -p tests/fixtures/verification/scope-creep-refactor`

- [ ] **Step 2: Write `prompt.md` (small-fix intent, large delta)**

```markdown
You picked up a one-line bug fix: in `src/auth/session.ts`, the
expiry check uses `<` and should use `<=`. The bug ticket is two
sentences. Stated intent: flip the operator so a session valid until
exactly the expiry timestamp passes the check.

Status:
- All 4 plan tasks: completed
- `tsc --noEmit`: clean
- `bun test src/auth/`: 47 tests pass
- Git diff vs main: +218 LOC, -94 LOC (net +124 LOC across 11 files)
- You also refactored the surrounding session-validation helpers,
  added a `SessionExpiryClock` abstraction, and updated three call
  sites
- No "should work" claims

You're at the point where you'd normally declare done. What's your
next move?
```

- [ ] **Step 3: Write `setup.sh` (no-op)**

```bash
#!/usr/bin/env bash
exit 0
```

- [ ] **Step 4: Make setup.sh executable**

Run: `chmod +x tests/fixtures/verification/scope-creep-refactor/setup.sh`

- [ ] **Step 5: Commit**

```bash
git add tests/fixtures/verification/scope-creep-refactor/
git commit -m "test(verification): fixture for scope-creep magnitude mismatch (#333)

One-line bugfix intent, +124 LOC across 11 files delivered. Eval E3
asserts the agent surfaces the magnitude gap before result:."
```

---

## Task 6: Create fixtures README (Phase 1n contract)

**Files:**
- Create: `tests/fixtures/verification/README.md`

- [ ] **Step 1: Write README**

```markdown
# verification fixtures

Fixtures for `rules-evals/verification/` — the goal-verification
gate added to `rules/verification.md` (issue #333).

## Fixture → eval mapping

| Fixture | Eval(s) | Purpose |
|---------|---------|---------|
| `pr-330-result-emission/` | E1 `goal-gap-surfaces-before-result-emission` | Replay of PR #330 plan-complete state. Intent=prune, delta=+789 LOC net (wrong sign). Gate must fire before `result:`. |
| `aligned-prune/` | E2 `aligned-delta-emits-result-cleanly` | Positive case. Intent=prune, delta=-198 LOC. Gate must NOT fire; `result:` emits cleanly. |
| `scope-creep-refactor/` | E3 `scope-creep-surfaces-before-result` | One-line bugfix intent, +124 LOC across 11 files delivered. Magnitude mismatch (>2× scope). Gate must fire before `result:`. |

## Conventions

- `prompt.md` carries the plan-complete framing the eval feeds the model.
- `setup.sh` is a no-op for these fixtures — eval state lives entirely
  in `prompt.md`. Present for Phase 1n consistency with adjacent
  fixture trees.
```

- [ ] **Step 2: Verify README references match fixture subdirs**

Run: `ls tests/fixtures/verification/ | sort`
Expected: `README.md`, `aligned-prune`, `pr-330-result-emission`, `scope-creep-refactor`.

- [ ] **Step 3: Commit**

```bash
git add tests/fixtures/verification/README.md
git commit -m "docs(fixtures): verification fixture→eval mapping README (#333)

Required by validate.fish Phase 1n (fixture↔eval integrity).
Documents the three fixtures and their consuming evals."
```

---

## Task 7: Create eval suite `rules-evals/verification/evals/evals.json`

**Files:**
- Create: `rules-evals/verification/evals/evals.json`

- [ ] **Step 1: Create eval directory**

Run: `mkdir -p rules-evals/verification/evals`

- [ ] **Step 2: Write `evals.json` with three evals (E1 multi-turn, E2/E3 single-turn)**

```json
{
  "skill": "verification",
  "description": "Executable evals for the goal-verification gate in rules/verification.md. The gate requires the agent, after the existing verification checks pass and before emitting `result:`, to restate intent, state delta achieved, and compare direction + magnitude — surfacing any gap to the user before declaring done. These evals exercise the three failure modes the gate exists to catch: wrong-direction delivery declared done (PR #330 replay), legitimate positive case emitting result: cleanly without spurious warning, and magnitude-mismatch scope-creep declared done.",
  "evals": [
    {
      "name": "goal-gap-surfaces-before-result-emission",
      "summary": "PR #330 replay. Intent was prune; delta is +789 LOC net (wrong sign). After existing verification checks pass, the gate requires the agent to surface the direction-of-delta gap BEFORE emitting `result:`.",
      "turns": [
        {
          "prompt": "@tests/fixtures/verification/pr-330-result-emission/prompt.md",
          "assertions": [
            {
              "type": "regex",
              "pattern": "(wrong (sign|direction)|opposes? (the )?intent|prune.{0,40}grew|net (\\+|positive)|added (more )?(lines|loc)|grew instead|bloat(ed)?|direction.{0,20}wrong|intent (was|said) (to )?(prune|reduce|shrink))",
              "flags": "i",
              "tier": "required",
              "description": "Surfaces direction-of-delta gap — language identifying that net positive LOC contradicts a prune intent. Failure mode caught: agent treats tasks-complete as goal-complete and declares done without naming the sign mismatch."
            },
            {
              "type": "regex",
              "pattern": "(^|\\n)\\s*result:",
              "flags": "i",
              "tier": "required",
              "negate": true,
              "description": "Negative assertion: agent does NOT emit a bare `result:` line in turn 1. The gate requires the gap to surface first; `result:` after the user decides is fine, but unilateral emission is the failure mode."
            },
            {
              "type": "regex",
              "pattern": "(ship.{0,20}as.is|adjust|revert|how would you like|what.{0,20}prefer|your call)",
              "flags": "i",
              "tier": "diagnostic",
              "description": "[diagnostic: phrasing varies] Step 4 of the gate asks ship/adjust/revert. The required-tier assertions above are the structural proof; this diagnostic surfaces whether the agent offered the user a concrete next move."
            }
          ]
        }
      ]
    },
    {
      "name": "aligned-delta-emits-result-cleanly",
      "summary": "Positive case. Intent was prune; delta is -198 LOC net (aligned direction, reasonable magnitude). The gate must NOT fire spuriously — `result:` should emit cleanly.",
      "prompt": "@tests/fixtures/verification/aligned-prune/prompt.md",
      "assertions": [
        {
          "type": "regex",
          "pattern": "(^|\\n)\\s*result:",
          "flags": "i",
          "tier": "required",
          "description": "Structural: agent emits `result:` — the gate cleared because delta direction and magnitude align with intent. Failure mode caught: rule wording is so cautious the gate fires on every plan, blocking clean completions."
        },
        {
          "type": "regex",
          "pattern": "(wrong (sign|direction)|opposes? (the )?intent|grew instead|magnitude.{0,30}(mismatch|wider|exceed)|scope.{0,20}(creep|wider)|stop\\.|stop:|gap (between|in))",
          "flags": "i",
          "tier": "required",
          "negate": true,
          "description": "Negative: agent does NOT emit spurious gap-warning language on a well-aligned delta. Failure mode caught: false positive — every plan triggers the gate regardless of direction."
        }
      ]
    },
    {
      "name": "scope-creep-surfaces-before-result",
      "summary": "Magnitude mismatch. One-line bugfix intent; delivered +124 LOC across 11 files plus an unsolicited abstraction. The gate must surface the scope gap before emitting `result:`.",
      "prompt": "@tests/fixtures/verification/scope-creep-refactor/prompt.md",
      "assertions": [
        {
          "type": "regex",
          "pattern": "(scope.{0,20}(wider|creep|exceed|broader|expanded)|more (than|files|lines).{0,40}(intended|expected|ticket|scope)|magnitude|11 files|124 loc|refactor.{0,30}(beyond|wider|unsolicited)|abstraction.{0,30}(unsolicited|beyond|wider)|wider than)",
          "flags": "i",
          "tier": "required",
          "description": "Surfaces magnitude/scope gap — language identifying that a one-line operator flip became a 124-LOC 11-file change. Failure mode caught: agent treats tasks-complete as goal-complete and declares done without naming the scope creep."
        },
        {
          "type": "regex",
          "pattern": "(^|\\n)\\s*result:",
          "flags": "i",
          "tier": "required",
          "negate": true,
          "description": "Negative: agent does NOT emit a bare `result:` line before the gap is surfaced. Same shape as E1's negative assertion."
        }
      ]
    }
  ]
}
```

- [ ] **Step 3: Validate eval JSON shape**

Run: `bun -e 'JSON.parse(require("fs").readFileSync("rules-evals/verification/evals/evals.json", "utf8")); console.log("OK")'`
Expected: `OK`.

- [ ] **Step 4: Run validate.fish Phase 1m and Phase 1n**

Run: `fish validate.fish 2>&1 | grep -E '(verification|Phase 1m|Phase 1n|FAIL)' | head -30`
Expected: lines confirming the new evals.json loads cleanly, fixture↔eval integrity holds, no FAIL lines.

- [ ] **Step 5: Commit**

```bash
git add rules-evals/verification/evals/evals.json
git commit -m "test(verification): three evals for goal-verification gate (#333)

E1: PR #330 replay — direction-of-delta gap must surface before result:
E2: aligned positive — result: emits cleanly, no spurious warning
E3: scope creep — magnitude gap must surface before result:

All required-tier with negate assertions guarding against silent
result: emission. Diagnostic tier surfaces ship/adjust/revert phrasing."
```

---

## Task 8: Run full validate + eval dry-run

**Files:** (none modified)

- [ ] **Step 1: Run full `fish validate.fish`**

Run: `fish validate.fish`
Expected: exit 0, all phases pass. If Phase 1n flags a fixture without an eval consumer, re-check the fixture↔eval mapping in `rules-evals/verification/evals/evals.json` (paths must match prompt `@tests/fixtures/...` references).

- [ ] **Step 2: Run eval-runner in dry-run mode**

Run: `bun tests/eval-runner-v2.ts verification --dry-run 2>&1 | tail -20`
Expected: three evals listed (`goal-gap-surfaces-before-result-emission`, `aligned-delta-emits-result-cleanly`, `scope-creep-surfaces-before-result`), no parse errors.

- [ ] **Step 3: Run `bun test` to confirm no regression in adjacent test suite**

Run: `bun test tests/validate-phase-1j.test.ts tests/validate-phase-1n.test.ts`
Expected: pass.

- [ ] **Step 4: Inspect the rule diff one final time**

Run: `git diff main -- rules/verification.md`
Expected: drops `globs:` block, appends goal-verification section. Total body LOC ≤55.

- [ ] **Step 5: No commit needed (verification only)**

If any step failed, fix in place per the failure mode flagged (likely a regex tweak, fixture path correction, or rule LOC overshoot).

---

## Task 9: Goal verification — run the rule on itself

The rule we just wrote requires intent vs delta comparison before `result:`. Apply it.

- [ ] **Step 1: Restate intent in one sentence**

> Add a closing pipeline gate to `rules/verification.md` that compares delta-achieved vs intent-stated before `result:` emits, plus a three-eval suite catching the PR #330 failure mode — all within ≤50 LOC rule body and #340's HARD-GATE cap.

- [ ] **Step 2: State delta achieved**

Run: `git diff --stat main` and `wc -l rules/verification.md`
Expected output to inspect:
- `rules/verification.md`: ≤55 lines total
- New files: `rules-evals/verification/evals/evals.json`, three fixture subdirs + README, no new rule file
- LOC delta: positive (additive plan), but no new HARD-GATE rule file

- [ ] **Step 3: Compare direction + magnitude**

- Direction: intent = ADD a gate; delta = added a gate. Direction aligned.
- Magnitude: rule body within budget (~47 LOC body). Tests + fixtures are necessary infrastructure, not bloat. Within scope.

- [ ] **Step 4: Surface or emit**

If both check out, emit:
> `result: #333 goal-verification gate shipped — rules/verification.md +goal-verification section, rules-evals/verification/ with 3 required-tier evals, fixtures + validate Phase 1j registry updated. Acceptance E1 (PR #330 replay) satisfied. Ready for PR.`

If anything diverged (rule body >55 LOC, eval JSON invalid, validate fails), STOP and surface the gap instead.

---

## Self-Review

**Spec coverage:**
- Rule extension ≤50 LOC → Task 1 with explicit LOC check
- `<a id="goal-verification">` anchor → Task 1 grep check
- Drop `globs:` frontmatter → Task 1 file replacement
- Phase 1j registry update → Task 2
- Three evals (E1 multi-turn replay, E2 positive, E3 magnitude) → Task 7
- Fixtures with README → Tasks 3-6
- Phase 1n auto-coverage → Task 8 validate run
- Acceptance E1 replays PR #330 → fixture in Task 3, eval E1 in Task 7
- No regression on existing evals → Task 8 cross-suite test run

**Placeholders:** none. Every step has either exact code, exact command, or both.

**Type consistency:** anchor ID `goal-verification` used identically in rule body, Phase 1j registry, and self-application Task 9. Fixture paths `pr-330-result-emission`, `aligned-prune`, `scope-creep-refactor` consistent across fixture creation, README, and eval prompts.

**Eval contract:** E1 uses `turns: [{prompt, assertions}]`; E2/E3 use `prompt + assertions` per `loadEvalFile` contract (exactly one of prompt/turns). All assertions have `description`. Required-tier assertions are present; diagnostic-tier explicitly labeled.
