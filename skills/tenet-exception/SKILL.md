---
name: tenet-exception
description: Create tenet exception requests for the engineering tenets governance process. Use when the user says /tenet-exception, "request a tenet exception", "exception to tenet", "deviate from a tenet", or "tenet exception".
---

# Tenet Exception Request

Creates tenet exception requests following the process defined in `~/repos/system-design-records/engineering_tenets/`.

Tenet exceptions are formal records of decisions to deviate from engineering tenets. They require PR labels and Engineering SLT review within 2 business days.

## Arguments

- `new <title>` — Create a new tenet exception
- `list` — List existing tenet exceptions
- (no args) — Interactive: ask what the user wants to do

## Engineering Lenses (for labeling)

- Web Application (app.procore.com)
- Mobile Application
- Service (api.procore.com)
- Data
- ML
- Reusable Asset & Tooling
- Platform Service
- Infrastructure Service

## Architecture Pillars (for labeling)

- Operational Excellence
- Security
- Reliability
- Quality
- Efficiency
- Global by Design

## Workflow

### Creating a New Exception (`new`)

1. **Gather context from the user**:
   - Title — short description of the exception
   - Which specific tenet is being excepted? Ask the user to identify the section. If unsure, help them search the tenets README at `~/repos/system-design-records/engineering_tenets/README.md`
   - Which lens(es) are affected?
   - Which pillar(s) are affected?

2. **Determine the next number**: Scan existing tenet exceptions (files matching `TE_NNNN*.md` or similar patterns) in the engineering_tenets directory and its subdirectories. If no existing exceptions, start at `0001`.

3. **Determine placement**: Tenet exceptions can be:
   - **Standalone**: Created as an ADR in `~/repos/system-design-records/adrs/` if the exception is a standalone decision
   - **Inline with an SDR**: Added to an existing SDR PR under the "Tenet Exceptions" section

   Ask the user which approach fits their situation.

4. **Create the exception using this template**:

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

5. **Remind the user of the PR process**:

```
## PR Requirements for Tenet Exceptions

When creating the PR, you must:

1. Add the PR label: `exception`
2. Add lens label(s): `lens:<lens-name>` for each affected lens
3. Add pillar label(s): `pillar:<pillar-name>` for each affected pillar
4. Slack your Engineering SLT member to notify them
5. SLT will respond with approval or next steps within 2 business days

Tip: An exception request is a record of a decision, not a substitute
for the technical discussion. Reach out to architects and tenet champions
in #engineering-tenets during the discussion phase.
```

6. **Challenge the exception** (per user's preference for being challenged):
   - Ask: "Is this truly an outlier, or are the tenets out of touch? If there's an opportunity to improve the tenets instead of requesting an exception, consider reaching out to the Tenet Champions in #engineering-tenets first."
   - This aligns with the exception process guidance in the README.

### Listing Exceptions (`list`)

Search for tenet exception files across:
- `~/repos/system-design-records/engineering_tenets/` (including subdirectories like `playground/`)
- `~/repos/system-design-records/adrs/` (any ADRs that reference tenet exceptions)

Display:

```markdown
## Tenet Exceptions

| # | Title | Date | Affected Tenet | Status |
|---|-------|------|----------------|--------|
```

## Important Reminders

- **Not a rubber stamp**: The exception process exists for transparency and learning. Encourage the user to have the technical discussion first, then document the decision.
- **Champion consultation**: Suggest reaching out to the relevant tenet champions before filing. Champions are listed in the engineering tenets README.
- **Time-bound**: Exceptions should have a clear scope. Ask if this is permanent or temporary, and if temporary, when it should be revisited.
