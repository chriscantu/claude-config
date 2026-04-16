---
name: tenet-exception
description: Use when the user says /tenet-exception or proposes a formal, documented deviation from an established engineering tenet. Also triggers for "request a tenet exception", "deviate from a tenet", or "exception to tenet".
---

# Tenet Exception Request

Creates tenet exception requests — formal records of decisions to deviate from engineering tenets.

## When NOT to Use

- Casual "we're not doing X right now" comments — this skill is for *documented, reviewed* deviations
- Disagreement with a tenet in general — open a discussion with tenet champions instead; use this only when a specific, time-bound deviation is being proposed
- Standalone architecture decisions that don't conflict with a tenet — use `/adr` instead

## Configuration

At first use in a new context, resolve these values by asking the user (or reading a `.tenet-exception.config.yaml` file in the target repo if present):

- **Tenets root** — directory containing the org's engineering tenets (e.g. `docs/engineering-tenets/`)
- **Exceptions placement** — `inline` (inside design records), `adrs` (separate ADRs), or `both`
- **Filename convention** — default `TE_NNNN-<kebab-title>.md`
- **Review process** — governance path (e.g. architecture review board, engineering leadership, tenet champions)
- **Review SLA** — how quickly reviewers respond (e.g. 2 business days)
- **Discussion channel** — optional; where pre-filing discussion happens
- **Lenses / Pillars / PR labels** — optional; the org's labeling scheme (see examples below)

If no config and no existing tenets directory is found, **ask** rather than defaulting silently.

Example `.tenet-exception.config.yaml`:

```yaml
tenets_root: docs/engineering-tenets/
exceptions_placement: adrs
filename_convention: "TE_{NNNN}-{kebab-title}.md"
review_process: Architecture review board
review_sla: 2 business days
discussion_channel: "#engineering-discuss"
lenses: [web, mobile, service, data]
pillars: [security, reliability, quality]
pr_labels: [exception]
```

## Example Lenses and Pillars (customize per org)

**Lenses:** Web Application, Mobile Application, Service/API, Data, ML, Reusable Asset & Tooling, Platform Service, Infrastructure Service

**Pillars:** Operational Excellence, Security, Reliability, Quality, Efficiency, Global by Design

## Arguments

- `new <title>` — Create a new tenet exception
- `list` — List existing tenet exceptions
- (no args) — Interactive: ask what the user wants to do

## Workflow

### Creating a New Exception (`new`)

1. **Gather context**: title, which tenet section is being excepted (help the user search the tenets root if unsure), affected lens(es) and pillar(s) if the org uses them.
2. **Determine the next number**: scan existing files matching the configured filename convention under the configured exceptions location. Start at `0001` if none exist.
3. **Determine placement**: unless the config resolves it, ask whether this is a standalone ADR or inline within an existing design record.
4. **Create the file** using the template at [exception-template.md](exception-template.md). Filename follows the configured convention (default: `TE_NNNN-<kebab-title>.md`).
5. **Remind the user of the PR process** using the resolved config — labels, reviewers, SLA, and discussion channel (if set).
6. **Challenge the exception**: ask "Is this truly an outlier, or are the tenets out of touch? Would raising this with tenet champions improve the tenets themselves be a better path?"

### Listing Exceptions (`list`)

Search all configured exceptions locations. Display:

```markdown
## Tenet Exceptions

| # | Title | Date | Affected Tenet | Status |
|---|-------|------|----------------|--------|
```

## Common Mistakes

- **Filing before the technical discussion** — the exception is a record of a decision, not a substitute for the discussion. Encourage reaching out to architects/champions first.
- **Treating review as approval** — reviewers provide oversight and learning; they don't rubber-stamp. Don't promise the user approval.
- **Open-ended exceptions** — always ask whether this is permanent or temporary, and if temporary, when it should be revisited.
- **Skipping labels** — missing lens/pillar/exception labels breaks the org's ability to audit exceptions later.
