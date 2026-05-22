# Rules — Install Contract

Files in this directory are loaded into Claude Code's session context as
"user's private global instructions for all projects" — but **only if a
symlink for them exists at `~/.claude/rules/<name>.md`**. The harness does
NOT auto-scan this directory; it walks `~/.claude/rules/`.

This is the same pattern used for `agents/` (loaded from `~/.claude/agents/`)
and `commands/` (loaded from `~/.claude/commands/`).

## Adding a new rule

1. Create `rules/<your-rule>.md` in this repo with the required frontmatter
   (see existing rules for the pattern: `description:`, optionally `globs:`).
2. Run the install script:

   ```
   ./bin/link-config.fish
   ```

   It is idempotent and safe to re-run. It will only create new symlinks;
   it will never overwrite a real file at the destination.
3. **Open a fresh Claude Code session** to load the new rule. Existing
   sessions will not pick it up — rules load at session start.
4. Verify the rule loaded. Two options:

   **Automated probe** (preferred):

   ```
   ./bin/verify-rule-loaded.fish <rule-name>     # e.g. planning
   ./bin/verify-rule-loaded.fish --all            # every rule in the table below
   ```

   Spawns a `claude --print` session and asserts the rule path appears
   in its loaded context. Exits 0 on found, 1 on missing, 2 on probe
   error (also: typo'd rule name, since single-rule mode validates the
   name against the "What lives here" table below — add the row first).
   Uses `haiku` by default (override via `VERIFY_RULE_MODEL=…`) to
   minimise spend; still costs a real API call per probe, so run
   selectively rather than wiring into every CI run. See issue #275 for
   rationale and caveats (model variance, auth requirement).

   **Manual fallback** — open a fresh session and ask:

   > List every rule file currently in your loaded system instructions.
   > Quote the first sentence of each. Do not Read from disk.

   Your new file should appear in the list.

## Verifying the install (CI-friendly)

```
./bin/link-config.fish --check
fish validate.fish
```

`link-config.fish --check` exits non-zero if any file in `rules/`,
`agents/`, or `commands/` is missing its symlink, or if a stale symlink
points to the wrong target.

`validate.fish` (top-level) is the consolidated structural + concept
validator. Phases relevant to rules:

