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

## sdr (post-artifact-body, pre-handoff)

After producing the System Overview / Service Creation / Data Design
/ Blueprint artifact body, run two end-of-skill hooks against
`./CONTEXT.md`. Read fires first, write-offer second.

Phase B scope: read + write-offer ship together per
[2026-05-22 decision](../../../docs/superpowers/decisions/2026-05-22-glossary-v2-read-discipline.md).
Timing for both is **once-at-end of skill run** — not per-section —
per the same decision's Phase B precondition resolution.

### Read hook — once-at-end, only-on-conflict, advisory

Fires once after the artifact body is filled. If `./CONTEXT.md`
exists and parses cleanly:

1. Parse the `## Language` section; build the set of `_Avoid_:`
   aliases mapped to their canonical terms.
2. Scan the artifact body for any term matching an `_Avoid_` alias.
3. For each match, surface one advisory line:

   > "Artifact uses **<alias>**; CONTEXT.md canonical is
   > **<canonical>**. Fix the artifact before handoff?"

NEVER substitute silently. Surface candidates for user judgment —
echoes `rules/memory-discipline.md` (verify before assert; file
claims surface, never override).

Skip the read entirely if:

- `./CONTEXT.md` is absent → silent no-op
- `./CONTEXT.md` parses malformed (no `## Language` header, or
  shape diverges from `references/CONTEXT-FORMAT.md`) → silent
  no-op + one-line diagnostic to the user

Enforcement is **advisory**, not blocking. Promotion to blocking is
gated by Phase B eval signal per the decision doc rollback
trigger (≥20% skip-rate OR ≥2 term-drift reports).

### Write-offer hook

After the read hook completes, scan the artifact body for component
/ system / data-source names that recurred ≥2× and lack a
`./CONTEXT.md` entry. Pass as candidates only nouns observable from
the artifact text — System Overview component names, Service /
Component name, Data Design entity names, Blueprint variation-point
names.

Skip the call entirely if every candidate name already exists in
`./CONTEXT.md`.

Offer format:

> "These terms appeared in the SDR: [list]. Want to canonicalize any
> in `./CONTEXT.md` before handoff?"

Invoke:

```
/glossary --offer-from-caller=sdr --candidate-terms=<term1,term2,...>
```

## adr (post-Decision-and-Consequences, pre-handoff)

After producing the ADR draft (Context / Decision / Consequences
filled), run two end-of-skill hooks against `./CONTEXT.md`. Same
shape as `sdr` — read first, write-offer second, both fire once at
end-of-skill per
[2026-05-22 decision](../../../docs/superpowers/decisions/2026-05-22-glossary-v2-read-discipline.md).

### Read hook — once-at-end, only-on-conflict, advisory

Fires once after the ADR body is filled. If `./CONTEXT.md` exists
and parses cleanly:

1. Parse the `## Language` section; build the `_Avoid_:` alias
   set.
2. Scan ADR Decision and Alternatives sections for terms matching
   an `_Avoid_` alias.
3. For each match, surface one advisory line:

   > "ADR uses **<alias>**; CONTEXT.md canonical is **<canonical>**.
   > Fix the ADR before handoff?"

NEVER substitute silently. Same memory-discipline echo as sdr.

Skip the read entirely if:

- `./CONTEXT.md` is absent → silent no-op
- `./CONTEXT.md` parses malformed → silent no-op + one-line
  diagnostic

Enforcement is **advisory**. Same promotion trigger as sdr.

### Write-offer hook

After the read hook completes, scan ADR Decision and Alternatives
sections for project-specific nouns that recurred ≥2× and lack a
`./CONTEXT.md` entry (option names, system names, decision-context
vocabulary).

Skip the call entirely if every candidate already exists in
`./CONTEXT.md`.

Offer format:

> "These terms appeared in the ADR: [list]. Want to canonicalize any
> in `./CONTEXT.md` before handoff?"

Invoke:

```
/glossary --offer-from-caller=adr --candidate-terms=<term1,term2,...>
```

## v2 follow-ups

- `decision-challenger` — issue #323 (Phase C — agent-vs-skill
  scope resolution pending)
