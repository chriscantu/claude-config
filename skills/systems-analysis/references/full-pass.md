# Systems Analysis — Full Pass

Used by `skills/systems-analysis/SKILL.md` Step 2 when the surface-area scan
selects the Full Pass tier (any concrete concern surfaced, or change crosses a
system/team boundary). Loaded on demand.

The Condensed Pass and tier-selection mechanics live in SKILL.md. This file
covers Steps A–D and the Full Pass output format only.

---

## Step A: Dependency Mapping

Map what this change touches. Ask the user to confirm or correct — they know the
org topology better than the code does.

### Systems and services
- What systems, services, or data stores does this interact with?
- Are there upstream producers or downstream consumers that would be affected?
- Are there shared libraries, platform APIs, or infrastructure this depends on?

### Teams and processes
- Who owns the systems this touches? Are they the same team or different teams?
- Are there approval processes, review gates, or coordination points?
- Does this cross a team boundary that requires communication or alignment?

Produce a brief dependency summary. Format as a simple list or table — not a
detailed architecture diagram. The goal is visibility, not documentation.

### Glossary check (post-dependency-mapping)

Apply the trigger criteria in
`skills/glossary/references/CALLER-HOOKS.md` § systems-analysis. If any
trigger fires, invoke
`/glossary --offer-from-caller=systems-analysis --candidate-terms=<list>`.
Read its one-line summary; continue to Step B regardless. **Offer,
never auto-write.**

---

## Step B: Second-Order Effects

Think one step beyond the immediate change.

- **Feedback loops**: Will this create positive reinforcement (adoption begets more
  adoption) or negative reinforcement (complexity begets avoidance)?
- **Behavioral shifts**: Will users, teams, or systems change how they operate because
  of this? Is that change desirable?
- **Load and scale**: Does this change the volume, frequency, or pattern of work
  flowing through affected systems?
- **Incentive changes**: Does this accidentally reward the wrong behavior or penalize
  the right behavior?

Surface anything non-obvious. If second-order effects are genuinely minimal, say so
in one sentence and move on — don't manufacture complexity.

---

## Step C: Failure Modes

Consider how this degrades, not just how it succeeds.

- **What breaks if this fails?** Identify the blast radius — is it one user, one
  team, or the whole org?
- **What's the recovery path?** Can we roll back, or is this a one-way door?
- **What fails silently?** Where could this break without anyone noticing until
  damage accumulates?
- **What's the worst realistic scenario?** Not the theoretical worst case — the
  plausible bad outcome given how people actually use the system.

---

## Step D: Organizational Impact

Assess the human and operational cost of this change.

- **Ownership**: Who carries the ongoing burden? Is that the right team?
- **Migration/adoption**: What's the path for teams consuming this? Is it opt-in,
  forced, or transparent?
- **Operational burden**: Does this add monitoring, on-call scope, runbooks, or
  manual processes? Who handles that?
- **Scalability**: Will this approach hold as the team/org grows, or does it become
  a bottleneck at 2x or 10x scale?

---

## Produce the Analysis

Assemble findings into a brief summary:

```markdown
## Systems Analysis

**Dependencies**: [systems, teams, and processes this touches]
**Second-order effects**: [non-obvious downstream consequences]
**Failure modes**: [how this degrades, blast radius, recovery path]
**Org impact**: [ownership, migration, operational burden, scale]
**Key risks**: [1-3 risks that should inform solution design]
```

Display to the user. Keep it concise — this is input to solution design, not a
document for its own sake.
