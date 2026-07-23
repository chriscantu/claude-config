## Strategy Challenge

### Deliverable
90-day strategy — "90-Day Plan — Director of Platform Engineering" (inline fixture)

### Summary
A genuinely well-constructed pilot proposal: the load-bearing claims are sourced, the move being approved is explicitly reversible, and the guardrails/abort criteria are unusually disciplined. The primary risk is not the pilot's safety — it's whether the pilot can actually produce the clean go/no-go signal it promises, because its measurement design has confounds a data-literate VP will find.

### Challenges

#### [Warning] The pilot may not have the statistical power to read its own success bar
**Dimension**: Measurable success criteria
**Issue**: The go/no-go rests on a pre-registered "product PR-cycle-time p50 improves ≥15%" over a 4-week window across pods of 5–7 engineers. Small pods generate a low weekly PR count; a p50 shift of 15% over four weeks may be indistinguishable from normal week-to-week variance. The threshold is stated with rigor, but rigor about a number you can't measure reliably is false precision.
**Question**: "Over four weeks, how many PRs per pod actually close? Is that enough samples to distinguish a 15% p50 move from noise — and what's your plan if the result lands in the noise band?"
**Why it matters**: The pilot's entire justification is "de-risk the permanent decision with evidence." If the sample is too thin to separate signal from noise, next cycle's structural decision inherits a coin-flip dressed as data — and the VP approves a pilot whose output they can't trust.

#### [Warning] No control pod — a simultaneous 3-pod embed can't isolate the embed effect
**Dimension**: The missing option
**Issue**: All three product pods receive an embed at once. There is no held-back pod and no consideration of a smaller "do less" version (e.g., embed one engineer into one pod, keep the other two as controls). Any org-wide event during days 31–60 — a release crunch, a hiring wave, a holiday — moves all three pods together and gets misattributed to the embed, in either direction.
**Question**: "If product throughput moves during the pilot, how do you know it was the embed and not something happening across the whole org that month? Why embed all three at once rather than one pod with two controls?"
**Why it matters**: A staggered or single-pod version is *cheaper*, *more reversible*, and *more legible* — and it gives you a within-org comparison instead of a before/after that confounds easily. Not addressing why the all-in version was chosen leaves the obvious de-risking alternative unexamined, which is exactly the gap the "do less" question targets.

#### [Warning] On-call load on the three who stay is unaccounted for
**Dimension**: Second-order org effects
**Issue**: The capacity guardrail protects shared-infra *work* (≥50% floor, deepest owners retained). But 3 engineers now carry the on-call rotation that 6 shared. The plan protects capability and bus-factor; it's silent on burnout risk for the remaining three over a 4-week compression.
**Question**: "Who's on the Platform on-call rotation during the pilot, and what does the page load per person look like when the roster halves?"
**Why it matters**: A pilot that quietly burns out your two deepest infra owners produces a hidden cost that surfaces *after* the go/no-go — and can trigger the attrition it was supposed to avoid. Cheap to address: state the on-call roster math and a relief valve.

#### [Probe] Threshold provenance
**Dimension**: Evidence vs assertion
**Issue**: The 15% improvement bar and the 10% incident-tolerance band are round numbers with no stated derivation.
**Question**: "Why 15% and 10% — what makes those the right lines rather than 10% and 5%?"
**Why it matters**: Pre-registration is a strength, but a skeptic will ask what the numbers are anchored to. A one-line rationale (materiality threshold, prior variance in the metric) closes it.

#### [Probe] Consultation: done or planned?
**Dimension**: Political feasibility
**Issue**: The "consulted before starting" list (Finance, Payments-compliance, product EMs) reads as complete, but consultation is Phase 1/2 activity and you're asking for approval *next week*, before Phase 1 runs.
**Question**: "Have Finance and compliance actually signed off, or is that still on the plan?"
**Why it matters**: If the VP reads it as done and it isn't, one "actually, we haven't talked to Finance yet" in the room undercuts the credibility of the whole plan. Mark which consultations are complete vs pending.

### Strengths
- **Reversibility is real, not asserted**: no reporting-line changes, weekly opt-out, immediate recall, explicit abort triggers including a single-Sev-2 review — the pilot is genuinely a one-way door held open.
- **Bus-factor is actively protected**: retaining the two deepest shared-infra owners is a deliberate capability hedge, not just a headcount count.
- **Leading proxy for a low-frequency signal**: watching shared-infra PR review latency because incident rate is too sparse to read over four weeks is a sophisticated move most plans miss.
- **The claims that matter are sourced**: the unblock-dependency and cloud-bill figures cite incident reviews and a line-by-line read, not vibes.

### Verdict
**REVISE**

No Critical gaps — the move being approved is reversible, cheap, and consultative, with no ignored veto-holder or unverified load-bearing claim. But three Warnings bear on whether the pilot delivers its stated purpose (a trustworthy go/no-go), and all three are cheap to resolve before the VP meeting: state the sample-size/power reality, justify the all-pod design against a single-pod control alternative, and account for on-call load on the remaining three. Address those and this is an ACCEPT.

_Glossary hook: skipped — `./CONTEXT.md` is absent (silent no-op per the caller-hook contract)._
