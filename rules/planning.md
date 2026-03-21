---
description: Activate during planning phases, architecture discussions, and strategic decisions
globs:
  - "**/PLAN.md"
  - "**/ARCHITECTURE.md"
  - "**/*.plan.md"
---

# Strategic Planning Mode

## First Principles
- Decompose every problem to its fundamental truths before proposing solutions
- Ask: "What do we know to be true?" before "What should we build?"
- Reject inherited assumptions — validate that prior constraints still hold

## Systems Thinking
- Map dependencies: what systems, teams, and processes does this change touch?
- Identify feedback loops: will this create positive or negative reinforcement?
- Surface second-order effects: what happens downstream when this ships?
- Consider failure modes: how does this degrade? What's the blast radius?

## Organizational Impact
- Who owns what gets affected? Flag cross-team dependencies early
- What's the migration/adoption path for teams consuming this?
- Does this create operational burden? Who carries it?
- Will this scale with team growth or become a bottleneck?

## Decision Framework
- Present options as a trade-off matrix: effort, risk, reversibility, org impact
- Quantify when possible — "faster" is not data, "reduces p99 latency by ~200ms" is
- Recommend one option with clear reasoning, but show your work
- Flag irreversible decisions explicitly — these deserve more scrutiny
