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

After prompt 11: append-only write `[YYYY-MM-DD][coverage:met] <context if any>`.
Every bootstrap counts as a meeting event.

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
   `timeMin` = N days ago, `timeMax` = now. If Calendar MCP is unavailable, warn
   and offer to continue with manual bootstrap only.
2. Extract unique attendee email/name pairs, excluding the current user.
3. For each candidate, `search_nodes` against the graph.
   - Match found: skip by default (user can override in step 5).
   - Not found: include in picklist.
4. Present picklist with three options per row: `[add]`, `[skip]`, `[seen-but-skip]`.
5. For each `[add]`: run the manual form above, pre-filled with name from the
   calendar entry.
6. For each `[seen-but-skip]`: create the entity if missing, and append
   `[YYYY-MM-DD][context] seen via calendar, not tracked`. This prevents the name
   from reappearing on the next seed run.

## Upgrade Flow (from 1on1-prep entity)

When the manual form's name-lookup matches an entity that has 1on1-prep tags
(`[1on1]` or `[context]`) but no stakeholder-map tags:

> "{name} exists with 1on1-prep data. Add stakeholder fields? [yes/no/skip]"

If yes: skip prompts 1-2 (name/role stay as recorded) and run prompts 3-11.

## Progressive Rendering

After every 5 successful per-stakeholder completions, offer to re-render:

> "Added 5 stakeholders. Render chart now? [yes/no]"

Explicit `/stakeholder-map --render` command triggers a render on demand.

## Idempotence

Running Mode A a second time on the same graph adds or updates without wiping:
- Replaceable tags overwrite via the protocol above.
- Append-only observations (`[advice]`, `[coverage:met]`) accumulate.
- Relations are only created if missing; duplicates are not re-created.

## MCP-Unavailable Fallback

If memory MCP check from SKILL.md failed, every add/update write in this file
routes to `pending-sync/YYYY-MM-DD-<person-lowercase>.md` instead, using the
1on1-prep file format (one observation per line, prefixed with `- `).
