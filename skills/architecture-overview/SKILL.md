---
name: architecture-overview
description: >
  Use when user says /architecture-overview, "map the architecture", "landscape of
  these repos", or wants a whole-system technical inventory across multiple repos
  for new-role onboarding. Produces inventory + dep map + data flow + integrations
  doc with code citations and flagged inferences. Do NOT use for single-repo deep
  dive (use /onboard) or new-system design (use /sdr).
---

# /architecture-overview — Whole-System Landscape

Discovery-mode architecture skill. Produces a landscape document covering systems,
dependencies, data flows, and external integrations across a list of repos.

**Announce:** "I'm using the architecture-overview skill to map the whole-system
landscape — code-grounded claims only, with flagged inferences for anything I can't
cite directly."

## When To Use

- User starting in a new role and needs day-3 mental model of the whole system
- User has multiple repos and wants a single landscape doc
- User explicitly invokes `/architecture-overview`

## When NOT To Use

- Single-repo deep dive → use `/onboard` (#12)
- New-system design → use `/sdr`
- Impact analysis of one specific change → use `/cross-project`

(Workflow added in Task 2.)
