# Skill Frontmatter — Canonical and Non-Canonical Fields

## Anthropic-Documented Fields

Per [skill-creator/SKILL.md](https://github.com/anthropics/claude-plugins-official/blob/main/plugins/skill-creator/skills/skill-creator/SKILL.md) §"Write the SKILL.md", the documented set is:

| Field | Required | Purpose |
|---|---|---|
| `name` | yes | Skill slug, kebab-case |
| `description` | yes | Triggers + anti-triggers; ≤100 words; pushy language preferred |
| `compatibility` | optional | Platform/version constraints |

## Non-Canonical Fields (this repo)

Two fields appear in `claude-config` skill frontmatter that are NOT in Anthropic's documented set. They are de facto canonical for this repo. This doc explains semantics, enforcement point, and audit.

### `disable-model-invocation: true`

**Semantics.** Marks a skill as **slash-only** — Claude Code will not auto-invoke the skill from the description's trigger phrases. The user must type `/<skill-name>` explicitly.

**Enforcement point.** Claude Code harness (skill loader). The field is read at session start; skills with `disable-model-invocation: true` are excluded from the model's auto-trigger evaluation set but remain reachable via the `Skill` tool when invoked by name.

**When to set.** Skill is destructive, expensive, or mode-shifting enough that an undertriggered slash command beats a false-positive auto-invocation. Examples in this repo: orchestration skills (`/onboard`), discovery scans (`/architecture-overview`), creation flows (`/new-project`, `/stakeholder-map`).

**When to drop.** Skill is cheap, idempotent, and benefits from auto-trigger. Most authoring skills (writing, brainstorming, reviewing) leave the field absent.

**Failure mode if dropped on a slash-only skill.** Skill becomes auto-invokable. The model may trigger on description matches the author considered ambiguous. Mitigation: tighter `description` anti-triggers OR re-add the field.

### `status: experimental | stable | deprecated`

**Semantics.** Maturity signal for human readers. Not enforced by tooling today.

**Taxonomy.**

| Value | When |
|---|---|
| `experimental` | Recently shipped, eval coverage thin, breaking changes likely |
| `stable` | Eval coverage adequate, breaking changes require deprecation cycle |
| `deprecated` | Superseded; kept for backward-compat; cite the replacement in `description` |

**Enforcement point.** None — advisory. Future: `validate.fish` could refuse `experimental` skills past a maturity window, or require `deprecated` skills to name a successor. Not implemented (issue tracker).

**When to set.** New skill defaults to `experimental` (template at `templates/skill/SKILL.md`). Promote to `stable` after eval coverage passes a maturity bar (case-by-case judgment until automated).

## Audit (as of 2026-05-06)

### Skills using `disable-model-invocation: true`

- `skills/1on1-prep/SKILL.md`
- `skills/architecture-overview/SKILL.md`
- `skills/new-project/SKILL.md`
- `skills/present/SKILL.md`
- `skills/stakeholder-map/SKILL.md`
- `skills/swot/SKILL.md`
- `skills/tenet-exception/SKILL.md`

### Skills using `status:`

- `skills/architecture-overview/SKILL.md` — `experimental`
- `skills/onboard/SKILL.md` — `experimental`

Other skills omit the field entirely.

## Scaffolder Defaults

`templates/skill/SKILL.md` defaults `status: experimental`. It does NOT default `disable-model-invocation` — slash-only is an opt-in decision per skill, not a default.

To opt a new skill into slash-only, add the field manually after running `bin/new-skill <slug>`.

## Open Questions

- Should `validate.fish` warn on `status: experimental` skills missing eval coverage above some bar?
- Should `disable-model-invocation` be promoted to a documented Anthropic field upstream? (Tracking via skill-creator issues.)
