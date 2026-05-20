---
name: Per-gate floor blocks are substitutable, not layered
description: In claude-config rules/, floor pattern (emission contract + Bash sentinel probe + Skill invocation) replicated across gates is model-generalized from any single anchor — per-gate duplication adds zero eval-measurable load
type: project
originSessionId: 09db7f5c-436e-4227-a6d0-faeba9ba36bd
---
Per-gate pressure-framing floor blocks were duplicated across 5 dependent rules
(fat-marker-sketch, goal-driven, pr-validation, execution-mode, think-before-coding)
despite ADR #0006 / #0007 and the 2026-04-24 inverse-RED audit demonstrating
they add no eval-measurable load given the single DTP anchor in planning.md.

The substitutability claim is historical evidence backing the pruned design,
not a recommendation for future per-gate blocks. New gates should follow the
delegate-link pattern from the outset.

## Status (2026-05-20)

Override + time-pressure + emission boilerplate consolidated to canonical
anchors in `rules/planning.md` (`#override-skip-contract`,
`#emission-contract-per-gate`) by PR #350 (commit `c8edebf`). Net delete
~54 lines across 4 rules (fat-marker-sketch.md, goal-driven.md,
pr-validation.md, think-before-coding.md). Phase 1l registry expanded
with both anchor IDs; HARD-GATE eval suite passed unchanged post-prune.

Substitutability hypothesis CONFIRMED in practice. This memory is now
historical reference for the design decision, not active guidance —
delete or migrate to `decisions/` if it stops earning its keep.
