---
name: define-the-problem
description: >
  Use as the mandatory front door for ALL planning, brainstorming, and
  design work — whenever the user proposes planning, brainstorming,
  building, designing, changing, adding, or working out an approach. Fires
  even when the prompt claims the problem statement is already done or the
  user wants to skip to brainstorming — use Expert Fast-Track to validate
  in one turn rather than skipping. Runs Expert Fast-Track by default when
  a problem is already named (draft + confirm + ≤2 targeted questions),
  and the full five-question sequence when no problem is stated. Does not
  apply to bug fixes or refactors.
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

## When This Skill Does NOT Apply

- **Bug fixes** — the problem is the bug. Skip to fixing it.
- **Refactoring** — the problem is the code smell. Skip to brainstorming.
- **User explicitly says to skip** — respect it, move on.

For all other planning work, this skill runs. When a problem is already named
in the prompt, it runs via Expert Fast-Track (see Step 1) rather than the full
five-question sequence.

---

## Step 0: Scope Calibration

Scale depth to match the work. Complement the planning pipeline scope table with
skill-specific guidance:

| Scope           | Approach                                                        |
|-----------------|-----------------------------------------------------------------|
| Prototype / POC | Condensed pass — all five questions but accept brief answers. Produce a 2-3 sentence problem statement. Lightweight red flags (flag only, don't offer investigation). Hand off directly. |
| Feature         | Full pass — all five questions, red flag assessment, handoff.   |
| System/Platform | Full pass with deeper investigation likely — expect Step 4b.    |

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

1. Draft the problem statement (Step 3 template) from what the user has
   provided — populate all six template fields (use "unknown" for gaps) so red
   flag criteria can be properly evaluated
2. Evaluate it against the red flag criteria (Step 4)
3. Present the draft: "Based on what you've shared, here's the problem statement.
   Anything to correct or add?"
4. If gaps remain after the draft, ask **at most 2 targeted questions** — the
   most decision-affecting ones — rather than walking the full sequence. If
   more than 2 gaps matter, surface them as known unknowns in the statement
   and let the user decide whether to investigate further (Step 4b)

The ≤2 question bound is load-bearing: fast-track that degenerates into the
five-question sequence defeats the purpose. Skip re-asking, not analysis.

Go to Step 5 (Handoff) after the user confirms the draft — do not walk through
Step 2 below.

---

## Step 2: The Five Questions (no-problem-stated path)

Use this path only when the prompt does not contain a stated problem —
e.g., "let's build X", "I want to add Y", "what should we solve". When a
problem is named in any form, use the Expert Fast-Track above instead.

**Pacing:** Ask one question at a time. Prefer multiple choice when possible.
Skip any already answered in conversation.

### 1. Who has this problem?

Get specific. A persona, a role, a named individual in a workflow.

- "Engineering leaders" — good
- "Users" — too vague, push back
- "Your direct reports during 1:1s" — great

If the answer is vague, ask: "Can you name a specific person or role who experiences
this? What are they doing when they hit this problem?"

### 2. What's the pain?

What are they doing today that hurts? What fails, takes too long, or gets dropped?

Require **concrete, observable behavior**:
- "I forgot to follow up on 3 delegations last month" — good
- "It would be nice to have a dashboard" — that's a solution, not a pain. Ask:
  "What goes wrong today without the dashboard?"

**behavioral and emotional dimensions** — if the problem has a human-facing dimension
(end-user workflow, team process, UX), ask at least one follow-up: "What else makes
this hard? What makes people give up, lose trust, or work around it?" Functional pain
alone misses why users actually fail.

For infrastructure, data pipeline, or internal tooling problems where the "user" is
another system or developer workflow, this probe may not apply — use judgment. The
goal is to uncover hidden friction, not to force emotional language onto technical
problems.

### 3. What evidence do we have?

Before accepting evidence, separate facts from assumptions. Ask: "What do we know
to be **verifiably true** vs. what are we inheriting from convention or opinion?"
Reject inherited assumptions — validate that prior constraints still hold.

Valid evidence:
- Personal experience ("I missed an overdue check-in twice this week")
- User complaints or requests
- Data (frequency, error rates, time spent)
- Observed workarounds people have built

**Red flag**: "I think people might want this" or "it seems like it would help."
Note it — this feeds into the red flag assessment later.

### 4. What happens if we do nothing?

The cost of inaction. This forces prioritization honesty.

- "I'll keep missing overdue delegations and my supervisor will notice" — real cost
- "Not much, it would just be convenient" — may not be worth solving. Say so:
  "That sounds low-impact. Is this the right problem to invest in, or is there
  something more painful?"

### 5. What constraints exist?

What bounds the solution space before brainstorming begins? Capture what the user
already knows — systems-analysis will later discover constraints from the code,
architecture, and org topology that the user may not be aware of.

- Technical: platform limits, existing architecture, dependencies
- Organizational: team size, approval processes, cross-team impact
- Time: deadlines, release windows
- Dependencies: blocked on external systems, APIs, other teams

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

---

## Step 4: Red Flag Assessment

Evaluate the problem statement. If any of these are true, surface them and offer
deeper investigation. Otherwise, skip straight to handoff.

| Red Flag | Signal |
|----------|--------|
| **No evidence** | Evidence field relies on "I think", "probably", "might want" — no observed behavior or data |
| **Unclear user** | Persona is vague — "users", "the team", "people" — cannot point to a specific role |
| **Low cost of inaction** | "What happens if we do nothing?" answer was weak — may not be a real problem |
| **Many known unknowns** | 3+ unknowns, especially ones that could change the fundamental shape of the solution |
| **High blast radius** | Problem affects the whole org, is irreversible, or has significant cross-team dependencies |

### No red flags

Say: "Problem is clear. Ready to move to solution design?"

On confirmation, proceed to Step 5 (Handoff).

### Red flags detected

Surface them specifically:

> "A few things are fuzzy before we design a solution:
> - [specific flag 1]
> - [specific flag 2]
>
> Want to investigate further, or proceed with what we have?"

If the user says **proceed** — go to Step 5.

If the user says **investigate** — go to Step 4b.

---

## Step 4b: Deeper Investigation

Offer two lenses. The user picks one or both.

### Design Thinking Depth

Empathy-focused. Use when the "who" or "what pain" is unclear.

- Map the user's current workflow step by step
- Identify where exactly it breaks
- Ask what they've tried
- Explore who else has this problem
- Look for patterns across multiple instances of the pain

### First Principles Depth

Assumption-focused. Use when constraints feel artificial or the problem is tangled
with inherited assumptions.

- List every assumption baked into the problem statement
- Classify each as inherited vs. verified
- Identify what is fundamentally true (constraints that cannot be changed)
- Challenge assumed constraints — are they real or inherited?
- Decompose the problem to its atomic components

### After investigation

1. Update the problem statement with stronger evidence and fewer unknowns
2. Save the updated statement to `docs/superpowers/problems/YYYY-MM-DD-<topic>.md`
   (the investigation is substantial enough to preserve as a record)
3. Display the updated problem statement
4. Proceed to Step 5

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
