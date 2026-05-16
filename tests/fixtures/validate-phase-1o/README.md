# Phase 1o fixtures

| Fixture | Used by | Purpose |
|---|---|---|
| `synthetic-log/phase-log.jsonl` | retirement-candidate WARN test | 3 phases × 50 firings — all active phases fire, no candidate emerges; baseline pass |
| `sparse-log/phase-log.jsonl` | silent-below-threshold test | <10 entries → Phase 1o (2)+(3) silent |
| `aging-soft-retire/validate.fish` | hard-delete-eligible WARN test | Tombstone date 2024-01-01 (>12mo old) with zero log activity since |
| `malformed-tombstone/validate.fish` | tombstone-format HARD-FAIL test | Commented phase block lacking required `# RETIRED YYYY-MM-DD —` header |

## Orphaned fixtures

(None.)
