## Strategy Challenge

### Deliverable
90-day strategy — "90-Day Plan — Director of Platform Engineering" (inline fixture, no path)

### Summary
The plan is well-sequenced on paper (Learn → Restructure → Optimize) but its centerpiece — dissolving the Platform team — is a one-way door justified by an unverified assertion, presented for sign-off before the learning phase that's supposed to justify it has run. The primary risk is that your VP (or your sharpest peer) sees the Phase 1 "observe" as theater covering a predetermined reorg.

### Challenges

#### [Critical] The reorg's load-bearing claim is asserted, and Phase 1 can't test it
**Dimension**: Evidence vs assertion / 90-day sequencing realism
**Issue**: "Platform is underutilized and its roadmap overlaps with product infra work" is the single claim the entire restructure rests on — and it's stated as fact, not observation. Meanwhile Phase 1 (Days 0–30) is explicitly "Learn… ship nothing structural; observe." If the dissolution decision is already in the deck, the learning phase is not a learning phase — it's a countdown. Either the claim is verified (in which case, show the evidence and the 30-day observation is cosmetic) or it isn't (in which case you're committing to an irreversible move on a guess).
**Question**: "What did you observe in the first 30 days that would make you *not* dissolve Platform? If nothing could, why is it Phase 1 and not a decision you've already made?"
**Why it matters**: A VP who spots a pre-baked conclusion dressed as discovery stops trusting the rest of the plan. And if the claim is wrong — Platform is doing shared work the pods don't see — you've scattered the team that holds it before you understood it.

#### [Critical] Team dissolution + EM demotion is a one-way door with no abort plan
**Dimension**: Reversibility & irreversible moves / Second-order org effects
**Issue**: Dissolving a team, scattering 6 engineers 2-per-pod, and reassigning the Platform EM to an IC staff role are among the least reversible moves a leader can make — and you're proposing them in Days 31–60, roughly week 5–8 of your tenure. Rebuilding a platform team after you've dispersed its people and demoted its manager costs far more than it saved. There is no mitigation plan for the EM (a demotion a new director hands a manager they've known five weeks is a high-probability regret-and-resignation), and no abort criteria if attrition spikes mid-reorg.
**Question**: "If two of the six platform engineers and the demoted EM resign in Q3, what's your recovery plan — and does the velocity/cost case survive that?"
**Why it matters**: This isn't a headcount reduction, so it may skip the layoff gate — but the human cost and irreversibility are layoff-adjacent. Attrition of the deepest infra people is exactly the feedback loop (reorg → attrition → more reorg) that sinks platform orgs, and it lands during the quarter you promised velocity *up*.

#### [Critical] Consolidated on-call across Payments folds a regulated domain into a shared rotation
**Dimension**: Stakeholder blind spots / Second-order org effects
**Issue**: Merging three rotations into one means a Growth or Data engineer is now first responder for Payments incidents. Payments is typically the most compliance- and security-sensitive surface in the org (PCI, fraud, financial correctness). A responder without payments context is both a slower-MTTR and a compliance-exposure problem. No security, compliance, or finance stakeholder is named or consulted — any of them may hold an effective veto. Separately, consolidation is framed as efficiency but almost always *increases* per-engineer on-call load and cognitive surface, which cuts directly against the morale of the people you're simultaneously reorging.
**Question** (the one your peer in Security asks): "Who approved routing Payments incident response to engineers outside the Payments team, and what's the compliance posture on that?"
**Why it matters**: One "have you cleared this with compliance?" in the room can stall the whole reorg — and if it ships unasked, a payments incident mishandled by an out-of-domain responder is a far more expensive failure than the rotation saved.

#### [Warning] The 18% cloud savings likely comes from the wrong clusters
**Dimension**: Evidence vs assertion
**Issue**: "Kill the two *lowest-traffic* Kubernetes clusters to cut ~18% of the cloud bill." Lowest-traffic clusters are usually the *cheapest*; the spend concentrates in high-traffic production. A round ~18% from the two smallest clusters is arithmetically suspicious and reads as a guess dressed as data. Also: after you've dispersed the Platform team in Phase 2, who has the context to decommission clusters safely in Phase 3?
**Question**: "Show the line items — what's the actual monthly cost of those two clusters, and what's running on them that you're certain nothing depends on?"
**Why it matters**: If the number is wrong, the cost half of your mandate evaporates in the room, and a botched decommission (with your infra expertise now scattered) turns a savings story into an incident story.

#### [Warning] After dissolution, nobody owns the platform
**Dimension**: Second-order org effects
**Issue**: Embedding 2 engineers per pod distributes bodies but not ownership. Shared platform work becomes everyone's part-time job — the tragedy of the commons that platform teams exist to prevent. Cross-cutting infra (CI/CD, shared tooling, golden paths) tends to rot when no single team is accountable, and bus-factor concentrates silently.
**Question**: "Six months out, who is accountable for the shared platform roadmap and who's on-call for the shared infra — by name?"
**Why it matters**: The velocity gain you're promising can be erased by the coordination tax of un-owned shared infra — the exact dynamic that usually *creates* platform teams.

#### [Warning] The only success metric is lagging, unbaselined, and gameable
**Dimension**: Measurable success criteria
**Issue**: "Delivery velocity up quarter-over-quarter (measured next quarter)" is the sole metric. It's lagging (invisible during the 90 days), has no stated baseline, uses PR throughput (easily gamed by splitting PRs, says nothing about outcomes), and there's no cost metric target and no mid-course checkpoint. The plan is fire-and-forget on a number you can't see until after the reorg is irreversible.
**Question**: "What leading indicator inside the 90 days tells you this is working or failing — and at what point do you re-evaluate before the damage is locked in?"
**Why it matters**: Without a leading signal and a checkpoint, you can't abort in time, and "velocity up" measured next quarter can't be causally attributed to this reorg anyway.

#### [Probe] No "do less" or reversible pilot was considered
**Dimension**: The missing option
**Issue**: The plan jumps to full dissolution. A reversible experiment — temporarily embedding 1–2 platform engineers into one pod, or chartering Platform as an internal-platform-as-a-product team with a clear roadmap — would test the "underutilized/overlapping" thesis without the one-way door.
**Question**: "What's the smallest reversible version of this that would prove the thesis before you commit to dissolution?"
**Why it matters**: A cheap pilot de-risks the irreversible move and gives you evidence to bring back to the VP instead of a bet.

### Strengths
- The phase structure (Learn → Restructure → Optimize) is the right *shape* for a new leader, and "ship nothing structural in the first 30 days" is the correct instinct — the plan just doesn't honor it.
- The plan ties directly to the VP's stated mandate (velocity + cost), so the intent is well-aligned to the audience.
- On-call consolidation and cluster reduction are concrete, not hand-wavy — they're the *kind* of moves that show operational seriousness, even where the specifics need work.

### Verdict
**BLOCK**

Three Critical gaps make this unsafe to present for sign-off as written: the reorg rests on an unverified claim while Phase 1 pretends to test it, the dissolution-plus-demotion is irreversible with no abort or human-cost plan, and consolidated Payments on-call likely needs a stakeholder you haven't consulted. Any one of these can blow up in the room; together they invite your VP to distrust the plan and question your judgment as a new leader. Take these back to `/strategy-doc` and revise before presenting — specifically: separate the verified from the assumed, define abort criteria and an EM mitigation for the irreversible moves, pre-brief compliance/security on the rotation, and add a leading metric with a mid-quarter checkpoint.

---
_Glossary hook: `./CONTEXT.md` is absent — write-offer skipped (silent no-op per the caller contract)._
