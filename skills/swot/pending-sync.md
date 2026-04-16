# SWOT — Pending-Sync File Format

## Purpose

When the memory MCP is unavailable or a write fails, observations are saved locally
so they can be retried later with `/swot <org-name> --sync`.

## File Location

```
skills/swot/pending-sync/YYYY-MM-DD-<org-name-sanitized>.md
```

**Filename sanitization**: lowercase, spaces → hyphens, strip all except letters/digits/hyphens,
collapse consecutive hyphens. Examples: "Acme Corp" → `acme-corp`, "Acme & Co." → `acme-co`.

## File Format

```markdown
# Pending Observations: <Org Name> SWOT
# Failed: YYYY-MM-DD HH:MM
# Retry: /swot <org-name> --sync

- [2026-05-01][weakness][org] No SRE team — devs carry pager (1:1 with Sarah)
```

Append to existing file if multiple failures on the same day.

## Parsing Rules

- Extract Org name from first line: `# Pending Observations: <Org Name> SWOT`
- Each line starting with `- [` is one observation
- Entity name = `<Org Name> SWOT` from the header

## `--sync` Flow

`<org-name>` is optional with `--sync`:
- **With org-name**: only sync files matching that org
- **Without**: sync all pending-sync files

For each file:
1. Extract org name from header
2. Verify entity exists: `mcp__memory__search_nodes({ query: "<Org Name> SWOT" })`
3. If entity missing, offer to recreate via Bootstrap
4. Write each observation via `mcp__memory__add_observations`
5. Delete file **only if all writes succeed**

## Error Handling

| Scenario | Action |
|----------|--------|
| File unreadable | Report per-file, skip |
| Zero parseable observations | Warn, do NOT delete |
| Entity missing, user declines recreation | Skip file, report as skipped |
| Write fails | Keep file, report results |
| Pending-sync file can't be written | Display observation in chat for manual copy |

Report totals: files found, observations parsed, writes attempted, writes succeeded.
