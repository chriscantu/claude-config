# ADR #0020: Persistent output destinations — single canonical writer per data class across six distinct destinations

Date: 2026-05-22

## Responsible Architect
Cantu

## Author
Cantu

## Contributors

* Claude (design partner)

## Lifecycle
POC

## Status
Proposed

## Context

Issue #381 framed the question as "three memory layers; pick a primary." Phase 0
grep against claude-config sources and a parallel pass across four skills that
persist state (`/onboard`, `/strategy-doc`, `/swot`, `/stakeholder-map`) surfaced
that the real shape is broader: **six distinct destinations** for persistent
skill output, each with a different load mechanism, audience, and confidentiality
profile.

**The original three-layer framing in issue #381 was a partial inventory.** A
two-leaf ADR would have (a) silently merged the two MCP-backed memory servers,
which is a privacy leak vector because they have different confidentiality
profiles, and (b) ignored both project-deliverable artifacts and time-triggered
state entirely.

**Destination inventory (as discovered 2026-05-22):**

1. **Auto-memory MD files** — `~/.claude/projects/<encoded-cwd>/memory/*.md` with
   a per-project `MEMORY.md` index. Loaded into `<system-reminder>` blocks at
   session start *before* the first tool call. Native to claude-config; human
   reviewable; diffable.

2. **User working repo artifacts** — Markdown the user commits, reviews, and ships:
   `~/repos/onboard-<slug>/docs/`, `~/repos/<project>/decisions/`, and similar.
   Not a memory layer in the harness sense — ordinary on-disk artifacts. Auditable
   like any other source file; never loaded by the harness automatically.

3. **ruflo MCP memory** (`mcp__ruflo__memory_*`) — Vector + KV store, accessed on
   demand via MCP. Feeds `harness_mem_resume_pack` injection at session start.
   Cross-session, fuzzy search, non-reviewable by humans without explicit query.

4. **memory MCP knowledge graph** (`mcp__memory__*` from
   `@modelcontextprotocol/server-memory`) — Entities + relations graph store.
   Used by `/swot` and `/stakeholder-map` for structured graph queries. Explicitly
   marked **local-only sensitive** ("never export to repo or share the raw
   graph" per `/stakeholder-map`'s Privacy section). Distinct from ruflo in both
   shape (graph vs. vector+KV) and confidentiality posture.

5. **scheduled-tasks MCP** — Cron/timer-triggered state. Used by `/onboard` to
   register cadence nags. Cross-session like ruflo, but the trigger surface is
   time, not query.

6. **Plugin-internal memory** (e.g., `claude-code-harness:memory` skill's
   `decisions.md` / `patterns.md`) — Shipped by a plugin and consumed only by
   that plugin's own skills. Non-addressable from claude-config skills (Phase 0
   grep confirms zero current consumers across `*.md|*.sh|*.fish|*.ts` outside
   `node_modules` and `tests/results`).

**Phase 0 evidence (grep across claude-config sources, 2026-05-22):**

- `grep -rn "decisions\.md"` claude-config sources: **zero matches**.
- `grep -rn "patterns\.md"`: **zero matches**.
- `grep -rn "claude-code-harness:memory"`: **zero matches**.
- `mcp__memory__*` knowledge-graph usage discovered in
  `skills/swot/SKILL.md` and `skills/stakeholder-map/SKILL.md` Prerequisites
  sections.
- `~/repos/onboard-<slug>/` working-repo usage discovered in
  `skills/onboard/SKILL.md` scaffold + RAMP.md flow.

**Forces in tension:**

- **Cold-start determinism vs. on-demand recall.** Auto-memory MD is injected
  before the first tool call; MCP-backed stores require explicit query. Resume-pack
  bridges this for short-lived state, but only ruflo feeds the resume pack today —
  knowledge-graph and scheduled state do not.
- **Reviewability vs. searchability.** MD diffs cleanly; vector + graph stores
  surface answers but not inventories.
- **Confidentiality tiers.** memory-MCP graph entities are explicitly marked
  local-only-sensitive; ruflo is non-reviewable but not confidentiality-flagged;
  MD is reviewable and shareable. A single "MCP memory" bucket would erase the
  confidentiality distinction.
- **Memory state vs. project artifacts.** A 90-day plan committed to
  `~/repos/onboard-<slug>/decisions/` is a deliverable, not memory. Treating
  them as the same category causes lint phases and scope rules to misfire.
- **Single-source-of-truth vs. parallel writers.** Two destinations writing the
  same data class is the drift mode issue #381 surfaces. The fix is
  *single-writer per data class*, not "pick one destination for everything."
- **Plugin-internal scope vs. cross-skill use.** Phase 0 shows the plugin
  memory layer is currently plugin-internal *de facto*. The user has separately
  directed consolidation of any prior `claude-code-harness:memory` content into
  ruflo as part of the ramp-down on independent plugin memory.

**Prior art:**

- **Cache hierarchies** (Hennessy & Patterson; RFC 9111 web caching): one
  canonical store, lower tiers derived. Drift solved by removing author rights
  from the cache.
