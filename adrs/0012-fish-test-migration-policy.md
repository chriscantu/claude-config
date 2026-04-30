# ADR #0012: Fish-shell tests retained only when SUT-coupled; subprocess tests migrate to TypeScript

Date: 2026-04-30

## Responsible Architect
Cantu

## Author
Cantu

## Contributors

* Claude (design partner)

## Lifecycle
Steady-state

## Status
Accepted (2026-04-30)

## Context

The repository has accumulated 9 fish-shell files (~1,961 LOC total), of which
5 are tests under `tests/` (772 LOC). The fish footprint splits cleanly into
two structurally distinct categories:

**Production fish — out of scope for this ADR.** These are CLI / install
entry points users and CI invoke directly. Migrating them to TS would not
remove the shell dependency; it would only relocate it behind a `spawnSync`
wrapper. Their fish-ness is load-bearing.

- `validate.fish` (844 LOC) — repo structural + concept validator (CI gate)
- `bin/link-config.fish` (221 LOC) — symlink installer
- `bin/lib/symlinks.fish` — installer helper library
- `install.fish` — top-level installer

**Tests — the subject of this ADR.**

| File | LOC | SUT | Coupling |
|---|---|---|---|
| `tests/symlinks-test.fish` | 241 | `bin/lib/symlinks.fish` (sourced) | In-process — calls fish functions directly |
| `tests/validate-phase-1g.fish` | 173 | `validate.fish` (subprocess) | Subprocess — asserts on stdout / exit code |
| `tests/validate-phase-1l.fish` | 186 | `validate.fish` (subprocess) | Subprocess — asserts on stdout / exit code |
| `tests/run-fish-tests.fish` | 50 | n/a — driver | Driver only |
| `tests/run-scenarios.fish` | 122 | `claude --print` (subprocess) | Subprocess — eval scenario runner |

PR #208 (commit a801cf3, 2026-04-29) migrated `link-config-test.fish` to
`tests/link-config.test.ts` using `spawnSync("fish", ...)`. Discussion on
that PR established an informal policy now restated in `tests/README.md`
("Picking fish vs TypeScript"):

> Use **fish** when the test sources a fish lib directly to call its
> functions in-process. Use **TypeScript** when the test shells out to a
> fish script via subprocess.

This ADR formalizes that policy as a binding architectural decision and
commits to migrating existing subprocess-style fish tests.

### Driving concerns (engineer-stated)

1. **Shell-agnostic goal.** The repo aspires to be runtime-agnostic where
   feasible. Test code is the highest-leverage place to make that real:
   tests are read and modified far more often than the SUT. Production
   fish stays — but tests do not need to share its substrate.
2. **Shell as a testing platform.** Bash/fish lack a real assertion
   library, parallel execution, IDE/LSP integration, type-checked fixture
   data, watch mode, and structured failure output. Hand-rolled
   `t_pass` / `t_fail` helpers cover the basics but cap our ceiling.
   `bun:test` is already wired in `package.json` and proven in
   `tests/link-config.test.ts`, `tests/evals-lib.test.ts`,
   `tests/new-skill.test.ts`, `tests/named-cost-skip-server.test.ts`.
3. **Maintainer skillset.** The primary maintainer reads fish but does
   not author fluently. Every fish-only test added is a future
   maintenance task that requires either a context-switch or an
   assist. TypeScript is the maintainer's working language. Bus-factor
   risk on shell-only tests is asymmetric to their value.

### What the policy does NOT change

- Production fish stays fish. CLI entry points are structurally bound to
  a shell.
- Tests that `source` a fish lib in-process stay fish. There is no way
  to introspect fish-internal function state from TS without
  re-implementing a fish parser; subprocess wrappers around such tests
  would lose the per-function assertion granularity that makes
  `tests/symlinks-test.fish` valuable. The shell-agnostic goal yields
  to the SUT-coupling reality here.

## Decision

Adopt the following test-substrate policy and execute the bounded
migration plan below.

### Policy (binding)

1. **New test files default to TypeScript** under `tests/*.test.ts` using
   `bun:test`.
