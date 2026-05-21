# ADR #0018: Distribution shape — hybrid Claude Code plugin (marketplace) + git-clone power-user path

Date: 2026-05-21

## Responsible Architect
Cantu

## Author
Cantu

## Contributors

* Claude (design partner)

## Lifecycle
Pilot

## Status
Proposed

## Context

Supersedes [ADR #0013](./0013-shared-vocab-monorepo-only.md) on the narrow ground of abort signal #4 ("Anthropic packager standardization"). #0013's vocab-file decision (Option 1: monorepo-only for `references/architecture-language.md`) remains valid within its original scope — cross-skill shared references inside a single bundle. This ADR addresses the broader distribution-shape question that issue [#374](https://github.com/chriscantu/claude-config/issues/374) conflated with #0013.

Forces in tension:

- **Audience-install mismatch.** Repo substance (anti-sycophancy baseline, HARD-GATE planning pipeline, leadership toolkit skills `/sdr` `/adr` `/tech-radar` `/onboard` `/stakeholder-map` etc.) targets VPs and Senior Directors. Install path today is `git clone` + fish shell + symlink scripts (`bin/link-config.fish`). The two are not addressed to the same user.
- **Anthropic plugin marketplace is now live.** Plugin format (`./skills/`, `./agents/`, `./commands/`, `hooks.json`, `.mcp.json`, `settings.json`) is the documented and widely-used distribution mechanism for Claude Code extensions. ADR #0013's abort signal #4 fires on this trigger.
- **Plugin spec has no `rules/` slot.** The `~/.claude/rules/*.md` autoload mechanism this repo depends on is not part of Anthropic's plugin anatomy. The HARD-GATE preamble (per [`rules/planning.md` Architectural Invariant](../rules/planning.md#architectural-invariant)) requires rules to load BEFORE any skill so a skill cannot catch its own failure-to-load. Encoding rules as skills loses pre-load semantics — the load-bearing enforcement model.
- **Validator and governance are bespoke.** `validate.fish` (Phase 1a–1q), `rules-evals/`, `bin/link-config.fish`, `bin/verify-rule-loaded.fish`, ADR/SDR governance docs, and `adrs/` itself have no plugin slot. They are contributor-facing tooling, not runtime extension surface.
- **Current state of `.claude-plugin/plugin.json` is incomplete.** Declares only `./skills/`. Does not enumerate agents, commands, hooks, or MCP servers. `.claude-plugin/hooks.json` contains leftover references to a foreign plugin (`claude-code-harness`); requires cleanup before publish.
- **Competing configs are landing in marketplace.** Each week of deferral cedes mindshare and the canonical-vocabulary slot to other publishers.

## Alternatives Considered

| # | Option | Effort | Risk | Reversible | Audience-install gap closed? |
|---|--------|--------|------|------------|------------------------------|
| 1 | **Stay git-clone-only** (reaffirm #0013) | none | none today | n/a | no — status quo; leadership audience cannot install via fish + symlink chain |
| 2 | **Plugin-only** — encode rules as skills, or embed rule content into a single `CLAUDE.md` import | high — requires rewriting HARD-GATE pre-load semantics into lazy-load skill semantics; loses `~/.claude/rules/*.md` autoload | high — pre-load enforcement model dies; `validate.fish` phase coverage breaks; ADR governance loses contributor surface | partial — rules-as-skills is hard to unwind | yes for surface, no for substance — audience gets skills but the discipline that makes them load-bearing is gone |
| 3 | **Hybrid — plugin (audience) + git-clone (power-user)** (selected) | low–medium — `.claude-plugin/plugin.json` expand, `hooks.json` cleanup, README restructure; no runtime semantics change | medium — version skew between two distribution channels; HARD-GATE absence from plugin path must be stated explicitly to avoid silent fork-consumer hostility | yes — both paths preserved | yes — leadership audience gets zero-friction plugin; power-user path stays for contributors and full enforcement |
| 4 | **Wait for Anthropic to add a `rules` slot to plugin spec** | none | none today | n/a | no — indefinite hold; cedes mindshare and canonical-vocabulary marketplace position to competing configs |

Option 3 wins on the audience-install gap dimension without paying Option 2's pre-load enforcement cost. Options 1 and 4 fail trigger #4 from ADR #0013 (Anthropic packager standardization) — the abort signal that reopened this question is incompatible with both.

## Decision

We will ship a hybrid distribution:

1. **Plugin path (default for audience):** Publish a Claude Code plugin via marketplace. Bundle includes skills + agents + commands + hooks + MCP server declarations. Plugin install is the documented default in README.
2. **Power-user path (preserved):** `git clone` + `bin/link-config.fish` remains supported and documented. This path additionally installs `~/.claude/rules/*.md` HARD-GATEs, exposes `validate.fish` for contributors, and includes ADR governance and rules-evals tooling. Required for anyone who wants the HARD-GATE pre-load enforcement model.
3. **`.claude-plugin/plugin.json` expands** from skills-only to enumerate every plugin-shaped surface the repo ships: skills, agents, commands, hooks, MCP servers. Foreign `claude-code-harness` references in `hooks.json` are removed.
4. **README install section is restructured** to document both paths with explicit trade-off statement: plugin path covers the runtime extension surface (skills, agents, commands, hooks, MCP); HARD-GATE rules and validator tooling require the power-user path.
5. **No skill-encoding of rules.** Rules stay as `~/.claude/rules/*.md` autoload. Until Anthropic's plugin spec adds a `rules` slot, the pre-load enforcement model is git-clone-only.

This ADR supersedes [ADR #0013](./0013-shared-vocab-monorepo-only.md) ONLY on the question of whole-repo packaging direction. #0013's Option 1 decision for the shared vocab file remains intact under the hybrid model — the plugin path bundles `references/architecture-language.md` inside the skills directory, and the monorepo-only header note remains accurate for that file.

## Consequences

### Positive

- Closes the largest audience-install gap. VPs / Sr. Directors can install from marketplace with zero fish-shell or symlink ceremony.
- Marketplace discoverability replaces git-clone friction. Plugin uninstall is one click — reversibility is restored.
- README distribution shape becomes legible to non-engineer users.
- ADR #0013's abort signal #4 is now formally answered rather than implicit.
- `.claude-plugin/plugin.json` cleanup forces a manifest of what the repo actually ships.

### Negative

- HARD-GATE rules are NOT in the plugin install. Audience using the marketplace path gets the leadership toolkit but does not get the pre-load enforcement that makes the planning pipeline load-bearing. This is the primary trade-off of the hybrid shape and must be stated explicitly in the README — silent omission would be a fork-consumer hostility regression (see [ADR #0013 §Fork-consumer hostility](./0013-shared-vocab-monorepo-only.md#fork-consumer-hostility-named-consequence)).
- Documentation cost: README now describes two install paths instead of one.
- Version-skew risk: plugin ships skill updates via marketplace cadence; git-clone ships rule + validator updates via main-branch cadence. The two surfaces can diverge between installs.
- First-run friction for the plugin path is unmeasured. Acceptance criterion below requires the spike to measure it before declaring the plugin "shipped" to a non-engineer audience.
- Foreign-plugin contamination in `.claude-plugin/hooks.json` is a publish blocker that must be resolved before any marketplace submission.
- Marketing surface (website, demo video) and multi-platform install (Windows) remain out of scope per issue #374 § Out of scope. The hybrid decision does not address them.

### Neutral

- This ADR does not commit to a specific marketplace publish date. The spike (issue #374 step 2) measures first-run friction; results feed a follow-up ADR or this ADR's validation block.
- Skill `/architecture-overview` and `/improve-codebase-architecture` continue to share `references/architecture-language.md` per ADR #0013 Option 1. The plugin bundle includes that file alongside both skills.
- Plugin name remains `claude-config` (per existing `plugin.json`). Rebranding (e.g., `leadership-toolkit`) is a separate decision; this ADR does not relitigate naming.
- If Anthropic later adds a `rules` slot to plugin spec, a follow-up ADR can collapse the hybrid into a single plugin path. The hybrid shape is the minimum that works today, not the eventual target.

<a id="abort-signal"></a>
### Abort signal — concrete triggers for reopening

Reopen with a superseding ADR when ANY of:

1. **First-run friction is unacceptably high after spike.** If non-engineer users cannot complete the plugin install + first-skill invocation in under 5 minutes without engineer assistance, the plugin path is not yet delivering the audience promise — pause publish, revisit packaging shape.
2. **Anthropic adds a `rules` slot to plugin spec.** Hybrid becomes obsolete; collapse to single plugin path.
3. **Plugin/git-clone version skew causes a user-visible defect.** Skill behavior in one path diverges from the other in a way users hit. Re-evaluate single-source vs hybrid.
4. **Marketplace publish is rejected or de-listed.** External constraint forces a different distribution channel; this ADR no longer describes reality.

## Validation

- [ ] `.claude-plugin/plugin.json` enumerates skills, agents, commands, hooks, MCP servers
- [ ] `.claude-plugin/hooks.json` foreign `claude-code-harness` references removed
- [ ] README install section documents both paths with explicit trade-off statement
- [ ] Plugin bundle audited — confirm each skill, agent, command, hook is loadable from a fresh `~/.claude/plugins/` install
- [ ] First-run friction measured: time + steps from marketplace install to first successful skill invocation
- [ ] ADR #0013 Status field updated to reference this ADR on the distribution-shape question (vocab-file decision unchanged)

## References

- Issue [#374](https://github.com/chriscantu/claude-config/issues/374) — Rank 1/10 Architectural Audit, distribution gap
- ADR [#0013](./0013-shared-vocab-monorepo-only.md) — superseded on distribution-shape question only; vocab-file Option 1 decision preserved
- [`rules/planning.md` Architectural Invariant](../rules/planning.md#architectural-invariant) — pre-load enforcement model for HARD-GATE rules
- Anthropic skill-creator: [`skill-creator/SKILL.md`](https://github.com/anthropics/claude-plugins-official/blob/main/plugins/skill-creator/skills/skill-creator/SKILL.md) §"Anatomy of a Skill"
- ADR [#0015](./0015-split-rules-readme-governance-from-operations.md) — governance split; relevant to where the README install-path restructure lands
