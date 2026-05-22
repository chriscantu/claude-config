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

## Considered options

| Option | Summary | Why rejected (or not) |
|---|---|---|
| **A. Yes-read uniform (soft)** | Add CONTEXT.md read at entry to all 5 consumers | Blunt — applies to DTP/SA where benefit is marginal. 5 skills × eval coverage. Stale-entry silent-failure surfaces × 5 |
| **B. No-read across the board** | Close #324/#325 with "won't fix" rationale; v1 write-offer is sufficient | Defers the question forever. Issues exist because the gap is real — SDR/ADR artifact term drift is observable, not hypothetical |
| **C. Asymmetric (chosen)** | Yes-read on section-complete for SDR/ADR; no-read for DTP/SA; defer decision-challenger | Shape-match. Contained blast radius. Closes both issues honestly |
| **D. Stale-detection wrapper** | Yes-read + verify-before-assert semantics across all 5 | Higher implementation cost; over-engineered for v2. Re-evaluate at v3 if stale-entry rate is observable in Phase B evals |

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

### Read timing — three options weighed

#325 asks: read on entry, on section-completion, or both?

| Timing | Cost | Benefit | Verdict |
|---|---|---|---|
| **On entry** | One I/O per skill invocation, even when CONTEXT.md is absent (>90% case) | Skill knows canonical vocab before producing anything | Rejected — precedes the section that introduces terms; nothing to compare against yet |
| **On section-completion (chosen)** | One I/O per section, only when section drafted | Candidate-terms list is observable from the draft; check fires when artifact is concrete | Chosen — fires when comparison is meaningful |
| **Both** | 2× I/O cost per skill invocation | Marginal — section-completion check already catches the case entry-read would catch | Rejected — pays double for the same signal |

Mirrors the v1 write-offer contract (`--offer-from-caller=<name>`) — the read-side hook is the inbound dual of the existing outbound hook.

### Source namespace

Read consults `./CONTEXT.md` only. `LANGUAGE.md` (architectural primitives — Module / Interface / Adapter / Seam, owned by `architecture-overview`) is a different namespace per v1 conflict rule and is out of scope. If a SDR/ADR section uses an architectural primitive ambiguously, that's a `LANGUAGE.md` concern handled separately.

### Cache coherence

Read-once per skill invocation. Skill does not re-read CONTEXT.md mid-section if the user edits the file during the run. Re-running the skill picks up changes. Phase B does NOT add invalidation logic — adds cost for a rare edge case.

### Memory-discipline coupling

`rules/memory-discipline.md` HARD-GATE requires that file/function/flag claims be verified before being asserted as current truth. CONTEXT.md term entries are file claims under the same discipline. SDR/ADR read-discipline MUST surface CONTEXT.md entries as candidates for the skill to compare against, NOT as canonical truth to substitute silently. The over-deference failure mode (skill stops asking because CONTEXT.md "answered") is the memory-discipline failure mode applied to glossary entries.

### Enforcement layer

**Soft (skill body)** for SDR and ADR. Reasons:

- HARD-GATE promotion bumps against the 8-rule cap policy (3-condition gate in `rules/GOVERNANCE.md`). Read-discipline is not a fundamental discipline like DTP / verification; it is a quality-of-life improvement gated by CONTEXT.md presence.
- Soft enforcement allows the skill to gracefully no-op when CONTEXT.md is absent (the >90% case) without rule-cap accounting.
- Promote to HARD-GATE only if Phase B evals show skip-rate that justifies the cap-cost.

### Rollback / promotion trigger

Re-open the HARD-GATE question when **either** holds:

- Phase B eval suite shows ≥20% skip-rate of the read-on-section-completion hook across the SDR + ADR eval scenarios (≥3 consecutive runs)
- ≥2 user reports of SDR/ADR shipping term-drift that CONTEXT.md would have caught

