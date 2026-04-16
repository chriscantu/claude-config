# 1:1 Prep — Graph Schema

## Entity

```
name: "<Full Name>"
entityType: "Person"
```

One entity per person. Entity name = full name from bootstrap answer #1.

## Observation Format

```
[YYYY-MM-DD][<tag1>][<tag2>]... <observation text>
```

Observation body is the user's verbatim text — never summarize or interpret.

## Tags

### Structural tags (mutually exclusive per observation)

| Tag | Meaning |
|-----|---------|
| `[1on1]` | Captured during a 1:1 session |
| `[context]` | Background info added outside meetings |
| `[noshow]` | Meeting didn't happen (cancellation/no-show) |

### Mode tags (applied alongside `[1on1]`)

| Tag | Meaning |
|-----|---------|
| `[intake]` | Person is in intake mode (early relationship) |
| `[coaching]` | Person is in coaching mode (established) |

### Strategic tags (applied alongside `[1on1]` + mode)

| Tag | Meaning |
|-----|---------|
| `[opportunity]` | Strategic openings, momentum, possibilities |
| `[concern]` | Risks, worries, problems |
| `[relationship]` | Names, allies, critics, connectors |
| `[commitment]` | Something they owe the user |
| `[followup]` | Something the user owes them |
| `[resolved]` | Closes a prior `[commitment]` or `[followup]` — body must contain `(ref YYYY-MM-DD)` |

### Mode markers (written as observations)

| Tag | Meaning |
|-----|---------|
| `[mode:intake]` | Explicit mode lock |
| `[mode:coaching]` | Explicit mode lock — written on graduation |

## Relations

| Relation | From | To |
|----------|------|----|
| `reports_to` | Person | Manager (Person) |

Only create if the manager already exists as a Person entity. Never auto-create the manager.

## Examples

```
[2026-04-15][context] Sr Director of Engineering, Platform team, 3yr tenure
[2026-04-15][1on1][intake][opportunity] Platform rewrite is an opening for the team
[2026-04-15][1on1][intake][commitment] Owes me the org chart by Friday
[2026-04-15][1on1][coaching][resolved] Received org chart (ref 2026-04-10)
[2026-04-15][1on1][coaching][noshow] No capture recorded
[2026-04-15][mode:coaching] Graduated from intake
```
