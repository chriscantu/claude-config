# The Five Questions (no-problem-stated path)

Use this path only when the prompt does not contain a stated problem —
e.g., "let's build X", "I want to add Y", "what should we solve". When a
problem is named in any form, use the Expert Fast-Track in
[SKILL.md](../SKILL.md) instead.

**Pacing:** Ask one question at a time. Prefer multiple choice when possible.
Skip any already answered in conversation.

## 1. Who has this problem?

Get specific. A persona, a role, a named individual in a workflow.

- "Engineering leaders" — good
- "Users" — too vague, push back
- "Your direct reports during 1:1s" — great

If the answer is vague, ask: "Can you name a specific person or role who experiences
this? What are they doing when they hit this problem?"

## 2. What's the pain?

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

## 3. What evidence do we have?

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

## 4. What happens if we do nothing?

The cost of inaction. This forces prioritization honesty.

- "I'll keep missing overdue delegations and my supervisor will notice" — real cost
- "Not much, it would just be convenient" — may not be worth solving. Say so:
  "That sounds low-impact. Is this the right problem to invest in, or is there
  something more painful?"

## 5. What constraints exist?

What bounds the solution space before brainstorming begins? Capture what the user
already knows — systems-analysis will later discover constraints from the code,
architecture, and org topology that the user may not be aware of.

- Technical: platform limits, existing architecture, dependencies
- Organizational: team size, approval processes, cross-team impact
- Time: deadlines, release windows
- Dependencies: blocked on external systems, APIs, other teams

---

After all five questions, return to [SKILL.md](../SKILL.md) Step 3 to assemble the Problem Statement.
