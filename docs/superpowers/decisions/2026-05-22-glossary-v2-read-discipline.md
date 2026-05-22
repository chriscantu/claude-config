# Glossary v2 — Read-Discipline Scope Decision

**Issues:** [#324](https://github.com/chriscantu/claude-config/issues/324) (DTP / SA), [#325](https://github.com/chriscantu/claude-config/issues/325) (SDR / ADR / decision-challenger)
**Status:** Decision recorded, pre-implementation
**Date:** 2026-05-22
**Supersedes:** v1 deferral in [docs/superpowers/decisions/2026-05-15-glossary-skill.md § Out of scope](./2026-05-15-glossary-skill.md)
**Related:** [#319](https://github.com/chriscantu/claude-config/issues/319) (v1), [#321](https://github.com/chriscantu/claude-config/issues/321) (SDR write-offer), [#322](https://github.com/chriscantu/claude-config/issues/322) (ADR write-offer), [#323](https://github.com/chriscantu/claude-config/issues/323) (decision-challenger)

## Problem (one line)

v1 deferred read-discipline (whether consumer skills consult `./CONTEXT.md` before introducing terms) across all 5 candidate consumers; the gap drives redundant naming-conversation friction in SDR/ADR artifact production and risks term drift across skills.

## Decision (one line)

**Asymmetric read-discipline.** Read-on-section-completion for SDR and ADR (artifact-producing skills). No-read for DTP and SA (question-loop skills); v1 write-offer at end-of-skill remains sufficient. decision-challenger deferred to Phase C — agent-not-skill scoping question must resolve first.

## Per-skill matrix

| Skill | Shape | v1 state | v2 decision | Rationale |
|---|---|---|---|---|
| DTP | Question loop | write-offer (shipped) | no-read; write-offer unchanged | User prompt drives terms forward. Pre-reading CONTEXT.md before the five questions is speculative I/O — terms appear in user answers, not the prompt frame. Write-offer at end captures what mattered. |
| SA | Question loop | write-offer (shipped) | no-read; write-offer unchanged | Dependency mapping surfaces system names from user-described topology, not from CONTEXT.md. Read-on-entry would precede the conversation that produces the candidates. |
| SDR | Artifact producer | none | read-on-section-completion + write-offer | SDR sections (System Overview, Service Creation, Data Design, Blueprint) reference established systems. Reading CONTEXT.md after a section drafts flags term drift before the artifact ships. |
| ADR | Artifact producer | none | read-on-section-completion + write-offer | ADR Decision and Alternatives sections introduce option names that recur in adjacent ADRs. Reading CONTEXT.md after section drafts surfaces aliases / known canonical equivalents. |
| decision-challenger | Agent (not skill) | none | **deferred to Phase C** | Currently an agent under `agents/`, not a skill under `skills/`. Hook-attachment shape is unresolved; #323 explicitly notes "if/when added; otherwise the closest existing reviewer skill." Phase C scopes the attachment point separately. |

## Approach (asymmetric — option C)

### Shape match

Two skill shapes have different cost/benefit profiles for read-discipline:

- **Question-loop skills (DTP, SA)** — drive terms forward from user input. The prompt frame rarely contains the canonical term; the conversation does. Read-on-entry costs an I/O round before any term has appeared. Write-offer at end captures the converged terms after the user has named what mattered.
- **Artifact-producing skills (SDR, ADR)** — emit drafts referencing established systems. The skill author (you / the model) introduces terms in section drafts. Reading CONTEXT.md after a draft section catches drift before the artifact ships — exactly when the cost of inconsistency lands downstream.

### Read timing

**On section-completion**, not on entry. Reasons:

- Entry-time read precedes the section that introduces terms. The skill has nothing to compare yet.
- Section-completion read fires when the draft is concrete. The candidate-terms list is observable (the section just produced it).
- Mirrors the v1 write-offer contract (`--offer-from-caller=<name>`) — the read-side hook is the inbound dual of the existing outbound hook.

### Enforcement layer

**Soft (skill body)** for SDR and ADR. Reasons:

- HARD-GATE promotion bumps against the 8-rule cap policy (3-condition gate in `rules/GOVERNANCE.md`). Read-discipline is not a fundamental discipline like DTP / verification; it is a quality-of-life improvement gated by CONTEXT.md presence.
- Soft enforcement allows the skill to gracefully no-op when CONTEXT.md is absent (the >90% case) without rule-cap accounting.
- Promote to HARD-GATE only if Phase B evals show skip-rate that justifies the cap-cost.

## Out of scope

- Read-discipline for DTP / SA (decided no-read; covered above)
- decision-challenger attachment shape (Phase C — separate scoping)
- Stale-detection / verify-before-assert wrapper (deferred to v3 — see Risks below)
- HARD-GATE promotion of read-discipline (deferred until Phase B eval signal)
- Multi-repo / multi-CONTEXT.md resolution (v1 deferral stands)

## Implementation surface (Phase B, separate issues)

**Phase B touches** (when #321 and #322 are worked):

- `skills/sdr/SKILL.md` — add read-on-section-completion block; cite this decision doc
- `skills/adr/SKILL.md` — add read-on-section-completion block; cite this decision doc
- `skills/glossary/references/CALLER-HOOKS.md` — extend with SDR / ADR read-hook contract
- `skills/sdr/evals/evals.json` — add scenarios: present + match, present + no match, absent (silent no-op), malformed (silent no-op)
- `skills/adr/evals/evals.json` — same scenarios
- No new validator phase (Phase 1r / 1s already cover the eval-shape side)
- No `rules/` changes (soft enforcement)

**Phase C touches** (when #323 is worked):

- TBD — gated on resolving whether decision-challenger gets a SKILL.md, gets the hook attached to a reviewer skill, or stays as-is

## Risks

| Risk | Mitigation |
|---|---|
| Stale CONTEXT.md entries silently mislead SDR/ADR drafts | Phase B eval scenario: malformed / outdated entry yields no-op + diagnostic rather than substitution. Echoes `memory-discipline.md` HARD-GATE — file claims require verification |
| Read-cost in CONTEXT.md-less projects | Soft body check: skip read if file absent. Eval scenario covers the absent case. Cost = single `test -f`, negligible |
| Over-deference: skill stops asking necessary questions because CONTEXT.md "answered" | Phase B eval scenario: term appears in CONTEXT.md but section context disagrees → skill flags conflict rather than substitutes silently |
| 8-rule cap pressure if evals later demand HARD-GATE | Cap policy gate-keeps; if read-discipline ever needs HARD-GATE, the cap audit forces extension-vs-new-rule decision per `rules/GOVERNANCE.md` |

## Acceptance — closes #324 and #325

- [x] Decision recorded in `docs/superpowers/decisions/2026-05-22-glossary-v2-read-discipline.md`
- [x] DTP / SA: documented "no-read" rationale (write-offer sufficient)
- [x] SDR / ADR: documented "yes-read on section-completion" rationale + Phase B implementation surface
- [x] decision-challenger: documented "deferred to Phase C" rationale
- [x] Eval coverage plan named per skill (Phase B)
- [x] Enforcement layer chosen: soft (skill body), promotion gate documented

## Sequencing — what unblocks what

```
[this decision doc] ──┬──> #321 SDR write-offer + read-on-section-complete
                      ├──> #322 ADR write-offer + read-on-section-complete
                      └──> Phase C (#323 + decision-challenger scoping)
```

`#321` and `#322` can run in parallel after merge. `#323` is sequenced last and may be re-scoped based on agent-vs-skill resolution.

## Open questions for Phase B

- Should SDR's read-on-section-completion fire after EACH section, or once after the full artifact drafts? (Per-section gives faster term-drift signal; once-at-end is cheaper.) → Resolve in #321 brainstorming.
- Read-hook output format: list of {term, CONTEXT.md entry} pairs vs only-on-conflict surface? → Resolve in #321 brainstorming.
- Does the read hook block the artifact handoff, or run advisory? → Default advisory; revisit if evals show skip-rate.
