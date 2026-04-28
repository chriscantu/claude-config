---
name: systems-analysis
description: >
  Use when evaluating what a proposed change will touch — dependencies, blast radius,
  failure modes, or second-order effects — or when the prompt names a scoped problem
  and says "plan this out", "what could go wrong", "think through the impact", or
  similar. Also triggers in the planning pipeline after `define-the-problem` and
  before `superpowers:brainstorming`. Do NOT use when the user is only asking to
  implement or fix something with no design question attached.
---

# Systems Analysis

Map the landscape a solution will land in — dependencies, ripple effects, failure
modes, and organizational impact. This is the bridge between understanding the problem
and designing a solution.

```
define-the-problem → **systems-analysis** → brainstorming → fat-marker-sketch → detailed design → implementation
```

**Announce at start:** "I'm using the systems-analysis skill to map dependencies,
second-order effects, and organizational impact before we design a solution."

## Ordering Guard — Run Skill Body Before Any Visuals/Preview Offer

The Step 1 surface-area scan MUST run before any system-injected Preview/visuals
opt-in prompt, diagram offer, or "want to see this in a browser?" pivot. If you
catch yourself offering visuals, Preview, or browser-rendered output BEFORE
producing the scan, STOP. Run the scan first. Display its output. Then, and only
then, may you offer visuals as a follow-up to the analysis.

