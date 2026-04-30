# tests/

This directory holds three distinct kinds of test artifact:

1. **Fish-shell regression suites** — automated, auto-discovered, run in CI.
2. **TypeScript regression suites** — `bun:test`, auto-discovered, run in CI.
3. **TypeScript / behavioral evals** — separate runners (see `EVALS.md`,
   `eval-runner-v2.ts`, `run-scenarios.fish`).

This README documents the **regression contracts** (1 + 2). Evals have their
own conventions in `EVALS.md`.

## Picking fish vs TypeScript

Use **fish** when the test sources a fish lib directly to call its functions
in-process (e.g. `tests/symlinks-test.fish` sources
`bin/lib/symlinks.fish` to unit-test `each_symlink_target` and
`check_symlink_layout`). TypeScript can't `source` fish, so this path stays
shell-native.

Use **TypeScript** when the test shells out to a fish script via subprocess
and asserts on stdout / stderr / exit code (e.g. `tests/link-config.test.ts`
runs `bin/link-config.fish` end-to-end). The shell boundary is the same
either way; TS gains real assertion lib + IDE support without losing
anything.

When in doubt, match the convention of the existing test for the SUT.

## Fish-shell regression contract

### Naming

A test file is picked up automatically by `tests/run-fish-tests.fish` (and
therefore by CI) if its filename matches either pattern:

- `tests/*-test.fish` — general regression suites (e.g. `symlinks-test.fish`)
- `tests/validate-phase-*.fish` — phase-specific suites for `validate.fish`

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
`symlinks-test.fish` for the established pattern.
Adopt a framework only if friction surfaces.

### Fixtures

Tests that need a fake repo build one under `mktemp -d` and clean up after
themselves. `validate.fish` honors the `CLAUDE_CONFIG_REPO_DIR` env override
to point at a fixture instead of the real repo.

### Running locally

```fish
fish tests/run-fish-tests.fish              # all suites
fish tests/symlinks-test.fish               # one suite
```

### CI wiring

`.github/workflows/validate.yml` invokes `fish tests/run-fish-tests.fish`
after `fish validate.fish`. The driver is the single point of CI integration —
new test files do not need workflow edits.

## TypeScript regression contract

### Naming

A test file is picked up automatically by `bun test tests/` (and therefore
by CI) if its filename matches `tests/*.test.ts`.

### Style

Use `bun:test` (`describe` / `test` / `expect`). Subprocess-style tests
that shell out to fish via `spawnSync` live here; see
`tests/link-config.test.ts` for the established pattern.

### Fixtures

Use `mkdtempSync(join(tmpdir(), "<prefix>-"))` for fixture HOMEs and clean
up in `afterEach`. Override `HOME` via the `env` option to `spawnSync` —
never mutate `process.env.HOME`.

### Running locally

```fish
bun test tests/                              # all TS suites
bun test tests/link-config.test.ts           # one suite
```

### CI wiring

`.github/workflows/validate.yml` invokes `bun test tests/` after the
fish-shell driver. Drop a new `*.test.ts` file and it runs on the next
build — no workflow edit required.
