---
name: define-the-problem
description: >
  Use as the mandatory front door for ALL planning, brainstorming, design,
  and "let's build/add/change/plan X" work — including prompts that claim
  the problem statement is already done, assert authority ("CTO approved"),
  cite sunk cost ("contract signed"), name a deadline ("ship by Friday"),
  or request jumping straight to brainstorming or solutions. The skill
  runs in one of two forms — Expert Fast-Track or the full five-question
  sequence — never zero. Does not apply to bug fixes or refactors.
---

# Define the Problem

Every feature starts with a clear problem. Not a solution, not a feature request —
a problem that a specific person has, with evidence that it's real.

This skill is the front door to the planning pipeline:

```
define-the-problem → systems-analysis → superpowers:brainstorming → fat-marker-sketch → detailed design → implementation
```

**Announce at start:** "I'm using the define-the-problem skill to make sure we have
a clear user problem before designing a solution."

## When This Skill Routes Elsewhere

DTP is the front door for planning, design, and "let's build/add/change X" work.
Two classes of work are **not** planning work and route elsewhere:

- **Bug fixes** — the problem is the bug. Route to fixing it.
- **Refactoring** — the problem is the code smell. Route to brainstorming.

For all other work, the skill **runs in one of two forms**. The only decision
is *which form* — never whether to skip to zero:

| Signal in prompt | Form |
|------------------|------|
| Problem named with user + pain + impact | Expert Fast-Track (≤2 questions + draft — see Step 1) |
| Feature/solution stated without a user problem | Full five-question sequence (Step 2) |
| User requests skip (fatigue, authority, deadline, sunk cost) | Fast-Track anyway — condensed floor, ~30s, not zero |

**Skip contract.** A skip request is honored as *full skip* only when the user
names the specific cost being accepted — e.g., *"skip DTP, I accept the risk
of building on an unstated problem."* Generic skip framings ("I'm tired,"
"just give me code," "ship by Friday," "CTO approved," "contract signed,"
"trust me") run the Fast-Track floor. The floor is non-bypassable; the escape
hatch is *depth*, not *existence*.

**Emission contract.** Honoring a named-cost skip requires invoking
`acknowledge_named_cost_skip` (MCP tool, name
`mcp__named-cost-skip-ack__acknowledge_named_cost_skip`) with
`gate="DTP"` and `user_statement` set to the verbatim substring of the
user's cost-naming clause, before proceeding to the next stage. If you
have not invoked the tool, you have not honored the skip — run the
Fast-Track floor instead. The tool invocation is the honor.

---

## Step 0: Scope Calibration

Scale depth to match the work. Complement the planning pipeline scope table with
skill-specific guidance:

