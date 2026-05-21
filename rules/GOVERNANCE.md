---
description: >
  Governance policy for the rules layer itself: 8-rule HARD-GATE cap,
  three-condition gate for adding a 9th rule, stable-anchor pattern, and
  retroactive audit table. NOT symlinked into `~/.claude/rules/` — consulted
  only at rule-promotion review time. See README.md for the live HARD-GATE
  registry and install contract.
---

# Rules — Governance

Policy that governs the rules layer itself: when a new HARD-GATE rule may
be added, what shape promotion takes, how cross-rule anchors stay stable,
and how to retire rules and validator phases. This file is **not**
symlinked into `~/.claude/rules/` — it loads only when a contributor
proposes a new HARD-GATE rule, migrates an anchor, retires a phase, or
audits the rules layer for accretion.

For install contract, validator phase descriptions, the live HARD-GATE
registry, and retirement procedures, see [`README.md`](README.md).

## Stable anchor pattern

When a rule construct (criteria block, decision table, definition list)
is referenced from other rules, promote it to a citable anchor:

1. Place an explicit `<a id="kebab-name"></a>` line directly above the
   heading. Auto-generated GitHub heading IDs are fragile — punctuation,
   em dashes, and renames silently break links.
2. Dependent rules deep-link with `[Display Text](BASENAME.md#kebab-name)`
   where BASENAME is the canonical file (e.g., `pressure-framing-floor`).
3. Add the anchor ID to `validate.fish` Phase 1j's registry so future
   removal fails CI.

The anchor is the contract; the heading is presentation. Treat the
anchor ID as load-bearing — never rename without updating every
dependent.

<a id="hard-gate-cap"></a>

## Policy: HARD-GATE cap

