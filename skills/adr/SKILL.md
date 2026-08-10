---
name: adr
description: Use when the user says /adr, "create an ADR", "new decision record", "document this decision", or "supersede ADR". Also triggers when a technical decision needs formal documentation with status tracking and lifecycle management.
---

# Architectural Decision Record Management

Creates and manages ADRs following the format established in `~/repos/system-design-records/`.

## Arguments

- `new <title>` — Create a new ADR
- `list` — List all existing ADRs
- `supersede <number> <new-title>` — Create a new ADR that supersedes an existing one
- `accept <number>` — Promote an existing ADR from Proposed to Accepted, stamping the date and an in-force evidence note
- (no args) — Interactive: ask what the user wants to do

## Workflow

### Locate ADR Directory

Search for ADRs in this order:
1. `adrs/` (matches system-design-records global convention)
2. `domains/{Domain}/{System}/` (domain-scoped convention)
3. `docs/adr/` or `docs/adrs/`
4. `adr/` or `adrs/`
5. Any directory containing files matching `NNNN-*.md` ADR naming pattern

If no ADR directory exists, ask the user:
- **Global decision?** → create in `adrs/`
- **Domain-scoped?** → ask for domain and system name, create in `domains/{Domain}/{System}/`

### Creating a New ADR (`new`)

1. **Determine the next number**: Scan existing ADRs, find the highest number, increment by 1. Pad to 4 digits (e.g., `0001`, `0012`). Support sub-numbers like `0008.1` when creating a related decision — ask if this is a sub-decision of an existing ADR.

2. **Generate the filename**: `NNNN-<kebab-case-title>.md`

3. **Gather metadata from the user**:
   - Responsible Architect (who owns this decision?)
   - Author (default: the user)
   - Contributors (optional)
   - Lifecycle stage: POC, Pilot, Beta, GA, or Sunset

4. **Create the ADR using this template**:

```markdown
# ADR #NNNN: <Title, a short present tense phrase>

Date: <today's date, YYYY-MM-DD>

## Responsible Architect
<name>

## Author
<name>

## Contributors

* <names>

## Lifecycle
<POC | Pilot | Beta | GA | Sunset>

## Status
Proposed

## Context

<!-- Describe the forces at play — technological, political, social, project-local. -->
<!-- These forces are probably in tension. Language should be value-neutral — just facts. -->

## Decision

<!-- Our response to these forces. Stated in full sentences, active voice. "We will ..." -->

## Consequences

<!-- What becomes easier or more difficult because of this decision. -->
<!-- List all consequences — positive, negative, and neutral. -->
```

5. **Open the file for the user** and tell them to fill in Context, Decision, and Consequences.

6. **Glossary hooks (end-of-skill).** After the ADR body is filled (Context / Decision / Consequences), fire two hooks against `./CONTEXT.md`. Both fire **once at end-of-skill** (not per-section) per the [2026-05-22 decision](../../docs/superpowers/decisions/2026-05-22-glossary-v2-read-discipline.md) and the contract in [references/CALLER-HOOKS.md § adr](../glossary/references/CALLER-HOOKS.md). Read hook runs first so its findings can inform what the write-offer surfaces as new terms.

   a. **Read hook (advisory).** If `./CONTEXT.md` exists and parses cleanly, parse the `## Language` section, build the `_Avoid_:` alias set, scan the Context / Decision / Consequences sections (plus any Alternatives subsection if the project's ADR template adds one), and surface one advisory line per match — only when an ADR term hits an `_Avoid_` alias (only-on-conflict). NEVER substitute silently in either direction — CONTEXT.md is a candidate, not authority. Surface candidates for user judgment per `rules/memory-discipline.md` (verify before assert). Silent no-op if `./CONTEXT.md` is absent or malformed.
   b. **Write-offer hook.** Scan Context / Decision / Consequences (and Alternatives if present) for project-specific nouns that recurred ≥2× and lack a `./CONTEXT.md` entry (option names, system names, decision-context vocabulary). Invoke `/glossary --offer-from-caller=adr --candidate-terms=<...>` — offer never auto-write. Skip if every candidate is already canonical.

   Both hooks are **advisory**, not blocking. Promotion to blocking is gated by Phase B eval signal per the decision doc rollback trigger.

### Superseding an ADR (`supersede`)

1. Create the new ADR as above.
2. Add to the new ADR's Context: `Supersedes [ADR #NNNN](./NNNN-<old-title>.md).`
3. Update the old ADR's Status to: `Superseded by [ADR #MMMM](./MMMM-<new-title>.md)`

### Accepting an ADR (`accept`)

Promotes an ADR from `Proposed` to `Accepted` at the moment its decision goes into force
(typically when the work that enacts it ships). This is the ADR half of the close-out
convention in [`docs/superpowers/close-out-convention.md`](../../docs/superpowers/close-out-convention.md).

1. Locate ADR `NNNN` (reuse the "Locate ADR Directory" logic above).
2. Read its current `## Status`. If it is not `Proposed` (already Accepted, Rejected, or
   Superseded), report the current status and stop — do not re-stamp.
3. Ask the user for a one-line **in-force evidence** note: what makes the decision live now
   (the shipped PR, the enforcing check, the merged change).
4. Rewrite the `## Status` body to: `Accepted (YYYY-MM-DD) — in force: <evidence>.` using
   today's date.

### Listing ADRs (`list`)

Display a markdown table:

```
| # | Title | Status | Lifecycle | Responsible Architect | Date |
|---|-------|--------|-----------|----------------------|------|
```

Parse the number from the filename, the title from the H1, and extract Status, Lifecycle, and Responsible Architect from the document body.

## When NOT to Use

- Trivial decisions that don't warrant formal tracking (naming conventions, small refactors, one-off code style choices)
- Decisions that require a fuller System Design Record — see Related Templates below for system-level, service-creation, or tool-adoption decisions
- Tenet deviations — use `/tenet-exception` instead
- Technology adoption with lifecycle tracking (Assess/Trial/Adopt/Hold) — use `/tech-radar` instead

## Common Mistakes

- **Writing Context as solution justification** — Context describes forces in tension in value-neutral language. Save the "why we chose X" for Decision and Consequences.
- **Skipping Consequences, or only listing positives** — every decision has trade-offs. Enumerate negative and neutral consequences too.
- **Creating ADRs for decisions that are already made and deployed** — ADRs are decision records; if the decision is fait accompli, mark Status accordingly rather than backfilling as "Proposed".
- **Forgetting to update the superseded ADR** — when superseding, always update the old ADR's Status field; otherwise future readers can't follow the chain.
- **Leaving an ADR `Proposed` after its decision is in force** — stamp it via `/adr accept <n>` when the work ships; drift here is what let 6 ADRs sit stale for months (issue #507).
- **Stuffing system-level designs into an ADR** — if the scope is a whole system or service, suggest the appropriate larger template instead.

## Related Templates

The system-design-records repo has additional templates for larger decisions:
- **System Overview** — for designing complete systems or large architectural changes
- **Service/Component Creation** — for implementing new services
- **Data Design** — for schema or data model changes
- **Tool/Framework Adoption** — for evaluating new technologies
- **Blueprint** — for reference architectures

If the user's decision seems larger than an ADR (e.g., "design a new system", "evaluate a new tool"), suggest the appropriate template instead and point them to `~/repos/system-design-records/templates/`.
