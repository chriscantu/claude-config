# Service/Component Creation SDR

Canonical template lives in `~/repos/system-design-records/templates/`
under a filename matching this type (likely `service-component.md`, but
the SDR skill resolves the filename at runtime — do not pin it here).
Read the canonical template directly when present; this file describes
the routing surface only and is NOT a substitute when the upstream is missing.

## Pick this type when

- Implementing a new service, microservice, worker, or library
- Breaking an existing component out of a monolith
- Replacing a deprecated component with a new implementation
- The unit of design is a single deployable / publishable artifact

## Pick a different type when

- The work spans multiple services → System Overview
- Schema-first change (data model is the design) → Data Design
- Pattern others will copy across services → Blueprint
- Choice between two implementation options without committing to build → `/adr`

## Required fields (verify before opening)

- Title (service name, noun phrase)
- Responsible Architect, Author, Contributors
- Lifecycle, Status
- Purpose — the one job this component owns
- Public API — endpoints, message types, library surface
- Dependencies — upstream services, datastores, third-party APIs
- SLOs — latency, error budget, availability target
- Operational concerns — deploy model, scaling, on-call ownership
- Failure modes and recovery posture

## Checklist before marking ready for review

- [ ] Purpose is single-sentence; if you need "and", consider splitting
- [ ] Public API includes contract stability commitment (semver? deprecation policy?)
- [ ] Each dependency lists the failure-mode impact (degraded? hard fail?)
- [ ] SLOs have numbers, not adjectives
- [ ] On-call ownership is named, not implied
- [ ] At least one alternative (build vs buy, sync vs async, etc.) considered
- [ ] `decision-challenger` agent invoked on the draft before sign-off

## Common mistakes

- Documenting the implementation plan instead of the design (the SDR outlives the sprint)
- Omitting the failure-mode column from dependencies — every dep is a fail point
- Over-broad public API surface that implies more flexibility than the team will support
