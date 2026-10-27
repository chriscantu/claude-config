# Fixtures — `pr-validation` rules evals

These fixtures support the evals in [`rules-evals/pr-validation/evals/evals.json`](../../../rules-evals/pr-validation/evals/evals.json).

`validate.fish` checks fixture↔eval integrity. Every fixture directory here must have an eval that uses it, or be listed under `## Orphaned fixtures` (a warning, not a failure).

## Eval → Fixture matrix

| Eval (`evals/evals.json`) | Fixture | Why this fixture |
|---|---|---|
| Every eval except `gh-unavailable-hard-fails-not-silent-pass` | `gh-stub/` | A fake `gh` that answers like a real PR. The evals name PRs that don't exist, so without it every run stops at "repo not found" and the gate is never what blocks a merge. The runner puts this directory first on `PATH` for that eval's `claude` process only (`path_prepend`). Each eval's `env` sets `GH_STUB_PR_BODY`, and optionally `GH_STUB_MODE`, `GH_STUB_DRAFT` and `GH_STUB_FILES`, to match its prompt. |

`gh-unavailable-hard-fails-not-silent-pass` uses no fixture. It tests the reply to a claimed `gh` failure, and any `gh` on `PATH` would contradict that claim.

## Orphaned fixtures

(none currently)
