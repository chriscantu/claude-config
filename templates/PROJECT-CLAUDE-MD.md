# Project CLAUDE.md Template
# Copy this into a repo's root as CLAUDE.md and fill in the sections.
# Delete any section that doesn't apply. Every line should earn its place.

## WHY — Project Purpose
<!-- What does this project do and why does it exist? 1-2 sentences. -->
<!-- This gives Claude decision-making context for trade-offs. -->

## WHAT — Architecture
<!-- Key directories, services, or packages and their responsibilities. -->
<!-- For monorepos: list apps and shared packages. -->

## HOW — Commands
<!-- Only include commands Claude cannot infer from package.json or config files. -->

```
# Build
# Test (all)
# Test (single file)
# Lint
# Type check
```

## Conventions
<!-- Only deviations from standard practices. If you use standard TypeScript + -->
<!-- ESLint + Prettier, you don't need to say that — Claude can read your configs. -->

## Domain Glossary
<!-- Define 5-10 terms specific to your business domain that appear in the code. -->
<!-- Example: "Tenant" = a customer organization, not an individual user -->

## Non-Obvious Decisions
<!-- Architectural choices that would surprise someone reading the code. -->
<!-- Example: "We use polling instead of webhooks because vendor X rate-limits webhooks" -->
