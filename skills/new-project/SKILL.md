---
name: new-project
description: Use when the user says /new-project, "scaffold a project", "set up a new repo", "initialize project", or wants to start a fresh codebase with standard conventions.
---

# New Project Scaffolding

Sets up a new project with Claude Code configuration, testing, and git conventions based on the selected stack.

## Arguments

- `<stack>` — One of: `ts-react`, `ts-node`, `python`, `swift`, `docs`
- (no args) — Interactive: ask the user to choose a stack

## Workflow

### Step 1: Gather Context

Ask the user (if not already clear):
1. **Project name** — used for directory and package name
2. **Stack** — ts-react, ts-node, python, swift, or docs
3. **One-line purpose** — what does this project do and why?

### Step 2: Generate CLAUDE.md

Use the template from the claude-config repo as a starting point. Fill in:
- **WHY**: The one-line purpose from Step 1
- **HOW**: Stack-appropriate commands

For each stack, populate the Commands section:

**ts-react / ts-node:**
```
bun run build        # Build
bun test             # Test (all)
bun test <file>      # Test (single file)
bun run lint         # Lint
bunx tsc --noEmit    # Type check
```

**python:**
```
python -m pytest              # Test (all)
python -m pytest <file>       # Test (single file)
ruff check .                  # Lint
mypy .                        # Type check
```

**swift:**
```
swift build          # Build
swift test           # Test (all)
```

**docs:**
```
# No build/test commands — documentation-only project
```

Leave Architecture, Conventions, Domain Glossary, and Non-Obvious Decisions sections with their template comments for the user to fill in.

### Step 3: Initialize Testing (if applicable)

**ts-react**: Suggest Vitest + Testing Library setup
**ts-node**: Suggest Vitest setup
**python**: Suggest pytest + ruff setup
**swift**: Note Xcode test target

Do NOT install packages or create config files automatically. Instead, present the recommended setup and let the user confirm before proceeding.

### Step 4: Git Setup

If not already a git repo:
- `git init`
- Create `.gitignore` appropriate to the stack
- Create initial commit

Remind the user of branch conventions from global config:
- Feature branches: `feature/<short-description>`
- Commit messages: concise subject, imperative mood

### Step 5: Summary

Print a checklist of what was created and what the user should do next:
- [ ] Fill in CLAUDE.md sections (Architecture, Conventions, Domain Glossary)
- [ ] Install dependencies (show the command)
- [ ] Verify test setup works

## When NOT to Use

- The project already exists and has a CLAUDE.md — use targeted edits instead
- Adding a feature, module, or subdirectory to an existing project
- Setting up a one-off script or scratch file that doesn't need project scaffolding
- The user only wants a `.gitignore` or a `CLAUDE.md` — create those directly without running the full workflow

## Common Mistakes

- **Auto-installing dependencies or creating config files without confirmation** — this skill recommends setup and waits for the user; don't run `bun add` or write `vitest.config.ts` unprompted.
- **Using `npm`/`node` for TypeScript stacks** — the user's environment is Bun; commands in CLAUDE.md must use `bun`/`bunx`.
- **Filling in Architecture, Conventions, or Domain Glossary with guesses** — leave those as template comments for the user; inventing content creates memory that rots fast.
- **Forgetting the one-line purpose** — the WHY in CLAUDE.md is the most useful section; don't skip Step 1's purpose question.
- **Committing before the user has reviewed CLAUDE.md** — make the initial commit, but stop there and let the user fill in the placeholders before further work.
