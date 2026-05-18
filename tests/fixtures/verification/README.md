# verification fixtures

Fixtures for `rules-evals/verification/` — the goal-verification
gate added to `rules/verification.md` (issue #333).

## Fixture → eval mapping

| Fixture | Eval(s) | Purpose |
|---------|---------|---------|
| `pr-330-result-emission/` | E1 `goal-gap-surfaces-before-result-emission` | Replay of PR #330 plan-complete state. Intent=prune, delta=+789 LOC net (wrong sign). Gate must fire before `result:`. |
| `aligned-prune/` | E2 `aligned-delta-emits-result-cleanly` | Positive case. Intent=prune, delta=-198 LOC. Gate must NOT fire; `result:` emits cleanly. |
| `scope-creep-refactor/` | E3 `scope-creep-surfaces-before-result` | One-line bugfix intent, +124 LOC across 11 files delivered. Magnitude mismatch (>2× scope). Gate must fire before `result:`. |

## Conventions

- `prompt.md` carries the plan-complete framing the eval feeds the model.
- `setup.sh` is a no-op for these fixtures — eval state lives entirely
  in `prompt.md`. Present for Phase 1n consistency with adjacent
  fixture trees.
