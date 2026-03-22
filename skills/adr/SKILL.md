---
name: adr
description: Create, list, or supersede architectural decision records using the system-design-records template. Use when the user says /adr, "create an ADR", "new decision record", "document this decision", or "supersede ADR".
---

# Architectural Decision Record Management

Creates and manages ADRs following the format established in `~/repos/system-design-records/`.

## Arguments

- `new <title>` — Create a new ADR
- `list` — List all existing ADRs
- `supersede <number> <new-title>` — Create a new ADR that supersedes an existing one
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

### Superseding an ADR (`supersede`)

1. Create the new ADR as above.
2. Add to the new ADR's Context: `Supersedes [ADR #NNNN](./NNNN-<old-title>.md).`
3. Update the old ADR's Status to: `Superseded by [ADR #MMMM](./MMMM-<new-title>.md)`

### Listing ADRs (`list`)

Display a markdown table:

```
| # | Title | Status | Lifecycle | Responsible Architect | Date |
|---|-------|--------|-----------|----------------------|------|
```

Parse the number from the filename, the title from the H1, and extract Status, Lifecycle, and Responsible Architect from the document body.

## Related Templates

The system-design-records repo has additional templates for larger decisions:
- **System Overview** — for designing complete systems or large architectural changes
- **Service/Component Creation** — for implementing new services
- **Data Design** — for schema or data model changes
- **Tool/Framework Adoption** — for evaluating new technologies
- **Blueprint** — for reference architectures

If the user's decision seems larger than an ADR (e.g., "design a new system", "evaluate a new tool"), suggest the appropriate template instead and point them to `~/repos/system-design-records/templates/`.
