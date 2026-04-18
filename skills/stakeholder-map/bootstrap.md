# Stakeholder-Map — Bootstrap Flow (Mode A: leader-onboarding)

Three entry variants, one shared form.

## Entry Variants

| Variant | Trigger | Behavior |
|---------|---------|----------|
| Full bootstrap | `--mode=leader-onboarding` with empty/sparse graph | Walk the manual form per stakeholder. Loop until user exits. |
| Resume | `--mode=leader-onboarding` with populated graph | Ask: "Add new, update existing, or upgrade a 1on1-prep entry?" Dispatch accordingly. |
| Calendar seed | `--mode=leader-onboarding --seed-from-calendar [--days=N]` | Attendee picklist precedes the manual form. |

## Per-Stakeholder Manual Form

Ask prompts one at a time. Prefer multiple-choice where possible.

1. **Full name** (free text).
   - `search_nodes(<name>)` — exact match → load; substring → ask to disambiguate;
     none → new entity.
   - On new: `create_entities([{ name, entityType: "Person" }])`.

2. **Role** (full job title, free text) →
   `add_observations([{ entityName, contents: ["[YYYY-MM-DD][context] <title>"] }])`.

3. **Role axis** (choice: manager / ic / exec / staff) →
   replaceable write of `[YYYY-MM-DD][role:<axis>]`. See
   [graph-schema.md](graph-schema.md) for the extensibility policy if a new
   value is needed.

4. **Function** (choice: engineering / product / design / data / security / sre) →
   replaceable write of `[YYYY-MM-DD][function:<name>]`.

5. **Team** (free text) → replaceable write of `[YYYY-MM-DD][team:<name>]`.

6. **Category** (choice: direct_report / skip / peer / skip_up / cross_functional) →
   replaceable write of `[YYYY-MM-DD][category:<type>]`.

7. **Tenure** (choice: long / new) →
   replaceable write of `[YYYY-MM-DD][tenure:<axis>]`.

8. **Formal power** (choice: high / medium / low) →
   replaceable write of `[YYYY-MM-DD][power:formal:<level>]`.

9. **Informal power** (choice: high / medium / low / skip) —
   skippable if unknown on day 1 → replaceable write of
   `[YYYY-MM-DD][power:informal:<level>]` if provided.

10. **Advice captured?** (optional free text) — if provided, append-only write
    `[YYYY-MM-DD][advice] <verbatim text>`.

11. **Relations** (each optional):
    - Reports to? → `create_relations([{ from, to, relationType: "reports_to" }])`
      only if target entity exists.
    - Informal reports to? → `reports_to_informally`.
    - Influences? → `influences`.

After prompt 11: append-only write `[YYYY-MM-DD][coverage:met] bootstrap intake`.
Every bootstrap counts as a meeting event — the text is fixed (`bootstrap intake`)
so freshness signals are not inflated by optional context text. If the user has
already logged a real meeting with this stakeholder today, omit this write and
instead add `[YYYY-MM-DD][context] bootstrap intake, real meeting already logged`.

## Replaceable-Tag Write Protocol

See [graph-schema.md](graph-schema.md) for the full sequence. Summary:

1. `search_nodes(entityName)` and filter observations by tag prefix
   (e.g. `[power:formal:`).
2. `delete_observations` on matches.
3. `add_observations` with the new value.

On step-3 failure after step-2 success: surface "Prior tag deleted but new tag
failed to write" and prompt the user to retry.

## Calendar-Seed Variant

When `--seed-from-calendar [--days=N]` (default N=30):

1. `mcp__5726bf10-7325-408d-9c0c-e32eaf106ac5__list_events` with
   `timeMin` = N calendar days ago (UTC), `timeMax` = now. If Calendar MCP is
   unavailable, warn and offer to continue with manual bootstrap only.
2. Extract attendee records, excluding the current user. **Dedupe key:**
   lowercased email address. Display label = first-seen display name for that
   email. Attendees without an email (rare) dedupe on lowercased name and are
   flagged as "no-email" in the picklist.
3. For each candidate, `search_nodes` against the graph:
   - Match found: show in picklist with a `[matched]` marker; default action is
     `[skip]`.
   - Not found: include in picklist with default action `[add]`.
4. Present picklist with four options per row: `[add]`, `[skip]`, `[seen-but-skip]`,
   `[upgrade-existing]` (the last only when matched and the entity lacks
   stakeholder-map tags).
5. For each `[add]`: run the manual form above, pre-filled with name from the
   calendar entry.
6. For each `[seen-but-skip]`: create the entity if missing, and append
   `[YYYY-MM-DD][context] seen via calendar, not tracked`. This prevents the name
   from reappearing on the next seed run.
7. For each `[upgrade-existing]`: run the upgrade flow (see below).

## Upgrade Flow (from 1on1-prep entity)

When the manual form's name-lookup matches an entity that has 1on1-prep tags
(`[1on1]` or `[context]`) but no stakeholder-map tags:

> "{name} exists with 1on1-prep data. Add stakeholder fields? [yes/no/skip]"

If yes: skip prompt 1 (name stays as recorded). For prompt 2, verify at least one
`[context]` observation already records a role/title; if none exists, still ask
prompt 2 before proceeding. Then run prompts 3-11.

## Progressive Rendering

Maintain a per-session counter. Increment by 1 on each successful completion of
prompt 11 (full form, upgrade flow, or calendar-seeded add — `seen-but-skip`
does NOT increment). The counter resets to 0 when the skill exits (a new
`/stakeholder-map` invocation starts at 0).

After every 5 increments, offer to re-render:

> "Added 5 stakeholders. Render chart now? [yes/no]"

Explicit `/stakeholder-map --render` command triggers a render on demand and does
not reset the counter.

## Idempotence

Running Mode A a second time on the same graph adds or updates without wiping:
- Replaceable tags overwrite via the protocol above.
- Append-only observations (`[advice]`, `[coverage:met]`) accumulate.
- Relations are only created if missing; duplicates are not re-created.

## MCP-Unavailable Fallback

If memory MCP check from SKILL.md failed, every add/update write in this file
routes to `pending-sync/YYYY-MM-DD-<person-lowercase>.md` instead. The file
uses the line-prefix format defined in [SKILL.md](SKILL.md) under
"`--sync` semantics":

- Entity creation → `- ent: <name>`
- Observation writes → `- obs: <name> :: [YYYY-MM-DD][tag]... <text>`
- Relation writes → `- rel: <from> --<relationType>--> <to>`

Replaceable-tag writes in offline mode append a new `- obs:` line for the new
value AND a `- del: <name> :: [YYYY-MM-DD][<prefix>]` line marking the prefix to
clear on replay. `--sync` processes `del` lines by running the replaceable-tag
write protocol before applying the following `obs` line.
