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
   > **<canonical>**. Reconcile before handoff — update which?"

NEVER substitute silently, in either direction. CONTEXT.md is a
**candidate canonical**, not authority — the artifact may be right
and CONTEXT.md may be stale. Surface candidates for user judgment;
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
2. Scan the ADR Context, Decision, and Consequences sections for
   terms matching an `_Avoid_` alias. (If a project's ADR template
   adds an Alternatives subsection under Decision, include it.)
3. For each match, surface one advisory line:

   > "ADR uses **<alias>**; CONTEXT.md canonical is **<canonical>**.
   > Reconcile before handoff — update which?"

NEVER substitute silently, in either direction. Same
memory-discipline echo as sdr (CONTEXT.md is candidate, not
authority).

Skip the read entirely if:

- `./CONTEXT.md` is absent → silent no-op
- `./CONTEXT.md` parses malformed → silent no-op + one-line
  diagnostic

Enforcement is **advisory**. Same promotion trigger as sdr.

### Write-offer hook

After the read hook completes, scan the ADR Context, Decision, and
Consequences sections for project-specific nouns that recurred ≥2×
and lack a `./CONTEXT.md` entry (option names, system names,
decision-context vocabulary). Include an Alternatives subsection if
the project's ADR template adds one.

Skip the call entirely if every candidate already exists in
`./CONTEXT.md`.

Offer format:

> "These terms appeared in the ADR: [list]. Want to canonicalize any
> in `./CONTEXT.md` before handoff?"

Invoke:

```
/glossary --offer-from-caller=adr --candidate-terms=<term1,term2,...>
```

## decision-challenger (post-challenge-pass, pre-handoff)

Decision-challenger is an **agent** (`agents/decision-challenger.md`),
not a skill — issue #323 carve-out: "(if/when decision-challenger
SKILL.md exists; otherwise the closest existing reviewer skill)."
The agent file owns the hook block; this section owns the contract.

After producing the Decision Challenge output (Document / Summary /
Challenges / Strengths / Verdict), run one **write-offer hook**
against `./CONTEXT.md`. No read hook in v2 — challenger consumes an
existing artifact rather than producing one, so the asymmetric
read-discipline of `sdr` / `adr` does not apply. Promote to
read+write parity only if Phase D eval signal shows challenger-author
drift.

### Write-offer hook — end-of-challenge, advisory

Scan the Challenges section for nouns the challenge text introduced
or used in a way not explicit in the source artifact — i.e., the
challenger inferred a meaning the author had not defined. Term
confusion between challenger and decision author is the exact
failure mode `./CONTEXT.md` exists to prevent.

Pass as candidates only nouns that:

- Recurred ≥2× across challenges, OR
- Were used in a **Critical** or **Warning** finding (high stakes
  if author misinterprets), AND
- Lack a `./CONTEXT.md` entry (canonical or `_Avoid_` alias).

Skip the call entirely if:

- `./CONTEXT.md` is absent → silent no-op (no scan, no offer)
- Every inferred term is already canonical in `./CONTEXT.md` →
  silent no-op
- Challenger only quoted the source artifact verbatim (no inferred
  terms) → silent no-op

Offer format:

> "These terms appeared in the challenge but not the source
> artifact: [list]. Want to canonicalize any in `./CONTEXT.md`
> before the author addresses the challenges?"

Invoke:

```
/glossary --offer-from-caller=decision-challenger --candidate-terms=<term1,term2,...>
```

Enforcement is **advisory**, not blocking. Echoes
`rules/memory-discipline.md` — surface candidates for user
judgment, never substitute silently.

## v2 follow-ups

_All v2 caller-hook follow-ups resolved as of 2026-05-22:_
- `sdr` — PR #406 (closes #321)
- `adr` — PR #406 (closes #322)
- `decision-challenger` — this PR (closes #323)

Phase D candidates (deferred, gated on eval signal):
- Read hook for `decision-challenger` if challenger-author drift
  surfaces in production use
