# SWOT — Graph Schema

## Entity

```
name: "<Org Name> SWOT"
entityType: "SWOT"
```

One entity per organization.

## Observation Format

```
[YYYY-MM-DD][<swot-tag>][<landscape-tag>] <observation text> (<provenance>)
```

## SWOT Tags (mutually exclusive — internal vs. external)

| Tag | Meaning |
|-----|---------|
| `[strength]` | Internal positive — what the org controls and does well |
| `[weakness]` | Internal negative — what the org controls but does poorly |
| `[opportunity]` | External positive — what the org could exploit |
| `[threat]` | External negative — what could hurt the org from outside |
| (omitted) | For `[context]` observations |

## Landscape Tags (one per observation, optional)

| Tag | Meaning |
|-----|---------|
| `[technical]` | Architecture, infrastructure, tooling, code quality |
| `[cultural]` | Team dynamics, values, practices, morale |
| `[market]` | Competitive position, industry trends, customer landscape |
| `[org]` | Structure, headcount, processes, reporting lines |

## Provenance

Source tracking in parentheses at end: `(repo README)`, `(1:1 with Sarah)`,
`(incident postmortem #47)`.

**Disambiguation rule**: Provenance is only the final parenthetical if it reads as a
source reference (person, document, system, event). If the final parenthetical is part
of observation text (e.g., "uses React (but considering Vue)"), it is NOT provenance.
When in doubt, treat as observation text — missing provenance is flagged by challenge,
but corrupted text is harder to recover.

## Examples

```
[2026-05-01][strength][technical] CI/CD deploys in 15 min, zero-downtime rolling updates (repo README)
[2026-05-01][weakness][org] No dedicated SRE team — devs carry pager, oncall burden uneven (1:1 with Sarah)
[2026-05-01][opportunity][market] Competitor X dropped enterprise support — their customers are shopping (sales team)
[2026-05-01][threat][market] Series C competitor raised $80M, hiring aggressively in our space (public filing)
[2026-05-01][context] Company went through reorg 6 months ago — some teams still settling (1:1 with Mike)
```