**Cap: 8 HARD-GATE behavioral concerns.** The current set listed in
[`README.md`'s "What lives here" table](README.md#what-lives-here) is the
ceiling. Note: the planning-pipeline / skip-contract /
pressure-framing-floor trio is **one concern** (the planning pipeline +
floor mechanics) implemented across three files for cognitive-load
hygiene per issue #375. Counting concerns rather than files, the live
set is: planning trio, fat-marker-sketch, think-before-coding,
goal-driven, execution-mode, pr-validation, disagreement,
memory-discipline = 8.

<!-- The README.md#what-lives-here anchor is defined explicitly in rules/README.md
     to make this deep-link Phase 1k-resolvable per the Stable anchor pattern. -->
 New behavioral concerns shaped as "we need a gate for X"
must extend an existing rule, not add a 9th.

Background: every HARD-GATE rule carries Skip contract + named-cost emission
+ pressure-framing-floor delegate + sentinel bypass inheritance. Each loads
per prompt. Accretion at the rules layer compounds cognitive load and
substrate cost. The cap is a prevention policy; per-prompt fixes (scope-tier
hooks, conditional loaders) are downstream remediation, not substitutes. The
originating issue referenced 6 gates — `disagreement.md` and `memory-discipline.md` shipped after that
count, bringing the live set to 8. The cap freezes the current set; it does
not retroactively prune. Splitting an existing concern across multiple
files for cognitive-load reasons (as in #375) is structural, not
accretive — it does not consume cap budget.

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

### Concern-split eligibility test

The trio precedent (issue #375) allows splitting an existing behavioral
concern across multiple files without consuming cap budget. To prevent
that carve-out from becoming a cap-evasion pattern ("my new gate is a
sub-concern of X"), a split qualifies as **one concern** only when ALL
three conditions hold:

1. **Shared trigger surface.** Every dependent rule referencing the
   pre-split file must reference each post-split file. Phase 1f's
   trio-mention guard plus Phase 1l's per-anchor registry enforce this
   structurally — a split that leaves a dependent referencing only some
   of the post-split files is a different concern by definition.
2. **ADR-documented rationale.** The split must be motivated by a named
   cognitive-load or substrate-cost problem (file size, anchor density,
   dependent count) in an ADR. "Feels cleaner" is not a rationale.
3. **Atomic registry update.** Phase 1f / Phase 1j / Phase 1l registries
   must be extended in the SAME commit as the split. A split that lands
   structurally but leaves validator registries pointing at the old
   single file is incomplete — and indistinguishable from accretion.

A new rule that fails any of these tests is a new concern and consumes
cap budget. "Refinement of existing concern X" without satisfying all
three is accretion in disguise.

### Retroactive audit pass

Survey of overlap candidates among the current 8. None forced to merge —
this is a discriminating-signal audit, not a deduplication pass.

Discriminating-signal claims below reference evals under `rules-evals/<name>/evals/evals.json`.

| Candidate pair | Overlap surface | Verdict |
|---|---|---|
| `think-before-coding` <-> `goal-driven` | Both fire at the Solution Design -> Implementation seam; both prescribe pre-code structure | **Keep separate.** TBC governs *what to surface* (assumptions/interpretations/simpler-path) at design; goal-driven governs *what success looks like* (verify criteria, loop semantics) at implementation. Distinct discriminating signals: TBC RED on missing preamble; goal-driven RED on missing verify check. Merging collapses two channels. (evals: `rules-evals/think-before-coding/`, `rules-evals/goal-driven/`) |
| `planning-pipeline` + floor trio <-> `fat-marker-sketch` | FMS sits inside the planning pipeline between approach-selection and detailed-design | **Keep separate but watch.** FMS is a *gate within* planning, not a parallel gate. Per the per-gate-boundary discrimination rule (see condition 2 above) and a four-cell inverse-RED audit, FMS per-gate blocks failed discrimination at their own boundary. FMS retained as a discrete file for substrate cost (its sketch artifact is a distinct deliverable), but flagged for re-evaluation if a discriminating signal at the FMS boundary cannot be authored. (evals: `skills/fat-marker-sketch/evals/`, `skills/{define-the-problem,systems-analysis,sdr}/evals/` — no `rules-evals/` home yet for FMS or planning rule) |
| `disagreement` <-> `memory-discipline` | Both handle anti-sycophancy / pressure framing; both yield to "new evidence" semantics | **Keep separate.** Disagreement governs *live pushback in-turn*; memory-discipline governs *stored auto-memory defaults across turns*. Different trigger surfaces, different escape clauses (evidence vs. surfaced trade-off). Discriminating signals differ: disagreement RED on capitulation-without-evidence; memory-discipline RED on uncited stored-claim execution. (evals: `rules-evals/disagreement/`, `rules-evals/memory-discipline/`) |

No merges proposed. Audit conclusion: the 8 are individually discriminable;
the cap prevents a 9th from accreting without the same scrutiny.

### Discriminating eval coverage

Per ADR #0015's Implementation gate, this cap is itself a HARD-GATE-shaped
behavior and requires the same discriminating-signal coverage it demands of
new rules. Coverage suite: [`rules-evals/hard-gate-cap/`](../rules-evals/hard-gate-cap/) — four-cell suite covering
9th-rule rejection (no conditions), 9th-rule rejection (partial / 2-of-3),
9th-rule acceptance (all three conditions), and extension-first audit
honored.

### Pointer

Policy preamble in `global/CLAUDE.md` Coding Principles section links here
as the canonical home. Do not restate the cap or the three-condition gate
elsewhere.

## Retiring a rule or validator phase

When a rule or validator phase no longer earns its keep, retire it
**softly first**. Phase 1q (retirement signals) surfaces candidates
mechanically — read its WARN output as the signal to begin this
procedure.

### Soft-retire a validator phase

1. Comment out the phase block in `validate.fish`.
2. Prepend a tombstone immediately above the commented block:

   ```fish
   # RETIRED YYYY-MM-DD — <reason: zero firings / superseded by X / etc.>
   # Restore: uncomment block + drop .skip on tests/validate-phase-1X.test.ts
   ```
3. If a corresponding `tests/validate-phase-1X.test.ts` exists, change
   the top-level `describe(` to `describe.skip(`.
4. Commit with `chore(validate): soft-retire phase 1X — <reason>`.

Phase 1q HARD-FAILs if a commented `# function _phase_` block lacks its
tombstone — this is intentional. Tombstones are the audit trail; a
soft-retire that skips them is a silent regression dressed as cleanup.

### Hard-delete a soft-retired phase

Trigger: Phase 1q emits `WARN ... hard-delete eligible` (tombstone aged
≥12 months). The signal means the soft-retired phase has gone an entire
release cycle without anyone needing to restore it.

1. Delete the commented block + tombstone from `validate.fish`.
2. Delete the corresponding `tests/validate-phase-1X.test.ts` file.
3. Commit with `chore(validate): hard-delete phase 1X (12mo+ no activity)`.

### Override-clause delegation

Skip-override prose ("What counts as an explicit override" + "Time
pressure is not an override" + per-gate "Emission contract — MANDATORY"
boilerplate) is canonical at:

- [`rules/skip-contract.md#override-skip-contract`](skip-contract.md#override-skip-contract)
- [`rules/skip-contract.md#emission-contract-per-gate`](skip-contract.md#emission-contract-per-gate)

Delegate rules link to these anchors with a one-line `See [...]` and
their own `gate=` value. Do not restate the canonical text in a
delegate rule — Phase 1l + Phase 1g guard against drift.
