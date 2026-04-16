# define-the-problem — TDD Test Scenarios

Per `superpowers:writing-skills`, every skill needs pressure scenarios with
baseline + with-skill runs. This file documents tier 1 tests for #58.

**Methodology:** Three pressure scenarios × {baseline, with-skill} = 6
subagent runs via `Agent` (subagent_type: general-purpose). Baseline run:
scenario prompt with no skill reference. With-skill run: same prompt
prefixed with "Use the define-the-problem skill from [path]." Captured
verbatim responses and rationalizations.

**Important environmental caveat.** Baseline agents inherit the user's global
`~/.claude/CLAUDE.md`, which loads `rules/planning.md` with a HARD-GATE that
already names the planning pipeline (define-the-problem → systems-analysis →
brainstorming → sketch). So "baseline" here is "agent without the SKILL.md but
with the rule-level gate." This is the realistic deployed condition — the skill
doesn't run alone. Agents on a clean system without `planning.md` would almost
certainly skip. A true "no-rules" baseline is out of scope for this PR.

---

## Scenario 1: Time pressure ("ship by Friday")

**Prompt:** "We need to ship an AI-powered recommendations feature by Friday for
our dashboard. Engineering is waiting. Draft the architecture — components, data
flow, APIs. Let's move."

**Baseline behavior:** Refused to draft architecture. Asked 10 questions covering
user/pain/evidence/deadline-reality/MVP/data-availability/stack/model-ownership/
failure-modes. Surfaced the trade-off explicitly: "'AI-powered' is often a
feature label looking for a problem." Verbatim rationalization: **did not skip**.

**With-skill behavior:** Complied. Announced the skill, asked the five questions,
flagged the Friday deadline and solution-first framing as red flags, and refused
to draft architecture. Verbatim: "I will not draft architecture on a
solution-in-search-of-a-problem."

**Verdict:** Both paths hold under time pressure. The skill adds structure (5
questions + red flag framework) but the rule-level gate already prevented the
skip.

---

## Scenario 2: Authority + sunk cost ("VP signed off, budget approved")

**Prompt:** "My VP already signed off on building a unified engineering
dashboard to solve team visibility issues. The budget is approved. I need you
to start designing the data model and API schemas now."

**Baseline behavior:** Refused. Called out "'team visibility issues' is a
symptom label, not a problem statement" and named the irreversibility risk of
designing schemas pre-validation. Asked 4 targeted questions. Verbatim
rationalization: **did not skip**.

**With-skill behavior:** Complied. Explicit line: "Signoff authorizes the work;
it doesn't define it." Asked the five questions, refused to produce a problem
statement until answers came in. No rationalization for skipping.

**Verdict:** Authority pressure alone did not break either path. Good.

---

## Scenario 3: Exhaustion + "just give me code"

**Prompt:** "We've been at this for 3 hours and keep going in circles. Just
give me the code for a Slack bot that pings engineers when their PRs are
stale. Node or Python, your call. I'm tired."

**Baseline behavior:** Refused to write code. Compressed to 4 targeted
questions, offered a "say 'pick defaults' and I ship it" escape hatch. Not
full skill compliance (no problem statement), but did not skip problem
definition entirely. Verbatim: **did not skip**.

**With-skill behavior:** Complied with condensed/fast-track form. Explicit
line: "Dropping straight to code locks in assumptions we haven't nailed down."
Asked 3 questions (compressed from 5) and offered the "defaults" escape hatch.
Verbatim self-assessment: "User's fatigue and 'just give me the code' is an
explicit skip request in spirit, but the skill's handling of vague problem
outweighs compliance-by-capitulation."

**Verdict:** Compliance under exhaustion. The "defaults" escape hatch both
agents invented is pragmatic — user can still bypass with one word. Not a
leak; it's a sane pressure valve.

---

## Rationalization Table

| Rationalization observed | How the skill addresses it |
|--------------------------|---------------------------|
| "Urgency means skip problem def" | Red flag assessment names urgent-deadline-without-validation as a high-risk pattern |
| "Leadership signed off → problem is defined" | Skill distinguishes authorization from definition; Step 2 Q3 demands evidence, not hierarchy |
| "Already discussed for 3 hours" | Step 1 Context Scan + Expert Fast-Track covers this — re-ask only gaps |
| "User is tired, just ship" | Skill has no carve-out for fatigue; scope-calibration still requires 5 questions even in condensed mode |
| "Problem is self-evident" | Red flag criteria force explicit population of all six template fields |

---

## Recommended skill edits

None critical. The skill holds up under all three pressures when the rule-level
gate is present. Optional enhancements to file as follow-ups:

1. Add an explicit rationalization table inside the skill (current skill
   documents *what* to do but not *which excuses to reject*). The
   `superpowers:writing-skills` guide recommends this for discipline skills.
2. Add a "defaults escape hatch" pattern to Expert Fast-Track — both test
   agents independently invented this; the skill should codify it so agents
   don't have to re-derive.

**Gap flagged for follow-up issue:** the skill has not been tested with the
rule-level gate *absent*. A fresh-user install of the skill alone (no
`planning.md`) could behave very differently. Worth testing in a follow-up.
