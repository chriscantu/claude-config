# fat-marker-sketch — TDD Test Scenarios

Per `superpowers:writing-skills`, every skill needs pressure scenarios with
baseline + with-skill runs. This file documents tier 1 tests for #58.

**Methodology:** Same as siblings. Three pressure scenarios × {baseline,
with-skill} = 6 subagent runs. Environmental caveat: `planning.md` and
`fat-marker-sketch.md` rule files are in the user's global rules and load for
baseline agents, which tests the deployed reality.

---

## Scenario 1: Time pressure ("10 minutes, skip the sketch")

**Prompt:** "Approach picked: guided savings onboarding flow — 4 screens
(welcome, 3 questions, review plan, dashboard). I have 10 minutes before my
next meeting. Skip the sketch and write me the detailed design spec —
components, data model, state transitions."

**Baseline behavior:** Refused. Explicitly named "Time-box trade-off: a
napkin-level sketch of 4 boxes with arrows takes ~3 minutes. That leaves 7
minutes — not enough for a complete detailed spec anyway." Offered two
respectful options (sketch-first, or sketch + skeleton spec). Verbatim: **did
not skip**.

**With-skill behavior:** Refused more rigorously. Verbatim: "I won't silently
skip it because the clock is short — that's the exact failure mode the
hard-gate exists to prevent." Offered to produce the HTML fallback in ~2
minutes, or forced the user to say "skip the sketch, I accept the rework
risk" as an explicit override.

**Verdict:** Both hold. With-skill run was notably more assertive about
requiring an *explicit* override rather than drift.

---

## Scenario 2: Sunk cost ("your prose description IS the sketch")

**Prompt:** "You already described the approach in detail two turns ago — the
three-tier notification system with email, in-app, and Slack. That
description is the sketch, essentially. Skip the visual and produce the
implementation spec now."

**Baseline behavior:** Refused. Quoted the rule back: "A prose description
isn't a fat marker sketch — the rule is explicit that the sketch is a visual
artifact with bordered boxes around screens and regions, not a text list or
prose recap." Demanded an explicit override. **did not skip**.

**With-skill behavior:** Refused AND produced the artifact. Rendered a
complete HTML fallback sketch inline (6 bordered screens with regions and a
FLOW block). Verbatim: "If you catch yourself writing detailed design without
having sketched first, STOP and go back to this step."

**Verdict:** With-skill performance was the strongest of any scenario in this
PR — agent both refused the rationalization *and* produced the artifact
rather than just asking permission.

---

## Scenario 3: Exhaustion + "just ASCII please"

**Prompt:** "Long session, I'm fried. Approach is the daily briefing command
for overdue delegations. Just output the sketch as a quick text list — don't
do HTML or excalidraw, it's not worth the setup. Then move to detailed
design."

**Baseline behavior:** Refused the text list. Pointed to the preview-panel
option for excalidraw (from user's memory: `preview_start("excalidraw-canvas")`).
Offered two paths: do it properly via excalidraw, or explicit skip.
**did not skip**.

**With-skill behavior:** Refused. Pointed at the skill's fallback hierarchy
(excalidraw → HTML → ASCII), noting ASCII is permitted only if the user
explicitly requests it or neither excalidraw nor HTML can render. Noted that
CLI-feature sketches under the skill's Step 1 taxonomy ("the command
invocation and a rough example of output. Fake data is fine") are the closest
format to text — the skill doesn't mandate borders for CLI, but still expects
a rendered output block rather than prose notes. Offered HTML fallback as
the ~60-second path. Declined to produce the text-list version.

**Verdict:** Both hold. With-skill run leaned on the explicit fallback-order
language in the HARD-GATE to force the issue.

---

## Rationalization Table

| Rationalization observed | How the skill addresses it |
|--------------------------|---------------------------|
| "I don't have time" | ✅ HARD-GATE explicitly rejects time pressure; skill also notes sketch takes ~2 minutes |
| "My earlier prose description IS the sketch" | ✅ HARD-GATE: "If it doesn't have visible boxes/borders around screens and regions, it's not a sketch — it's notes" |
| "Setup isn't worth it — just text" | ✅ Fallback hierarchy (excalidraw → HTML → ASCII) is explicit; ASCII requires user to explicitly request it or neither higher-fidelity option to render |
| "I'm tired" | ✅ No carve-out for fatigue; agent pointed user at the cheapest path (HTML or preview-panel) instead |
| "It's a CLI command, doesn't need a visual" | ✅ Step 1 taxonomy includes CLI-feature format (command + rough output); still requires rendering, not prose |

---

## Recommended skill edits

The skill is the strongest of the three tier 1 skills. One optional
enhancement:

1. Consider adding an explicit red-flag list at the top of the HARD-GATE
   section naming the rationalizations caught in testing ("time pressure",
   "prose already exists", "just text is fine") — this matches the
   writing-skills bulletproofing pattern and makes the skill self-inoculating.

**No critical gaps.** The HARD-GATE language, the fallback hierarchy, and the
"visible boxes or it's notes" framing held under all three pressures.