- **CQRS / event sourcing** (Fowler, Greg Young): single write model, multiple
  read models materialized from it. Drift impossible because nothing is
  hand-maintained in two places.
- **MemGPT / Letta** (Packer et al. 2023): explicit working / recall / archival
  tiers; promotion/demotion is an *explicit operation*, never parallel writes.

The common shape: **one writer per data class; other destinations are derived
(index, cache, summary) — never independently authored.** This ADR generalizes
that shape across six destinations instead of two.

## Decision

Three concrete pieces:

1. **Every persistent skill output names exactly one canonical destination per
   data class.** Data class is the granularity for the single-writer rule — not
   destination, not file path. A data class may live in one destination and be
   *indexed* (read-only derive) from another, but never authored in two.

2. **The canonical destination map.** For each of the six destinations above, the
   ADR names the data classes that belong there:

   - **Auto-memory MD** owns: user identity / role / preferences (`user_*.md`),
     project-level facts that outlive any session (`project_*.md`), recorded
     feedback that biases future behavior (`feedback_*.md`), reference pointers
     to external systems (`reference_*.md`). Read mechanism: harness loads at
     session start into `<system-reminder>` blocks. Governance:
     [`memory-discipline.md`](../rules/memory-discipline.md) HARD-GATE.

   - **User working repo** owns: project deliverables a human reviews / ships /
     commits — 90-day plans, decision logs, ramp templates, SWOT documents, the
     `RAMP.md` workspace contract. Read mechanism: the user opens the file;
     skills may read but not auto-load. Governance: ordinary code-review.

   - **ruflo MCP memory** owns: session resume context (`harness_mem_resume_pack`
     payload), vector embeddings, pattern clusters, attention traces,
     observability event records, high-churn state. Read mechanism: explicit
     `mcp__ruflo__memory_*` query OR resume-pack injection at session start.

   - **memory MCP knowledge graph** owns: structured entity-and-relation data
     where the graph shape is load-bearing — stakeholder maps, sensitive
     person/team relationships, project graphs that require traversal. Read
     mechanism: explicit `mcp__memory__*` query. **Confidentiality contract:**
     never export raw graph contents to a repo or share verbatim. Skills that
     write here MUST honor that contract in their own privacy sections.

   - **scheduled-tasks MCP** owns: cadence nags, time-triggered reminders,
     cron-shaped agent triggers. Read mechanism: the MCP fires the trigger; the
     skill receives the fire-event payload.

   - **Plugin-internal memory** owns: state used only by the plugin's own
     skills. Specifically: `claude-code-harness:memory` skill's
     `decisions.md` / `patterns.md` are addressable only by harness-plugin
     skills, never by claude-config skills.

