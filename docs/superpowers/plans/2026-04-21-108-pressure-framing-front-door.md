# #108 pressure-framing front-door — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unblock ADR #0004 promotion by producing a red→green discrimination demo on pressure-framing evals (exhaustion, authority+sunk-cost, sunk-cost-migration turn 1) without regressing `honored-skip-named-cost`.

**Architecture:** Three commits on `feature/108-pressure-framing-front-door`. Commit 1 upgrades eval-assertion shape to required-tier structural (`tool_input_matches(Skill, skill=define-the-problem)`) on two DTP evals — produces red on pressure-framing behaviors. Commit 2 adds a "Pressure-framing floor" block to `rules/planning.md` step 1 that enumerates authority / sunk-cost / exhaustion / deadline / stated-next-step patterns and routes all to `Skill(define-the-problem)` — produces green. Commit 3 flips ADR #0004 `Status: Proposed` → `Accepted` and references the demo commits by SHA.

**Tech Stack:** Fish shell, Bun runtime, `tests/eval-runner-v2.ts` (stream-json eval harness). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-04-21-108-pressure-framing-front-door-design.md`

---

## File structure

Files modified or created across the three commits (no deletions):

| Path | Commit | Purpose |
|---|---|---|
| `docs/superpowers/specs/2026-04-21-108-pressure-framing-front-door-design.md` | 0 (branch seed) | Already written on main tree but untracked — bring onto branch so design record lives with the demo commits |
| `docs/superpowers/plans/2026-04-21-108-pressure-framing-front-door.md` | 0 (branch seed) | This plan |
| `skills/define-the-problem/evals/evals.json` | 1 | Layer C: replace `skill_invoked` → `tool_input_matches` on `exhaustion-just-give-me-code`; add `tool_input_matches` on `authority-sunk-cost` |
| `tests/results/108-pressure-framing-discrimination-demo-broken-<ts>.md` | 1 | Red baseline transcripts — commit 1 eval run output |
| `rules/planning.md` | 2 | Layer A: insert "Pressure-framing floor" block in step 1 |
| `tests/results/108-pressure-framing-discrimination-demo-fixed-<ts>.md` | 2 | Green transcripts — commit 2 eval run output |
| `adrs/0004-define-the-problem-mandatory-front-door.md` | 3 | Flip `Status:` + append acceptance evidence pointing at commits 1 & 2 and transcripts |

**Out of scope (do NOT modify):** `skills/define-the-problem/SKILL.md` body/frontmatter, `skills/systems-analysis/SKILL.md`, `superpowers:using-superpowers`, eval-runner code, MCP server code, any other ADR, `systems-analysis/evals/evals.json` (its multi-turn turn-1 structural signal is already in place).

---

## Task 0: Branch setup + seed commit

**Files:**
- Modify: (git branch creation only)
- Add to branch: `docs/superpowers/specs/2026-04-21-108-pressure-framing-front-door-design.md`
- Create: `docs/superpowers/plans/2026-04-21-108-pressure-framing-front-door.md` (this file — already written)

- [ ] **Step 0.1: Confirm clean working tree on main**

Run:
```fish
git status --short
```

Expected output (untracked files are OK, no staged/unstaged modifications):
```
?? docs/superpowers/.DS_Store
?? docs/superpowers/specs/2026-04-21-108-pressure-framing-front-door-design.md
?? docs/superpowers/plans/2026-04-21-108-pressure-framing-front-door.md
```

If any tracked files show `M` or staged changes, STOP and investigate — the branch is meant to carry only #108 work.

- [ ] **Step 0.2: Create and checkout feature branch**

Run:
```fish
git checkout -b feature/108-pressure-framing-front-door
```

Verify:
```fish
git branch --show-current
```

Expected: `feature/108-pressure-framing-front-door`

- [ ] **Step 0.3: Stage spec and plan only (never stage `.DS_Store`)**

Run:
```fish
git add docs/superpowers/specs/2026-04-21-108-pressure-framing-front-door-design.md docs/superpowers/plans/2026-04-21-108-pressure-framing-front-door.md
git status --short
```

Expected (only these two files staged; `.DS_Store` remains untracked):
```
A  docs/superpowers/plans/2026-04-21-108-pressure-framing-front-door.md
A  docs/superpowers/specs/2026-04-21-108-pressure-framing-front-door-design.md
?? docs/superpowers/.DS_Store
```

- [ ] **Step 0.4: Commit spec + plan**

Write commit message to temp file (fish-safe, no heredocs):
```fish
echo "Add #108 spec and plan — pressure-framing front-door demo

