# ADR #0003: Adopt Anthropic Knowledge Graph Memory MCP for onboarding toolkit storage

Date: 2026-04-15

## Responsible Architect
Cantu

## Author
Cantu

## Contributors

* Claude (design partner)

## Lifecycle
Pilot

## Status
Accepted

## Context

The onboarding toolkit (11 planned skills, with `/1on1-prep` intake mode and
`/stakeholder-map` coverage-review mode as the immediate drivers) requires a persistent
storage layer that survives across Claude Code sessions. Without it, each session starts
from zero and the toolkit degrades to one-shot authoring aids.

This ADR selects that storage layer. Prior analysis is captured in
`docs/superpowers/decisions/2026-04-15-onboarding-memory-storage.md`.

### Forces in tension

- **Build-ahead constraint.** The decision maker is currently between senior engineering
  leadership roles with time to invest in tooling. Once back in-role, the window to build
  infrastructure closes. Migration under time pressure is exactly what this decision is
  trying to avoid.

- **Pick-once commitment.** Unlike the typical "try it, reassess" pattern, this decision
  is explicitly made with the intent **not to revisit during the first 90 days of the next
  role**. Onboarding will be too intense for tool-shopping. That means the chosen system
  must be mature enough to trust through a period of no reassessment.

- **Scaling is the primary concern.** Starting volume is ~40 people, ~10 teams, ~20
  systems, but complexity grows as onboarding extends and the role matures. The storage
  system must accommodate growth in stakeholder networks, project dependencies, and
  relationship density over 12+ months without breaking.

- **Privacy: cloud permissible only with strong posture.** Notes contain names, opinions,
  and concerns of real colleagues. Cloud-hosted services are acceptable only when they
  provide encryption at rest, a credible compliance posture, and no reasonable ability for
  data exposure. Local-only remains preferred for privacy reasons, even when cloud is
  permissible.

- **Relationships are graph-shaped.** Stakeholder networks, reporting structures, project
  ownership, and commitments all have entity-relationship structure. Flat key-value or
  prose storage requires either re-extraction on every read or hand-maintained link tables
  that drift out of date.

- **Discipline realism.** Any storage that depends on religious manual curation will
  decay. The system must either populate itself autonomously or be paired with skills
  that make capture easier than forgetting.

### Options evaluated

1. **Markdown-only (current baseline).** Current auto-memory system with `MEMORY.md` as
   index. Fails scaling requirement: hard 200-line truncation on the index, no graph
   model for relationships, linear retrieval degradation.

2. **Mem0 Free tier (cloud).** 1,000 retrievals/month, no graph memory. Quota exhausted
   in ~2-3 weeks of active daily use given per-message query behavior. Does not solve
   the relationship-tracking problem. Fails scaling and feature fit.

3. **Mem0 Starter ($19/mo, cloud).** 5,000 retrievals/month, no graph memory. Mature and
   stable but does not include the graph memory capability that justifies moving off
   markdown at all. Fails feature fit.

4. **Mem0 Pro ($249/mo, cloud).** Full feature set including graph memory, autonomous
   extraction, and plug-and-play integration. SOC 2 Type I certified, HIPAA-compliant,
   SOC 2 Type II audit in progress. Privacy posture meets the bar but is not ironclad.
   Cost: ~$3,000/year. Defensible but expensive, with autonomous extraction being the
   only real capability not achievable via the Anthropic MCP plus purpose-built skills.

5. **Mem0 self-hosted (Qdrant + SQLite + Neo4j).** Full feature set with full local
   privacy. Mature. Requires maintaining a 3-service Docker stack — ops burden that is
   exactly wrong to carry during an active onboarding period. Fails the discipline-realism
   constraint under time pressure.

