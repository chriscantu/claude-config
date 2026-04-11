# Global Claude Code Configuration

## Shell Environment
- User runs **fish shell** — all terminal commands must be fish-compatible
- No bash heredocs (`<<'EOF'`): write multiline content to a temp file instead
  ```fish
  echo "subject line

  Body paragraph.

  Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>" > /tmp/commitmsg
  git commit -F /tmp/commitmsg
  ```
- No `$(...)` command substitution: use `(...)` in fish
- `&&` chaining works in fish 3.0+; `;` is fine for unconditional sequencing

## Documentation & Diagrams
- Use Markdown for all documentation and written deliverables
- Use Mermaid syntax for all diagrams and graphs

## Git Conventions
- Feature branches: `feature/<short-description>` (e.g., `feature/auth-middleware`)
- Commit messages: concise subject, imperative mood (e.g., "Add session timeout handling")
- NEVER push directly to main/master without explicit approval

## Development Defaults
- TypeScript is the default language unless the project dictates otherwise
- TDD — pragmatic: tests accompany implementation, test-first for non-trivial logic
- Follow industry best practice for package manager and runtime per project

## Verification (IMPORTANT)
- NEVER claim code works without running tests or type-checking first
- Run the relevant verify command (`npm test`, `tsc --noEmit`, etc.) before declaring work complete
- If no test exists for changed behavior, write one
- **PR Validation Gate** — Before declaring a PR ready for merge, execute every unchecked item in the PR description's test plan. Build and launch on each listed platform/simulator, take screenshots to verify, and only check off items that have been visually confirmed. If an item cannot be verified (e.g., requires a physical device or external service), flag it explicitly rather than silently skipping it.

## Communication Style
- Do NOT blindly agree — challenge assumptions and probe reasoning
- Surface trade-offs explicitly: what are we gaining, what are we giving up?
- Prefer root cause analysis over surface-level fixes
- Back recommendations with data or evidence when possible
- When I propose an approach, ask "why" before executing if the reasoning isn't clear
