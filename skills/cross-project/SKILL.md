---
name: cross-project
description: Analyze the impact of a change across multiple local repos. Use when the user says /cross-project, "what repos does this affect", "cross-repo impact", "cross-project dependency analysis", or "who else uses this API".
---

# Cross-Project Impact Analysis

Analyzes how a change in the current project might affect other local repositories.

## Arguments

- `<description>` — What changed or is about to change (e.g., "removing the auth middleware", "renaming UserAccount to Account")
- (no args) — Infer from recent git diff or ask the user

## Workflow

### Step 1: Identify the Change

If no description provided:
1. Check `git diff HEAD` for recent changes
2. Summarize what changed (files, exports, APIs, types)
3. Confirm with the user

### Step 2: Determine What to Search For

Extract searchable identifiers from the change:
- Exported function/class/type names
- API endpoint paths
- Package names (if this is a shared library)
- Configuration keys or environment variables
- Shared constants or enum values

### Step 3: Scan Local Repos

Search across sibling directories in `~/repos/` for references to the identified items.

Use grep/glob across repos, but SKIP:
- `node_modules/`, `.git/`, `dist/`, `build/`, `__pycache__/`
- The current repo itself

### Step 4: Report

Present findings using this structure:

```markdown
## Impact Analysis: <change description>

### Direct References Found
| Repo | File | Line | Usage |
|------|------|------|-------|

### Potential Indirect Impacts
<!-- Things that don't directly reference the change but may be affected -->
<!-- e.g., downstream consumers of an API, shared config patterns -->

### Risk Assessment
- **Blast radius**: How many repos/teams affected
- **Severity**: Breaking change? Behavioral change? Cosmetic?
- **Reversibility**: Can this be rolled back easily?

### Recommended Actions
<!-- Ordered list of what to do in each affected repo -->
```

### Step 5: Systems Thinking Check

Apply the planning rule's systems thinking framework:
- What feedback loops does this create?
- What second-order effects might occur?
- Who owns the affected repos? Flag cross-team dependencies.
