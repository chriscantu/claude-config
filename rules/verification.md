---
description: Enforce verification before claiming work is complete
globs:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
  - "**/*.jsx"
---

# Verification Rules

- Run `tsc --noEmit` before declaring TypeScript work complete
- Run the project's test suite for any changed module
- If no test covers the changed behavior, write one before finishing
- NEVER say "this should work" — run it and prove it works
