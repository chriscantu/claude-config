---
description: Pragmatic TDD approach for TypeScript development
globs:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.test.ts"
  - "**/*.spec.ts"
---

# Pragmatic TDD

- For non-trivial logic: write a failing test first, then implement
- For simple/obvious code: write tests alongside, not necessarily before
- Every public function or exported API should have test coverage
- Tests should describe behavior, not implementation — test WHAT not HOW
- When fixing a bug: write a test that reproduces it before writing the fix
