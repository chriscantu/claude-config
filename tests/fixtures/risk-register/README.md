# Fixtures — `/risk-register`

Each fixture is a minimal workspace shape (`<fixture>/risks/register.md`) that exercises a specific eval contract from [`skills/risk-register/evals/evals.json`](../../../skills/risk-register/evals/evals.json). An eval copies the fixture into a temp workspace (`cp -r <fixture>/. <tmp-ws>/`), then runs the helper against `<tmp-ws>` with a fixed `--today` so dates are deterministic.

`validate.fish` enforces fixture↔eval integrity: every fixture directory here must either have an eval consumer or be listed under `## Orphaned fixtures` (warning, not failure), and every eval-referenced fixture must exist on disk.

## Eval → Fixture matrix

| Eval (`evals/evals.json`) | Fixture | Why this fixture |
|---|---|---|
| `review-surfaces-stale` | `register-stale/` | One active risk with `Last reviewed: 2026-05-01`. At `--today 2026-06-16` it is 46 days old (> 14-day default), so it must surface in the stale section. Proves a real file read (entry ID R-1 appears). |
| `escalate-flips-sentinel`, `escalate-bad-id-refuses`, `ack-bumps-date`, `resolve-drops-from-review` | `register-active/` | A single active R-1. Starting state for the mutating actions: escalate R-1 (success), escalate R-99 (refusal with list hint), ack R-1 (date bump), and resolve R-1 → review (resolved drops out). |

The `add-writes-block` eval uses no fixture — it starts from an empty workspace.

## Orphaned fixtures

(none currently)
