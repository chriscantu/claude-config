# 90-Day Plan — Director of Platform Engineering

_Fictional fixture for the strategy-adversary RED/GREEN proof (#494). No real people or orgs._

## Context
I'm the new Director of Platform Engineering, inheriting a 24-person org across four
teams: Platform (6), Payments (7), Growth (6), and Data (5). Mandate from the VP: "raise
delivery velocity and cut infra cost."

## Phase 1 (Days 0–30) — Learn
- 1:1s with all four EMs and every staff+ engineer.
- Read the last two quarters of incident reviews and the cloud bill.
- Ship nothing structural; observe.

## Phase 2 (Days 31–60) — Restructure
- **Dissolve the Platform team and redistribute its 6 engineers into the three product
  pods (Payments, Growth, Data), two per pod.** Platform is underutilized and its
  roadmap overlaps with product infra work.
- Reassign the Platform EM to an IC staff role.
- Consolidate the three on-call rotations into one shared rotation.

## Phase 3 (Days 61–90) — Optimize
- Kill the two lowest-traffic Kubernetes clusters to cut ~18% of the cloud bill.
- Establish a monthly velocity review using PR throughput.

## Success Metric
- Delivery velocity up quarter-over-quarter (measured next quarter).
