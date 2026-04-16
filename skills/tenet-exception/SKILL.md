---
name: tenet-exception
description: Use when the user says /tenet-exception, "request a tenet exception", "exception to tenet", "deviate from a tenet", or "tenet exception". Also triggers when proposing a deviation from an established engineering tenet.
---

# Tenet Exception Request

Creates tenet exception requests — formal records of decisions to deviate from engineering tenets.

## Configuration

This skill is org-agnostic. At first use in a new context, resolve these values by asking the user (or reading a `.tenet-exception.config.yaml` file in the target repo if present):

- **Tenets root** — directory containing the org's engineering tenets (e.g. `~/repos/<org-records>/engineering_tenets/`, `docs/engineering-tenets/`).
- **Exceptions placement** — where exception records live (inline with tenets, in an ADR directory, or both).
- **Filename convention** — pattern for new exception files (default: `TE_NNNN-<kebab-title>.md`).
- **Review process** — the org's governance path (e.g. architecture review board, engineering leadership, tenet champions).
- **Review SLA** — how quickly reviewers respond (e.g. 2 business days).
- **Discussion channel** — where pre-filing discussion happens (e.g. a Slack channel, mailing list, regular sync). Optional.
- **Lenses** — engineering lens labels the org uses (optional; see examples below).
- **Pillars** — architecture pillar labels the org uses (optional; see examples below).
- **PR labels** — labels the org requires on exception PRs (optional).

If no config and no existing tenets directory is found, **ask** rather than defaulting silently — writing to `docs/engineering-tenets/` in the wrong repo is worse than a prompt.

Example `.tenet-exception.config.yaml`:

```yaml
tenets_root: docs/engineering-tenets/
exceptions_placement: adrs  # or: inline, both
filename_convention: "TE_{NNNN}-{kebab-title}.md"
review_process: Architecture review board
review_sla: 2 business days
discussion_channel: "#engineering-discuss"
lenses: [web, mobile, service, data]
pillars: [security, reliability, quality]
pr_labels: [exception]
```

Cache the resolved config on the user's confirmation. Do not assume a specific org's process.

## Example Lenses (customize per org)

- Web Application
- Mobile Application
- Service / API
- Data
- ML
- Reusable Asset & Tooling
- Platform Service
- Infrastructure Service

## Example Architecture Pillars (customize per org)

- Operational Excellence
- Security
- Reliability
- Quality
- Efficiency
- Global by Design

## Arguments

- `new <title>` — Create a new tenet exception
- `list` — List existing tenet exceptions
- (no args) — Interactive: ask what the user wants to do

## Workflow

### Creating a New Exception (`new`)

1. **Gather context from the user**:
   - Title — short description of the exception
   - Which specific tenet is being excepted? Ask the user to identify the section. If unsure, help them search the configured tenets root.
   - Which lens(es) are affected? (if the org uses lenses)
   - Which pillar(s) are affected? (if the org uses pillars)

2. **Determine the next number**: Scan existing tenet exceptions matching the configured filename convention (default: `TE_NNNN*.md`) under the configured exceptions location. If no existing exceptions, start at `0001`.

3. **Determine placement**: Tenet exceptions can be:
   - **Standalone**: Created as an ADR if the exception is a standalone decision
   - **Inline with a design record**: Added to an existing design record PR under a "Tenet Exceptions" section

   Ask the user which approach fits their situation (unless the config's `exceptions_placement` resolves it).

4. **Create the exception file**. Filename follows the configured convention — default `TE_NNNN-<kebab-title>.md` (e.g. `TE_0003-skip-auth-for-internal-probe.md`). Write it to the resolved exceptions location. File contents use this template:

```markdown
# TE #NNNN: <Title>

Date: <today's date, YYYY-MM-DD>

## Situation

<!-- Describe the forces at play leading to the need for this tenet exception. -->
<!-- These forces are probably in tension — call them out as such. -->
<!-- Language should be value-neutral — just facts. -->

**Affected Tenet(s):**
<!-- Link to the specific tenet section(s) being excepted -->

## Course of Action

<!-- Our response to these forces and what we are proposing. -->
<!-- Stated in full sentences, active voice. "We will ..." -->

## Impact

<!-- What becomes easier or more difficult because of this exception. -->
<!-- List all consequences — positive, negative, and neutral. -->
<!-- Consider: How does this affect the team and project going forward? -->
```

5. **Remind the user of the PR process** — customize the reminder using the configured review process, SLA, labels, and discussion channel. Generic template:

```
## PR Requirements for Tenet Exceptions

When creating the PR, you must:

1. Apply the required PR labels for your org (e.g. `exception`, `lens:<name>`, `pillar:<name>`)
2. Notify the designated reviewers (e.g. architecture council, engineering leadership)
3. Reviewers respond with approval or next steps within the configured SLA

Tip: An exception request is a record of a decision, not a substitute
for the technical discussion. Reach out to architects and tenet champions
during the discussion phase — via the configured discussion channel if one is set.
```

6. **Challenge the exception** (per user's preference for being challenged):
   - Ask: "Is this truly an outlier, or are the tenets out of touch? If there's an opportunity to improve the tenets instead of requesting an exception, consider raising that with the tenet champions first."

### Listing Exceptions (`list`)

Search for tenet exception files across the configured exceptions locations (tenets root, ADR directory, and any subdirectories).

Display:

```markdown
## Tenet Exceptions

| # | Title | Date | Affected Tenet | Status |
|---|-------|------|----------------|--------|
```

## Important Reminders

- **Not a rubber stamp**: The exception process exists for transparency and learning. Encourage the user to have the technical discussion first, then document the decision.
- **Champion consultation**: Suggest reaching out to the relevant tenet champions before filing.
- **Time-bound**: Exceptions should have a clear scope. Ask if this is permanent or temporary, and if temporary, when it should be revisited.