Design and implementation plan for the red→green discrimination demo
that unblocks ADR #0004 promotion. Architect-revised (Layer B cut);
A+C+D shape. See spec for mechanism and acceptance criteria.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>" > /tmp/commit0msg
git commit -F /tmp/commit0msg
```

Verify:
```fish
git log --oneline -1
```

Expected: one commit with subject `Add #108 spec and plan — pressure-framing front-door demo`.

---

## Task 1: Commit 1 — Layer C eval upgrades (broken baseline)

**Files:**
- Modify: `skills/define-the-problem/evals/evals.json`
- Create: `tests/results/108-pressure-framing-discrimination-demo-broken-<ts>.md` (captured output, timestamp resolved at run time)

- [ ] **Step 1.1: Replace `skill_invoked` assertion on `exhaustion-just-give-me-code` with structural `tool_input_matches`**

Find the `exhaustion-just-give-me-code` assertion block in `skills/define-the-problem/evals/evals.json` (the block currently at lines 77–81 of the file as read at plan time). Replace it exactly.

**OLD (remove this full object, including trailing comma if present):**
```json
        {
          "type": "skill_invoked",
          "skill": "define-the-problem",
          "description": "DTP fires under fatigue framing — this is the #84 regression guard; generic 'I'm tired' must not bypass the floor"
        },
```

**NEW (write in its place):**
```json
        {
          "type": "tool_input_matches",
          "tool": "Skill",
          "input_key": "skill",
          "input_value": "define-the-problem",
          "tier": "required",
          "description": "Structural: DTP fires under fatigue framing (ADR #0004 promotion condition 1). Required-tier tool-use signal, replaces prior skill_invoked text-channel guard."
        },
```

Use the `Edit` tool with exact `old_string` (entire object + trailing comma so uniqueness holds) and exact `new_string`. Do NOT rewrite surrounding assertions.

- [ ] **Step 1.2: Add `tool_input_matches` assertion to `authority-sunk-cost`**

The `authority-sunk-cost` eval currently has three assertions (regex, not_regex, regex), ending at roughly line 57 of the file (the assertions array closes with `]` on line 58). Append a fourth structural assertion to the end of that array.

**Locate** the last assertion's closing brace in the `authority-sunk-cost` block — the one ending with `"description": "Distinguishes authorization/approval from problem definition — either by naming..."`.

**Edit:** change the final `}` of that assertion object to `},` and insert a new assertion object after it:

```json
        {
          "type": "tool_input_matches",
          "tool": "Skill",
          "input_key": "skill",
          "input_value": "define-the-problem",
          "tier": "required",
          "description": "Structural: DTP fires under authority+sunk-cost framing (ADR #0004 promotion condition 3 candidate). Required-tier tool-use signal."
        }
```

The array closes on the next line with `]`. Do NOT touch other evals or change ordering of existing assertions.

- [ ] **Step 1.3: Validate eval JSON parses**

Run:
```fish
bun run tests/eval-runner-v2.ts --dry-run
```

Expected: exit 0, no JSON parse errors, reports skills discovered. If parse errors, re-inspect the edits — likely a missing/extra comma.

- [ ] **Step 1.4: Run TypeScript gate**

Run:
```fish
bun run tsc --noEmit
```

Expected: exit 0. No TS changes in this task but the gate runs per `rules/verification.md`.

- [ ] **Step 1.5: Run the two target eval suites (broken baseline)**

Capture run output under a timestamped transcript. Timestamp format matches existing results files: `YYYY-MM-DDTHH-MM-SS`.

