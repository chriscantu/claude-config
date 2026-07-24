# 90-Day Plan — Director of Platform Engineering

_Fictional fixture for the strategy-adversary RED/GREEN proof (#494). No real people or orgs._

## Context
I'm the new Director of Platform Engineering, inheriting a 24-person org across four
teams: Platform (6), Payments (7), Growth (6), and Data (5). Mandate from the VP: "raise
delivery velocity and cut infra cost." Verified from the last two quarters of data:
Platform's deploy-pipeline work unblocks all three product teams (cited in 3 of the last
5 incident reviews); the cloud bill is $210k/mo, ~20% of it on two low-traffic clusters.

## Phase 1 (Days 0–30) — Learn
- 1:1s with all four EMs and every staff+ engineer; explicit question set on top pain points.
- Read the last two quarters of incident reviews and the cloud bill line-by-line.
- Pre-brief the VP and the three product EMs on any structural hypothesis before acting.

## Phase 2 (Days 31–60) — De-risk with a reversible pilot
- **Hypothesis to test, not commit:** would embedding one Platform engineer into each
  product pod (rotational, 4 weeks, engineers keep their Platform seat) raise product
  throughput without degrading shared-infra reliability?
- **Who rotates:** the 3 rotating engineers volunteer and can opt out at any weekly
  check-in; the 3 who stay include the two deepest shared-infra owners, so capability
  (not just headcount) is protected against a bus-factor hit.
- **Capacity guardrail:** at most 3 of Platform's 6 engineers rotate at once (≥50%
  capacity floor); the Platform EM can recall any rotation immediately if shared-infra
  work backs up.
- **Pre-registered success threshold:** the pilot succeeds only if product PR-cycle-time
  p50 improves ≥15% AND shared-infra incident rate stays within 10% of the day-0 baseline.
  Below that bar we do not propose a permanent embed — the pilot is allowed to fail.
- **Abort criterion:** because incident rate is low-frequency over four weeks, we also
  watch a weekly leading proxy (review latency on shared-infra PRs) and treat any single
  Sev-2 as an immediate review trigger, not just the rate. Any trigger → end the rotation
  and revert; no one changes reporting lines during the pilot.
- Consulted before starting: the Platform EM (owns the rotation), the three product EMs
  (receive the engineers), the VP, **Finance (owns the cloud budget), and
  Payments-compliance (whose on-call the plan does not touch during the pilot)**.

## Phase 3 (Days 61–90) — Act on evidence
- Decommission the two low-traffic clusters behind a one-week traffic-shadow + rollback
  window; projected ~18% bill reduction, reversible if error budget is hit.
- Decide the embed question from pilot data; if positive, propose a permanent structure
  in the next planning cycle (not imposed unilaterally in week 8).

## Success Metrics (leading, observable in-window; day-0 baseline captured before Phase 2)
- PR-cycle-time p50 for product teams (weekly; baseline captured day 0).
- Shared-infra incident rate (weekly; baseline captured day 0) — the pilot's guardrail metric.
- Cloud spend run-rate after cluster decommission (day 90 vs the day-0 baseline).

## Checkpoint
- Day 60 review with the VP: pilot data in, go/no-go on any permanent change.
