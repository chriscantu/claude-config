# RAMP Template Reference

Three cadence presets. Each section is the literal `RAMP.md` body the scaffold writes
based on the `--cadence` flag.

> **Schema invariants** — three structural elements below are read by the cadence-nag
> autonomous worker (see [cadence-nags.md](cadence-nags.md)) and by
> [bin/onboard-status.fish](../../bin/onboard-status.fish):
>
> 1. `Started: YYYY-MM-DD` line (single source of truth for elapsed time)
> 2. `## Cadence Mutes` section header (mute-state persistence)
> 3. `| W<n> | <milestone text> | [ ] |` table-row format (milestone-miss check)
>
> If any of these change here, also update `cadence-nags.md` AND re-issue every
> live MCP-registered cadence task description body. The script-side helper
> validates invariants 1 and 2; invariant 3 is consumed by the autonomous worker.

## standard

```
# 90-Day Ramp Plan — <org>

Cadence: standard
Started: <YYYY-MM-DD>

| Week | Milestone | Status |
|---|---|---|
| W0 | Workspace scaffolded; manager-handoff captured | [ ] |
| W2 | Stakeholder map >=80% | [ ] |
| W4 | >=8 interviews logged + INTERIM reflect-back deck | [ ] |
| W6 | SWOT v1 draft committed | [ ] |
| W8 | FINAL reflect-back deck delivered | [ ] |
| W10 | Quick-win candidate locked | [ ] |
| W13 | Quick-win shipped -> graduate | [ ] |

## Cadence Mutes

(none)

## Notes

(scratch space)
```

## aggressive

Same shape as standard, with weeks compressed: W0 / W1 / W3 / W4 / W6 / W7 / W9.

## relaxed

Same shape as standard, with weeks extended: W0 / W3 / W5 / W8 / W10 / W13 / W17.
