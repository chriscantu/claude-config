# define-the-problem — Global Skill Design Spec

**Date**: 2026-03-27
**Status**: Approved
**Author**: Cantu

---

## Purpose

A global Claude Code skill that ensures every new feature starts with a clear user
problem definition before solution design begins. Lightweight by default — a few
focused questions — with the option to go deeper when red flags surface.

Slots into the workflow as the front door to solution design:

```
define-the-problem → superpowers:brainstorming → writing-plans → implementation
```

## Location

```
~/repos/claude-config/skills/define-the-problem/SKILL.md
```

Symlinked into `~/.claude/skills/define-the-problem/` via `install.fish`.

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Scope boundary | Clean handoff — no scope decomposition | Brainstorming already handles "is this one project or many?" Keep this skill focused on problem clarity. |
| Context awareness | Context-aware — skip answered questions | Forcing re-answers for questions already discussed in conversation creates friction that discourages use. |
| Output format | Structured lightweight template (6 fields) | One paragraph is too thin for brainstorming to consume. A full document is overkill for the default path. Six fields force rigor without feeling like paperwork. |
| Framework selection | Unified flow, framework choice only at depth | Design Thinking and First Principles are complementary lenses. The lightweight pass blends both naturally. Framework labels only matter when going deep. |
| Deeper investigation trigger | Signal-based, not always-offer | Asking "want to go deeper?" every time becomes noise. Offer only when the lightweight pass reveals red flags — weak evidence, vague user, many unknowns. |

---

## Trigger

The skill activates when the user proposes building something new without a clear
problem statement. Trigger phrases include:

- "let's build", "new feature", "I want to add"
- "what should we solve", "what problems should we address"
- "define the problem"
- Any statement that proposes a solution without articulating the user pain

The skill does NOT trigger for:
- Bug fixes (the problem is the bug)
- Refactoring (the problem is the code smell)
- Explicit "skip problem framing" instruction from the user

---

## Lightweight Flow (Default Path)

Takes 2-5 minutes. Runs every time.

### Step 1: Context Scan

Before asking anything:

1. Check conversation history for problem-related discussion already in progress.
   If context exists, acknowledge it: "Based on our discussion, the problem seems
   to be [X]. Let me confirm a few things."
2. Check the current project for signals: README, ROADMAP, recent commits, open
   issues. Ground questions in reality, not abstraction.

### Step 2: The Five Questions

Asked one at a time. Skip any already answered in conversation. Prefer multiple
choice when possible.

1. **Who has this problem?**
   Identify the specific user or persona. "Engineering leaders", not "users."
   "Your direct reports during 1:1s", not "the team."

2. **What's the pain?**
   What are they doing today that hurts? What fails, takes too long, or gets
   dropped? Concrete, observable behavior — not "it would be nice if."

3. **What evidence do we have?**
   How do we know this is real? Personal experience, user complaints, data,
   frequency of occurrence. "I forgot to follow up 3 times last month" counts.
   "I think people might want this" is a red flag.

4. **What happens if we do nothing?**
   The cost of inaction. Forces prioritization honesty. If the answer is
   "not much," the problem might not be worth solving.

5. **What constraints exist?**
   Technical, organizational, time, dependencies. Things that bound the solution
   space before brainstorming begins.

### Step 3: Produce Problem Statement

Assemble answers into the structured template (see Output Format below).
Then evaluate for red flags.

---

## Output Format — Problem Statement Template

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

### Example

```markdown
## Problem Statement

**User**: Director of Engineering starting their workday
**Problem**: No consolidated view of what needs attention today — urgent tasks,
overdue delegations, inbox backlog, and calendar shape require running multiple
commands manually.
**Impact**: Daily. Risk of missing urgent items compounds throughout the day.
The Director's scarcest resource (attention) is spent on assembly instead of action.
**Evidence**: Current workflow requires manually checking TASKS.md, running
/scan-email, and reviewing calendar separately. All data exists but nothing
assembles it.
**Constraints**: Must work with existing TASKS.md, calendar, and memory data
sources. Plugin is local-first, macOS only.
**Known Unknowns**:
- Is the morning the right anchor, or do Directors need this view after
  every long meeting?
- Should overdue delegations be surfaced with recommended actions, or just listed?
- How much calendar detail is useful vs. noise at a glance?
```

