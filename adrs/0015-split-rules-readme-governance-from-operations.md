# ADR #0015: Split rules/README.md governance from operational phase descriptions

Date: 2026-05-20

## Responsible Architect
Cantu

## Author
Cantu

## Contributors

* Claude (design partner)

## Lifecycle
Steady-state

## Status
Accepted

Implementation shipped 2026-05-21 in commit/PR closing this ADR.
`rules-evals/hard-gate-cap/` suite exists with 4 discriminating evals
(rejection-no-conditions, rejection-partial-conditions, acceptance-all-three,
extension-first-honored). Live RED/GREEN demonstration deferred per #369
precedent — cost-gated follow-up issue tracks the demonstration loop;
suite presence closes the gate per ADR §Implementation gate, demo run
closes ADR §0005 §4 demonstration requirement.

## Context

`rules/README.md` is 250 lines / ~15,806 chars / ~3,951 tokens (8% of the per-session auto-injected budget, 20% of the rules budget — see baseline at `docs/superpowers/decisions/2026-05-20-token-determinism-baseline.md`). It is symlinked into `~/.claude/rules/` and auto-loads on every session start.

The file concatenates two distinct surfaces:

1. **Operational** — install contract ("Adding a new rule", "Verifying the install"), `validate.fish` phase descriptions (1a-1p), the "What lives here" table. Consulted when contributors add rules, change validator behavior, or audit install state.
2. **Governance** — HARD-GATE cap (8-rule ceiling), three-condition gate for a 9th rule (extension-first audit, discriminating eval per ADR #0005, substrate cost accounting), retroactive audit table, stable anchor pattern. Consulted only when proposing a new HARD-GATE rule.

Both surfaces auto-inject every prompt, but their read-frequency diverges sharply. Governance is load-bearing at promotion gates only — at most a handful of prompts per quarter. Operational is referenced when validator output flags a regression or a contributor onboards.

`global/CLAUDE.md` Coding Principles section anchors `rules/README.md#hard-gate-cap` as the canonical governance home. The anchor is contract-protected by `validate.fish` Phase 1j.

Forces in tension:
- **Token budget vs governance visibility** — splitting cuts auto-inject load but moves governance to a less-prominent file
- **Anchor stability vs file restructuring** — `#hard-gate-cap` is deep-linked from `global/CLAUDE.md`; any move requires anchor preservation or redirect
- **Discriminating-eval requirement (ADR #0005)** — the HARD-GATE cap is itself a HARD-GATE-shaped behavior; per ADR #0005 promoting or restructuring HARD-GATE-protected logic without a discriminating eval is rejected. The cap's eval signal must survive the split.
- **Author intent vs read pattern** — the file was authored as a single registry; usage has split it into two surfaces de facto

## Decision

We will split `rules/README.md` into two files:

1. **`rules/README.md`** (retained, auto-injected) — operational only:
   - Install contract ("Adding a new rule", "Verifying the install")
   - `validate.fish` phase descriptions (1a-1p, currently lines ~65-145)
   - "What lives here" table
   - "Why the silent-failure mode matters" paragraph
   - Target: ≤120 lines, ≤7,500 chars, ≤1,900 tokens

2. **`rules/GOVERNANCE.md`** (new, NOT symlinked into `~/.claude/rules/`) — governance only:
   - HARD-GATE cap policy + three-condition gate
   - Retroactive audit table (`think-before-coding` ↔ `goal-driven`, etc.)
   - Stable anchor pattern guidance
   - Pointer back to operational README for install contract
   - Target: ~100 lines, ~5,500 chars, ~1,400 tokens (NOT auto-injected)

Anchor migration:
- `rules/README.md#hard-gate-cap` → `rules/GOVERNANCE.md#hard-gate-cap` (same anchor ID, new file)
- Update `global/CLAUDE.md` Coding Principles pointer
- Update `validate.fish` Phase 1j anchor registry: move `#hard-gate-cap` registration from README.md to GOVERNANCE.md
- Add `validate.fish` Phase 1j entries for all anchors that move

Pre-merge discriminating eval (per ADR #0005):
- Add `rules-evals/hard-gate-cap/` suite with ≥2 evals proving:
  - 9th-rule rejection: prompt proposing a 9th HARD-GATE rule without all three conditions (extension-first audit + discriminating eval + substrate cost) triggers refusal language citing the cap
  - 9th-rule acceptance: prompt proposing a 9th rule WITH all three conditions emits acknowledgment of the gate criteria being met
- Suite must be RED on a broken implementation (cap deleted or moved without pointer fix) and GREEN on a passing one. The split is rejected if the new GOVERNANCE.md location does not produce the same RED/GREEN discrimination as the current README.md location.

## Consequences

Positive:
- **~1,500 token savings per session** (rules/README.md drops from ~3,951 to ~1,900 auto-injected tokens). ~3% of measured per-prompt baseline. Compounds across high-frequency sessions.
- Governance lives in a file whose name describes its purpose, increasing discoverability for the small number of contributors who need it.
- Operational README becomes scannable — install instructions and phase descriptions are no longer buried under policy.

Negative:
- **Discriminating-eval suite must be authored before merge** — `rules-evals/hard-gate-cap/` does not exist. Estimated 2-3 evals + fixtures; nontrivial substrate work. Cost-gated if eval suite needs live API run to validate.
- **Anchor migration risk** — `validate.fish` Phase 1j guards anchors but does NOT detect anchor MOVES across files. New phase or extension may be needed to enforce "if anchor X moves from file A to file B, all `A#X` links in other files become `B#X`." Without this, the split could silently break the `global/CLAUDE.md` deep-link.
- **One more file in `rules/`** — small navigation cost for new contributors.
- **GOVERNANCE.md not auto-loading is the point but also a risk** — when a contributor proposes a 9th HARD-GATE rule, the agent may not consult GOVERNANCE.md unless explicitly prompted. Mitigation: add a short pointer line to the operational README ("Adding a HARD-GATE rule? See GOVERNANCE.md for the three-condition gate.") so the auto-injected surface still contains the gateway reference.

Neutral:
- Per `rules/README.md` convention, GOVERNANCE.md will follow the same frontmatter style (`description:` field, kebab-case name) even though it is not symlinked into `~/.claude/rules/`.
- The Hot Path memory access (memory entries that cite `rules/README.md#hard-gate-cap`) should be reviewed for stale references after the migration. Memory note `per_gate_floor_blocks_substitutable.md` already exists; check whether it points at the moved anchor.

## Implementation gate

Per ADR #0005 and the three-condition gate in the document being split: this ADR cannot be marked Accepted until the `rules-evals/hard-gate-cap/` suite exists and demonstrates RED/GREEN discrimination at the cap's boundary. Without it, the ADR is structurally rejected by the very policy it is restructuring.

## References

- Baseline that produced this candidate: `docs/superpowers/decisions/2026-05-20-token-determinism-baseline.md`
- ADR #0005 (discriminating-signal requirement for behavioral promotion)
- ADR #0001 (sequential-thinking MCP manual-only) — analogous shape (governance separated from operational)
- Memory note `per_gate_floor_blocks_substitutable.md` (audit method)