Either trigger fires the 3-condition cap audit per `rules/GOVERNANCE.md#hard-gate-cap`. Quiet quarter (no skip-rate, no user reports) = soft enforcement holds.

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
- `skills/sdr/evals/evals.json` — add scenarios: present + match, present + no match, absent (silent no-op), malformed (silent no-op). At least one scenario per skill MUST carry a `"tier": "required"` assertion per [ADR #0019](../../../adrs/0019-skill-eval-discriminating-signal-discipline.md) (Phase 1r blocks merge otherwise)
- `skills/adr/evals/evals.json` — same scenarios + same `tier: required` requirement
- No new validator phase (Phase 1r / 1s already cover the eval-shape side)
- No `rules/` changes (soft enforcement)

**Execution mode hint (Phase B):** ≥2 SKILL.md + ≥2 eval suites + 1 references file = 5 files. Per `rules/execution-mode.md`, this sits at the boundary between single-implementer and subagent-driven. Recommend single-implementer mode unless #321 and #322 are worked together (then subagent-driven applies — task count crosses the threshold).

**Phase C touches** (when #323 is worked): TBD per Phase C scope below.

## Phase C scope (decision-challenger)

Phase C is deferred but the question Phase C must answer is bounded. Three options:

| Option | Shape | Cost | Trade-off |
|---|---|---|---|
| **(a) Promote to skill** | Create `skills/decision-challenger/SKILL.md`; attach hook normally | Highest — full skill scaffold + frontmatter + evals + validate.fish coverage | Cleanest. Brings decision-challenger under the skill discipline (eval requirements, structural validation) |
| **(b) Attach to nearest reviewer skill** | Pick existing reviewer skill (TBD which); add hook there | Medium — 1 SKILL.md edit + eval scenarios | Pragmatic. Avoids new skill creation; couples decision-challenger output to whichever skill takes the hook |
| **(c) Accept no-hook** | Document that decision-challenger as an agent does not participate in read-discipline | Lowest — single line in this doc + #323 close | Defers indefinitely. Term confusion between challenger and decision author remains the failure mode CONTEXT.md is supposed to prevent |

Phase C kickoff runs DTP to decide between (a)/(b)/(c) with eval-signal evidence from Phase B as input.

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
- [x] decision-challenger: documented "deferred to Phase C" rationale, with 3 candidate scopes named
- [x] Eval coverage plan named per skill (Phase B): present + match / present + no match / absent / malformed; ≥1 `"tier": "required"` per skill per [ADR #0019](../../../adrs/0019-skill-eval-discriminating-signal-discipline.md)
- [x] Enforcement layer chosen: soft (skill body); HARD-GATE promotion trigger named (≥20% skip-rate over 3 runs OR ≥2 term-drift reports)
- [x] Considered alternatives enumerated (A/B/C/D) with rejection rationale
- [x] Read timing alternatives weighed (entry / section-complete / both)
- [x] memory-discipline coupling cited (verify before assert)

## Sequencing — what unblocks what

```
[this decision doc] ──┬──> #321 SDR write-offer + read-on-section-complete
                      ├──> #322 ADR write-offer + read-on-section-complete
                      └──> Phase C (#323 + decision-challenger scoping)
```

`#321` and `#322` can run in parallel after merge. `#323` is sequenced last and may be re-scoped based on agent-vs-skill resolution (see Phase C scope above).

## Phase B preconditions — must resolve at Phase B kickoff

These questions are unresolved here. They affect Phase B brainstorming and shape implementation. Resolve before writing code.

- **Per-section vs once-at-end read?** SDR has 4 sections; ADR has Decision + Alternatives. Per-section fires the hook 4× (SDR) / 2× (ADR) per skill run. Once-at-end is cheaper but loses incremental drift signal. → Resolve in #321 + #322 brainstorming. Default proposal: per-section for SDR (4 distinct artifact types), once-at-end for ADR (decision is one cohesive unit).
- **Read-hook output format.** List of `{term, CONTEXT.md entry}` pairs surfaced inline vs surface only on conflict. → Resolve in #321 + #322 brainstorming. Default proposal: only-on-conflict — reduces noise; pairs full list under `/glossary --list` if user wants it.
- **Blocking vs advisory.** Does the read hook block artifact handoff, or run advisory? → Default advisory; revisit if Phase B evals show skip-rate per the promotion trigger above.
