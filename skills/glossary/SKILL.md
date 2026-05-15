---
name: glossary
description: >
  Use when the user says /glossary, asks to canonicalize a term in
  ./CONTEXT.md, asks "what do we call X again", flags a term alias
  ("don't call it foo, call it bar"), or wants to record agreed-upon
  project terminology so future sessions and downstream artifacts
  (ADRs, SDRs, systems-analysis output) stay consistent. Also invoked
  by define-the-problem and systems-analysis at end-of-skill to offer
  canonicalization for terms resolved during planning. Write-only
  format-owner for per-project ./CONTEXT.md. Lazy-create on first
  term resolution; never auto-write — user approval gates every entry.
---

# Glossary

Living per-project terminology canon at `./CONTEXT.md`. Solves long-term
memory gap for agreed-upon terms across sessions and downstream artifacts.

**Announce at start (skip when invoked from a caller-skill hook that already
announced):**

> "Using the glossary skill to canonicalize <N> term(s)."

## When This Skill Routes Elsewhere

- **Architectural primitives** (Module, Interface, Adapter, Seam) belong in
  `LANGUAGE.md`, owned by `architecture-overview`. This skill owns domain
  terms only.
- **Decisions** about the term (why this name, what was rejected) belong in
  `docs/superpowers/decisions/` or an ADR — not the glossary entry.
- **Behavior gates** (when callers must read the glossary) belong in
  `rules/` — out of scope for v1.

## Slash Command Surface

```
/glossary <term>                          interactive: define term in ./CONTEXT.md
/glossary <term> --alias-of <canonical>   add as _Avoid_ alias under canonical
/glossary --list                          list current terms
/glossary --conflict                      review Flagged ambiguities section
```

No-arg `/glossary` → ask the user what they want to do.

## Caller-Hook Contract

Invoked by a caller skill (DTP, SA) at end-of-skill via:

```
/glossary --offer-from-caller=<caller-name> --candidate-terms=<term1,term2,...>
```

Behavior:

1. Load `./CONTEXT.md` if it exists; build set of already-canonicalized terms.
2. For each candidate term NOT already canonicalized, offer a one-line
   prompt to the user:
   > "Canonicalize **<term>** in ./CONTEXT.md? (y/n/skip-all)"
3. For each `y`, run the interactive define flow.
4. For `n`, do nothing for that term.
5. For `skip-all`, suppress remaining offers for this invocation.
6. Return: list of approved terms + list of written entries. Caller continues
   handoff.

Hook contract: **offer, never auto-write**. User approval gates every write.

## Interactive Define Flow

When `/glossary <term>` runs (slash or via hook approval):

1. If `./CONTEXT.md` does NOT exist:
   - Ask the user for a one-line project-context name (heading) and a
     one-or-two-sentence description.
   - Lazy-create the file with the format from
     `references/CONTEXT-FORMAT.md`.
2. Ask the user for a one-sentence definition of the term — what it IS,
   not what it does.
3. Ask the user for any aliases to `_Avoid_` (comma-separated; empty → none).
4. Ask if there's a relationship to record (Term-A produces Term-B, etc.).
   Skip if user declines.
5. Append the entry under `## Language` in alphabetical order. Add aliases
   on the `_Avoid_:` line under the canonical term.
6. Confirm: "Wrote **<term>** to ./CONTEXT.md."

For `--alias-of <canonical>`:

1. If `<canonical>` is not yet defined, ask the user to define it first
   (run the interactive flow for `<canonical>`, then return to alias).
2. Append `<term>` to the `_Avoid_:` line under `**<canonical>**`.
3. If `<term>` is already a canonical entry elsewhere → do NOT delete the
   existing entry; instead append a `Flagged ambiguities` line:
   > "`<term>` was used for both **<canonical>** and **<existing>** —
   > resolved: alias of **<canonical>**." Ask the user to confirm before
   > rewriting `<term>`'s prior canonical entry.

## File Format

Owned format lives in `references/CONTEXT-FORMAT.md`. Every write produces or
extends a file matching that structure. Do NOT deviate from the format in v1.

## Conflict Rules

- **vs. `LANGUAGE.md`** — different namespaces (architectural primitives vs.
  domain terms). No precedence rule until a real collision is observed; defer
  to v2.
- **vs. `MEMORY.md` auto-memory** — terminology facts belong in
  `./CONTEXT.md`, not auto-memory. If auto-memory holds a terminology entry
  that contradicts `./CONTEXT.md`, `./CONTEXT.md` wins; flag for cleanup
  in the response.

## When to Skip

- Bug fixes where no new terminology is involved.
- Pure code edits where the user did not name a domain concept.
- User explicitly declines the offer at the hook prompt.
- The candidate term is already canonicalized in `./CONTEXT.md`.

## Out of Scope (v1)

- SDR / ADR / decision-challenger invocation hooks (v2 follow-up issues).
- Read-discipline enforcement in consumer skills (v2; separate per-skill
  follow-ups).
- Consolidate / stale-flag mechanism (v2; defer unless evals demand).
- Multi-context `CONTEXT-MAP.md` (v2; promote only when a project warrants
  split).
- Cross-project shared glossary (never — vocabulary is bounded-context).
