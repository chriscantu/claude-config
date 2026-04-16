# 1:1 Prep — Pending-Sync File Format

## Purpose

When the memory MCP is unavailable or a write fails, observations are saved locally
so they can be retried later with `/1on1-prep --sync`.

## File Location

```
skills/1on1-prep/pending-sync/YYYY-MM-DD-<person-name-lowercase>.md
```

## File Format

```markdown
# Pending Observations: <Person Name>
# Failed: YYYY-MM-DD HH:MM
# Retry: /1on1-prep --sync

- [2026-04-15][1on1][intake][concern] Team morale dropping after reorg
- [2026-04-15][1on1][intake][followup] Send them the onboarding doc
```

If the file already exists (multiple failed writes on the same day), append new
observations to it.

## Parsing Rules

- Extract Person name from the first line: `# Pending Observations: <Person Name>`
- Each line starting with `- [` is one observation to write
- The entity name for all observations is the Person name from the header

## `--sync` Flow

1. Read all files in `skills/1on1-prep/pending-sync/`
2. For each file, attempt to write each observation via `mcp__memory__add_observations`
3. Delete the pending-sync file **only if all observations in it succeed**
4. Report: total files found, observations parsed, writes attempted, writes succeeded

## Error Handling

| Scenario | Action |
|----------|--------|
| File cannot be read (permissions, missing) | Report error per-file, skip it |
| File yields zero parseable observations | Warn user, do NOT delete (may be corrupted) |
| Write fails for some observations | Keep file, report which succeeded/failed |
| Pending-sync file itself can't be written | Display observation text in chat for manual copy |

## Last-Resort Fallback

If writing to the pending-sync file fails (disk full, permissions), display the full
observation text in chat:

> "I could not save this observation to the pending-sync file either. Please copy the
> text below and save it yourself:
> `[2026-04-15][1on1][intake][concern] Team morale dropping after reorg`"

This ensures observations are never silently lost in a double-failure scenario.
