# tests/

This directory holds two distinct kinds of test artifact:

1. **Fish-shell regression suites** — automated, auto-discovered, run in CI.
2. **TypeScript / behavioral evals** — separate runners (see `EVALS.md`,
   `eval-runner-v2.ts`, `run-scenarios.fish`).

This README documents the **fish-shell regression contract**. Evals have their
own conventions in `EVALS.md`.

## Fish-shell regression contract

### Naming

A test file is picked up automatically by `tests/run-fish-tests.fish` (and
therefore by CI) if its filename matches either pattern:

- `tests/*-test.fish` — general regression suites (e.g. `symlinks-test.fish`)
- `tests/validate-phase-*.fish` — phase-specific suites for `validate.fish`
  (e.g. `validate-phase-1g.fish`)

Drop a new file matching either pattern and it will run on the next CI build.
No edit to the driver or workflow is required.

### Exit-code contract

Each test file MUST:

- exit `0` when all assertions pass
- exit non-zero when any assertion fails

The driver aggregates results across files and exits non-zero if any file
fails. CI fails the job on a non-zero driver exit.

### Style

Tests use plain fish + manual `t_pass` / `t_fail` helpers — no framework. See
`symlinks-test.fish` and `validate-phase-1g.fish` for the established pattern.
Adopt a framework only if friction surfaces.

### Fixtures

Tests that need a fake repo build one under `mktemp -d` and clean up after
themselves. `validate.fish` honors the `CLAUDE_CONFIG_REPO_DIR` env override
to point at a fixture instead of the real repo.

### Running locally

```fish
fish tests/run-fish-tests.fish              # all suites
fish tests/symlinks-test.fish               # one suite
fish tests/validate-phase-1g.fish           # one suite
```

### CI wiring

`.github/workflows/validate.yml` invokes `fish tests/run-fish-tests.fish`
after `fish validate.fish`. The driver is the single point of CI integration —
new test files do not need workflow edits.