---

## Red Flag Assessment

After the lightweight pass, evaluate the problem statement for red flags. This
determines whether to offer deeper investigation or proceed to handoff.

### Red Flags

| Flag | Signal |
|------|--------|
| No evidence | "Evidence" field is weak — "I think", "probably", "might want". No observed behavior, data, or complaints. |
| Unclear user | Persona is vague — "users", "the team", "people". Cannot point to a specific person or role. |
| Low cost of inaction | "What happens if we do nothing?" answer was weak. May not be a real problem. |
| Many known unknowns | 3+ unknowns, especially ones that could change the fundamental shape of the solution. |
| High blast radius | Problem affects the whole org, is irreversible, or has significant cross-team dependencies. |

### Routing

**No red flags detected**: Skip straight to handoff.
Say: "Problem is clear. Ready to move to solution design?" Then invoke brainstorming.

**Red flags detected**: Surface them specifically and offer:
"A few things are fuzzy — [list specifics]. Want to investigate further before
designing a solution, or proceed with what we have?"

---

## Deeper Investigation (Optional)

Only entered when the user opts in after red flags are surfaced.

### Design Thinking Depth

Empathy-focused investigation:

- Map the user's current workflow step by step
- Identify where exactly it breaks
- Ask what they've tried
- Explore who else has this problem
- Look for patterns across multiple instances of the pain

Observational, human-centered. Best when the "who" or "what pain" is unclear.

### First Principles Depth

Assumption-focused investigation:

- List every assumption baked into the problem statement
- Classify each as inherited vs. verified
- Identify what is fundamentally true (constraints that cannot be changed)
- Challenge assumed constraints — are they real or inherited?
- Decompose the problem to its atomic components

Decompositional, analytical. Best when constraints feel artificial or the problem
is tangled with assumptions.

### After Investigation

- User picks one lens or both
- Investigation produces an updated problem statement with stronger evidence and
  fewer unknowns
- The updated problem statement is saved to disk at
  `docs/superpowers/problems/YYYY-MM-DD-<topic>.md` (investigation is substantial
  enough to preserve)
- Then proceed to handoff

---

## Handoff to Brainstorming

When the problem statement is solid:

1. Display the final problem statement
2. Ask: "Problem defined. Move to solution design?"
3. On confirmation, invoke `superpowers:brainstorming` with the problem statement
   as input

### What the skill does NOT do

- Propose solutions (brainstorming's job)
- Decompose into sub-problems (brainstorming handles scope)
- Write a design spec (brainstorming → writing-plans handles that)
- Save lightweight-pass output to disk (lives in conversation context; brainstorming
  captures it in its spec)

### File output

| Path | When |
|------|------|
| No file | Lightweight pass only (default) |
| `docs/superpowers/problems/YYYY-MM-DD-<topic>.md` | Deeper investigation was performed |

---

## Integration

### Workflow Position

```
define-the-problem → superpowers:brainstorming → writing-plans → implementation
```

**What changes for the user**: When proposing "let's build X", Claude invokes
`define-the-problem` first instead of jumping to brainstorming. Fast enough
(2-5 minutes) that it feels like a focused conversation, not a gate.

**What doesn't change**: Everything downstream of brainstorming. The superpowers
pipeline is untouched. Brainstorming just gets better input.

### Install

Add `skills/define-the-problem/SKILL.md` to the `claude-config` repo. Run
`fish install.fish` to symlink into `~/.claude/skills/`.

### Frontmatter

```yaml
---
name: define-the-problem
description: >
  Ensure every new feature starts with a clear user problem before solution design.
  Triggers when the user proposes building something new. Lightweight by default —
  a few focused questions to establish who has the problem, what the pain is, and
  what evidence supports it. Hands off to superpowers:brainstorming when complete.
---
```