6. **MemPalace (local, free, MIT-licensed).** Feature fit is the strongest of any option:
   hierarchical Wings/Rooms/Halls architecture that maps cleanly onto onboarding intake
   shape, autonomous extraction via lifecycle hooks, local storage in SQLite and ChromaDB,
   semantic vector search, and claimed hyper-efficient context usage (~170–800 tokens for
   recall vs. potentially multiple thousand for the Anthropic MCP). **Rejected on project
   reliability grounds**, not on features, age alone, or technical fit. The concrete
   reliability concerns:

   - **Bus factor of two.** Two primary maintainers (Igor Lins e Silva with ~124 commits,
     Ben Sigman with ~95 commits) account for the overwhelming majority of the codebase.
     Twenty-plus other contributors exist but with small-single-digit commit counts.
     Disruption to either primary maintainer halts or stalls the project.
   - **No track record of maintenance through adversity.** Reliability is earned by
     demonstrating how a project handles contributor turnover, incompatible changes,
     production bugs, security issues, and data migrations. MemPalace (created 2026-04-05)
     has not been tested on any of these dimensions.
   - **Data format is actively in flux.** Three major version bumps (v3.0.0 → v3.3.0) in
     the first 10 days of the project's public existence. The schema the onboarding graph
     would be stored in is still being reshaped by the maintainers themselves. There is
     no demonstrated history of clean data migrations across breaking changes.
   - **Marketing claims run ahead of verification.** A `docs/honest-benchmarks-and-readme`
     PR is currently in flight, in which the team is retroactively verifying their own
     LongMemEval benchmark claims. The transparency is a positive signal; the fact that
     verification is happening after the claims were shipped is a reliability concern.
   - **No production incident history.** Mature projects earn reliability through
     post-mortems of real failures. MemPalace has none. Unknown unknowns dominate the
     risk profile in a way they do not for older systems.
   - **MIT license makes the code forkable, but forking is not reliability.** If the
     project stalls or the data format breaks, the fallback position is "maintain a
     personal fork of a graph database layer." That is not a cost that can be absorbed
     during onboarding — exactly the window in which this decision is being optimized.

   None of these concerns are about whether MemPalace is a good project. Several signals
   (active commits, honest benchmark re-verification, MIT license, real engineering)
   suggest it is. They are about whether the project is reliable *enough* to entrust with
   onboarding data during a zero-reassessment commitment window. Today it is not.
   Deferred, not rejected on technical merit — see the follow-up below.

7. **Anthropic Knowledge Graph Memory MCP (local, JSONL).** Anthropic-maintained, MIT-
   licensed, 83.8k stars, multi-year track record. Data model: entities (name, type,
   observations), relations (directed, active voice), and observations (atomic facts).
   Storage: JSONL at a configurable path. Nine MCP tools covering create/delete/search
   operations. No autonomous extraction — Claude must explicitly call tools. No semantic
   search (keyword/substring over JSONL). No temporal awareness or automatic deduplication.

### Why Anthropic KG Memory MCP wins under the stated constraints

Under the pick-once, scaling-primary, privacy-first, time-constrained constraint set:

- **Project reliability is the dominant factor, and Anthropic's maintenance is the
  strongest reliability signal on the option set.** An established maintainer
  organization, a multi-year track record, stable API through recent releases,
  organizational continuity that survives individual contributor turnover, and a
  documented posture toward breaking changes. This is not "maximum possible reliability"
  — it is a reference MCP server inside a larger org's repo, not a flagship product —
  but it is meaningfully ahead of MemPalace's zero-track-record baseline and it clears
  the bar set by the pick-once constraint.
- **JSONL is the ultimate escape hatch.** If this decision proves wrong later, migrating
  JSONL entities and relations into any other system (including MemPalace or Mem0) is
  mechanical. This is the lowest-regret option because its data format is the most
  portable.
- **Privacy is absolute.** Fully local, no breach risk, no subpoena risk, no vendor
  incident risk. Stronger than Mem0 Pro's SOC 2 Type I posture.
- **Scale is adequate at current and projected volume.** Linear search over 40–500
  entities is imperceptible. If volume grows past the comfort range, migration is cheap.
- **Cost is zero.** $3,000/year saved vs. Mem0 Pro.
- **Known footguns over unknown footguns.** The trade-offs (no autonomous extraction, no
  semantic search, no temporal awareness) are visible and planable. MemPalace's trade-offs
  are unknown because the project has no track record.
- **The "autonomous extraction" gap is solvable.** Mem0 Pro's and MemPalace's automatic
  extraction is just an LLM calling `add_memory` behind the scenes. A purpose-built skill
  (`/capture-intake`, `/log-1on1`) that runs after meetings and populates the graph via
  MCP tools achieves the same outcome, under full control, for $0/month. Those skills
  were going to be built anyway as part of the onboarding toolkit.

### Acknowledged losses vs. the runner-up (MemPalace)

This ADR explicitly accepts the following costs that MemPalace would have avoided:

- **~5–8× higher context overhead per recall.** MemPalace's hierarchical memory stack is
  more context-efficient. Over a year of daily use, this is real money and real latency.
  Mitigated by discipline: use targeted `open_nodes` and `search_nodes` queries rather
  than `read_graph` dumps.
- **Keyword search, not semantic.** The Anthropic MCP's `search_nodes` uses substring
  matching, not vector similarity. Queries like "cloud migration concerns" will not
  automatically find notes where Alice said "the lift-and-shift worries me" unless the
  phrasing overlaps. Mitigated by: storing observations in multiple phrasings when
  capturing, and by Claude applying synonym expansion at query time.
