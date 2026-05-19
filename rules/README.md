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
- **1f. Rules anchor labels** — fails if `rules/planning.md` loses one
  of the labeled blocks that other rules delegate to (Skip contract,
  Pressure-framing floor, Emission contract, Architectural invariant,
  Emergency bypass — sentinel file check, Skip override — what counts,
  Emission contract — per-gate skip honor), or if a dependent rule
  (`fat-marker-sketch.md`, `goal-driven.md`, `think-before-coding.md`,
  `execution-mode.md`, `pr-validation.md`) loses its reference to
  `planning.md`. Catches
  silent breakage when the anchor file is renamed or its sections
  restructured (issue #135).
- **1g. Canonical-string drift** — fails if a canonical rule string
  (e.g. the [Trivial/Mechanical tier criteria](planning.md#trivial-tier-criteria),
  defined in `planning.md`) is restated outside its canonical home.
  "Do not restate" markers in non-canonical files are editor hints;
  this phase is the enforcement. Phase 1g also guards canonical
  scope-tier hook strings (verb signals, minimizers, scope-expanders,
  blast-radius words) — see `hooks/scope-tier-memory-check.sh` for
  the canonical home. Regression coverage:
  `tests/validate-phase-1g.test.ts` (migrated from fish per ADR #0012).
- **1h. Hook ↔ user docs consistency** — fails when non-test `hooks/*.sh` script is undocumented in `README.md` or `docs/*.md`. Lineage: PR #179 (issue #175).
- **1i. Dangling hook permissions** (warn-only) — warns when `.claude/settings.json` Bash permission references hook script no longer present under `hooks/`. Warn-only because absolute paths may be valid on other machines. Lineage: PR #179.
- **1j. Stable anchor presence** — fails if `planning.md` loses an
  explicit `<a id="…">` anchor that dependent rules deep-link to.
  Currently guards `#trivial-tier-criteria`, `#skip-contract`,
  `#emission-contract`, `#pressure-framing-floor`,
  `#architectural-invariant`, and `#emergency-bypass-sentinel`; add
  to the registry when promoting another rule construct to a citable
  anchor.
- **1k. Anchor-link target resolution** — fails when cross-rule `[text](other.md#anchor-id)` link in `rules/*.md` targets an undefined anchor. Generalized from planning.md-only to all rule-to-rule refs: PR #282 (issue #276). Regression coverage: `tests/validate-phase-1k.test.ts`.
- **1l. Delegate-link presence** — fails if a rule registered as
  delegating to a `planning.md` anchor loses the `planning.md#<id>`
  link. Currently guards 15 (rule, anchor) pairs covering
  `#pressure-framing-floor`, `#emission-contract`,
  `#emergency-bypass-sentinel`, and `#trivial-tier-criteria` across
  the five dependent rules. Phase 1g only fires on canonical-string
  RESTATEMENT and Phase 1k only fires on DANGLING anchor links —
  neither catches a contributor DELETING the entire delegate
  paragraph from a dependent rule, which silently weakens the
  HARD-GATE (issue #200). Add `(rule, anchors)` pairs to the
  registry when promoting a new floor delegation. Regression
  coverage: `tests/validate-phase-1l.test.ts` (migrated from fish
  per ADR #0012).
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

Use these in pre-push hooks or CI to catch the silent-failure modes
(rule not loaded; rule restated and drifted; anchor structurally broken;
stable deep-link target removed; delegate link deleted from dependent).

## Stable anchor pattern

When a rule construct (criteria block, decision table, definition list)
is referenced from other rules, promote it to a citable anchor:

1. Place an explicit `<a id="kebab-name"></a>` line directly above the
   heading. Auto-generated GitHub heading IDs are fragile — punctuation,
   em dashes, and renames silently break links.
2. Dependent rules deep-link via
   `[Display Text](planning.md#kebab-name)`.
3. Add the anchor ID to `validate.fish` Phase 1j's registry so future
   removal fails CI.

The anchor is the contract; the heading is presentation. Treat the
anchor ID as load-bearing — never rename without updating every
dependent.

## Why the silent-failure mode matters

A HARD-GATE rule that isn't loaded is worse than no rule at all — it
provides false confidence that the discipline is in place when it isn't.
PR #121 discovered this live: two new HARD-GATE rules shipped without
symlinks and were silently no-op'd in fresh sessions until the symlinks
were added manually. The script and this README close the gap.

## What lives here

| File | Type | Purpose |
|---|---|---|
| `planning.md` | HARD-GATE | DTP / Systems Analysis / Solution Design pipeline; pressure-framing floor; named-cost skip emission contract |
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

<a id="hard-gate-cap"></a>

## Policy: HARD-GATE cap

**Cap: 8 HARD-GATE rules.** The current set listed above is the ceiling. New
behavioral concerns shaped as "we need a gate for X" must extend an existing
rule, not add a 9th.

Background: every HARD-GATE rule carries Skip contract + named-cost emission
+ pressure-framing-floor delegate + sentinel bypass inheritance. Each loads
per prompt. Accretion at the rules layer compounds cognitive load and
substrate cost. The cap is a prevention policy; per-prompt fixes (scope-tier
hooks, conditional loaders) are downstream remediation, not substitutes. The
originating issue referenced 6 gates — `disagreement.md` and `memory-discipline.md` shipped after that
count, bringing the live set to 8. The cap freezes the current set; it does
not retroactively prune.

### Adding a 9th HARD-GATE rule requires:

1. **Extension-first audit.** Name the specific existing rule the concern
   could extend (which one, why it doesn't fit). "None fit" must be argued,
   not assumed.
2. **Discriminating eval signal per [ADR #0005](../adrs/0005-behavioral-adr-promotion-requires-discriminating-signal.md).**
   A regression eval whose required-tier assertion is RED on a broken
   implementation and GREEN on a passing one — at the new rule's specific
   boundary, not just "somewhere in the rules layer." Per-gate behavioral claims that cannot
   demonstrate discrimination at their own boundary are rejected per
   Karpathy #2 — speculative duplication adding no eval-measurable load.
3. **Substrate cost accounting.** Estimate per-prompt token load added and
   any new sentinel/hook surface. Cap intent is to make the trade-off
   visible, not to forbid additions.

PRs that add a HARD-GATE rule without these three are rejected at review.

### Retroactive audit pass

Survey of overlap candidates among the current 8. None forced to merge —
this is a discriminating-signal audit, not a deduplication pass.

Discriminating-signal claims below reference evals under `rules-evals/<name>/evals/evals.json`.

| Candidate pair | Overlap surface | Verdict |
|---|---|---|
| `think-before-coding` <-> `goal-driven` | Both fire at the Solution Design -> Implementation seam; both prescribe pre-code structure | **Keep separate.** TBC governs *what to surface* (assumptions/interpretations/simpler-path) at design; goal-driven governs *what success looks like* (verify criteria, loop semantics) at implementation. Distinct discriminating signals: TBC RED on missing preamble; goal-driven RED on missing verify check. Merging collapses two channels. (evals: `rules-evals/think-before-coding/`, `rules-evals/goal-driven/`) |
| `planning` (DTP/SA/SD) <-> `fat-marker-sketch` | FMS sits inside the planning pipeline between approach-selection and detailed-design | **Keep separate but watch.** FMS is a *gate within* planning, not a parallel gate. Per the per-gate-boundary discrimination rule (see condition 2 above) and a four-cell inverse-RED audit, FMS per-gate blocks failed discrimination at their own boundary. FMS retained as a discrete file for substrate cost (its sketch artifact is a distinct deliverable), but flagged for re-evaluation if a discriminating signal at the FMS boundary cannot be authored. (evals: `skills/fat-marker-sketch/evals/`, `skills/{define-the-problem,systems-analysis,sdr}/evals/` — no `rules-evals/` home yet for FMS or planning rule) |
| `disagreement` <-> `memory-discipline` | Both handle anti-sycophancy / pressure framing; both yield to "new evidence" semantics | **Keep separate.** Disagreement governs *live pushback in-turn*; memory-discipline governs *stored auto-memory defaults across turns*. Different trigger surfaces, different escape clauses (evidence vs. surfaced trade-off). Discriminating signals differ: disagreement RED on capitulation-without-evidence; memory-discipline RED on uncited stored-claim execution. (evals: `rules-evals/disagreement/`, `rules-evals/memory-discipline/`) |

No merges proposed. Audit conclusion: the 8 are individually discriminable;
the cap prevents a 9th from accreting without the same scrutiny.

### Pointer

Policy preamble in `global/CLAUDE.md` Coding Principles section links here
as the canonical home. Do not restate the cap or the three-condition gate
elsewhere.