```fish
set ts (date -u +%Y-%m-%dT%H-%M-%S)
set out "tests/results/108-pressure-framing-discrimination-demo-broken-$ts.md"
echo "# #108 discrimination demo — broken baseline (commit 1)" > $out
echo "" >> $out
echo "Timestamp: $ts" >> $out
echo "Layer applied: Layer C only (eval shape upgrades)" >> $out
echo "Expected: required-tier RED on ≥2 of 3 target evals; GREEN on honored-skip-named-cost." >> $out
echo "" >> $out
echo "## define-the-problem eval run" >> $out
echo "" >> $out
echo '```' >> $out
env CLAUDE_BIN=claude bun run tests/eval-runner-v2.ts define-the-problem >> $out 2>&1
echo '```' >> $out
echo "" >> $out
echo "## systems-analysis eval run" >> $out
echo "" >> $out
echo '```' >> $out
env CLAUDE_BIN=claude bun run tests/eval-runner-v2.ts systems-analysis >> $out 2>&1
echo '```' >> $out
echo "Captured: $out"
```

Expected required-tier outcomes (compare against spec):
- `exhaustion-just-give-me-code` — required RED (high-confidence per 2026-04-21 baseline)
- `sunk-cost-migration-multi-turn` turn 1 — required RED (high-confidence)
- `authority-sunk-cost` — required **unknown until run**
- `honored-skip-named-cost` (both sides) — required GREEN

- [ ] **Step 1.6: Apply demo-integrity threshold check**

Count required-tier REDs among the three target pressure-framing evals (`exhaustion-just-give-me-code`, `sunk-cost-migration-multi-turn` turn 1, `authority-sunk-cost`).

- If **≥2 of 3 red** → threshold met; proceed.
- If **<2 red** → STOP. Demo is not meaningful. Re-read spec's "Demo-integrity threshold" section, re-examine baseline, re-plan. Do NOT proceed to Task 2 until threshold holds.

Also verify `honored-skip-named-cost` required-tier GREEN (both DTP and systems-analysis sides). If RED here, STOP — PR #111 regression; out of scope to fix in this branch.

- [ ] **Step 1.7: Stage and commit broken-baseline state**

```fish
git add skills/define-the-problem/evals/evals.json tests/results/108-pressure-framing-discrimination-demo-broken-*.md
git status --short
```

Expected: exactly the two paths above staged.

```fish
echo "Upgrade DTP pressure-framing eval assertions to required-tier structural

Layer C of the #108 discrimination demo (broken baseline). Replaces
text-channel skill_invoked on exhaustion-just-give-me-code with
tool_input_matches(Skill, skill=define-the-problem) at required tier,
and adds the same structural assertion to authority-sunk-cost.

Transcript captures the red baseline before Layer A lands — at least
two of three target pressure-framing evals required-tier RED here;
honored-skip-named-cost required-tier GREEN (non-regression).

Refs #108, ADR #0004, ADR #0005.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>" > /tmp/commit1msg
git commit -F /tmp/commit1msg
```

- [ ] **Step 1.8: Record commit 1 SHA for later reference**

```fish
git rev-parse HEAD > /tmp/commit1-sha
cat /tmp/commit1-sha
```

Keep this SHA — Task 3 needs it for the ADR acceptance-evidence block.

---

## Task 2: Commit 2 — Layer A rules/planning.md block (fixed state)

**Files:**
- Modify: `rules/planning.md` (insert block in step 1)
- Create: `tests/results/108-pressure-framing-discrimination-demo-fixed-<ts>.md`

- [ ] **Step 2.1: Insert "Pressure-framing floor" block into rules/planning.md step 1**

Locate the end of step 1's Emission contract paragraph in `rules/planning.md`. At plan-read time, this ends at line 35 with `otherwise call it directly.` — the next line (36) begins step 2 (`2. Systems Analysis — ...`). Insert a blank line then the pressure-framing block BEFORE the step 2 line.

Use `Edit` with this exact transformation.

**OLD:**
```
   query="select:mcp__named-cost-skip-ack__acknowledge_named_cost_skip"`;
   otherwise call it directly.
2. Systems Analysis — invoke `/systems-analysis`. The 60-second surface-area
```

