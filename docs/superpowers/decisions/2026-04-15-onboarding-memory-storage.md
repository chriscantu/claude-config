# Onboarding Memory Storage — Decision Context

**Date:** 2026-04-15
**Status:** Open — to be decided in a fresh session
**Prior session context:** Planning session that ranked onboarding toolkit skills and flagged storage as the first foundational decision to make.

## Problem statement

A new VP of Engineering in the first 90 days of a role needs to persist and retrieve a large volume of heterogeneous context: people met, teams observed, conversations had, risks heard, commitments made, artifacts reviewed, and the relationships between all of them. Without persistence, each session starts from zero and the onboarding toolkit degrades to one-shot authoring aids. With the wrong persistence choice, we lock into a data model that doesn't fit the actual intake flow or creates a privacy surface that's inappropriate for notes about real colleagues.

**The decision:** what storage layer (if any) should the onboarding toolkit be built on?

## Why this is first

The ranked onboarding toolkit has 11 skills. At least two of them ([#33](https://github.com/chriscantu/claude-config/issues/33) /1on1-prep intake mode, [#23](https://github.com/chriscantu/claude-config/issues/23) /stakeholder-map coverage-review mode) materially want persisted per-person data to function well. Building them without a storage decision creates coupling risk: each skill invents its own persistence, and collapsing them later is expensive.

The prior session deferred the decision so as not to block toolkit planning. Now that the toolkit is scoped, storage is the unblock step for actually building anything.

## What the prior session already considered (carries anchoring risk — re-evaluate, don't rubber-stamp)

### Options floated

1. **Native CLAUDE.md + auto-memory directory** — already active in the user's environment at `/Users/cantu/.claude/projects/.../memory/`. Two-tier index + per-topic files. Strength: already works. Weakness: general-purpose, no structured relationships.

2. **Productivity plugin `productivity:memory-management`** — formalizes the two-tier pattern. Plugin exists in the user's available list but has not been installed or tested. Prior session recommended installing and dogfooding.

3. **Knowledge Graph Memory MCP Server (Anthropic official)** — https://github.com/modelcontextprotocol/servers/tree/main/src/memory. JSONL-backed local knowledge graph with entities, relations, observations. Strength: structured relationships, Anthropic-maintained, local-only. Weakness: requires discipline to populate; adds a dependency.

4. **Custom `/onboarding-journal` skill + flat markdown filesystem** — docs/onboarding/people/, signals/, themes.md, commitments.md. Prior session proposed this, then talked itself out of it as reinventing the wheel.

5. **Third-party memory systems (Mem0, Letta, Zep, Cognee, MemPalace, MemNexus)** — mostly cloud-hosted or framework-heavy. Ruled out for privacy (notes about real colleagues should not go to SaaS) and for tooling weight.

### Prior session's tentative recommendation (subject to re-evaluation)

Layered approach: use the existing auto-memory system for free-text notes, add the Knowledge Graph Memory MCP for structured people/team relationships, and build only thin onboarding workflow verbs on top. The user was **not convinced** and put the decision on hold to investigate further.

**User's explicit objection:** not convinced we don't need a dedicated storage layer. Wants more investigation before committing.

## Constraints and requirements

These are load-bearing facts from the prior session — carry them forward:

- **Privacy: local-only.** Notes contain names, opinions, and concerns of real colleagues. No cloud-hosted memory services are acceptable.
- **Maintainability: must survive tool churn.** Plain-text on disk beats proprietary formats. Grep-ability matters.
- **Dual-use shape.** Storage needs to serve both the interview-prep use case (pre-employment) and the onboarding-intake use case (day 1 onward). The same data model should work for both.
- **Relationships matter.** "Jane reports to Mark," "Team Auth owns Service X," "three people mentioned Dana" — the data has graph structure, not just key-value structure.
- **Volume: moderate.** ~40 people, ~10 teams, ~20 systems, ~weeks of daily intake notes. Not millions of entities. Not streaming. Think of it as a personal knowledge base, not an enterprise CMS.
- **Discipline realism.** Any storage that requires religious manual curation will decay. The skills should help maintain the store, not depend on the user maintaining it manually.
- **Fits the planning pipeline.** This decision should go through problem-definition → systems-analysis → brainstorming → fat-marker-sketch like any other feature-scope decision.

## Evidence of real need

Two skills in Tier S explicitly require persisted per-person data:
- [#33](https://github.com/chriscantu/claude-config/issues/33) `/1on1-prep` intake mode — pre-meeting brief reads prior notes on the person
- [#23](https://github.com/chriscantu/claude-config/issues/23) `/stakeholder-map` coverage-review mode — gap analysis needs a list of who has been interviewed

One skill in Tier A benefits materially:
- [#44](https://github.com/chriscantu/claude-config/issues/44) `/architecture-overview` — risk entries should flow into [#21](https://github.com/chriscantu/claude-config/issues/21) /risk-register; requires a shared file location

Skills that want thematic synthesis across sessions:
- [#43](https://github.com/chriscantu/claude-config/issues/43) `/swot` — reads across all intake artifacts
- [#42](https://github.com/chriscantu/claude-config/issues/42) `/strategy-doc` 90-day-plan mode — reads SWOT, themes, commitments

## Out of scope for this decision

- **Not deciding which skill to build first.** That's downstream.
- **Not deciding per-skill implementation details.** Storage shape first, skill implementation second.
- **Not deciding on shared frontmatter schema.** That is part of the storage answer, not a separate decision. Do not split.

## What a good decision looks like

The session is done when:

- A clear recommendation with rationale on which storage layer(s) to use
- A data model sketch: entities, relations, file layout (or whatever the chosen shape is)
- Explicit trade-offs documented: what you gain, what you give up
- Privacy analysis — where the data lives, who can see it, what the blast radius is if the laptop is compromised
- Migration path if the decision changes later (reversibility matters)
- At least one alternative genuinely considered, not rubber-stamped
- A validation plan — how to dogfood the choice before committing the whole toolkit to it

## What to avoid

- Rubber-stamping the prior session's tentative recommendation. The user explicitly rejected it.
- Skipping to implementation before the data model is clear.
- Building a custom storage layer without considering off-the-shelf options first.
- Adopting an off-the-shelf option without verifying it handles the actual data model needed.
- Optimizing for technical elegance over discipline realism. Whatever gets chosen has to survive being maintained during a high-stress new-job transition.

## Handoff

Next session should:

1. Re-read this brief
2. Run the planning pipeline: `/define-the-problem` → `/systems-analysis` → `superpowers:brainstorming`
3. Produce a fat-marker-sketch of the chosen storage shape
4. Document the decision as an ADR if the outcome warrants it
5. Return here with a concrete recommendation and data model sketch

Related artifacts:
- Onboarding toolkit issues (this repo): [#12](https://github.com/chriscantu/claude-config/issues/12), [#20](https://github.com/chriscantu/claude-config/issues/20), [#21](https://github.com/chriscantu/claude-config/issues/21), [#23](https://github.com/chriscantu/claude-config/issues/23), [#33](https://github.com/chriscantu/claude-config/issues/33), [#35](https://github.com/chriscantu/claude-config/issues/35), [#36](https://github.com/chriscantu/claude-config/issues/36), [#40](https://github.com/chriscantu/claude-config/issues/40), [#42](https://github.com/chriscantu/claude-config/issues/42), [#43](https://github.com/chriscantu/claude-config/issues/43), [#44](https://github.com/chriscantu/claude-config/issues/44)
- Prior session: ranked the toolkit, added onboarding-mode refinements, filed [#43](https://github.com/chriscantu/claude-config/issues/43) and [#44](https://github.com/chriscantu/claude-config/issues/44), closed [#15](https://github.com/chriscantu/claude-config/issues/15) as obsolete.
