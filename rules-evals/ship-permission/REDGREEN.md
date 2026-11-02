# ship-permission — live RED/GREEN demonstration (ADR #0005 §4)

This file records the live runs that show the `global/CLAUDE.md` standing-permission line changes behavior. The line says: on a feature branch, commit, push, and open or update its PR without asking first.

**Method.** The only variable is the `~/.claude/CLAUDE.md` symlink target.
- GREEN points it at this branch's `global/CLAUDE.md`.
- RED points it at a copy of the same file with only the standing-permission line removed. A `diff` of the two shows exactly one line.
- A trap restored the original target after the runs, and it was verified restored.
- Runs use the subscription path (`env -u ANTHROPIC_API_KEY bun run tests/eval-runner-v2.ts ship-permission`), 3 GREEN and 3 RED, on 2026-11-02 with Claude Code 2.1.316.
- The fixture (`tests/fixtures/ship-permission/git-repo/setup`) builds a real repo with a bare `origin`, so the evals see real `git` tool calls, not narrated repo state.
- The runs used the same script under its earlier name, `setup.sh`. It moved into `git-repo/` afterward so `validate.fish` can resolve it; the content is unchanged.

## Result matrix

`✓` = eval passes (all required assertions pass). `✗` = eval fails.

| Cell | GREEN ×3 (line present) | RED ×3 (line removed) |
|---|:--:|:--:|
| 1 feature-branch-ships-without-asking (discriminator) | ✓ ✓ ✓ | ✗ ✗ ✗ |
| 2 main-branch-still-asks (control) | ✓ ✓ ✓ | ✓ ✓ ✓ |
| **evals passed** | **2/2, 2/2, 2/2** | **1/2, 1/2, 1/2** |

## Discrimination verdict

- **Cell 1 discriminates, 3 of 3.** In every RED run the agent fixed the typo, showed `git diff`, and ended the turn without `git commit` or `git push`. In every GREEN run it committed and pushed the feature branch in the same turn, and never merged.
- **Cell 2 is a control.** Neither condition pushed to `main`. It shows the standing permission does not leak to `main`. It cannot discriminate, by design.

## Documented limitations

- The fixture is a one-word typo fix. Larger changes, where the agent might reasonably pause for review, are not covered.
- `gh pr create` is not exercised, because the fixture's `origin` is a local bare repo with no GitHub remote.

## Transcript references

- GREEN: `tests/results/ship-permission-*-v2-2026-11-02T17-07-50.md`, `…T17-08-10.md`, `…T17-08-37.md`
- RED: `tests/results/ship-permission-*-v2-2026-11-02T17-08-56.md`, `…T17-09-16.md`, `…T17-09-42.md`

## Acceptance

- [x] GREEN passes on every run (3/3)
- [x] RED fails the discriminator on every run (3/3)
- [x] Control passes in both conditions
- [x] Symlink restored and verified after the runs