3. **Decision tree (the artifact issue #381 asks for):**

   ```
   What kind of data is the skill saving?

   ├── Project deliverable — markdown the user reviews / ships / commits
   │     -> USER WORKING REPO (~/repos/<project>/docs/ etc.)
   │
   ├── Agent context — stable preference, role, project fact the agent uses to behave
   │     -> AUTO-MEMORY MD (~/.claude/projects/<cwd>/memory/*.md)
   │
   ├── Cross-session structured search — vector recall, embeddings, resume pack, patterns
   │     -> RUFLO MCP (mcp__ruflo__memory_*)
   │
   ├── Cross-session graph — entities + relations; possibly sensitive; never exported
   │     -> MEMORY MCP (mcp__memory__*); honor non-export contract
   │
   ├── Time-triggered state — cadence nag, scheduled fire, cron-shaped trigger
   │     -> SCHEDULED-TASKS MCP
   │
   └── Plugin-internal scratch — only that plugin's own skills consume it
         -> the plugin's own store; non-addressable from claude-config skills
   ```

   Each leaf is a single-writer assignment. A data class that the author thinks
   fits two leaves is a signal that either (a) the data needs splitting into
   two distinct classes, each with its own canonical leaf, or (b) the ADR
   needs amendment because a real class falls between leaves.

**Single-writer rule (the drift mitigation):**

For any given data class, exactly one destination holds write rights. The
boundary is *who writes*, not *how long it lasts* — the "stable vs. short-lived"
cut is too fuzzy on its own. Mechanical version:

- If a data class is assigned to one leaf, the other five MAY index or read it
  but MUST NOT receive direct writes for it.
- If a data class doesn't clearly fit any leaf, the ADR is amended; silent
  dual-write or pick-the-closest-leaf is forbidden.
- Indexing (read-derive) requires explicit provenance pointing back to the
  canonical source (`source: <destination>:<key>`).

We will **not** build:

- A migration of existing content across destinations. Issue #381 explicitly puts
  migration out of scope; Phase 0 confirms no migration is required for
  plugin-internal memory in claude-config (zero consumers). Adjacent projects
  using `claude-code-harness:memory` migrate to ruflo on their own timeline.
- A retirement or replacement of any MCP server. memory-MCP, ruflo,
  scheduled-tasks, and the harness plugin all ship independently; this ADR scopes
  their *use* by claude-config skills, not their existence.
- A new HARD-GATE rule. [`memory-discipline.md`](../rules/memory-discipline.md)
  gains a single-line scope pointer to this ADR; its enforced behavior is
  unchanged.
- An expansion of [`memory-discipline.md`](../rules/memory-discipline.md) to
  cover the other five destinations. The HARD-GATE's failure mode
  (system-prompt-injected memory looks like authoritative command) is specific
  to auto-memory MD's load mechanism. The other five have explicit-query or
  user-review load patterns and do not exhibit the same failure mode.
- A "unified memory API" abstraction layer. Each destination's tool surface
  (Write tool / MCP / scheduled-tasks) is distinct because their semantics are
  distinct. Wrapping them would obscure the single-writer rule, not enforce it.

## Consequences

**Positive:**

- **Single-writer-per-class kills the drift mode without flattening
  confidentiality tiers.** The two-leaf version of this ADR would have merged
  memory-MCP (sensitive-local-only) and ruflo (non-reviewable but not
  confidentiality-tagged) into one bucket. That would have eroded the privacy
  contract `/stakeholder-map` already enforces. The six-leaf version preserves
  the tier distinction the existing skills already encode.
- **Project deliverables separated from memory.** `/strategy-doc`'s 90-day plan
  is no longer ambiguous: it's a project deliverable in the working repo,
  governed by code-review, not memory discipline. Lint and scope rules apply
  cleanly.
- **`memory-discipline.md` scope made explicit.** The HARD-GATE was always
  about auto-memory's specific failure mode; the ADR makes that legible and
  excludes the other five destinations from its scope rather than implicitly
  extending it.
- **Plugin-internal scope removes a phantom layer.** Issue #381's three-layer
  framing implied an architectural choice to make; Phase 0 showed there isn't
  one for claude-config. ADR encodes the de-facto truth.
- **Decision tree is testable.** Every new skill PR can answer "where does
  your data go?" by pointing at a tree leaf. The validator phase (below)
  catches the failure mode where the answer is "more than one."

**Negative:**

- **Six leaves is more cognitive load than two.** A skill author has to read
  the tree, not pattern-match a binary. Mitigation: the tree is ~6 questions,
  each with a one-line decision criterion. Cost paid once per skill author per
  new data class.
- **MCP-server inventory is now part of the ADR's footprint.** If a future
  skill needs a seventh destination (a different MCP server, a CRDT store,
  whatever), the ADR amends. That's the right outcome — silent expansion is
  the failure mode — but it makes the ADR a more living document than a
  two-leaf version would have been.
- **Adjacent projects affected by consolidation directive.** Any prior
  `claude-code-harness:memory` content the user maintained in other projects
  needs explicit migration to ruflo. This ADR documents the direction but
  does not perform the migration.

**Neutral:**

- **No change to existing auto-memory contents.** Every entry already in
  `MEMORY.md` continues to be loaded as-is.
- **No change to any MCP server's behavior.** ruflo, memory-MCP, and
  scheduled-tasks keep working exactly as today.
- **No change to plugin behavior.** The plugin's internal memory skill is
  unaffected.

## Implementation notes (non-binding)

If this ADR is accepted, the implementation likely touches:

1. [`rules/memory-discipline.md`](../rules/memory-discipline.md) — single-line
   pointer to this ADR under a new "Scope" section, clarifying the HARD-GATE
   covers auto-memory MD specifically. No change to enforced behavior. **(Done
   in this PR.)**
2. `README.md` — one sentence in the documentation index pointing at this ADR
   as the canonical answer to "which destination do I save to?" **(Done in
   this PR.)**
3. `skills/onboard/SKILL.md`, `skills/strategy-doc/SKILL.md`,
   `skills/swot/SKILL.md`, `skills/stakeholder-map/SKILL.md` — each gains a
   short "Where this skill persists state" subsection citing the decision tree
   and naming its specific data classes per leaf. **(Done in this PR by
   parallel subagent pass; review for tree alignment against final 6-leaf
   shape.)**
4. `validate.fish` — new phase that fails if any `skills/<name>/SKILL.md`:
   - References `decisions.md` or `patterns.md` as a write target (catches
     accidental plugin-memory consumer relationships).
   - Names the same data class slug as written to two distinct destinations in
     its "Where this skill persists state" subsection (catches dual-writers).
5. `tests/validate-phase-<id>.test.ts` — regression coverage with synthetic
   fixtures.

## Promotion criteria

This ADR is **non-behavioral at the rules layer** (it documents an existing
de-facto split and adds a single pointer to an existing HARD-GATE). Per
ADR #0005, non-behavioral ADRs are not subject to the four-condition
discrimination gate. It promotes from `Proposed` to `Accepted` once:

- The validator phase is implemented and passes against the current repo
  state without modifying any existing skill (proving the policy reflects
  current practice).
- A synthetic RED fixture (skill referencing `decisions.md` as write target,
  OR a skill with same-slug dual-write) trips the new phase as expected.
- All four affected SKILL.md files declare their persistence destinations per
  the six-leaf tree without surfacing a data class that doesn't fit any leaf
  (proving the tree covers the current skill surface).
