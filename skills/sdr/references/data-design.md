# Data Design SDR

Canonical template lives in `~/repos/system-design-records/templates/`
under a filename matching this type (likely `data-design.md`, but the
SDR skill resolves the filename at runtime — do not pin it here). Read
the canonical template directly when present; this file describes the
routing surface only and is NOT a substitute when the upstream is missing.

## Pick this type when

- Designing a new data model, schema, or storage layout
- Choosing a datastore (relational vs document vs columnar vs KV)
- Migrating an existing schema (column adds, type changes, denormalization)
- Defining event payloads or stream contracts
- Capturing data ownership, retention, and access boundaries

## Pick a different type when

- The choice is purely "Postgres vs MySQL" with no schema design → `/adr`
- Pattern for cross-team data contracts (CDC, eventing template) → Blueprint
- The work is a service that *uses* the data, not the data itself → Service/Component Creation
- System-level data flow across many services → System Overview

## Required fields (verify before opening)

- Title (entity or domain, e.g. "Customer Identity Schema")
- Responsible Architect, Author, Contributors
- Lifecycle, Status
- Conceptual model — entities, relationships, cardinality
- Physical model — tables/collections/topics, keys, indexes
- Access patterns — read paths, write paths, expected QPS / scan patterns
- Consistency posture — strong, eventual, bounded staleness
- Retention and lifecycle — how long data lives, who can delete it
- Privacy / compliance classification — PII, PHI, financial, regulated

## Checklist before marking ready for review

- [ ] Access patterns drive the physical model, not the other way around
- [ ] Indexes match the named access patterns; nothing unjustified
- [ ] PII fields are flagged and the encryption/redaction posture is named
- [ ] Retention has a number and a deletion mechanism
- [ ] Migration plan covers backfill AND rollback
- [ ] At least one alternative storage choice was evaluated
- [ ] `decision-challenger` agent invoked on the draft before sign-off

## Common mistakes

- Designing the schema before listing access patterns — you'll over-normalize or under-index
- Treating retention as a policy concern instead of a design constraint
- Forgetting that schema changes are usually easier than data backfills — plan the data move, not just the DDL