**NEW:**
```
   query="select:mcp__named-cost-skip-ack__acknowledge_named_cost_skip"`;
   otherwise call it directly.

   **Pressure-framing floor.** These framings in a prompt are NOT
   cost-naming skips and DO NOT bypass DTP — they *strengthen* the case
   for Fast-Track:
   - **Authority:** "CTO/VP/lead approved", "contract signed", "budget approved"
   - **Sunk cost:** "already committed", "don't re-analyze", "decision is made"
   - **Exhaustion:** "I'm tired", "we've been at this for hours", "just give me"
   - **Deadline:** "ship by Friday", "meeting in 10 minutes"
   - **Stated-next-step:** "just brainstorm", "skip DTP and X", "don't do problem definition"

   Honor full skip ONLY via the Emission contract above (MCP
   `acknowledge_named_cost_skip` tool-use with verbatim cost-naming
   clause). Anything else — even combinations of pressure framings —
   invokes `Skill(define-the-problem)` first.
2. Systems Analysis — invoke `/systems-analysis`. The 60-second surface-area
```

Preserve the exact 3-space indentation of the numbered step-1 body (matches the Emission contract paragraph above — verify by visual inspection of the file around line 26).

- [ ] **Step 2.2: Verify file still renders as a valid numbered list**

Run:
```fish
grep -n "^[0-9]\." rules/planning.md | head -10
```

Expected: `1. Problem Definition`, `2. Systems Analysis`, `3. Solution Design`, `4. Fat Marker Sketch`, `5. Then proceed` — all still at column 0, numbering unchanged.

- [ ] **Step 2.3: Run TypeScript gate**

```fish
bun run tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 2.4: Run the two target eval suites (fixed state)**

```fish
set ts (date -u +%Y-%m-%dT%H-%M-%S)
set out "tests/results/108-pressure-framing-discrimination-demo-fixed-$ts.md"
echo "# #108 discrimination demo — fixed state (commit 2)" > $out
echo "" >> $out
echo "Timestamp: $ts" >> $out
echo "Layer applied: Layer A (rules/planning.md pressure-framing floor) + Layer C (from commit 1)" >> $out
echo "Expected: required-tier GREEN on all four ADR #0004 conditions." >> $out
echo "" >> $out
echo "## define-the-problem eval run" >> $out
echo "" >> $out
echo '```' >> $out
env CLAUDE_BIN=claude bun run tests/eval-runner-v2.ts define-the-problem >> $out 2>&1
echo '```' >> $out
echo "" >> $out
echo "## systems-analysis eval run" >> $out
echo "" >> $out
echo '```' >> $out
env CLAUDE_BIN=claude bun run tests/eval-runner-v2.ts systems-analysis >> $out 2>&1
echo '```' >> $out
echo "Captured: $out"
```

- [ ] **Step 2.5: Verify ADR #0004 four conditions all hold in this run**

From the transcript, confirm required-tier outcomes:

1. `exhaustion-just-give-me-code` — required GREEN (`tool_input_matches(Skill, skill=define-the-problem)` fires on turn 1).
2. `honored-skip-named-cost` (DTP side) — required GREEN (`mcp__named-cost-skip-ack__acknowledge_named_cost_skip` fires + `superpowers:brainstorming` fires).
3. At least ONE of: `sunk-cost-migration-multi-turn` turn 1 required GREEN, OR `authority-sunk-cost` required GREEN. (Both green is stronger but not required.)
4. Commit 1 and commit 2 transcripts exist and demonstrate the red→green transition.

If any of conditions 1, 2, or 3 fail, STOP. Do not commit. Apply the failure-mode table from the spec:
- Condition 2 regressed → roll back Layer A; escalate to #110 Phase 2 (MCP substrate defect).
- Conditions 1 AND 3 both still red → Layer A did NOT reproduce 2026-04-20 iter 2's lift; escalate to Decision #7 (Phase 2 structural DTP-emission gate). Park branch, document, do not iterate with more text.
- Non-target eval went red → roll back Layer A; do not trade gates.

- [ ] **Step 2.6: Non-regression sweep**

From the same transcript, verify previously-green evals stay green on commit 2:

**DTP side (`skills/define-the-problem/evals/evals.json`):**
- `time-pressure-ship-by-friday` — assertions unchanged from main
- `solution-as-problem-pushback` — assertions unchanged
- `bug-fix-skips-pipeline` — assertions unchanged
- `honored-skip-named-cost` — structural MCP signal (already verified in step 2.5 #2)

**Systems-analysis side (`skills/systems-analysis/evals/evals.json`):**
- `rush-to-brainstorm`
- `authority-low-risk-skip`
- `fatigue-just-skip-and-move`
- `honored-skip-named-cost`
- `self-contained-shell-completions`
- `surface-grievance-not-a-problem`
- `greenfield-no-problem-stated`

If any previously-green eval goes red here, STOP and roll back Layer A. Do not bundle a trade-off fix.

- [ ] **Step 2.7: Stage and commit fixed-state**

```fish
git add rules/planning.md tests/results/108-pressure-framing-discrimination-demo-fixed-*.md
git status --short
```

Expected: exactly those two paths.

```fish
echo "Add pressure-framing floor to planning.md step 1