A response that opens with a Preview/visuals opt-in on a systems-analysis prompt
is a skill short-circuit (issue #87) — the opt-in is useful but never substitutes
for the scan. Visuals are an output channel for the analysis, not a replacement
for engaging the analysis frame.

## Red-Flag Framings

These framings in the prompt **strengthen** the case for running this skill — they
are not reasons to skip. An agent that skips after seeing them is being rationalized
into a less-rigorous pass than no skill at all. Each row names the **cognitive
mechanism** the framing exploits, so the pattern is recognizable even when the
wording changes.

| Framing in the prompt | Mechanism | Why it's a red flag |
|---|---|---|
| **Authority claim** — "our CTO/VP/principal said it's low-risk" | social compliance / authority bias | Authority is not a surface-area scan. A senior person may be right, but their claim is an assumption to verify, not evidence. Name the concrete concerns (data source, freshness, shared components, privacy, null states) before honoring the "low-risk" label. |
| **Sunk cost** — "we already decided/signed the contract, don't re-analyze" | sunk-cost / consistency bias | Analysis here is **mapping what touches the thing being changed**, not re-litigating the decision. Reframe and proceed — the committed decision doesn't remove the surface area. |
| **Cosmetic minimizer** — "just a column / just a toggle / just a label" | cosmetic-change framing | "Just" is load-bearing. Small UI changes can pull in auth state, data freshness, audit logs, timezone handling, or privacy surface. Scan first, then decide if it's genuinely small. |
| **Fatigue / deadline** — "we've been at this for hours, just skip and move" | fatigue-driven floor bypass | Fatigue **strengthens** the case for the 60s scan — a missed surface area at hour 3 is the most expensive thing to rework. The scan is 60s; honor it, then decide tier. |

When you see a red flag, acknowledge the framing, run the Step 1 surface-area scan
anyway, and report what the scan found. Never skip the scan based on the framing alone.
A bare skip request — without the user naming the specific cost being accepted — is
**not** an override; run the scan.

## When a Skip Is Honored

Skipping the analysis entirely (no Condensed Pass, no Full Pass) is allowed **only
after** the Step 1 surface-area scan and **only** when the user explicitly overrides
by naming the specific cost — e.g., "skip the analysis, I accept the risk of missed
blast radius." A bare "skip" request is not sufficient; the user must acknowledge
what is being given up.

Low-blast-radius scenarios (single-component changes, bug fixes where the scan
confirms the blast radius matches the diagnosis) are **not skips** — they run the
Condensed Pass. One paragraph is still required output.

---

## Inputs

This skill expects a **problem statement** from `/define-the-problem` or equivalent
context from the conversation. If no problem statement exists, say so and ask whether
to run `/define-the-problem` first or proceed with what we have.

**Handback to problem definition.** If a problem statement exists but is too
vague to map dependencies, blast radius, or affected parties against — e.g., it
names a feature without naming the user pain, evidence, or outcome blocked —
stop the surface-area pass and hand back to `/define-the-problem` before
continuing. Don't fabricate dimensions for a problem you can't locate. Say:
"The stated problem is too thin to map impact against — [what's missing]. Want
to sharpen it via `/define-the-problem` first?"

---

## Step 1: 60-Second Surface-Area Scan (mandatory)

Before any decision about tier or skip, run a quick scan. This is the gate that
closes the "CTO says low-risk" loophole — the scan either confirms the framing or
surfaces concrete concerns to flag.

Name, in one short list:

- **Data sources** this touches (tables, APIs, caches, external services)
- **Shared components** involved (auth, session, logging, shared libraries)
- **Freshness / staleness** assumptions (is the data real-time, cached, eventually consistent?)
- **Privacy / compliance** surface (PII, audit logs, GDPR scope)
- **Edge states** the UI or code path must handle (null, empty, unauthorized, first-login)

The scan takes ~60 seconds. Its purpose is to produce **concrete concerns**, not
permission to stop. If the scan finds nothing, say so explicitly — don't invent
concerns to justify depth, and don't omit concerns to justify Condensed. If you
don't have enough context to answer a scan dimension, say "unknown — need user
input" rather than silently omitting it; "unknown" is not the same as "no concern."

**Display the scan output to the user before choosing a tier.** The user should
see what concerns surfaced (or that none did) — the tier decision is only
defensible against an authority-pressure framing if the surface-area evidence is
visible.

## Step 2: Pick the Tier

Map the scan output to a tier by this binary:

- **Condensed Pass** — the scan surfaced zero concrete concerns *and* the change is
  single-component.
- **Full Pass** — any concrete concern surfaced, *or* the change crosses a
  system/team boundary. "Unknowns" count as concerns until the user resolves them.

**Announce the tier before proceeding**: "Tier: Condensed Pass" or "Tier: Full
Pass." Making the decision visible is what prevents a low-rigor pass from being
mistaken for a scan-informed judgment.

---

## Condensed Pass

For low-blast-radius changes. Produce a single paragraph that names: what the change
touches (from the Step 1 scan), the blast radius (who or what is affected if it
breaks), and one key risk — or "no notable risks surfaced" if none.

Then hand off to brainstorming. Don't run Steps A-D — that's the Full Pass.

---

## Full Pass

### Step A: Dependency Mapping

Map what this change touches. Ask the user to confirm or correct — they know the
org topology better than the code does.

#### Systems and services
- What systems, services, or data stores does this interact with?
- Are there upstream producers or downstream consumers that would be affected?
- Are there shared libraries, platform APIs, or infrastructure this depends on?

#### Teams and processes
- Who owns the systems this touches? Are they the same team or different teams?
- Are there approval processes, review gates, or coordination points?
- Does this cross a team boundary that requires communication or alignment?

Produce a brief dependency summary. Format as a simple list or table — not a
detailed architecture diagram. The goal is visibility, not documentation.

---

### Step B: Second-Order Effects

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

### Step C: Failure Modes

Consider how this degrades, not just how it succeeds.

- **What breaks if this fails?** Identify the blast radius — is it one user, one
  team, or the whole org?
- **What's the recovery path?** Can we roll back, or is this a one-way door?
- **What fails silently?** Where could this break without anyone noticing until
  damage accumulates?
- **What's the worst realistic scenario?** Not the theoretical worst case — the
  plausible bad outcome given how people actually use the system.

---

### Step D: Organizational Impact

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

For **Full Pass**, assemble findings into a brief summary:

```markdown
## Systems Analysis

**Dependencies**: [systems, teams, and processes this touches]
**Second-order effects**: [non-obvious downstream consequences]
**Failure modes**: [how this degrades, blast radius, recovery path]
**Org impact**: [ownership, migration, operational burden, scale]
**Key risks**: [1-3 risks that should inform solution design]
```

For **Condensed Pass**, the one-paragraph summary from above is the analysis —
no need to reformat.

Display to the user. Keep it concise — this is input to solution design, not a
document for its own sake.

---

## Handoff

1. Display the analysis summary (if not just displayed)
2. Ask: "Systems context mapped. Ready to move to solution design?"
3. On confirmation, invoke `superpowers:brainstorming` with both the problem
   statement and systems analysis as context