- **1a. Skill frontmatter** — fails on missing `skills/<slug>/SKILL.md`, missing required field (`name:`, `description:`), or `name:` ≠ dir slug. Lineage: PR #147.
- **1b. Rule frontmatter** — fails on missing `---` delimiter or `description:` field in `rules/*.md`. Lineage: commit 5c470b0 (no PR ref).
- **1c. Agent frontmatter** — fails on missing required YAML field (`description:`, `tools:`) in `agents/*.md`. Lineage: commit 5c470b0 (no PR ref).
- **1d. Pipeline cross-references** — fails when rule/skill `/skill-name` or `/agent-name` reference has no matching dir/file on disk. Lineage: commit 5c470b0 (no PR ref).
- **1e. Symlink verification** — fails when any managed entry (rules/, agents/, commands/, hooks/, CLAUDE.md, skills/) is missing/stale/non-symlink in `~/.claude/`. Generalized to uniformly cover `commands/`+`hooks/`: PR #198.
- **1f. Rules anchor labels** — fails if any file in the floor trio
  (`planning-pipeline.md`, `skip-contract.md`,
  `pressure-framing-floor.md`) loses a labeled block that other rules
  delegate to (Skip contract, Pressure-framing floor, Emission
  contract, Architectural invariant, Emergency bypass — sentinel file
  check, Scope-tier memory check), or if a dependent rule
  (`fat-marker-sketch.md`, `goal-driven.md`, `think-before-coding.md`,
  `execution-mode.md`, `pr-validation.md`) loses references to all
  three trio files. Catches silent breakage when an anchor file is
  renamed or its sections restructured (issue #135; trio split issue #375).
- **1g. Canonical-string drift** — fails if a canonical rule string
  (e.g. the [Trivial/Mechanical tier criteria](planning-pipeline.md#trivial-tier-criteria),
  defined in `planning-pipeline.md`) is restated outside its canonical home.
  "Do not restate" markers in non-canonical files are editor hints;
  this phase is the enforcement. Phase 1g also guards canonical
  scope-tier hook strings (verb signals, minimizers, scope-expanders,
  blast-radius words) — see `hooks/scope-tier-memory-check.sh` for
  the canonical home. Regression coverage:
  `tests/validate-phase-1g.test.ts` (migrated from fish per ADR #0012).
- **1h. Hook ↔ user docs consistency** — fails when non-test `hooks/*.sh` script is undocumented in `README.md` or `docs/*.md`. Lineage: PR #179 (issue #175).
- **1i. Dangling hook permissions** (warn-only) — warns when `.claude/settings.json` Bash permission references hook script no longer present under `hooks/`. Warn-only because absolute paths may be valid on other machines. Lineage: PR #179.
- **1j. Stable anchor presence** — fails if any file in the floor trio
  (`planning-pipeline.md`, `skip-contract.md`,
  `pressure-framing-floor.md`) loses an explicit `<a id="…">` anchor
  that dependent rules deep-link to. Currently guards
  `#trivial-tier-criteria` (planning-pipeline), `#skip-contract` /
  `#emission-contract` / `#override-skip-contract` /
  `#emission-contract-per-gate` (skip-contract), and
  `#pressure-framing-floor` / `#scope-tier-memory-check` /
  `#fast-track-validation-emission` / `#architectural-invariant` /
  `#emergency-bypass-sentinel` (pressure-framing-floor); add to the
  registry when promoting another rule construct to a citable anchor.
- **1k. Anchor-link target resolution** — fails when cross-rule `[text](other.md#anchor-id)` link in `rules/*.md` targets an undefined anchor. Generalized from planning.md-only to all rule-to-rule refs: PR #282 (issue #276). Regression coverage: `tests/validate-phase-1k.test.ts`.
- **1l. Delegate-link presence** — fails if a rule registered as
  delegating to a floor-trio anchor loses the
  `<basename>.md#<id>` link, where `<basename>` is one of
  `planning-pipeline.md`, `skip-contract.md`, or
  `pressure-framing-floor.md`. Currently guards (rule, target#anchor)
  triples covering `#pressure-framing-floor`, `#emission-contract`,
  `#emergency-bypass-sentinel`, `#override-skip-contract`,
  `#emission-contract-per-gate`, and `#trivial-tier-criteria` across
  the five dependent rules. Phase 1g only fires on canonical-string
  RESTATEMENT and Phase 1k only fires on DANGLING anchor links —
  neither catches a contributor DELETING the entire delegate
  paragraph from a dependent rule, which silently weakens the
  HARD-GATE (issue #200). Add `(rule, target.md#anchor)` triples to
  the registry when promoting a new floor delegation. Regression
  coverage: `tests/validate-phase-1l.test.ts` (migrated from fish
  per ADR #0012; updated for split issue #375).
- **1m. evals.json shape** — fails if any `evals.json` under
  `skills/*/evals/` or `rules-evals/*/evals/` violates the
  `loadEvalFile` contract from `tests/evals-lib.ts`: top-level
  `{skill, evals[]}`; each entry has a non-empty `name`, exactly
  one of `prompt`/`turns`, a non-empty `assertions` array
  (single-turn) or per-turn non-empty `prompt`+`assertions`
  (multi-turn). A `__SCANNED__` sentinel emitted per eval lets the
  loop assert the filter visited every entry — without it, a
  future filter regression that makes every `select(...)` predicate
  miss would re-introduce the silent-skip class issue #203 closed.
- **1n. Fixture ↔ eval integrity** — for each
  `tests/fixtures/<skill>/` directory, fails if (a) the fixtures
  README is missing (fixture-to-eval contract documentation is
  required); (b) any fixture subdir has no eval consumer in
  `skills/<skill>/evals/evals.json` AND is not listed under a
  `## Orphaned fixtures` heading in the fixtures README; or (c)
  any fixture path referenced by an eval prompt does not exist on
  disk (dangling reference). Documented orphans warn rather than
  fail, allowing intentional staging while still surfacing the
  unconsumed status. Closes the silent-failure mode where stale
  fixtures rot or eval renames orphan their fixtures undetected
  (issue #234). Regression coverage:
  `tests/validate-phase-1n.test.ts`.
- **1o. Scope-tier hook + installer + substrate field** — fails if
  `hooks/scope-tier-memory-check.sh` is missing or not executable;
  if `bin/install-scope-tier-hook.fish` is missing or not executable;
  if shellcheck reports warnings on the hook; or if the `Eval`
  interface in `tests/evals-lib.ts` does not declare the
  `additional_context?: string` field (substrate contract for the
  scope-tier routing-contract evals). Regression coverage:
  `tests/validate-phase-1o.test.ts`.
- **1p. rules-evals/README.md suite inventory** — bidirectional check
  that `rules-evals/README.md`'s "Current suites:" bullet list matches
  on-disk dirs under `rules-evals/`. Fails when an on-disk suite dir
  has no README bullet, or a README bullet has no on-disk dir. Closes
  the doc-rot mode that motivated issue #361's README backfill (the
  prior README listed 2 of 7 live suites). Regression coverage:
  `tests/validate-phase-1p.test.ts`.
- **1q. Retirement signals** — three checks on `validate.fish` plus the
  opt-in `.claude/state/validate-phase-log.jsonl`: (a) HARD-FAILs when a
  commented `# function _phase_` block lacks a preceding
  `# RETIRED YYYY-MM-DD — reason` + `# Restore:` tombstone (no audit
  trail = no soft-retire); (b) WARNs when an active phase has 0 firings
  in the last 100 log entries (silent when log <10); (c) WARNs when a
  tombstone is ≥12 months old (hard-delete eligible). Reads phase IDs
  from `_phase_begin "<id>"` markers, so fixtures can inject synthetic
  validate.fish content to test each check in isolation. Lineage:
  issue #352. Regression coverage: `tests/validate-phase-1q.test.ts`.
  Soft-retire / hard-delete procedure: see ["Retiring a rule or
  validator phase"](#retiring-a-rule-or-validator-phase) below.
- **1r. Skill-eval discriminating-signal presence** — for each
  `skills/<name>/evals/evals.json`, fails if zero
  `"tier": "required"` assertions are present across the suite's
  `evals[]`. Mirrors at the skill layer the discriminating-signal
  discipline `rules-evals/` inherits from
  [ADR #0005](../adrs/0005-behavioral-adr-promotion-requires-discriminating-signal.md);
  policy lineage: [ADR #0019](../adrs/0019-skill-eval-discriminating-signal-discipline.md)
  (issue #379). Counts via grep; zero-state (no skill eval files)
  emits a documented pass. Regression coverage:
  `tests/validate-phase-1r.test.ts`.
- **1s. Skill persistence destinations — no plugin-internal consumers**
  — for each `skills/<name>/SKILL.md`, fails if `decisions.md` or
  `patterns.md` appears as a positive write target. Exclusion
  declarations (lines containing `NOT`, `Not used`, `non-addressable`,
  `plugin-internal`, `claude-code-harness:memory`) are allowed.
  Enforces the plugin-internal scoping rule from
  [ADR #0020](../adrs/0020-memory-layer-primary-and-delegations.md)
  (issue #381). Regression coverage:
  `tests/validate-phase-1s.test.ts`.

Use these in pre-push hooks or CI to catch the silent-failure modes
(rule not loaded; rule restated and drifted; anchor structurally broken;
stable deep-link target removed; delegate link deleted from dependent).

Anchor-pattern guidance (when to promote a rule construct to a citable
anchor) is canonically housed in [`GOVERNANCE.md`](GOVERNANCE.md#stable-anchor-pattern).

## Why the silent-failure mode matters

A HARD-GATE rule that isn't loaded is worse than no rule at all — it
provides false confidence that the discipline is in place when it isn't.
PR #121 discovered this live: two new HARD-GATE rules shipped without
symlinks and were silently no-op'd in fresh sessions until the symlinks
were added manually. The script and this README close the gap.

Retirement procedure (soft-retire, hard-delete) and override-clause
delegation guidance live in [`GOVERNANCE.md`](GOVERNANCE.md#retiring-a-rule-or-validator-phase)
— contributor-workflow content, consulted only at retirement-review
time.

<a id="what-lives-here"></a>

## What lives here

| File | Type | Purpose |
|---|---|---|
| `planning-pipeline.md` | HARD-GATE | DTP / Systems Analysis / Solution Design pipeline; stage visibility; scope calibration (incl. Trivial/Mechanical tier); decision framework; sequential-thinking opt-in; multi-session continuity |
| `skip-contract.md` | HARD-GATE | Named-cost skip mechanics, emission contract, and per-gate skip-honor table |
| `pressure-framing-floor.md` | HARD-GATE | Pressure-framing routing, scope-tier memory check, fast-track validation emission, architectural invariant, emergency-bypass sentinel |
| `fat-marker-sketch.md` | HARD-GATE | Mandatory shape sketch after approach selection, before detailed design |
| `think-before-coding.md` | HARD-GATE | Three-part preamble (Assumptions / Interpretations / Simpler-Path) at Solution Design |
| `goal-driven.md` | HARD-GATE | Per-step verify checks defined before code, loop-until-verified semantics |
| `tdd-pragmatic.md` | Soft | Test-first for non-trivial logic; bug-repro test before fix |
| `verification.md` | Soft | End-of-work gate: tests run, type-check runs, no "should work" |
| `execution-mode.md` | HARD-GATE | Sizing guard for subagent-driven-development; controller announces mode before first dispatch |
| `pr-validation.md` | HARD-GATE | PR readiness declaration triggers test plan execution; trigger surface (speech-act + action-bound), locator contract, mechanical zero-functional-change carve-out |
| `disagreement.md` | HARD-GATE | When the user pushes back on a stated position, require new evidence before reversing; capitulation absent evidence and hedge-then-comply both forbidden |
| `memory-discipline.md` | HARD-GATE | Stored auto-memory entries are defaults with provenance, not commands; `feedback` yields to surfaced trade-offs on context shift, `project` may be stale, file/function/flag claims require verification before action |

The `bin/link-config.fish` script will skip `README.md` files automatically.

Adding a HARD-GATE rule? The 8-rule cap policy, three-condition gate, and
retroactive audit table live in [`GOVERNANCE.md`](GOVERNANCE.md#hard-gate-cap)
— not auto-loaded; consulted only at rule-promotion review time.
