# Caller-Hook Trigger Criteria

Per-caller integration detail for the glossary caller-hook contract
(see `SKILL.md` § Caller-Hook Contract for the contract itself).

Each caller skill calls `/glossary --offer-from-caller=<name>
--candidate-terms=<term1,term2,...>` at end-of-skill. Trigger criteria
below decide which terms to pass as candidates. Criteria are
**observable from the conversation transcript** — never agent
introspection. **Offer, never auto-write.**

## define-the-problem (post-Problem-Statement, pre-handoff)

Scan `./CONTEXT.md` (if it exists) for project-specific nouns used in
the Problem Statement's **User** and **Problem** fields. Pass as
candidates the nouns that meet ANY trigger:

- User explicitly substituted or corrected a term during the
  five-question sequence (e.g., "actually we call that Customer, not
  account")
- Problem Statement uses a project-specific noun ≥3 times that lacks
  a canonical definition in `./CONTEXT.md`
- User asked a disambiguation question that the agent answered during
  the session

Skip the call entirely if `./CONTEXT.md` is absent AND no trigger
fired.

Offer format:

> "These terms appeared in the problem statement: [list]. Want to
> canonicalize any in `./CONTEXT.md` before handoff to
> systems-analysis?"

## systems-analysis (post-dependency-mapping, pre-Step B)

Scan the dependency summary for component / system / data-source
names that recurred ≥2× and lack `./CONTEXT.md` entries. Pass as
candidates only names the user **specifically named** (not inferred
from code).

Skip the call entirely if every named system already exists in
`./CONTEXT.md`.

Offer format:

> "These systems recurred in the dependency summary: [list]. Want to
> canonicalize any in `./CONTEXT.md` before continuing to second-order
> effects?"

## v2 follow-ups

- `sdr` — issue #321
- `adr` — issue #322
- `decision-challenger` — issue #323
- Read-discipline (DTP / SA) — issue #324
- Read-discipline (SDR / ADR / decision-challenger) — issue #325
