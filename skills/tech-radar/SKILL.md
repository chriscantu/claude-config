---
name: tech-radar
description: Use when the user says /tech-radar, "evaluate a technology", "should we adopt X", "add to tech radar", "tech radar entry", or "technology assessment". Also triggers when comparing tools or frameworks for an adoption decision.
---

# Technology Radar Management

Creates and manages tech radar entries tracking technologies through a lifecycle: **Assess → Trial → Adopt → Hold**.

## Configuration

This skill is org-agnostic. At first use in a new context, resolve these values by asking the user (or reading a `.tech-radar.config` file in the target repo if present):

- **Radar root** — directory where entries live (e.g. `~/repos/<org-records>/tech-radar/`, `docs/tech-radar/`). Default: `docs/tech-radar/` in the current repo.
- **Organization name** — used in template headings (default: "our organization").
- **Categories** — top-level groupings for entries (see defaults below).
- **Review process** — how entries are reviewed (PR review, architecture council, etc.).

Cache the resolved config on the user's confirmation. Do not assume a specific org's directory layout.

## Arguments

- `new <tool-name>` — Create a new tech radar entry
- `list` — List all radar entries grouped by category and stage
- `status <tool>` — Show current status of a specific tool
- `advance <tool>` — Move a tool to its next lifecycle stage and prompt for the new section content
- (no args) — Interactive: ask what the user wants to do

## Default Radar Categories

If the user has no existing categories, propose:
- `infrastructure/` — Infrastructure technologies (IaC, networking, autoscaling, etc.)
- `quality-tooling/` — QA and testing tools (static analysis, mocking, etc.)
- `tools/` — Developer and operational tools

Adapt to whatever categories the user's org already uses. If a tool doesn't fit, ask.

## Workflow

### Creating a New Entry (`new`)

1. **Gather context from the user**:
   - Tool/framework name
   - Category
   - Responsible Architect (or equivalent decision owner)
   - Author (default: the user)
   - Domain — which area of functionality does this apply to?
   - Sponsoring Division, Group, or Team

2. **Generate the filename**: `<kebab-case-tool-name>.md` in the appropriate category directory under the configured radar root. If the tool needs supporting assets (images, PDFs), create a subdirectory instead: `<tool-name>/<tool-name>.md`

3. **Create the entry from the adoption template** (replace `<org>` with the configured organization name):

```markdown
# Tool or Framework Adoption — <Tool Name>

Use this template if you are evaluating a new technology for <org> to adopt. Fill it out incrementally, asking for review as you complete each major section: Assessment, Trial, Adopt, Hold.

## Responsible Architect
<name>

## Author
<name>

## Contributors

* <names>

## Lifecycle
POC

## Domain
<domain>

## Delivery & Execution

### Sponsoring Division or Group
<division>

### Timeline / Milestones
<!-- What are the timelines for this work? Critical milestones and dependencies? -->

### Architectural Dependencies
<!-- Major architectural pieces not yet delivered that this depends on. Prefer links to other decision records. -->

### Architectural Risks
<!-- Bucket as High, Medium, or Low -->

### Tenet Exceptions
<!-- Will this require exceptions to engineering tenets? Link to exception requests. -->

## Assessment

### Current Solution
<!-- How are we solving this problem today? -->

### Competing Alternatives
<!-- What alternatives exist? How do they compare? -->

### Case Studies
<!-- What other companies use this? How similar are they to us? -->

### Cost / Benefit Analysis
<!-- What are the costs (hidden or otherwise)? When does it start paying off? -->

### Product and End User Visible Changes
<!-- How does adoption improve things for end users or the business? -->

### License Compatibility
<!-- How is it licensed? Has legal reviewed? -->

### Procurement
<!-- How do we get it? Sales process? Contacts? -->

### Learning Resources
<!-- How do teams learn it? Classes? Contractors? Learn-as-you-go? -->

## Trial

### Evaluation

#### Criterion
<!-- Rubric for evaluating the technology -->

#### Timeline
<!-- Evaluation period -->

#### Resources
<!-- Who did the learning? -->

#### Links to artifacts, demos, etc.
<!-- Demos, POCs, evaluation artifacts -->

### Sharp Edges
<!-- Unexpected negatives discovered during trial -->

## Adoption

### Rollout Plan
<!-- Coordination, commitments, dependencies, timeline -->

### Abort Plan
<!-- What if we discover something major? Can we back out? -->

## Hold

### Sunsetting Plan
<!-- Transition path if we need to stop using this -->

### Resurrection Plan
goto: Trial
```

4. **Tell the user** to fill in the Assessment section first and request review before proceeding to Trial. This is the incremental review process defined by the template.

### Listing Entries (`list`)

Scan the configured radar root and display entries grouped by category:

```markdown
## Tech Radar

### <Category Name>
| Tool | Lifecycle | Responsible Architect |
|------|-----------|----------------------|
```

Parse Lifecycle from the document body. If not present, mark as "Unknown".

### Checking Status (`status`)

Read the specified tool's entry and summarize:
- Current lifecycle stage
- Which sections are filled in vs. empty
- Any identified risks or sharp edges
- Next steps (what section needs to be completed next)

### Advancing Stage (`advance`)

When moving a tool to the next stage:
1. Read the current entry
2. Verify the current stage's sections are filled in (warn if not)
3. Update the Lifecycle field
4. Prompt the user to fill in the next stage's sections
5. Remind about the review process: request review at each major section transition

## Important Reminders

- **Incremental review**: The adoption template is designed to be filled out incrementally with review at each major section (Assessment → Trial → Adopt → Hold). Remind users of this.
- **Tenet exceptions**: If the tool requires exceptions to engineering tenets, remind the user to create a tenet exception request (suggest `/tenet-exception` skill).
- **Cross-reference**: Check if related ADRs or decision records already exist that should be linked.
