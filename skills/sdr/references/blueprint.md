# Blueprint SDR

Canonical template: `~/repos/system-design-records/templates/blueprint.md`
(read it directly — this file routes, doesn't redefine).

## Pick this type when

- Defining a reusable pattern teams should follow ("the way we build event consumers")
- Establishing a golden path or paved road for a category of work
- Documenting a reference architecture that will be instantiated multiple times
- Codifying conventions across a platform (auth, observability, deploy)

## Pick a different type when

- One-off system design (not meant to be copied) → System Overview
- Implementation of a single instance of an existing blueprint → Service/Component Creation
- Schema-shaped pattern → Data Design (with a note that it's reusable)
- A standalone choice with no template intent → `/adr`

## Required fields (verify before opening)

- Title (pattern name — "Event Consumer Blueprint", "Standard CRUD Service")
- Responsible Architect, Author, Contributors
- Lifecycle (POC blueprints are common — surface that early)
- Status
- Problem the blueprint solves — what pain does instantiating this remove?
- Components and contracts the blueprint mandates
- Variation points — what callers may customize, what they MUST NOT
- Worked example — at least one concrete instantiation
- Migration path for existing implementations that pre-date the blueprint

## Checklist before marking ready for review

- [ ] At least one team has piloted this on a real workload
- [ ] Variation points are explicit; everything else is non-negotiable on purpose
- [ ] The worked example is real, not aspirational
- [ ] Existing non-conforming implementations are identified and have a migration plan (or an explicit waiver)
- [ ] Cost of NOT following the blueprint is named (drift, support burden, etc.)
- [ ] At least one rejected alternative pattern is documented
- [ ] `decision-challenger` agent invoked on the draft before sign-off

## Common mistakes

- Publishing a blueprint with zero adopters — blueprints without users are speculative architecture
- Treating every choice as a variation point — that's not a blueprint, it's a wiki page
- Forgetting that adopting a blueprint costs the adopting team time; document the carrot, not just the stick
