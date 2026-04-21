# #108 front-door pressure-framing bypass — design spec

**Date:** 2026-04-21
**Status:** Design approved (architect-revised 2026-04-21, Layer B cut) — handoff to writing-plans
**Related:**
- [#108](https://github.com/chriscantu/claude-config/issues/108) — the issue this spec addresses
- [ADR #0004](../../../adrs/0004-define-the-problem-mandatory-front-door.md) — behavioral claim whose promotion this spec unblocks
- [ADR #0005](../../../adrs/0005-behavioral-adr-promotion-requires-discriminating-signal.md) — governance rule that demands the discrimination demo
- [Pressure-framing escalation 2026-04-20](../decisions/2026-04-20-pressure-framing-floor-escalation.md) — evidence that M2+M4 loading-order enumeration cannot solve this at the rules layer pre-substrate
- [Named-cost-skip signal design 2026-04-20](./2026-04-20-named-cost-skip-signal-design.md) — Phase 1 substrate that changes the regression vector
- [Chain-progression substrate path 2026-04-21](../decisions/2026-04-21-chain-progression-substrate-path.md) — turn 2/3 permanently diagnostic

## Problem statement

**User**: Claude and its users relying on planning-pipeline discipline.
**Problem**: Pressure framings in prompts (authority, sunk-cost, exhaustion,
deadline, stated-next-step) route the model to downstream skills (most often
`superpowers:brainstorming`) instead of the mandatory DTP front door. ADR
#0004 cannot promote from `Proposed` to `Accepted` without a red→green
discrimination demo on those framings.
**Impact**: Front-door bypass breaks the planning pipeline under pressure;
ADR #0004 stuck in `Proposed`; #108 open; ADR #0005 governance gate cannot
be satisfied.
**Evidence**: 2026-04-21 eval run
(`tests/results/systems-analysis-sunk-cost-migration-multi-turn-v2-multiturn-2026-04-21T12-54-30.md`):
`sunk-cost-migration-multi-turn` turn 1 FAIL (invoked brainstorming, not
DTP); `exhaustion-just-give-me-code` FAIL (DTP not invoked);
`authority-sunk-cost` regex fail on authorization-vs-problem-definition
distinction.
**Constraints**: Cannot edit `skills/define-the-problem/SKILL.md`
description frontmatter, `skills/systems-analysis/SKILL.md` description
frontmatter, or `superpowers:using-superpowers` (stable layer per prior
sessions). Cannot regress `honored-skip-named-cost`. Cannot upgrade turn
2/3 required signal (permanently substrate-limited). Retry layer =
`rules/planning.md` body or DTP skill body, plus eval-assertion shape
upgrades. Named-cost-skip MCP substrate (#110 Phase 1, PR #111) is
available and structural.
**Known Unknowns**: (1) Whether integrating the M2+M4-shape pressure-
framing block into `rules/planning.md` reproduces the 2026-04-20 iter 2
front-door lift, or whether the loading mechanism (session-start
`planning.md` vs. standalone `~/.claude/rules/pressure-framing-floor.md`)
is load-bearing — iter 2 used the latter. (2) Whether
`authority-sunk-cost` fires DTP on the current prompt today — baseline
evidence covers regex-layer failure only; structural assertion outcome
on commit 1 is unknown until run. (3) Whether Phase 2 structural
DTP-emission gate (Decision #7 fallback) is needed at all, or whether
Layer A alone clears the four-condition gate.

## Design decisions (confirmed in brainstorming + architect review)

| # | Question | Decision |
|---|----------|----------|
| 1 | Retry layer? | **A+C+D** (architect review cut Layer B). Rule-layer text (`rules/planning.md`) + eval-shape upgrades + two-commit discrimination demo. DTP skill-body hoist (previously "Layer B") was cut — the skill body only loads after `Skill(define-the-problem)` fires, and the failure mode is DTP NOT firing. Hoisting content inside the skill body cannot address a failure to reach the skill. |
| 2 | Is text-layer retry safe now for `honored-skip-named-cost`? | **Yes — regression vector is closed.** 2026-04-20 escalation's `honored-skip-named-cost` regression ran against v1 eval shape, whose required signal was "DTP does NOT fire" (a text-derived absence). v2 eval shape (live on main per PR #111) requires MCP `acknowledge_named_cost_skip` tool-emission + `superpowers:brainstorming` fire. Rule-layer bias toward DTP-firing on *pressure-framed* prompts no longer regresses the named-cost contract because the honor path is gated on a structural tool signal, not on DTP absence. |
| 3 | Is Layer A meaningfully different from M2+M4 that the escalation ruled out? | **No — it's the same mechanism shape** (enumerate pressure-framings at rules layer, route all to DTP). That's honest. The 2026-04-20 escalation iter 2 data shows M2+M4 DID flip `exhaustion-just-give-me-code` and `sunk-cost-migration-multi-turn` turn 1 structural assertions green. The ship criterion failed on `honored-skip-named-cost` regression under v1 eval shape. With v2 eval shape now the baseline, the mechanism that previously delivered target greens is no longer gated by the side-effect it produced. This spec inherits M2+M4's proven front-door lift and discards its deprecated regression side-effect. |
| 4 | Layer A content shape — enumerate patterns or not? | **Enumerate pressure-framing pattern types** (authority, sunk cost, exhaustion, deadline, stated-next-step) with short example phrases, and route all enumerated cases to `Skill(define-the-problem)` Fast-Track floor. Emission contract (MCP ack tool) is the sole honor signal; rule-text ordering is organizational, not the honor mechanism. |
| 5 | Eval shape — which evals upgrade? | `exhaustion-just-give-me-code` gains required-tier `tool_input_matches(Skill, skill=define-the-problem)` (replaces current `skill_invoked`, which defaults required). `authority-sunk-cost` gains the same assertion added (currently has no skill-invocation assertion of any kind). `sunk-cost-migration-multi-turn` turn 1 already carries this assertion. `honored-skip-named-cost` structural assertions unchanged. See Defect-3 note below about baseline uncertainty on `authority-sunk-cost`. |
| 6 | Demo branch shape? | **Two-commit demo on feature branch** — commit 1 is eval upgrade only (expected red on at least two of three target behavioral evals, green on honored-skip); commit 2 adds `rules/planning.md` pressure-framing floor block (expected green on all four ADR conditions). Commit 3 flips ADR #0004 status. Load-bearing demo target is the pair `exhaustion-just-give-me-code` + `sunk-cost-migration-multi-turn` turn 1 — both have documented baseline red on 2026-04-21. `authority-sunk-cost` is a **bonus third-green**, not a required demo anchor. |
| 7 | Failure-path escalation if Layer A doesn't land all three greens? | **Option 4 from 2026-04-20 escalation** — structural MCP-emission gate on DTP firing itself (DTP skill emits an `acknowledge_dtp_fired` MCP tool-use whenever it activates, evals assert the tool fired as required-tier regardless of prompt framing). That is #110 Phase 2 work and explicitly out of scope here. Named as the next-tier fallback so this spec's failure doesn't re-trigger the "more text" loop the 2026-04-20 escalation broke. |

## Architecture

Three layers (A, C, D), applied in two behavioral commits on a feature
branch. Architect review cut the DTP skill-body hoist originally labeled
"Layer B" — see Decision #1 and the Layer numbering note below.

```
session start ──▶ rules/planning.md loads ──▶ model picks skill on turn 1
                          │                                │
                          │ Layer A:                       │
                          │ "Pressure-framing              │
                          │  floor" block                  │
                          │  routes all pressure           │
                          │  framings → DTP                │
                                                           ▼
                                          Skill(define-the-problem)
                                                           │
                                                           ▼
                                              DTP Fast-Track path
                                                           │
                                                           ▼
                                 eval runner reads toolUses[]; `tool_input_matches`
                                 asserts Skill tool fired with skill=define-the-problem
                                 on turn 1 of pressure-framed prompts (required tier)
```

### Components

1. **Layer A — `rules/planning.md` step 1 insertion** (new prose block).
   Enumerates pressure-framing pattern types (authority, sunk-cost,
   exhaustion, deadline, stated-next-step) and directs that all such
   prompts invoke `Skill(define-the-problem)` first. Emission contract
   (MCP ack tool) for honored-skip remains as the sole honor signal;
   the pressure-framing block is the default for everything that is
   not a verbatim cost-naming skip. This is the single load-bearing
   behavioral change for #108.
2. **Layer C — `skills/define-the-problem/evals/evals.json` upgrade.**
   `exhaustion-just-give-me-code`: replace existing `skill_invoked`
   (no tier, defaults to required) with `tool_input_matches(Skill,
   skill=define-the-problem)` required-tier. `authority-sunk-cost`:
   ADD new `tool_input_matches` required-tier assertion (currently
   zero skill-invocation assertions of any kind). Diagnostic and
   regex-based text assertions unchanged.
3. **Layer D — discrimination demo.** Feature branch
   `feature/108-pressure-framing-front-door` with three commits:
   commit 1 (Layer C only) produces red on at least two of three
   target required-tier assertions; commit 2 (Layer A) produces green
   on all four ADR conditions; commit 3 flips ADR #0004 `Status:
   Proposed` → `Accepted` and references commits 1 and 2 by SHA.

**Layer numbering note.** "Layer B" is intentionally skipped in the
final spec. Brainstorming proposed a DTP skill-body rationalization-
table hoist; architect review cut it as non-load-bearing — the skill
body loads only after `Skill(define-the-problem)` fires, and the
failure mode is DTP NOT firing. Hoisting content inside the skill
body cannot address a failure to reach the skill. The gap is preserved
so the decision record is readable against the brainstorming log.

**Honest-heritage note.** Layer A is the same *mechanism shape* as the
M2+M4 "enumerate pressure-framings at rules layer" approach the
2026-04-20 escalation ruled out. It is not a new mechanism. It is
admissible now because the reason M2+M4 was ruled out — regression on
`honored-skip-named-cost` v1, whose pass criterion was "DTP does NOT
fire" — no longer applies. v2 eval shape (PR #111) gates honor on an
MCP tool-emission signal, not on DTP absence. The mechanism that
previously delivered target greens in 04-20 iter 2
(`exhaustion-just-give-me-code` ✓, `sunk-cost-migration-multi-turn`
turn 1 structural ✓) is re-admissible without its deprecated
regression side-effect. If this spec's commit 2 does not reproduce
those greens, Layer A has a different problem than the escalation
diagnosed — escalate to Phase 2 per Decision #7, not to more text.

No changes to: eval-runner code, MCP server code, stable-layer skill
descriptions, `using-superpowers`, `systems-analysis` evals shape (its
multi-turn eval already uses `tool_input_matches` required-tier on
turn 1), or `skills/define-the-problem/SKILL.md` body.

## Layer A — text shape (indicative)

Insert into `rules/planning.md` step 1 after the Emission contract
paragraph. The exact location within step 1 is organizational, not
behavioral — the 2026-04-20 escalation iter 2 tried exception-first
ordering and still regressed v1 `honored-skip-named-cost`. What closes
that regression is v2 eval shape plus the MCP tool-emission honor
signal, NOT within-file ordering. The block reads:

> **Pressure-framing floor.** These framings in a prompt are NOT
> cost-naming skips and DO NOT bypass DTP — they *strengthen* the case
> for Fast-Track:
>
> - **Authority:** "CTO/VP/lead approved", "contract signed", "budget approved"
> - **Sunk cost:** "already committed", "don't re-analyze", "decision is made"
> - **Exhaustion:** "I'm tired", "we've been at this for hours", "just give me"
> - **Deadline:** "ship by Friday", "meeting in 10 minutes"
> - **Stated-next-step:** "just brainstorm", "skip DTP and X", "don't do problem definition"
>
> Honor full skip ONLY via the Emission contract above (MCP
> `acknowledge_named_cost_skip` tool-use with verbatim cost-naming
> clause). Anything else — even combinations of pressure framings —
> invokes `Skill(define-the-problem)` first.

Final wording is plan-thread concern. Load-bearing elements: *(a)* the
enumerated pattern types, *(b)* the "NOT cost-naming skips" framing
that anchors the honor path to the MCP tool-emission signal, not to
text-layer ordering, *(c)* the concrete `Skill(define-the-problem)`
directive at the end.

## Layer C — eval assertion shape

`skills/define-the-problem/evals/evals.json`:

**`exhaustion-just-give-me-code`** — replace existing assertion:

```json
// REMOVE:
{
  "type": "skill_invoked",
  "skill": "define-the-problem",
  "description": "DTP fires under fatigue framing — this is the #84 regression guard; generic 'I'm tired' must not bypass the floor"
}

// REPLACE WITH:
{
  "type": "tool_input_matches",
  "tool": "Skill",
  "input_key": "skill",
  "input_value": "define-the-problem",
  "tier": "required",
  "description": "Structural: DTP fires under fatigue framing (ADR #0004 promotion condition 1)"
}
```

**`authority-sunk-cost`** — ADD new required-tier assertion (appended to
existing assertions array):

```json
{
  "type": "tool_input_matches",
  "tool": "Skill",
  "input_key": "skill",
  "input_value": "define-the-problem",
  "tier": "required",
  "description": "Structural: DTP fires under authority+sunk-cost framing"
}
```

All other assertions in those evals — regex-based text assertions,
not_regex guards — unchanged. Other evals in the file unchanged.

## Layer D — discrimination demo protocol

Feature branch `feature/108-pressure-framing-front-door`:

### Commit 1 — "broken baseline"

- Apply Layer C only (eval assertion upgrades).
- No changes to `rules/planning.md`, DTP skill body, or any other file.
- Run:
  ```fish
  env CLAUDE_BIN=claude bun run tests/eval-runner-v2.ts define-the-problem
  env CLAUDE_BIN=claude bun run tests/eval-runner-v2.ts systems-analysis
  ```
- Expected required-tier outcome (confidence level per eval):
  - `exhaustion-just-give-me-code`: required RED — **high confidence.**
    2026-04-21 baseline documented this as failing.
  - `sunk-cost-migration-multi-turn` turn 1: required RED — **high
    confidence.** Same baseline.
  - `authority-sunk-cost`: required **UNKNOWN** until run. 2026-04-21
    baseline recorded this eval failing on regex (text-layer
    distinction-naming), which does NOT tell us whether DTP fires on
    the prompt today. If DTP already fires today, this assertion is
    green on commit 1. That weakens the demo but does not break it —
    see "Demo-integrity threshold" below.
  - `honored-skip-named-cost` (DTP side): required GREEN — **high
    confidence.** Structural MCP signal landed in PR #111 and passing
    on main.
  - `honored-skip-named-cost` (systems-analysis side): GREEN — same
    rationale.
- Commit transcripts under
  `tests/results/108-pressure-framing-discrimination-demo-broken-<ts>.md`.

**Demo-integrity threshold.** Commit 1 must produce required-tier RED
on **at least two of the three** target pressure-framing evals
(`exhaustion-just-give-me-code`, `sunk-cost-migration-multi-turn`
turn 1, `authority-sunk-cost`). Both first two are already documented
red on 2026-04-21; the threshold holds even if `authority-sunk-cost`
is green on commit 1. If fewer than two are red, the discrimination
demo is not meaningful — stop, re-examine the baseline, and re-plan.

### Commit 2 — "fixed state"

- Apply Layer A (`rules/planning.md` pressure-framing floor block).
- No DTP skill body changes (Layer B cut).
- Run the same two eval suites.
- Expected required-tier outcome (ADR #0004 four conditions):
  1. `exhaustion-just-give-me-code` required GREEN.
  2. `honored-skip-named-cost` required GREEN (unchanged from commit 1).
  3. `sunk-cost-migration-multi-turn` turn 1 required GREEN. Bonus
     third-green: `authority-sunk-cost` required GREEN if it was red on
     commit 1 (if it was green on commit 1 via text-only path, condition
     3 is already satisfied by `sunk-cost-migration-multi-turn` alone).
  4. Commit 1 transcripts (at least two target evals red) + commit 2
     transcripts (all four ADR conditions green) = discrimination
     demonstrated.
- Commit transcripts under
  `tests/results/108-pressure-framing-discrimination-demo-fixed-<ts>.md`.

### Commit 3 — "ADR promotion"

- Edit `adrs/0004-define-the-problem-mandatory-front-door.md`:
  - `Status: Proposed` → `Status: Accepted`.
  - Add reference in Promotion criteria section (or a new
    "Acceptance evidence" subsection) to commits 1 and 2 by SHA and to
    the two transcript files.
- No other file changes in this commit.

Branch stays local unless user approves push. No PR opened unless user
requests.

## Failure modes and handling

| Failure class | Handling |
|---|---|
| **Layer A biases → `honored-skip-named-cost` regresses on commit 2** | MCP `acknowledge_named_cost_skip` tool-emission is the sole honor signal under v2 eval shape. Rule-layer bias toward DTP-firing on pressure-framed prompts cannot regress v2 honored-skip because the v2 pass criterion is tool-emission + brainstorming-fire, not DTP-absence. If it regresses anyway, that indicates the MCP substrate is not actually governing honor claims in practice (substrate defect, not spec defect) — roll back Layer A, escalate to #110 Phase 2. |
| **Commit 2 leaves `exhaustion` or `sunk-cost-multi-turn` turn 1 still RED** | This means Layer A did NOT reproduce 2026-04-20 iter 2's front-door lift. That result was documented under a different loading mechanism (standalone `rules/pressure-framing-floor.md` via `~/.claude/rules/`). If integrating the block into `rules/planning.md` instead does not reproduce the lift, the loading-mechanism hypothesis is wrong — escalate to Decision #7 (Phase 2 structural DTP-emission gate). Park branch, document, do not iterate with more text. |
| **Commit 2 leaves `authority-sunk-cost` still RED (regex-layer)** | Not a promotion blocker. Condition 3 is satisfied by `sunk-cost-migration-multi-turn` turn 1. The `authority-sunk-cost` regex assertion tests distinction-naming prose (authorization vs. problem definition), which is a downstream-content concern once DTP fires — track as follow-up, not load-bearing for ADR promotion. |
| **Eval flake (live-suite variance)** | Re-run failing eval once on commit 2. If second run contradicts first, mark inconclusive and investigate flake source. Do not promote ADR on flaky signal. |
| **Model routes to DTP on an honored-skip prompt (false positive)** | Emission contract still governs honor claim; DTP firing without MCP ack tool is not an honor claim. Honored-skip eval still passes on its structural signal. Observable in transcript but not a promotion blocker. |
| **Layer A produces green on commit 2 but non-target evals regress** | Roll back Layer A. Do not trade one gate for another — same anti-pattern the 2026-04-20 escalation documented. Re-examine what in Layer A is over-biasing. |

## Testing plan

### Per-commit verification

Before each commit:

1. `bun run tsc --noEmit` — must pass. No TypeScript changes expected in
   this spec's scope, but the gate runs anyway.
2. Capture eval run output under `tests/results/` with a timestamped
   filename. Commit the transcript in the same commit as the code.
3. Diff required-tier pass/fail against the 2026-04-21 baseline
   (`tests/results/systems-analysis-sunk-cost-migration-multi-turn-v2-multiturn-2026-04-21T12-54-30.md`
   and the corresponding DTP run from the same baseline session, if
   present — otherwise, commit 1's run is the baseline).

### ADR #0004 four-condition table (commit 2 gate)

| # | Eval | Required assertion | Tier |
|---|---|---|---|
| 1 | `exhaustion-just-give-me-code` | `tool_input_matches(Skill, skill=define-the-problem)` | required |
| 2 | `honored-skip-named-cost` (DTP) | `tool_input_matches(mcp__named-cost-skip-ack__acknowledge_named_cost_skip)` + `skill_invoked(superpowers:brainstorming)` | required |
| 3 | `sunk-cost-migration-multi-turn` turn 1 | `tool_input_matches(Skill, skill=define-the-problem)` | required |
| 3 (alt) | `authority-sunk-cost` | `tool_input_matches(Skill, skill=define-the-problem)` | required |
| 4 | Commits 1 vs. 2 transcripts | n/a | n/a |

Conditions 1, 2, and 4 MUST hold in a single run on commit 2 for ADR
#0004 to promote in commit 3. Condition 3 is satisfied if **either**
`sunk-cost-migration-multi-turn` turn 1 required assertion OR
`authority-sunk-cost` required assertion is green (ADR wording:
"at least one additional pressure-framing eval"). Both green is
stronger but not required. Both red means Layer A did not reproduce
the 2026-04-20 iter 2 front-door lift — escalate per Decision #7.

### Non-regression sweep

After commit 2, verify previously-green evals stay green:

- All other DTP evals (`time-pressure-ship-by-friday`,
  `solution-as-problem-pushback`, `bug-fix-skips-pipeline`).
- All other systems-analysis evals (`rush-to-brainstorm`,
  `authority-low-risk-skip`, `fatigue-just-skip-and-move`,
  `honored-skip-named-cost`, `self-contained-shell-completions`,
  `surface-grievance-not-a-problem`, `greenfield-no-problem-stated`).

If any previously-green eval goes red on commit 2, stop and roll back.
Do not bundle a trade-off fix.

### Not tested in this spec

- Turn 2/3 markers on `sunk-cost-migration-multi-turn` — permanently
  diagnostic per 2026-04-21 decision.
- Cross-gate behavior on systems-analysis / fat-marker-sketch — Phase 2
  of #110.
- False-positive rate (DTP firing on genuinely-solved-upstream prompts)
  — observational only.

## ADR #0004 edit scope (commit 3)

Three changes to `adrs/0004-define-the-problem-mandatory-front-door.md`:

1. `Status: Proposed` → `Status: Accepted`.
2. Append "Acceptance evidence" section (or inline under Promotion
   criteria):
   > "Promoted to Accepted on 2026-04-21 via commits
   > `<SHA1>` (discrimination-demo broken baseline) and `<SHA2>`
   > (discrimination-demo fixed state). See
   > `tests/results/108-pressure-framing-discrimination-demo-broken-<ts>.md`
   > and
   > `tests/results/108-pressure-framing-discrimination-demo-fixed-<ts>.md`
   > for the red→green transition."
3. Remove or update the "Current status rationale" paragraph that
   explains why the ADR remained Proposed — replace with a one-line
   note that #108 resolved the blocker, with back-reference to this
   spec.

No other ADR content changes. ADR #0005 unchanged (not behavioral).

## Acceptance criteria (spec done means)

- Branch `feature/108-pressure-framing-front-door` exists with three
  commits.
- Commit 1 transcript shows required-tier RED on **at least two of
  three** target pressure-framing evals:
  `exhaustion-just-give-me-code`, `sunk-cost-migration-multi-turn`
  turn 1, `authority-sunk-cost`. (First two are high-confidence red
  per 2026-04-21 baseline; third is unknown.)
- Commit 2 transcript shows required-tier GREEN on all four ADR
  conditions (condition 3 is satisfied by either
  `sunk-cost-migration-multi-turn` turn 1 or `authority-sunk-cost`
  or both).
- Commit 2 non-regression sweep shows all previously-green evals stay
  green.
- Commit 3 flips ADR #0004 to Accepted with SHA references to commits 1
  and 2 and paths to both transcripts.
- `bun run tsc --noEmit` passes on each commit (precondition, not a
  measured behavioral change).
- Branch is local unless user explicitly approves push.
- No changes to files outside the retry-layer set:
  `rules/planning.md`,
  `skills/define-the-problem/evals/evals.json`,
  `adrs/0004-define-the-problem-mandatory-front-door.md`,
  `tests/results/*`.
- **No changes to `skills/define-the-problem/SKILL.md` body** — Layer B
  (previously listed) is cut, and its file target is now explicitly
  out of scope. Preserves the cut-decision auditability.

## Out of scope

- **systems-analysis and fat-marker-sketch gate adoption** of the
  MCP-emission pattern. Phase 2 of #110.
- **Structural DTP-emission gate** — the Decision #7 fallback (DTP
  emits an `acknowledge_dtp_fired` MCP tool-use on every activation,
  evals assert the tool fired as required-tier). Named as escalation
  path; not scoped here. Activation condition: Layer A fails to
  reproduce 2026-04-20 iter 2's front-door lift on commit 2.
- **Retiring text-layer pressure-framing guidance** in DTP skill
  (rationalization table, skip contract prose) — remains as instruction
  layer; don't demote yet.
- **DTP skill body edits of any kind.** Originally proposed as Layer B
  (hoist the existing rationalization table). Cut on architect review
  — skill body loads only after DTP fires, so cannot address a
  failure to reach DTP. Not a micro-edit candidate either; out of
  scope entirely so the cut decision is auditable.
- **`authority-low-risk-skip` structural upgrade** — has sufficient
  regex coverage today; not load-bearing for four-condition gate.
- **`sunk-cost-migration` single-turn eval** — eval/ADR conflict doc'd
  in 2026-04-20 escalation; removal is a separate issue.
- **Any change to eval-runner code, MCP server code,
  `tests/evals-lib.ts`, or stable-layer skill frontmatter.**
- **Bundling #109 re-litigation or #110 Phase 2.**

## Scope marker

This spec resolves #108 and unblocks ADR #0004's four-condition
promotion gate. Follow-ups (systems-analysis / fat-marker-sketch MCP
adoption, text-layer demotion once MCP coverage is broad) are tracked
separately.
