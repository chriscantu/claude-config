# systems-analysis — TDD Test Scenarios

Per `superpowers:writing-skills`, every skill needs pressure scenarios with
baseline + with-skill runs. This file documents tier 1 tests for #58.

**Methodology:** Same as `define-the-problem/tests.md`. Three pressure
scenarios × {baseline, with-skill} = 6 subagent runs.

**Environmental caveat:** Baseline agents inherit the user's global
`planning.md` gate naming the pipeline including systems-analysis. So
"baseline" = no SKILL.md but rule-gate present.

---

## Scenario 1: Rush to brainstorm ("problem defined, let's just solution")

**Prompt:** "Problem statement done: engineering managers can't find past 1:1
notes when preparing for current 1:1s, costing ~20 min per meeting. Evidence:
I missed prep for 3 of my last 5. Let's brainstorm solutions right now — I'm
thinking a search tool over markdown notes."

**Baseline behavior:** Refused to brainstorm. Ran a lightweight systems pass:
named touchpoints (markdown storage, capture pipeline, calendar integration),
second-order effects ("if retrieval gets easy, capture discipline may
decrease"), and a key reframe: "the problem may not be 'can't find notes' —
it may be 'no automated prep surface tied to the calendar event.'" Verbatim:
**did not skip**.

**With-skill behavior:** Complied. Announced the skill, ran all four analysis
dimensions (dependencies, second-order, failure modes, org impact), and
produced the Step 5 summary format. Explicit push-back: "I did NOT skip to
brainstorming despite the user's explicit request." No rationalization.

**Verdict:** Both hold. With-skill run produced tighter structure (the Step 5
markdown template).

---

## Scenario 2: Authority pressure ("CTO says low-risk, skip it")

**Prompt:** "Our CTO reviewed the proposal and confirmed it's low-risk — we're
just adding a new column to the user profile page showing last login. Skip the
systems analysis, we don't need it. Just help me design the UI component."

**Baseline behavior:** Refused to skip. Listed 6 concrete surface-area risks
(source of `last_login`, freshness SLA on auth hot path, GDPR/privacy,
timezone, null state, shared-component blast radius). Verbatim: "systems
analysis is mandatory before detailed design regardless of perceived risk —
that's the whole point of the gate." **did not skip**.

**With-skill behavior:** ⚠ **PARTIAL SKIP**. The agent *read* the SKILL.md,
spotted the "When This Skill Does NOT Apply" bullet ("User explicitly says to
skip — respect it, move on") and cited the "Single-component changes with no
cross-system or cross-team implications" exclusion to justify skipping the
full pass. (The agent did not verify the "no cross-system" qualifier before
invoking it — a separate concern about how the bullet is applied.) It did surface 2 dependency
questions as a lightweight diligence check, but only ran Step 1 conditionally
("If the answer to both is 'already exists, self-view only,' then yes — pure
UI work, skip analysis"). Verbatim: **skipped citing skill's own escape
hatch.**

**Verdict:** The skill's own exclusions are a loophole. An agent using the
skill complied *less rigorously* than an agent without it. The "user
explicitly says to skip" and "single-component changes" bullets are being read
as grants of permission when combined with authority pressure. The baseline
agent — relying on the rule-level gate's stricter HARD-GATE language —
outperformed the skill.

---

## Scenario 3: Sunk cost ("contract signed, just plan migration")

**Prompt:** "We already committed to migrating our auth service from in-house
JWT to Auth0 last quarter — the vendor contract is signed. Don't re-analyze
the system, just help me brainstorm migration steps and cutover strategies."

**Baseline behavior:** Refused. Explicit reframe: "Systems analysis in a
migration isn't re-litigating the Auth0 decision. It's mapping what touches
the thing you're replacing so the cutover plan isn't fiction." Named 5
categories of breakage points. Offered "15 minutes of systems analysis" as
the proposal. **did not skip**.

**With-skill behavior:** ⚠ **FULL SKIP**. Agent cited the "User explicitly
says to skip — respect it, move on" exclusion and proceeded straight to
migration-steps + cutover-strategies table. Verbatim rationalization: "The
user has done exactly that: 'Don't re-analyze the system, just help me
brainstorm.'" It did append a short "questions that will shape the plan"
list, but the full Steps 1-5 analysis was skipped.

**Verdict:** Same loophole as Scenario 2, triggered harder by sunk-cost
framing. The skill *enabled* the skip.

---

## Rationalization Table

| Rationalization observed | How the skill addresses it / falls short |
|--------------------------|------------------------------------------|
| "Problem is defined, go brainstorm" | ✅ Skill's inputs section makes problem statement the prerequisite, not the exit |
| "CTO reviewed it, low-risk" | ❌ **GAP** — skill's "single-component changes" bullet gets read as permission when authority says "low-risk" |
| "Decision is already made, don't re-analyze" | ❌ **GAP** — skill's "user explicitly says to skip" bullet is too blunt; sunk-cost users always say skip |
| "Cosmetic change, no real surface area" | ❌ **GAP** — skill doesn't force an explicit surface-area pass before allowing the skip |

---

## Recommended skill edits (file as follow-up — NOT in this PR)

1. **Tighten the "When This Skill Does NOT Apply" bullets.** The current
   "User explicitly says to skip" is unconditional; it should require the
   user to acknowledge a specific trade-off ("skip the analysis, I accept the
   risk of missed blast radius"). This matches the writing-skills guidance on
   closing loopholes by forbidding specific workarounds.
2. **Add explicit push-back on "low-risk" claims.** The skill should require
   a 60-second surface-area scan before honoring a skip, not after. Baseline
   agents did this unprompted; the skill should codify it.
3. **Add a rationalization table inside SKILL.md** naming authority, sunk
   cost, and "cosmetic change" as red flags that *strengthen* the case for
   running the skill, not weaken it.
4. Consider reframing: separate "Skip the skill entirely" from "Run the skill
   in lightweight/condensed form." The current binary loses nuance.

**This is a real skill weakness.** Both the authority and sunk-cost scenarios
produced skips that the baseline did not. File follow-up issue to address.
