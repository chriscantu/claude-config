# Templates

Scaffolds for new repo artifacts. Use `bin/new-skill` (and future siblings)
to spawn a copy with the slug substituted and structural validation run.

## `skill/`

Scaffold for a new skill under `skills/<slug>/`. Spawn with:

```fish
bin/new-skill <slug>            # creates skills/<slug>/
bin/new-skill --dry-run <slug>  # print intended files, write nothing
```

### Frontmatter — required vs optional

| Field         | Required | Enforced by         | Notes |
|---------------|----------|---------------------|-------|
| `name`        | yes      | `validate.fish`     | Must equal directory name (kebab-case, lowercase) |
| `description` | yes      | `validate.fish`     | Loader uses for routing — audit triggers vs adjacent skills (#73) |
| `status`      | no       | convention only     | `experimental` \| `stable` \| `deprecated` (#76 may formalize) |
| `version`     | no       | convention only     | semver-ish; bump on behavioral change |
| `type`        | no       | upstream client     | Reserved per Anthropic Agent Skills spec; omit unless needed |

`name` + `description` are the only loader-required keys. Everything else is
client-defined and may be promoted to a HARD-GATE in `validate.fish` later
(see #76 for status field formalization).

### Status vocabulary

- `experimental` — new skill, no eval coverage yet, behavior may change. **Default.**
- `stable` — has at least one passing eval; behavioral contract is held.
- `deprecated` — kept for backward compat; superseded by another skill (name it).

### Body shape

Template lays out the recommended progressive-disclosure pattern (see
[#71](https://github.com/chriscantu/claude-config/issues/71)):

- Thin `SKILL.md` (announce, when-to-use, procedure, references)
- Depth lives in `references/<topic>.md`, read on demand
- `assets/` is **optional** per skill — create only when the skill ships
  static artifacts (templates, schemas, fixtures). Not scaffolded by default.

### Evals

Template includes:

- `evals/evals.json` — empty eval array with `_contract_note` stub
- `evals/README.md` — links to `tests/EVALS.md` rubric

Authoring contract:

- At least one eval before promoting `experimental` → `stable`
- HARD-GATE-promoted skills target ≥4 structural assertions per
  [ADR #0005](../adrs/0005-behavioral-adr-promotion-requires-discriminating-signal.md)
- See [#58](https://github.com/chriscantu/claude-config/issues/58) for the
  test-scenarios-per-skill rationale.

### After scaffolding

`bin/new-skill` runs `validate.fish` on the new skill. If validation fails,
the script exits non-zero and prints what's broken. Next steps the script
prints:

1. Fill the `description` triggers; audit overlap with adjacent skills.
2. Replace placeholder `<Skill Title>`, body paragraph, and section content.
3. Write the first eval in `evals/evals.json`.
4. Run `fish validate.fish` and `bun run tests/eval-runner-v2.ts <slug>`.
5. `bin/link-config.fish` to symlink into `~/.claude/skills/`.
