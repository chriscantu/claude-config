# System Overview SDR

Canonical template: `~/repos/system-design-records/templates/system-overview.md`
(read it directly — this file routes, doesn't redefine).

## Pick this type when

- Designing a whole system or platform from scratch
- Major landscape rework touching ≥2 services
- Documenting an existing system's architecture for the first time
- Capturing the system's bounded context, capabilities, and integration surface

## Pick a different type when

- Single service implementation → Service/Component Creation
- Schema or storage change → Data Design
- Reusable pattern for others to copy → Blueprint
- Single architectural choice (X vs Y) → `/adr`

## Required fields (verify before opening)

- Title (system name, present-tense capability — "Order Fulfillment Platform")
- Responsible Architect, Author, Contributors
- Lifecycle (POC / Pilot / Beta / GA / Sunset)
- Status (Proposed by default)
- Bounded context — what's IN scope, what's OUT
- Capability map — what the system does
- Integration surface — upstream producers, downstream consumers
- Quality attributes — latency, availability, security, compliance posture
- Risks and open questions

## Checklist before marking ready for review

- [ ] Bounded context names what is OUT of scope, not just what's in
- [ ] Each capability has an owner (team or service)
- [ ] Integration surface lists both contracts AND failure modes
- [ ] Quality attributes are quantified ("p99 < 200ms", not "fast")
- [ ] Stakeholders beyond the immediate team are identified
- [ ] At least one alternative system shape was considered and rejected with reasoning
- [ ] `decision-challenger` agent invoked on the draft before sign-off

## Common mistakes

- Listing services as the architecture (services are an *artifact* of the architecture, not the design)
- Skipping the OUT-of-scope list — without it, scope creep is invisible
- Treating quality attributes as nice-to-haves instead of constraints that drove the design
