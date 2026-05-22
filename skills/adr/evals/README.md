# Evals — adr

Executable behavioral evals for the adr skill. Schema, runner usage, and
assertion-type rubric live in [`tests/EVALS.md`](../../../tests/EVALS.md).

## Run

```fish
bun run tests/eval-runner-v2.ts adr
bun run tests/eval-runner-v2.ts --dry-run    # validate JSON + regex compile only
```

## Coverage

- **Base trigger fires** — plain-English request fires the skill (required-tier signal).
- **Phase B read-hook scenarios** (per [2026-05-22 decision doc](../../../docs/superpowers/decisions/2026-05-22-glossary-v2-read-discipline.md)):
  - present + conflict → surface advisory (only-on-conflict, never substitute)
  - present + match → silent OK, proceed to write-offer
  - absent CONTEXT.md → silent no-op
  - malformed CONTEXT.md → silent no-op + diagnostic

Each Phase B scenario carries at least one `"tier": "required"` assertion
per [ADR #0019](../../../adrs/0019-skill-eval-discriminating-signal-discipline.md)
(Phase 1r blocks merge otherwise).

## Fixtures

Scenarios use inline `scratch_decoy` fields rather than
`tests/fixtures/adr/` — no fixtures README is required while the inline
form is sufficient. Migrate to `tests/fixtures/adr/` only if a
scenario needs files large enough to be unwieldy inline.
