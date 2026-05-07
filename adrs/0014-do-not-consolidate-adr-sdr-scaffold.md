# ADR #0014: Do not consolidate `/adr` and `/sdr` scaffold procedures — extraction fails deletion test

Date: 2026-05-07

## Responsible Architect
Cantu

## Author
Cantu

## Contributors

* Claude (design partner)

## Lifecycle
Steady-state

## Status
Accepted (2026-05-07)

## Context

`skills/adr/SKILL.md` (125 lines) and `skills/sdr/SKILL.md` (140 lines) both scaffold numbered records in a project directory: search for an existing directory by priority list, increment the highest record number, copy a template, fill metadata. On first read this looks like a duplication candidate.

A `/improve-codebase-architecture` audit (2026-05-07) surfaced this as a deepening opportunity ([#285](https://github.com/chriscantu/claude-config/issues/285)). The audit proposed two paths:

- **Path A** — extract a shared `references/record-scaffold-procedure.md` consumed by both skills.
- **Path B** — merge into a single `/record <type>` dispatcher.

Grilling the candidate revealed the duplication was overstated. This ADR records the rejection so future audits do not re-suggest the same consolidation without new evidence.

## Re-assessment of "duplication"

| Element | adr | sdr | Truly shared? |
|---|---|---|---|
| Directory search | 5-step priority list, `adrs/` first | 4-step priority list, `sdrs/` first | Pattern shared, contents differ |
| Numbering algorithm | scan + increment + zero-pad + sub-numbers | same | **Yes — ~6 lines identical** |
| Template source | inline (L40-80, 41 lines) | external repo `~/repos/system-design-records/templates/` | **Fundamentally different** |
| HALT-on-missing | n/a | L65-71 | sdr-only |
| Supersede / list operations | yes | n/a | adr-only |
| Per-type routing to references/ | n/a | yes | sdr-only |

Templates — the visually-largest part of each skill — are not the duplication; they fundamentally differ (inline vs external repo). Genuine duplication is ~6 lines of numbering algorithm plus a shared *pattern* of "search dir1, dir2, ..., or ask" with different priority lists and contents.

## Driving concerns

- **Algorithm is small and stable.** Numbering hasn't changed since both skills were authored. Six lines is below the indirection threshold where deduplication pays.
- **Templates and lifecycle diverge.** ADR has supersede + list operations; SDR has HALT-on-missing canonical templates. Sharing a procedure encourages future drift in the wrong direction.
- **Deletion test fails.** Removing the duplication forces both skills to Read a shared procedure file every invocation. ~6 lines saved, 1 Read added per turn. Net neutral or worse.

## Options Considered

| # | Option | Effort | Risk | Reversible | Solves stated problem? |
|---|--------|--------|------|------------|------------------------|
| 1 | **Reject — document this decision (this ADR)** | tiny | low | yes | yes — decision recorded; future audit short-circuits |
| 2 | Path A (full): extract directory-search + numbering to `references/record-scaffold-procedure.md` | low | low | yes | partially — extracts ~15 lines, adds Read per invocation, indirection cost > win |
| 3 | Path A (numbering-only): extract just numbering | tiny | low | yes | partially — extracts ~6 lines; smaller win, smaller cost; still net neutral |
| 4 | Path B: merge into `/record <type>` dispatcher | high — ADR's inline-template + supersede + list make merger heavyweight | medium — speculative slash-command surface change | partial | overshoots — collapses unlike things |

## Decision

**Option 1: Reject the consolidation. Preserve current shape.**

Rationale:

1. **Deletion test fails.** Indirection cost equals or exceeds dedup win at current scale (~6 lines, stable algorithm).
2. **Pulling unlike things together.** ADR (inline template, supersede, list) and SDR (external repo, HALT-on-missing, per-type routing) have divergent strategies. A shared scaffold procedure encourages future drift toward false symmetry.
3. **Reversible.** If algorithm changes (e.g. switching to ULID, lock-based numbering for shared repos) OR `/record <type>` slash-command surface becomes desired for discoverability, this ADR will be superseded. See [Abort signal](#abort-signal) below.
4. **Karpathy #2 (Simplicity First).** The minimum that solves the stated problem ("future audits will re-suggest this") is documenting the rejection.

## Consequences

### Immediate

- `skills/adr/SKILL.md` and `skills/sdr/SKILL.md` retain their current independent scaffold procedures.
- Issue [#285](https://github.com/chriscantu/claude-config/issues/285) closed with reasoning.
- Future `/improve-codebase-architecture` audits citing this ADR can short-circuit re-evaluation unless an [abort signal](#abort-signal) fires.

<a id="abort-signal"></a>
### Abort signal — concrete triggers for reopening

This ADR is reversible only if reversal triggers are observable. Reopen with a superseding ADR when ANY of:

1. **Numbering algorithm change** — switch to ULID, addition of collision detection, lock-based numbering for shared-repo concurrent authors. At that point the algorithm grows beyond ~6 lines and extraction starts paying.
2. **`/record <type>` slash-command surface request** — a user (or audit) requests unification of the slash surface for discoverability reasons that outweigh the heavyweight merger cost.
3. **Project-wide aesthetic shift to zero-duplication-at-any-scale.** If the repo adopts a stricter dedup policy as a tenet, Option 3 (numbering-only extraction) becomes the cheapest path to compliance.
4. **A third record-type skill ships** (e.g. `/tdr` threat-decision-record, `/rfc`) with the same scan-and-number algorithm. Three sites breach the dedup threshold; extraction becomes worthwhile.

### What this ADR does NOT do

- Does not change skill behavior.
- Does not preclude future consolidation — explicitly defers it on observable triggers.
- Does not address other adr/sdr concerns (#155 ADR-vs-SDR ambiguity evals, #152 sdr silent-failure hardening) — those are separate.

## Validation

- [x] Issue [#285](https://github.com/chriscantu/claude-config/issues/285) closed with reasoning preserved
- [x] Abort signal defined with concrete observable triggers
- [x] Cross-references to related-but-separate concerns (#155, #152) preserved
- [x] No skill behavior changed

## References

- Issue [#285](https://github.com/chriscantu/claude-config/issues/285) — original audit candidate (closed: rejected)
- `/improve-codebase-architecture` skill — surfaced the candidate
- ADR template: [`adrs/0013-shared-vocab-monorepo-only.md`](0013-shared-vocab-monorepo-only.md) (structural reference only)
- Related (still open): [#155](https://github.com/chriscantu/claude-config/issues/155), [#152](https://github.com/chriscantu/claude-config/issues/152)