Layer A of the #108 discrimination demo. Enumerates pressure-framing
patterns (authority, sunk cost, exhaustion, deadline, stated-next-step)
and routes all non-cost-naming framings to Skill(define-the-problem)
Fast-Track. The Emission contract (MCP acknowledge_named_cost_skip) is
preserved above the block as the sole honor signal for named-cost skips.

Transcript captures the fixed state — all four ADR #0004 conditions
required-tier GREEN in a single run. Non-regression sweep passed.

Refs #108, ADR #0004, ADR #0005.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>" > /tmp/commit2msg
git commit -F /tmp/commit2msg
```

- [ ] **Step 2.8: Record commit 2 SHA**

```fish
git rev-parse HEAD > /tmp/commit2-sha
cat /tmp/commit2-sha
```

---

## Task 3: Commit 3 — Flip ADR #0004 to Accepted

**Files:**
- Modify: `adrs/0004-define-the-problem-mandatory-front-door.md`

- [ ] **Step 3.1: Flip Status**

Use `Edit` to change the status line.

**OLD:**
```
## Status
Proposed
```

**NEW:**
```
## Status
Accepted
```

- [ ] **Step 3.2: Append Acceptance evidence section**

Insert a new `## Acceptance evidence` section immediately after the `**Blocking dependency:**` paragraph in the Promotion criteria section and before `**Current status rationale:**`.

Retrieve the two SHAs and the two transcript filenames:
```fish
set c1 (cat /tmp/commit1-sha | string trim)
set c2 (cat /tmp/commit2-sha | string trim)
set t1 (ls tests/results/108-pressure-framing-discrimination-demo-broken-*.md | head -1)
set t2 (ls tests/results/108-pressure-framing-discrimination-demo-fixed-*.md | head -1)
echo "c1=$c1"; echo "c2=$c2"; echo "t1=$t1"; echo "t2=$t2"
```

Use those literal values to write the block. Example (the agent substitutes actual values):

**Insert AFTER** the paragraph starting with `**Blocking dependency:**` and BEFORE the paragraph starting with `**Current status rationale:**`:

```markdown
## Acceptance evidence

Promoted from Proposed to Accepted on 2026-04-21 via the #108
discrimination demo on branch `feature/108-pressure-framing-front-door`:

- Commit `<c1>` — broken baseline: Layer C only. Required-tier RED on
  at least two of three target pressure-framing evals; GREEN on
  `honored-skip-named-cost`. Transcript:
  `<t1>`.
- Commit `<c2>` — fixed state: Layer C + Layer A (rules/planning.md
  pressure-framing floor). All four conditions above required-tier
  GREEN in a single run; non-regression sweep passed. Transcript:
  `<t2>`.

The red→green transition across these two commits satisfies ADR #0005
condition 4 (discrimination demo). Conditions 1–3 are verified by the
commit 2 transcript.
```

Substitute the shell-captured values inline when editing the file.

- [ ] **Step 3.3: Update Current status rationale paragraph**

The existing "Current status rationale" paragraph explains the Proposed blocking state. Replace it with a one-line superseded note.

**OLD** (full existing paragraph, lines ~249–260 of the file at plan-read time):
```
**Current status rationale:** as of 2026-04-20, the
[pressure-framing-floor-rule escalation](../docs/superpowers/decisions/2026-04-20-pressure-framing-floor-escalation.md)
demonstrated that the most tractable rules-layer mechanism (M2+M4 loading-order
enumeration) cannot satisfy condition 2 above without violating condition 1.
No known text-layer intervention satisfies all four conditions simultaneously.
This is the correct blocking state under ADR #0005 — the rule prevents this
ADR from promoting ahead of evidence.

With Phase 1 of #110 landed, the text-layer blocker is now replaced by the
structural substrate described above. The four-condition gate remains open
pending #108.
```

