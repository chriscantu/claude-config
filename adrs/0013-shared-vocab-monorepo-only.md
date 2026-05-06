# ADR #0013: `references/architecture-language.md` shared across `/architecture-overview` and `/improve-codebase-architecture` — monorepo-only, `.skill` packaging deferred

Date: 2026-05-06

## Responsible Architect
Cantu

## Author
Cantu

## Contributors

* Claude (design partner)

## Lifecycle
Steady-state

## Status
Accepted (2026-05-06)

## Context

`references/architecture-language.md` defines canonical architectural vocabulary (Module / Interface / Seam / Adapter / Depth / Leverage / Locality). Two skills consume it via repo-relative deep-links:

- [`skills/architecture-overview/SKILL.md`](../skills/architecture-overview/SKILL.md) — line 42 references `../../references/architecture-language.md`
- [`skills/improve-codebase-architecture/SKILL.md`](../skills/improve-codebase-architecture/SKILL.md) — lines 48, 66, 119 reference `../../references/architecture-language.md`

The shared file is **intentionally single-source**. Vocabulary IS the integration contract between the two skills (issue #44, #226 lineage). Drift between two copies would corrupt both skills' outputs (one calls a `Seam` what the other grades against `Adapter`, etc.).

This layout violates Anthropic skill anatomy ([skill-creator/SKILL.md](https://github.com/anthropics/claude-plugins-official/blob/main/plugins/skill-creator/skills/skill-creator/SKILL.md) §"Anatomy of a Skill"), which has no shared-references concept — each skill is meant to be self-contained inside its bundle directory. Anthropic's reference packager (`scripts/package_skill.py`) does not follow `../../` references; if invoked against either skill today, it would ship a `.skill` bundle missing the vocab file.

Architect review post-#233 (R2) flagged this as a portability defect requiring a documented decision. Issue #239 enumerated four options.

## Driving concerns (engineer-stated)

- **No Python in this repo.** Anthropic's reference packager is `package_skill.py`. If portability becomes load-bearing, the local equivalent must be TS/Bun. See [Consequences §Future packaging](#future-packaging).
- **Monorepo today, not packaged.** No `.skill` is produced from this repo today. The portability defect is theoretical, not blocking.
- **Vocab drift is the real failure mode.** A single source preserves the integration contract; copy-based options invent a new failure surface (drift detection).

## Options Considered

| # | Option | Effort | Risk | Reversible | Solves stated problem? |
|---|--------|--------|------|------------|------------------------|
| 1 | **Accept — document monorepo-only** | tiny (this ADR + 1 contributor note + 1 file-header line) | low | yes | yes — decision recorded, packaging deferred |
| 2 | Inline references at package time | medium — requires new TS/Bun packager (Anthropic's is Python; out per concern above); inlining `../../` paths is non-trivial | medium — new tooling = new bugs | yes | no — solves a hypothetical, not actual, problem |
| 3 | Duplicate file into both bundles + add `validate.fish` drift phase | medium — copy + new validate phase | medium — drift gate is imperfect; relies on humans noticing CI failure | yes | yes, but premature |
| 4 | Promote to a sibling skill (`/architecture-language`) the other two depend on | high — Anthropic does not document a skill-dependency mechanism; would need to invent one | high — speculative | partial | no — speculative ground |

## Decision

**Option 1: Accept the monorepo-only design.** Document the constraint; defer packaging tooling until a real packaging need exists.

Rationale:

1. **No real defect today.** No packager exists; no `.skill` is shipped from this repo. The "broken bundle" is hypothetical.
2. **Karpathy #2 (Simplicity First).** Minimum that solves the stated problem. The stated problem is "the decision needs to be documented" — Option 1 documents it.
3. **Vocab single-source is load-bearing.** Options 2 / 3 / 4 each introduce drift surfaces or speculative tooling for a problem nobody is hitting. Option 1 preserves the integration contract intact.
4. **Reversible.** If `.skill` packaging becomes load-bearing, this ADR will be superseded by one selecting Option 2 or 3 (Option 4 stays speculative until Anthropic documents skill dependencies).
5. **No Python.** If a packager is later built, it must be TS/Bun. This ADR records the constraint so the future ADR doesn't accidentally pull in `package_skill.py`.

## Consequences

### Immediate

- New header note in [`references/architecture-language.md`](../references/architecture-language.md): single-source, monorepo-only, `.skill`-bundle hostile.
- New section in [`docs/contributing.md`](../docs/contributing.md): cross-bundle reference policy (when allowed, what trade-off this ADR accepted).
- Both consuming SKILL.md files are unchanged — their `../../references/...` deep-links remain canonical for this repo.

### Future packaging

If `.skill` packaging becomes load-bearing:

- The packager MUST be TypeScript/Bun, not Python (per repo convention; not negotiable in scope of this ADR).
- The packager MUST handle the `../../references/architecture-language.md` case explicitly. Two viable strategies remain (Options 2 and 3 above); a follow-up ADR picks between them at that time, with concrete data on packaging frequency, drift incidents, and tooling cost.
- Until then, no `package_skill.py`-style tool ships from this repo, and packaging-shaped issues against either skill are rejected with a pointer to this ADR.

### What this ADR does NOT do

- Does not change skill behavior.
- Does not preclude future packaging — explicitly defers it.
- Does not add a `validate.fish` phase. (No copies to drift-check today.)

## Validation

- [x] Both consuming SKILL.md files reference the shared file via documented deep-link path
- [x] Header note added to canonical vocab file warning of the monorepo coupling
- [x] Contributor doc explains the cross-bundle policy
- [x] No Python introduced

## References

- Issue [#239](https://github.com/chriscantu/claude-config/issues/239) — R2 of architect review post-#233
- ADR template: [`adrs/0012-fish-test-migration-policy.md`](0012-fish-test-migration-policy.md) (structural reference only)
- Anthropic skill-creator: [`skill-creator/SKILL.md`](https://github.com/anthropics/claude-plugins-official/blob/main/plugins/skill-creator/skills/skill-creator/SKILL.md) §"Anatomy of a Skill"
- Vocab lineage: issues #44, #226
