## Strategy Challenge

### Deliverable
90-day strategy — "90-Day Plan — Director of Platform Engineering" (inline fixture, no path)

### Summary
This is a disciplined, reversibility-first plan — the pilot has an abort criterion, the cost move has a rollback window, and structure is deferred to evidence. Its primary risk is not recklessness but a mismatch between what the *plan* proposes (a reversible pilot, decide later) and what you say you're walking into the room to get (Q3 reorg sign-off).

### Challenges

#### [Critical] The plan defers the reorg the meeting is meant to approve
**Dimension**: Political feasibility
**Issue**: Your decision context is "get sign-off on a Q3 reorg." But the plan explicitly *avoids* committing to structure in-window: Phase 2 is a "hypothesis to test, not commit," "no one changes reporting lines during the pilot," and Phase 3 defers any permanent structure to "the next planning cycle... not imposed unilaterally in week 8." So the artifact and the ask point in opposite directions.
**Question**: "I asked you to bring me a Q3 reorg. This is a 90-day pilot that decides the reorg question in Q4. Which are you asking me to approve today?"
**Why it matters**: If the VP came expecting a reorg decision, you'll look like you dodged the mandate. If the VP wanted a de-risked approach, this is exactly right — but then the *framing* ("reorg sign-off") is wrong and undersells the discipline. Either way, reconcile the ask before the room: are you seeking approval to *run the pilot*, or approval of a *structure*? Name the specific decision you want the VP to make on the day.

#### [Warning] The pilot drains ~50% of the team that unblocks everyone else
**Dimension**: Second-order org effects
**Issue**: Platform is 6 engineers. The pilot embeds "one Platform engineer into each product pod" — three pods (Payments, Growth, Data) means three of six engineers rotated out, i.e. ~50% of Platform capacity diverted for 4 weeks. You've verified Platform's deploy-pipeline work "unblocks all three product teams." The guardrail metric is *shared-infra incident rate* — but capacity drain shows up as slipped Platform roadmap and slower unblock-turnaround before it shows up as an incident.
**Question**: "Who does Platform's core pipeline work while half the team is embedded, and what's your leading indicator that Platform itself is falling behind — not just that infra hasn't broken yet?"
**Why it matters**: Incident rate is a lagging proxy for a team already flagged as the org's bottleneck. The pilot could quietly starve the one function that gates all three product teams, and your abort criterion wouldn't trip until something breaks. Add a Platform-throughput guardrail (e.g., unblock-request turnaround), not just an infra-reliability one.

#### [Warning] The headline savings number contradicts the spend it's drawn from
**Dimension**: Evidence vs assertion
**Issue**: You state 40% of the $210k/mo bill (~$84k/mo) runs on the two low-traffic clusters, then project "~18% bill reduction" (~$38k/mo) from decommissioning them. More than half the cluster spend survives the decommission, with no explanation of where it goes (migration to other clusters? reserved-instance commitments? data egress?).
**Question**: "If those two clusters are 40% of the bill and you're shutting them down, why is the saving 18% and not closer to 40% — what's the other ~$46k/mo, and does it move rather than disappear?"
**Why it matters**: This is a load-bearing number in a "cut infra cost" mandate, and it's the kind of gap a VP or finance partner catches instantly. If the answer is "workloads migrate," your *net* saving may be smaller still — better to show the migration cost and net figure yourself than have it surfaced across the table.

#### [Warning] Finance and Payments-compliance are unnamed, and either can veto
**Dimension**: Stakeholder blind spots
**Issue**: Consulted parties are EMs, staff+ engineers, and the VP. Two absent stakeholders carry veto power over specific moves: (1) whoever owns the cloud budget / FinOps — they own the cost claim and the decommission's financial framing; (2) security/compliance for Payments — you're both embedding a rotating engineer into a payments pod and decommissioning clusters, and payments infra typically carries PCI/compliance constraints on who touches what and what can be torn down.
**Question**: "Have you cleared the cluster decommission with whoever owns cloud commitments, and does compliance have any say over rotating a non-Payments engineer into the Payments pod or retiring payments-adjacent infra?"
**Why it matters**: A finance objection ("those clusters are on a reserved-instance contract, you can't just cut them") or a compliance objection ("that engineer needs access review before touching Payments") can sink a move mid-flight. Pre-brief both before the VP room so the VP doesn't discover the gap for you.

#### [Probe] Metrics have no stated day-0 baseline
**Dimension**: Measurable success criteria
**Issue**: The leading metrics are well-chosen (PR-cycle-time p50, incident rate, spend run-rate) but there's no recorded starting value. "PR-cycle-time p50 (weekly)" only demonstrates velocity gain against a baseline.
**Question**: "What's the day-0 number for each metric, and how big a move counts as success versus noise?"
**Why it matters**: Without a baseline and a target delta, a Day-60 go/no-go can't be adjudicated — you'll be arguing over whether a change is real. Capture baselines during Phase 1 while you're already reading the data.

#### [Probe] Were the rotating engineers consulted, or volunteered?
**Dimension**: Stakeholder blind spots
**Issue**: The Platform EM (who "owns the rotation") and receiving EMs were consulted; the engineers who actually rotate were not named as consulted — they appear only as people who can "flag overload" after the pilot starts.
**Question**: "Do the three engineers know they're being rotated, and did any of them get a say before the check-in became their only exit?"
**Why it matters**: Rotation is disruptive to individuals (context-switch, split loyalty, on-call ambiguity). Consulting them up front costs little and converts a potential morale/attrition risk into buy-in — cheap insurance for a plan that's otherwise careful about consent.

### Strengths
- **Reversibility is engineered in, not asserted.** Pilot abort criterion, no reporting-line changes during the test, traffic-shadow + rollback on the decommission, structure deferred to a planning cycle. This is textbook one-way-door avoidance.
- **The two load-bearing claims are sourced** — the Platform-as-bottleneck claim cites 3 of 5 incident reviews; the cost claim cites a line-item read. That's verified inheritance, not assumption.
- **The "do less first" option is the plan.** You chose the cheap reversible experiment over the ambitious reorg — the missing-option discipline most 90-day plans skip is already built in.

### Verdict
**REVISE**

The plan itself is strong and unusually disciplined on reversibility. But before the room: (1) reconcile the Critical framing gap — decide whether you're asking the VP to approve *the pilot* or *a structure*, because "Q3 reorg sign-off" oversells what the plan commits to; (2) add a Platform-capacity guardrail so the pilot can't starve the org's bottleneck undetected; (3) pre-brief finance and Payments-compliance and fix the 40%-vs-18% cost gap before either is raised against you. None of these require rewriting the plan — they require closing the distance between the plan and the ask.

_(Glossary hook: skipped — no `./CONTEXT.md` present in the working directory.)_