- **Flat graph, no hierarchical organization.** MemPalace's Wings → Rooms → Halls model
  is a better fit for onboarding intake shape. The Anthropic MCP requires modeling
  hierarchy via entity types and relation types, which is less natural. Mitigated by: a
  well-defined entity-type taxonomy (Person, Team, System, Commitment, Risk, Decision)
  and relation vocabulary established up front.
- **Manual extraction required.** No lifecycle hooks extract memories autonomously.
  Mitigated by: building capture skills as part of the onboarding toolkit, with explicit
  capture verbs (`/capture-1on1`, `/log-stakeholder`, `/record-commitment`).

## Decision

We will adopt the **Anthropic Knowledge Graph Memory MCP** as the primary storage layer
for the onboarding toolkit. Specifically:

- Install via `npx @modelcontextprotocol/server-memory` and register as an MCP server in
  Claude Code configuration.
- Store the JSONL memory file at a stable, backed-up path outside the claude-config repo
  (exact path decided in the runbook).
- Keep the existing markdown-based auto-memory system running for free-text notes and as
  a safety net during the transition period.
- Build onboarding toolkit skills on top of this storage layer, including at least one
  purpose-built capture skill early to ensure the graph actually gets populated.
- Establish a lightweight, deterministic backup strategy for the JSONL file (daily copy
  or git commit, documented in the runbook).

**MemPalace is deferred on reliability grounds, not rejected on merit.** A one-time
reliability check will be scheduled for 2026-10-15 (~6 months out). By then MemPalace
will be ~6 months old and will have had a chance to demonstrate — or fail to demonstrate
— the reliability signals that are missing today: sustained maintainer activity under
real conditions, stable data format across at least one major version, absence of
reported data-loss incidents, and growing production usage. The check is **not** a
reassessment of this ADR — it is a narrow evaluation of whether MemPalace has earned
enough reliability to become a future migration target. A subsequent ADR would be
required to change the storage decision.

Lifecycle: **Pilot**. We are committing to this in production (for personal use) but
acknowledging that practical experience over the next several months will surface
adjustments to the entity taxonomy, relation vocabulary, and capture workflows.

## Consequences

### Positive

- **Maximum stability** available for a scaling-primary, pick-once decision. Anthropic
  maintenance is the strongest track-record signal on the option set.
- **Absolute privacy.** Fully local, no cloud exposure of colleague-identifying data.
- **Zero cost.** $3,000/year saved vs. the runner-up cloud option (Mem0 Pro).
- **JSONL portability.** Data is grep-able, diff-able, inspectable, and mechanically
  migratable to any other graph-shaped system if this decision is revisited later.
- **Low ops burden.** Single MCP server, no databases, no services to maintain, no
  upgrades to manage under time pressure.
- **Forces discipline where it pays off.** The requirement to build capture skills on top
  of the storage layer is work that was going to happen anyway as part of the onboarding
  toolkit. The "limitation" aligns with the existing work plan.

### Negative

- **Higher context overhead per recall** vs. MemPalace. Over daily use this is real cost
  and real latency — estimated ~5-8× more tokens per recall under worst-case usage.
  Must be mitigated through disciplined query patterns.
- **Keyword search, not semantic.** Recall quality for fuzzy queries is lower than
  vector-based alternatives. Notes must be stored with retrieval in mind (multiple
  phrasings, synonymous observations).
- **Flat graph model** is a worse fit for onboarding intake shape than MemPalace's
  hierarchical architecture. Requires establishing a disciplined entity/relation taxonomy
  before capture begins or the graph will become inconsistent.
- **No autonomous extraction.** Requires explicit capture skills to be built early in the
  onboarding toolkit rollout. Delaying those skills means the graph stays empty.
- **No temporal awareness.** If "Alice reports to Bob" becomes "Alice reports to Carol,"
  the graph will keep both facts unless the update is handled explicitly. Must be
  addressed in the capture skills, not ignored.
- **No automatic deduplication.** Near-duplicate facts will accumulate without active
  cleanup.

### Neutral

- **MemPalace remains on the table as a future migration target.** The deferral is
  deliberate and revisitable at the 6-month check, not a permanent rejection.
- **The markdown auto-memory system continues to run in parallel** during the pilot as a
  source of truth for unstructured notes and as a safety net.
- **Onboarding toolkit skills will need to commit to a specific entity/relation taxonomy
  early.** This is additional design work but is necessary regardless of storage choice.
