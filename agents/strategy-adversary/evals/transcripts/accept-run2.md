## Strategy Challenge

### Deliverable
90-day strategy — "90-Day Plan — Director of Platform Engineering" (inline fixture, no path)

### Summary
A disciplined, appropriately-scoped plan: the ask is narrow (run a *reversible* pilot), the irreversible moves are deferred to a later go/no-go, and reversibility is genuinely engineered in. The primary risk isn't recklessness — it's that the pilot's decision machinery (what counts as "positive," whether the guardrail can even fire in 4 weeks) is underspecified, so the pilot could run and still not settle the question it exists to answer.

### Challenges

#### [Warning] The guardrail metric may be too noisy to fire in a 4-week window
**Dimension**: 5. 90-day sequencing realism (and the integrity of the reversibility claim)
**Issue**: The abort criterion is "shared-infra incident rate rises >10%." Incident rates on a 24-person org's shared infra are low-count and bursty — a single bad week can swing the rate far more than 10% for reasons unrelated to the rotation, and a real degradation can hide inside 4 weeks of noise. The quantitative half of your safety net may be statistically meaningless over the pilot window.
**Question**: "Over what baseline window is the 10% measured, and how many incidents do you actually expect in 4 weeks? If the answer is 'two or three,' what does a 10% rise even mean?"
**Why it matters**: The pilot is sold as safe *because* it's reversible on a tripwire. If the tripwire can't reliably distinguish signal from noise, the real abort mechanism is the qualitative overload flag alone — which is fine, but then say so, and don't present the >10% number as a load-bearing guarantee to the VP.

#### [Warning] "Positive" is undefined — no pre-registered success threshold for the embed decision
**Dimension**: 6. Measurable success criteria
**Issue**: You define the *abort* criteria precisely but the *success* criteria only as "if positive, propose a permanent structure." How much PR-cycle-time improvement justifies a permanent embed? Without a threshold set *before* the pilot, the Day-60 decision becomes a post-hoc read of ambiguous data — exactly where a new director gets accused of confirmation bias.
**Question**: "What p50 improvement, sustained over how long, would you call a win — and did you write that number down before you saw the data?"
**Why it matters**: A pre-registered threshold is what lets you walk into the *next* planning cycle and say "we said X, we got X." Without it, a skeptical peer VP can dismiss any result as the number you needed it to be.

#### [Warning] The ≥50% capacity floor protects headcount, not capability
**Dimension**: 3. Second-order org effects (SPOF)
**Issue**: Your Context establishes that Platform's deploy-pipeline work "unblocks all three product teams" and shows up in 3 of 5 incident reviews — i.e., it's the critical shared surface. The guardrail is "at most 3 of 6 rotate." But a headcount floor says nothing about *which* skills stay. If the one or two engineers deepest on the deploy pipeline rotate out, shared-infra risk spikes even at 50% headcount.
**Question**: "Who is the deploy-pipeline expert, and is your guardrail 'any 3 stay' or 'the pipeline-critical people stay'?"
**Why it matters**: This is the mechanism by which the pilot could actually degrade the reliability you're trying to protect — and it's invisible in a headcount-only rule. Cheap fix: name the pipeline-critical capabilities as non-rotating.

#### [Probe] The affected group closest to the change isn't listed as consulted
**Dimension**: 2. Stakeholder blind spots
**Issue**: Your consulted list is thorough on *managers and budget owners* (Platform EM, 3 product EMs, VP, Finance, Payments-compliance) — genuinely good coverage. But the rotating engineers themselves, who carry the actual dual load and keep their Platform seat, appear only as a mid-pilot overload sensor, not as people consulted before it starts.
**Question**: "Have the six Platform engineers been asked whether a rotation is something they want, or are they finding out when it starts?"
**Why it matters**: A pilot that reads as done-*to* engineers rather than done-*with* them can generate the morale/attrition cost you'd otherwise attribute to the embed itself — contaminating your own data and your standing with the team.

#### [Probe] A single-pod pilot is the cheaper reversible experiment
**Dimension**: 8. The missing option
**Issue**: The plan rotates up to 3 engineers across 3 pods simultaneously. A smaller version — embed *one* engineer in *one* pod for 4 weeks — tests the same hypothesis at a third of the capacity hit and blast radius, and is even easier to abort.
**Question**: "What does running three simultaneous rotations buy you over one, given the extra risk to shared infra?"
**Why it matters**: If per-pod variation is the reason (you want to compare three contexts), say so — it's a defensible answer. If not, the smaller pilot de-risks the Platform capacity concern above for free.

#### [Probe] Scope of the ask vs. what the doc shows
**Dimension**: 7. Political feasibility
**Issue**: Your stated ask is approval to run the pilot only. But the doc lays out Phase 3's cluster decommission (~18% bill reduction) as if it's greenlit. The VP may either approve more than you intended or derail the meeting onto the infra plan.
**Question**: "Are you asking the VP to bless Phase 3 decommission today, or just the pilot?"
**Why it matters**: State the boundary explicitly in the room — "today I'm asking only for the pilot; the cluster decommission comes back as its own decision" — so the reversible ask doesn't get entangled with the infra one.

### Strengths
- **Reversibility is genuinely engineered, not asserted**: no reporting-line changes, immediate recall power, an explicit abort criterion, and a capacity floor. This is the model of a low-agonizing, one-way-door-free ask.
- **Evidence is sourced and separated from assumption**: the cloud bill and incident-review citations are concrete, and Phase 1 is honest about learning before acting.
- **Political sequencing is right for a new leader**: no unilateral reorg in week 8, structural change deferred to a real go/no-go with pre-briefed stakeholders. This spends the political capital you actually have.

### Verdict
**REVISE**

The ask is sound and the reversibility discipline is strong — none of these are Critical, and there's no ignored veto-holder or unguarded irreversible move (no headcount reduction, so the layoff gate doesn't apply). But three Warnings could change the pilot's design or its credibility: fix the success threshold and the guardrail's statistical validity *before* the VP meeting, and decide whether capability (not just headcount) is protected. Answer those three and this is an ACCEPT.

_(Glossary hook: skipped — `./CONTEXT.md` is absent, so the write-offer is a silent no-op per contract.)_