2. **A new test file MAY be fish only if** it sources a fish library
   directly to assert on internal function behavior. The author MUST
   note this in the file header (one line: "in-process fish lib test;
   sourced SUT requires shell substrate"). Subprocess-style assertions
   on fish CLI tools are NOT a valid reason to author in fish.
3. **Existing fish tests are categorized as either Retained or
   Migration-Pending** per the classification table below.
4. **`tests/README.md`'s "Picking fish vs TypeScript" section is the
   canonical day-to-day reference.** This ADR is the architectural
   anchor; the README is the implementation guide.

### Classification

| Test | Status | Rationale |
|---|---|---|
| `tests/symlinks-test.fish` | **Retained** | In-process `source` of `bin/lib/symlinks.fish`; per-function assertions |
| `tests/validate-phase-1g.fish` | **Migration-Pending** | Subprocess against `validate.fish` |
| `tests/validate-phase-1l.fish` | **Migration-Pending** | Subprocess against `validate.fish` |
| `tests/run-fish-tests.fish` | **Retained while any fish test exists; remove with last fish test** | Driver only |
| `tests/run-scenarios.fish` | **Retained, deferred** | Eval runner; coexists with `eval-runner-v2.ts`. Out of scope here — re-evaluate via separate ADR if the eval substrate consolidates |

### Migration plan (bounded, deadline-driven)

The migration is deadline-driven with a hard cut-off. Initial drafting
considered an opportunistic trigger ("port when someone touches the
file"), but that signal is too weak — Phase 1g / 1l regression coverage
may not be modified for months, and the user's stated skillset concern
makes any indefinite fish-test residency a continued bus-factor risk.

1. **Tracking issues opened at acceptance time** (binding, not aspirational):
   - [#210](https://github.com/chriscantu/claude-config/issues/210) —
     migrate `tests/validate-phase-1g.fish`
   - [#211](https://github.com/chriscantu/claude-config/issues/211) —
     migrate `tests/validate-phase-1l.fish`

   Both labeled `test-migration`. Issue creation is part of accepting
   this ADR — a future ADR amendment that adds a Migration-Pending
   entry MUST also open its tracking issue at acceptance, not later.

2. **Hard freeze on new fish subprocess tests starting at acceptance
   date (2026-04-30).** Any new regression coverage for `validate.fish`
   (any phase) or other fish CLI scripts is authored in TS. This stops
   bleeding before staunching. Enforced by reviewer attention; if
   violations occur, escalate to a `validate.fish` phase that fails
   the build on new `tests/*.fish` files matching the subprocess pattern.

3. **Migration deadline: 2026-07-30 (3 months from acceptance).**
   Both Migration-Pending issues MUST be closed (test ported, fish
   original deleted) by this date. Earlier is welcome; later requires
   an ADR amendment with explicit slip rationale — not silent rollover.

4. **Status checkpoint: 2026-06-30** (1 month before deadline). If
   either issue is unstarted at that date, schedule a focused
   migration PR rather than risking deadline slip.

### What "migrated" means concretely

For a Migration-Pending test, "migrated" means:
- New `tests/<name>.test.ts` using `spawnSync("fish", ["validate.fish", ...])`
  per the `tests/link-config.test.ts` pattern.
- All assertion semantics from the fish original preserved (case A, B,
  C, D, E coverage in Phase 1g / 1l does not regress).
- Old `tests/validate-phase-*.fish` deleted in the same PR — no parallel
  coverage period.
- `tests/README.md` and `rules/README.md` Phase references updated.

## Alternatives Considered

**A. Migrate all fish tests to TypeScript, including in-process lib
tests.** Rejected. `tests/symlinks-test.fish` exercises individual
functions in `bin/lib/symlinks.fish` (`each_symlink_target`,
`check_symlink_layout`) by sourcing the lib. A TS port would have to
either (a) drive each function via a one-off CLI shim, multiplying the
SUT surface and the bug-attack surface; or (b) reduce coverage to
end-to-end-only via `link-config.fish --check`, which is what
`link-config.test.ts` already does. Option (a) is more code than the
fish original; option (b) silently loses per-function granularity.
Neither is an improvement over keeping the in-process test in its
native substrate.

**B. Keep all fish tests, document in README only.** Rejected. The
policy is real and load-bearing — it shapes what new tests get written
in. README notes are advisory; an ADR is the durable artifact that
survives a maintainer rotation. The user's stated bus-factor concern
(skillset asymmetry) is exactly what ADRs exist to address.

**C. Migrate immediately in a single PR.** Rejected. Two Migration-Pending
tests at 173 + 186 LOC = ~360 LOC of port work plus equivalence review,
done eagerly, against tests that already work. The 3-month deadline
captures most of the value (bounded residency, no indefinite stall)
without forcing a single-PR megacommit that ties up review bandwidth.

**C′. Opportunistic / "port when touched."** Rejected during ADR
acceptance review. The trigger signal is too weak: Phase 1g / 1l
coverage may not be modified for months. Indefinite fish-test residency
keeps the user's skillset concern unresolved. Replaced with the
deadline-driven plan above.

**D. Adopt a third runner (e.g., bats-core for fish).** Rejected.
Introducing bats adds a third test substrate to a repo that already
has two. The skillset concern would worsen, not improve. The
maintainer's working language is TypeScript; the migration target
should be TypeScript.

**E. Migrate production fish too.** Out of scope and not recommended.
`validate.fish` and `link-config.fish` are CLI tools users invoke
directly. A TS port would either (i) require Bun on every dev machine
that runs `validate.fish` (currently fish suffices), or (ii) ship a
compiled binary for each platform. Both expand operational surface
without addressing the test-skillset concern this ADR scopes.

## Consequences

**Positive:**
- New regression coverage lands in TS by default — assertion library,
  parallel runner, IDE support, type-checked fixtures.
- Bus-factor risk on subprocess tests collapses to the maintainer's
  working language.
- One test substrate (`bun:test`) for ~80% of new tests; the remaining
  ~20% (in-process fish lib tests) is a small, well-defined exception.
- The shell-agnostic goal becomes operationally true at the test layer
  even though production fish remains.

**Negative / accepted trade-offs:**
- Subprocess overhead per TS test that shells out to fish (~10–50ms
  per `spawnSync` invocation). Acceptable: regression suites are not
  hot loops, and `bun:test`'s parallelism more than offsets this in
  aggregate.
- Two test runners (`bun test` + `fish tests/run-fish-tests.fish`) for
  as long as `tests/symlinks-test.fish` exists. CI runs both; local
  workflows need to run both. This is the cost of keeping in-process
  granular coverage on the symlink lib. Acceptable.
- Migration-Pending tests sit in fish for some period. Mitigated by
  the new-fish-test freeze: the bleeding stops today even though the
  cleanup is opportunistic.

**Risks:**
- Migration deadline (2026-07-30) could slip under load. Mitigation:
  2026-06-30 status checkpoint; slip past deadline requires ADR
  amendment with explicit rationale, not silent rollover.
- A future change to `bin/lib/symlinks.fish` that breaks the in-process
  fish test could prompt a "just delete it" reaction. Guardrail: this
  ADR's "Retained" classification is the stop sign — replace coverage
  before deleting, do not regress to subprocess-only.
- Freeze on new fish subprocess tests is reviewer-enforced, not
  CI-enforced. If a violation slips in, escalate to `validate.fish`
  phase per Decision §2.

## Verification

Per `rules/verification.md`:

- This ADR is a documentation artifact; no executable verify command
  is required for the decision itself.
- The first concrete migration (a Migration-Pending test → TS) MUST
  pass `bun test tests/<new>.test.ts` AND demonstrate equivalence: the
  same fixture cases (A, B, C, D, E for Phase 1g / 1l) cover the same
  failure modes.
- `validate.fish` Phase 1f (anchor labels), Phase 1g (drift), Phase 1l
  (delegate-link presence) continue to pass after each migration.
- The new-fish-test freeze is enforceable by reviewer attention; no
  automated check is added at this time. If freeze violations occur,
  add a `validate.fish` phase that fails on new `tests/*.fish` files
  matching the subprocess-style pattern.

## Related

- [PR #208](https://github.com/chriscantu/claude-config/pull/208) —
  established the informal policy via `link-config.test.ts` migration;
  closed tracking issue [#201](https://github.com/chriscantu/claude-config/issues/201)
  for the fixture-driven round-trip pattern
- [PR #204](https://github.com/chriscantu/claude-config/pull/204) —
  wired fish-shell regression tests into CI (closed
  [#199](https://github.com/chriscantu/claude-config/issues/199));
  this ADR scopes their long-term lifecycle
- [PR #189](https://github.com/chriscantu/claude-config/pull/189) —
  hardened `validate.fish` Phase 1g and added the regression suite
  (Migration-Pending target)
- [PR #206](https://github.com/chriscantu/claude-config/pull/206) —
  added `validate.fish` Phase 1l and its regression suite
  (Migration-Pending target)
- [#210](https://github.com/chriscantu/claude-config/issues/210) —
  tracking issue: migrate `validate-phase-1g.fish` to TS
- [#211](https://github.com/chriscantu/claude-config/issues/211) —
  tracking issue: migrate `validate-phase-1l.fish` to TS
- `tests/README.md` — canonical day-to-day reference for "fish vs TS"
- `rules/verification.md` — end-of-work verification gate
- `package.json` `scripts.test` — `bun test tests/` is the canonical
  TS runner invocation
