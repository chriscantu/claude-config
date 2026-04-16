---
name: cross-project
description: Use when the user says /cross-project, "what repos does this affect", "cross-repo impact", "cross-project dependency analysis", or "who else uses this API". Also triggers when evaluating whether a change in one repo breaks consumers in other local repos.
---

# Cross-Project Impact Analysis

Analyzes how a change in the current project might affect other local repositories.

## Arguments

- `<description>` — What changed or is about to change (e.g., "removing the auth middleware", "renaming UserAccount to Account")
- `--scan-paths <comma-separated-paths>` — Optional. Override the default scan locations with one or more directories to search across (e.g., `--scan-paths ~/work,~/oss`)
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

Determine the scan paths:

1. If `--scan-paths` was provided, use those directories (comma-separated) as the exclusive scan roots.
2. Otherwise, default to the **parent directory of the current working directory** (sibling repos).
3. Additionally include `~/repos/` if it exists and is not already covered by the default (i.e., not the same directory as, or an ancestor of, the default).

Search the resolved scan roots for references to the identified items.

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

## When NOT to Use

- Changes scoped entirely to the current repo with no shared APIs, packages, or config
- Conceptual "what if we changed X someday" questions without a concrete change in hand
- Single-file tweaks inside the current repo (no exported surface area changes)
- When the user just wants to know who imports a symbol within this repo — use grep directly

## Common Mistakes

- **Searching only for direct references and missing indirect impacts** — downstream consumers of an API, shared config patterns, or documentation references can all be affected without naming the identifier directly.
- **Reporting matches without assessing severity** — a match in a test file is very different from a match in production code; always tag findings with blast radius and reversibility.
- **Scanning only the default path when the user has multiple repo roots** — ask about `--scan-paths` if the default parent-dir scan seems too narrow for their layout.
- **Skipping ownership** — a finding without an owner is hard to act on; flag cross-team dependencies explicitly.
