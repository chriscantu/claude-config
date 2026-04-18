# Stakeholder-Map — `--sync` Drain Semantics

Invoked via `/stakeholder-map --sync`. Drains files in
`skills/stakeholder-map/pending-sync/` into the memory graph after MCP
availability returns.

## Line Format

Each pending-sync line begins with a type sigil. Lines are processed in file
order. Lines that do not match are surfaced as errors; `--sync` does NOT
silently skip.

| Sigil | Format | Action |
|-------|--------|--------|
| `- ent:` | `- ent: <entityName>` | `create_entities` with `entityType: "Person"` if missing; no-op otherwise. |
| `- obs:` | `- obs: <entityName> :: [YYYY-MM-DD][tag]... <text>` | `add_observations`. Creates the entity first if missing. |
| `- del:` | `- del: <entityName> :: [<prefix>]` | Run the [replaceable-tag write protocol](graph-schema.md#replaceable-tag-prefix-matching) for the prefix on the entity (deletes all matching observations). Used to mark replaceable-tag rewrites; typically followed by a matching `- obs:` line carrying the new value. |
| `- rel:` | `- rel: <from> --<relationType>--> <to>` | `create_relations` when both entities exist. If either end is missing: append a `- obs: <from> :: [YYYY-MM-DD][context] pending relation <relationType> to <to>, target missing` line to a new pending-sync file and continue (do not fail the drain). |

## Line Authoring Rules

Hand-authored pending-sync files must follow these rules exactly. Malformed
lines are rejected, not coerced:

- Exactly one space after the sigil colon and before each field separator.
- The `::` separator between entity name and content uses exactly ` :: ` (space,
  two colons, space).
- The relation arrow uses exactly `--<relationType>-->` with no spaces inside
  the dashes.
- Dates use the canonical `[YYYY-MM-DD]` prefix format from graph-schema.md.
- A `- del:` line on a replaceable tag prefix MUST be followed (on the next
  non-blank, non-comment line) by a `- obs:` line carrying the replacement
  value for that same entity and prefix. A `- del:` without a following
  matching `- obs:` is an error — `--sync` refuses to process the file and
  reports the line number.

## Partial-Replay Semantics

Mid-file failure leaves the pending-sync file in place with some lines already
applied to the graph. Re-running `--sync` is:

- **Safe for `ent`, `obs`, `rel`** — these are idempotent at the MCP layer
  (duplicate entity creation is a no-op; duplicate observation text is
  deduplicated by memory MCP; duplicate relations are not re-created).
- **Unsafe for `del`** — re-running a `del` line after the graph has already
  had the prefix deleted is harmless in isolation, but if the following `obs`
  line is missing or mis-ordered the tag is left unset. `--sync` handles this
  by processing each `del` + following `obs` pair **atomically**: both succeed
  or the pair is rolled back by re-writing whatever value was present before
  `del` ran (captured by reading the entity's observations for the prefix
  immediately before issuing `delete_observations`).

On any line failure:

1. Stop processing the file at that line.
2. Surface: "pending-sync drain failed at `<filename>:<lineno>` — `<reason>`.
   Lines 1..<lineno-1> were applied. Lines <lineno>..end remain pending."
3. Do NOT delete the file. The user corrects the failing line (or the
   underlying MCP state) and re-runs `--sync`.
4. On re-run, lines 1..<lineno-1> are safely re-applied per the idempotence
   rules above; processing resumes at the failed line.

On a file that drains without errors, delete it.

## Privacy

Pending-sync files contain sensitive assessments in plaintext. They are covered
by a root `.gitignore` entry — never commit them. If you copy a pending-sync
file between machines, use a secure transfer (not email, not chat).
