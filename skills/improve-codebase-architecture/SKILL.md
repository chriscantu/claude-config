---
name: improve-codebase-architecture
description: >
  Slash-invoked: /improve-codebase-architecture. Surfaces deepening opportunities
  in a codebase via deep/shallow module vocabulary, the deletion test, and seam
  discipline. Produces a numbered candidate list, then drops into a grilling
  loop on the user-selected candidate, with optional parallel interface-design
  exploration. Do NOT use for whole-system mapping or inventory (use
  /architecture-overview), a single architectural choice (use /adr), a
  system-level design record (use /sdr), or a tool/framework adoption
  evaluation (use /tech-radar).
disable-model-invocation: true
status: experimental
version: 0.1.0
---

# Improve Codebase Architecture

Surface architectural friction and propose **deepening opportunities** — refactors
that turn shallow modules into deep ones. The aim is testability and
AI-navigability.

**Announce at start:** "I'm using the improve-codebase-architecture skill to surface
deepening opportunities — refactors that turn shallow modules into deep ones."

## When To Use

- User has worked in a codebase long enough to feel the friction and wants an
  evaluation pass — not a discovery pass.
- User explicitly invokes `/improve-codebase-architecture`.
- User asks to "find refactoring opportunities," "consolidate tightly-coupled
  modules," or "make this codebase more testable."

## When NOT To Use

- Whole-system mapping or inventory across multiple repos → use
  `/architecture-overview` (discovery, code-grounded claims, flagged inferences).
- A single architectural choice with named alternatives → use `/adr`.
- A system-level design record (overview, service creation, data design,
  blueprint) → use `/sdr`.
- A tool or framework adoption evaluation → use `/tech-radar`.
- Documenting a deviation from a tenet → use `/tenet-exception`.

## Glossary

Use these terms exactly in every suggestion. Consistent language is the point —
don't drift into "component," "service," "API," or "boundary." Full definitions
in [LANGUAGE.md](references/LANGUAGE.md).

- **Module** — anything with an interface and an implementation (function, class,
  package, slice). Distinct from JS/Python language-level *modules* (files,
  packages); when ambiguity matters, qualify as "architectural module."
- **Interface** — everything a caller must know to use the module: types,
  invariants, error modes, ordering, config. Not just the type signature.
- **Implementation** — the code inside.
- **Depth** — leverage at the interface: a lot of behaviour behind a small
  interface. **Deep** = high leverage. **Shallow** = interface nearly as complex
  as the implementation.
- **Seam** — where an interface lives; a place behaviour can be altered without
  editing in place. (Use this, not "boundary.")
- **Adapter** — a concrete thing satisfying an interface at a seam.
- **Leverage** — what callers get from depth.
- **Locality** — what maintainers get from depth: change, bugs, knowledge
  concentrated in one place.

Key principles (see [LANGUAGE.md](references/LANGUAGE.md) for the full list):

- **Deletion test**: imagine deleting the module. If complexity vanishes, it was a
  pass-through. If complexity reappears across N callers, it was earning its keep.
- **The interface is the test surface.**
- **One adapter = hypothetical seam. Two adapters = real seam.**

This skill is _informed_ by the project's domain model, if one is documented.
The domain language gives names to good seams; ADRs record decisions the skill
should not re-litigate. A future `domain-model` skill (issue
[#169](https://github.com/chriscantu/claude-config/issues/169)) will formalize
this convention; until then, proceed silently when these files are absent.

## Process

### 1. Explore

Read existing documentation first, if it exists:

- `CONTEXT.md` (or `CONTEXT-MAP.md` + each `CONTEXT.md` in a multi-context repo)
- Relevant ADRs in `docs/adr/` (and any context-scoped `docs/adr/` directories)

If any of these files don't exist, proceed silently — don't flag their absence
or suggest creating them upfront.

Then use the Agent tool with `subagent_type=Explore` to walk the codebase. Don't
follow rigid heuristics — explore organically and note where you experience
friction:

- Where does understanding one concept require bouncing between many small modules?
- Where are modules **shallow** — interface nearly as complex as the implementation?
- Where have pure functions been extracted just for testability, but the real bugs
  hide in how they're called (no **locality**)?
- Where do tightly-coupled modules leak across their seams?
- Which parts of the codebase are untested, or hard to test through their current
  interface?

Apply the **deletion test** to anything you suspect is shallow: would deleting it
concentrate complexity, or just move it? A "yes, concentrates" is the signal you
want.

### 2. Present candidates

Present a numbered list of deepening opportunities. For each candidate:

- **Files** — which files/modules are involved
- **Problem** — why the current architecture is causing friction
- **Solution** — plain English description of what would change
- **Benefits** — explained in terms of locality and leverage, and also in how tests
  would improve

**Use `CONTEXT.md` vocabulary for the domain (if present), and
[LANGUAGE.md](references/LANGUAGE.md) vocabulary for the architecture.** If
`CONTEXT.md` defines "Order," talk about "the Order intake module" — not "the
FooBarHandler," and not "the Order service."

**ADR conflicts**: if a candidate contradicts an existing ADR, only surface it
when the friction is real enough to warrant revisiting the ADR. Mark it clearly
(e.g. _"contradicts ADR-0007 — but worth reopening because…"_). Don't list every
theoretical refactor an ADR forbids.

Do NOT propose interfaces yet. Ask the user: "Which of these would you like to
explore?"

### 3. Grilling loop

Once the user picks a candidate, drop into a grilling conversation. Walk the
design tree with them — constraints, dependencies, the shape of the deepened
module, what sits behind the seam, what tests survive.

Side effects happen inline as decisions crystallize:

- **Naming a deepened module after a concept not in `CONTEXT.md`?** If a
  `CONTEXT.md` exists in the repo, add the term there inline (same discipline
  the future `domain-model` skill, issue #169, will codify). If no
  `CONTEXT.md` exists, don't create one upfront — note the term in the
  recommendation document instead.
- **Sharpening a fuzzy term during the conversation?** Update `CONTEXT.md` right
  there if it exists.
- **User rejects the candidate with a load-bearing reason?** Offer an ADR, framed
  as: _"Want me to record this as an ADR so future architecture reviews don't
  re-suggest it?"_ Only offer when the reason would actually be needed by a
  future explorer to avoid re-suggesting the same thing — skip ephemeral reasons
  ("not worth it right now") and self-evident ones. Hand off via `/adr`.
- **Want to explore alternative interfaces for the deepened module?** See
  [INTERFACE-DESIGN.md](references/INTERFACE-DESIGN.md).

### 4. Handoff

When grilling settles on a deepening direction that requires code change, the
skill exits with a recommendation document. Implementation follows the standard
pipeline — re-enter at `superpowers:writing-plans` if non-trivial, or proceed
directly if the work is Trivial-tier per `rules/planning.md` Scope Calibration.

The skill does **not** auto-invoke `writing-plans` or any implementation skill.
This preserves user agency to defer the implementation, batch multiple deepening
recommendations into one plan, or hand the recommendation to a different
session.

## Composition With Other Skills

- **`/architecture-overview`** — runs FIRST in onboarding mode. Produces inventory
  + dep map + data flow + integrations doc. This skill consumes that output (or
  the live codebase) and grades depth/seams.
- **`/adr`** — invoked from inside the grilling loop when the user rejects a
  candidate with a load-bearing reason worth preserving for future reviewers.
- **`/sdr`** — distinct purpose (system-level design records); do not conflate
  with deepening recommendations.
- **`superpowers:writing-plans`** — invoked by the user AFTER this skill exits,
  if the recommendation warrants a multi-step implementation plan.
