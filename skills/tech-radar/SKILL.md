---
name: tech-radar
description: Use when the user says /tech-radar or asks to evaluate, adopt, or compare a technology, framework, or tool for formal adoption. Also triggers for "should we adopt X", "add to tech radar", or "technology assessment".
---

# Technology Radar Management

Creates and manages tech radar entries tracking technologies through a lifecycle: **Assess → Trial → Adopt → Hold**.

## When NOT to Use

- One-off library choices inside a single feature ("which date lib should I import here")
- Casual "what do you think of X" discussions — use only when the user wants a formal adoption record
- Decisions already made — use `/adr` for standalone decisions that don't need lifecycle tracking

## Configuration

At first use in a new context, resolve these values by asking the user (or reading a `.tech-radar.config.yaml` file in the target repo if present):

- **Radar root** — directory where entries live (e.g. `docs/tech-radar/`, `~/repos/<org-records>/tech-radar/`)
- **Organization name** — used in template headings (default: "our organization")
- **Categories** — top-level groupings, mapped to subdirectories under the radar root
- **Review process** — how entries are reviewed (PR review, architecture council, etc.)

If no config and no existing radar directory is found, **ask** rather than defaulting silently.

Example `.tech-radar.config.yaml`:

```yaml
radar_root: docs/tech-radar/
organization: Acme Corp
categories:
  - infrastructure
  - quality-tooling
  - tools
review_process: PR review by architecture council
```

## Arguments

- `new <tool-name>` — Create a new tech radar entry
- `list` — List all radar entries grouped by category and stage
- `status <tool>` — Show current status of a specific tool
- `advance <tool>` — Move a tool to its next lifecycle stage
- (no args) — Interactive: ask what the user wants to do

## Default Categories

If the user has no existing categories, propose:
- `infrastructure/` — IaC, networking, autoscaling
- `quality-tooling/` — static analysis, mocking, testing
- `tools/` — developer and operational tools

Adapt to whatever categories the user's org already uses.

## Workflow

### Creating a New Entry (`new`)

1. **Gather context**: tool name, category, responsible architect (or decision owner), author (default: user), domain, sponsoring division/team.
2. **Generate the filename**: `<kebab-case-tool-name>.md` under the appropriate category subdirectory. If supporting assets are needed, create a subdirectory instead: `<tool-name>/<tool-name>.md`.
3. **Create the entry** using the template at [adoption-template.md](adoption-template.md). Replace `<org>` with the configured organization name.
4. **Tell the user** to fill in the Assessment section first and request review before proceeding to Trial.

### Listing Entries (`list`)

Scan the configured radar root and display entries grouped by category:

```markdown
## Tech Radar

### <Category>
| Tool | Lifecycle | Responsible Architect |
|------|-----------|----------------------|
```

Parse Lifecycle from the document body. Mark as "Unknown" if missing.

### Checking Status (`status`)

Summarize: current lifecycle stage, filled vs. empty sections, identified risks/sharp edges, next section to complete.

### Advancing Stage (`advance`)

1. Read the current entry
2. Verify current stage's sections are filled (warn if not)
3. Update the Lifecycle field
4. Prompt for the next stage's sections
5. Remind to request review at each major transition

## Common Mistakes

- **Skipping Assessment, jumping straight to Trial** — the template is incremental for a reason; each stage needs review before the next.
- **Creating an entry before agreeing on category** — if the category is ambiguous, ask before writing the file.
- **Forgetting cross-references** — check for related ADRs or existing decision records and link them.
- **Missing tenet exceptions** — if adoption requires deviating from engineering tenets, prompt the user to run `/tenet-exception`.