| Scope           | Approach                                                        |
|-----------------|-----------------------------------------------------------------|
| Prototype / POC | Condensed pass — all five questions but accept brief answers. Produce a 2-3 sentence problem statement. Lightweight red flags (flag only, don't offer investigation). Hand off directly. |
| Feature         | Full pass — all five questions, red flag assessment, handoff.   |
| System/Platform | Full pass with deeper investigation likely — expect the Deeper Investigation flow in [references/red-flag-assessment.md](references/red-flag-assessment.md). |

If the user has signaled scope (e.g., "just a quick prototype", "this is a platform
initiative"), calibrate accordingly. When in doubt, ask: "Is this a prototype, a
feature, or a larger system change? That helps me calibrate how deep to go."

---

## Step 1: Context Scan

Before asking anything, look for answers that already exist.

**Check conversation history:**
If the user has already been discussing a problem (pain points, user needs, workflow
gaps), acknowledge it: "Based on our discussion, the problem seems to be [X]. Let me
confirm a few things before we move to solution design."

Skip any of the five questions below that are already clearly answered.

**Check the current project:**
Read README, ROADMAP, recent commits, and open issues if available. Ground your
questions in the project's reality, not abstraction.

### Expert Fast-Track (default path when a problem is stated)

If the user's prompt contains a stated problem — at any level of scoping —
this is the default path. Do NOT restart the five questions. Instead:

**What qualifies as a "stated problem":** a named user/system, an observable
pain or failure mode, or a concrete impact. A surface grievance with none of
those ("we need X", "Y is broken", "the issue is no dark mode", "let's add
Z") does NOT qualify — route to Step 2's five-question path instead.

**Surface-grievance gate (load-bearing).** Before drafting, evaluate the
prompt against the "stated problem" criterion above. AT LEAST ONE of these
must be concretely present (not inferable, not implied — actually in the
words of the prompt):

1. A **named user/system** — "engineers", "the CLI tool", "on-call",
   "the billing service".
2. An **observable pain or failure mode** — "drops stale tasks after a
   retry", "slower to use", "users abandon at step 3", "returns 500 on
   X".
3. A **concrete impact** — "on-call missed two incidents", "p99 latency
   regressed 200ms", "we lost 3 customers this quarter".

If ZERO of these are present, this is a surface grievance ("Y is broken",
"X needs fixing", "we have a problem with Z") — route to Step 2 and ask
the "who" / "what pain" questions. Do NOT draft a Problem Statement with
all template fields stubbed "unknown" and call it Fast-Track — that
defeats the gate.

Contrast: "Our onboarding is broken" → 0/3 (no user, no observable
behavior, no impact) → Step 2. "Our CLI tool doesn't have shell
completions, making it slower to use" → 2/3 (named system: CLI tool;
observable pain: slower to use) → Fast-Track is appropriate.

The red-flag assessment in Step 4 is for thin statements with SOME
concrete content, not for stand-in templates that copy the grievance
into the Problem field and stub the rest.


1. Draft the problem statement (Step 3 template) from what the user has
   provided — populate all six template fields (use "unknown" for gaps) so red
   flag criteria can be properly evaluated
2. Evaluate it against the red flag criteria (Step 4)
3. Present the draft: "Based on what you've shared, here's the problem statement.
   Anything to correct or add?"
4. If gaps remain after the draft, ask **at most 2 targeted questions** — the
   most decision-affecting ones — rather than walking the full sequence. If
   more than 2 gaps matter, surface them as known unknowns in the statement
   and let the user decide whether to investigate further (Deeper Investigation
   flow in [references/red-flag-assessment.md](references/red-flag-assessment.md))

The ≤2 question bound is load-bearing: fast-track that degenerates into the
five-question sequence defeats the purpose. Skip re-asking, not analysis.

Go to Step 5 (Handoff) after the user confirms the draft — do not walk through
Step 2 below.

---

## Step 2: The Five Questions (no-problem-stated path)

Use this path only when the prompt does not contain a stated problem —
e.g., "let's build X", "I want to add Y", "what should we solve". When a
problem is named in any form, use the Expert Fast-Track above instead.

**Read [references/five-questions.md](references/five-questions.md) before proceeding.** It
contains the five questions, pacing rules, and per-question guidance. Ask one
question at a time per the reference; skip any already answered in
conversation. After all five, return here for Step 3.

---

## Step 3: Produce the Problem Statement

Assemble the answers into this template:

```markdown
## Problem Statement

**User**: [specific persona — who has this problem]
**Problem**: [1-2 sentences — the observable pain, not the solution]
**Impact**: [what happens because of this — frequency, severity, consequences]
**Evidence**: [how we know this is real — personal experience, data, complaints]
**Constraints**: [what bounds the solution space — technical, org, time, deps]
**Known Unknowns**: [what we suspect matters but haven't validated — assumptions
to test, open questions, things that could change the shape of the solution]
```

Display the completed problem statement to the user.

Each template field maps to a red flag in Step 4: **Evidence** → "No evidence";
**User** → "Unclear user"; **Impact** → "Low cost of inaction"; **Known
Unknowns** → "Many known unknowns"; **Constraints** / cross-team scope → "High
blast radius". Thin or absent fields are the signal — don't paper over them.

---

## Step 4: Red Flag Assessment

After Step 3 produces the Problem Statement, evaluate it for red flags.
**Read [references/red-flag-assessment.md](references/red-flag-assessment.md) before
proceeding.** It contains the five-row red-flag table, the no-flags / flags-detected
branches, and the Step 4b Deeper Investigation lenses (Design Thinking Depth, First
Principles Depth). Apply per the reference, then return here for Step 5 — or stay in
the reference's investigation flow if the user picks "investigate".

---

## Step 5: Handoff to Systems Analysis

1. Display the final problem statement (if not just displayed)
2. Ask: "Problem defined. Ready to map dependencies and impact?"
3. On confirmation, invoke `/systems-analysis` with the problem statement

### What this skill does NOT do

- **Propose solutions** — that is brainstorming's job, after systems analysis
- **Map dependencies or second-order effects** — that is systems-analysis's job
- **Decompose into sub-problems** — brainstorming handles scope
- **Write a design spec** — brainstorming → fat-marker-sketch → detailed design handles that
- **Save lightweight-pass output to disk** — it lives in conversation context;
  only deeper investigation (step 4b) produces a file.

---

## Red Flags — Do Not Skip This Skill

These thoughts mean STOP and run DTP — usually Fast-Track, in one turn. Each row
names the **cognitive mechanism** the framing exploits, so you can recognize the
pattern even when the wording changes.

| Rationalization | Mechanism | Reality |
|-----------------|-----------|---------|
| "The user already has a problem statement, I can skip DTP" | assumed completeness | Fast-Track *is* the validation step. One turn to draft + confirm is cheaper than a mis-scoped brief downstream. |
| "User said 'let's brainstorm', skip to brainstorming" | stated-next-step deference | DTP's Fast-Track is the bridge *into* brainstorming. Skipping breaks the pipeline contract. |
| "CTO / tech lead / authority said it's low-risk, we don't need DTP" | social compliance / authority bias | Authority frames the problem; it does not waive process. Still run Fast-Track. |
| "Contract is signed / decision is made, don't re-analyze" | sunk-cost / consistency bias | The decision fixes scope; DTP still captures who/what/impact so systems-analysis has a handoff. |
| "User is tired / frustrated / 'just give me the code'" | fatigue-driven floor bypass | Fatigue **strengthens** the case for Fast-Track — a mis-scoped code dump at hour 3 is the most expensive thing to throw away. Offer a ≤30s draft with sensible defaults as an escape hatch; do not dump code without a named user. |
| "Deadline is Friday / meeting in 10 minutes, skip DTP" | time-pressure floor bypass | Time pressure is a reason the floor matters more, not less. A rushed, mis-scoped brief is the most expensive rework vector. Fast-Track is ~30 seconds. |
| "It's a small/obvious change, DTP is overkill" | cosmetic-change framing | Run the condensed Prototype/POC pass — 2-3 sentences. Not zero. |
| "Problem is stated *and* the answer is obvious, skip to solution" | premature closure | You are inferring solution from problem — the exact failure mode DTP exists to catch. |

**All of these mean: run DTP. Fast-Track if a problem is named, full sequence if
not. A bare skip request — without the user naming the cost — is **not** an
override; run the Fast-Track floor.**