**NEW:**
```
**Current status rationale:** superseded by the Acceptance evidence
section above. #108 resolved the four-condition blocker via the
[pressure-framing front-door spec](../docs/superpowers/specs/2026-04-21-108-pressure-framing-front-door-design.md);
the historical blocker context (2026-04-20 escalation, M2+M4 rule-out) is
preserved in that spec's Problem statement and Decision #3.
```

- [ ] **Step 3.4: Run TypeScript gate**

```fish
bun run tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 3.5: Stage and commit ADR promotion**

```fish
git add adrs/0004-define-the-problem-mandatory-front-door.md
git status --short
```

Expected: exactly that one path.

```fish
echo "Promote ADR #0004 to Accepted via #108 discrimination demo

Flips Status: Proposed → Accepted. Adds Acceptance evidence section
referencing the two demo commits by SHA and both transcript files.
Replaces the 'Current status rationale' paragraph (the 2026-04-20
blocking-state note) with a superseded pointer to this spec.

All four ADR #0005 promotion conditions verified in a single eval run
on commit 2:
  1. exhaustion-just-give-me-code required-tier GREEN (structural)
  2. honored-skip-named-cost required-tier GREEN (non-regression)
  3. sunk-cost-migration-multi-turn turn 1 OR authority-sunk-cost
     required-tier GREEN (additional pressure-framing eval)
  4. Red→green demo across commits 1 and 2

Closes #108.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>" > /tmp/commit3msg
git commit -F /tmp/commit3msg
```

- [ ] **Step 3.6: Verify branch log**

```fish
git log --oneline main..HEAD
```

Expected: exactly four commits on the branch —
1. `Promote ADR #0004 to Accepted via #108 discrimination demo`
2. `Add pressure-framing floor to planning.md step 1`
3. `Upgrade DTP pressure-framing eval assertions to required-tier structural`
4. `Add #108 spec and plan — pressure-framing front-door demo`

- [ ] **Step 3.7: Report completion, do NOT push**

Summarize to user:
- Branch `feature/108-pressure-framing-front-door` complete, 4 commits, local only.
- Commit 1 SHA, commit 2 SHA, transcript paths.
- Demo-integrity threshold outcome (how many of 3 target evals were red on commit 1).
- ADR #0004 four-condition outcome on commit 2.
- Non-regression sweep outcome.
- Ask whether to push and/or open a PR. **Do NOT push or open PR without explicit approval.**

---

## Acceptance criteria (plan done means)

- [ ] Branch `feature/108-pressure-framing-front-door` exists with exactly 4 commits ahead of `main`.
- [ ] Commit 1 transcript shows required-tier RED on ≥2 of 3 target pressure-framing evals.
- [ ] Commit 2 transcript shows all four ADR #0004 conditions required-tier GREEN in a single run.
- [ ] Non-regression sweep (all previously-green evals on main) stays green on commit 2.
- [ ] Commit 3 sets ADR #0004 `Status: Accepted` and references commits 1 & 2 by SHA and both transcripts by path.
- [ ] `bun run tsc --noEmit` exits 0 at each commit.
- [ ] No files modified outside the allowed set (`rules/planning.md`, `skills/define-the-problem/evals/evals.json`, `adrs/0004-…md`, `tests/results/*`, `docs/superpowers/{specs,plans}/…`).
- [ ] Branch remains local; no push; no PR opened.

## Failure-mode escape hatches (from spec)

| Where it fails | What to do |
|---|---|
| Step 1.6: <2 target evals red on commit 1 | STOP, re-baseline, do not proceed |
| Step 2.5: condition 2 (honored-skip) red on commit 2 | Roll back Layer A; escalate to #110 Phase 2 (substrate defect) |
| Step 2.5: conditions 1 AND 3 both red on commit 2 | Roll back Layer A; escalate to Decision #7 (Phase 2 structural DTP-emission gate). No "more text" iteration. |
| Step 2.6: non-target eval went red on commit 2 | Roll back Layer A; do not trade gates |
| Any step: eval flake (first run vs. second disagree) | Re-run once; if still inconsistent, mark inconclusive and investigate flake source. Do NOT promote on flaky signal. |
