# Red Flag Assessment + Deeper Investigation

Loaded after the Problem Statement is drafted ([SKILL.md](../SKILL.md) Step 3). Evaluate
the statement; if any red flag fires, surface and offer deeper investigation.
Otherwise return to SKILL.md Step 5 (Handoff).

## Red flags

| Red Flag | Signal |
|----------|--------|
| **No evidence** | Evidence field relies on "I think", "probably", "might want" — no observed behavior or data |
| **Unclear user** | Persona is vague — "users", "the team", "people" — cannot point to a specific role |
| **Low cost of inaction** | "What happens if we do nothing?" answer was weak — may not be a real problem |
| **Many known unknowns** | 3+ unknowns, especially ones that could change the fundamental shape of the solution |
| **High blast radius** | Problem affects the whole org, is irreversible, or has significant cross-team dependencies |

## No red flags

Say: "Problem is clear. Ready to move to solution design?"

On confirmation, proceed to [SKILL.md](../SKILL.md) Step 5 (Handoff).

## Red flags detected

Surface them specifically:

> "A few things are fuzzy before we design a solution:
> - [specific flag 1]
> - [specific flag 2]
>
> Want to investigate further, or proceed with what we have?"

If the user says **proceed** — go to [SKILL.md](../SKILL.md) Step 5.

If the user says **investigate** — go to [Deeper Investigation](#deeper-investigation) below.

---

## Deeper Investigation

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
4. Proceed to [SKILL.md](../SKILL.md) Step 5
