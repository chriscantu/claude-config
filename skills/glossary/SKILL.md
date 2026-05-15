---
name: glossary
description: >
  Use when the user explicitly invokes /glossary, asks to canonicalize a
  domain term in ./CONTEXT.md, or wants to record agreed-upon
  project-specific terminology so future sessions and downstream artifacts
  (ADRs, SDRs, systems-analysis output) stay consistent. Also invoked by
  define-the-problem and systems-analysis at end-of-skill via the
  caller-hook contract to offer canonicalization for terms resolved during
  planning. Write-only format-owner for per-project ./CONTEXT.md.
  Lazy-create on first term resolution; never auto-write — user approval
  gates every entry. Do NOT use for: casual term mentions in conversation,
  code-level naming questions, architectural primitives (Module, Interface,
  Adapter, Seam — those belong in LANGUAGE.md owned by
  architecture-overview), general programming concepts, or decisions about
  why a term was chosen (those belong in docs/superpowers/decisions/ or an
  ADR).
---

# Glossary

Living per-project terminology canon at `./CONTEXT.md`. Solves long-term
memory gap for agreed-upon terms across sessions and downstream artifacts.

**Announce at start (skip when the user invoked the slash command directly —
they already know what they typed):**

> "Using the glossary skill to review <N> candidate term(s)."

`<N>` = candidate count from the caller-hook invocation (offers about to
fire), not write count (writes are gated on user approval per offer).

## When This Skill Routes Elsewhere

- **Architectural primitives** (Module, Interface, Adapter, Seam) belong in
  `LANGUAGE.md`, owned by `architecture-overview`. This skill owns domain
  terms only.
- **Decisions** about the term (why this name, what was rejected) belong in
  `docs/superpowers/decisions/` or an ADR — not the glossary entry.
- **Behavior gates** (when callers must read the glossary) belong in
  `rules/` — out of scope for v1.

## Slash Command Surface

User-facing:

```
/glossary <term>                          interactive: define term in ./CONTEXT.md
/glossary <term> --alias-of <canonical>   add as _Avoid_ alias under canonical
/glossary --list                          list current terms
/glossary --conflict                      review Flagged ambiguities section
```

No-arg `/glossary` → ask the user what they want to do.

Hook-only (invoked by caller skills; see Caller-Hook Contract below — not
intended for direct user use):

```
/glossary --offer-from-caller=<caller-name> --candidate-terms=<term1,term2,...>
```

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
6. After all candidates processed, surface a one-line summary in the
   response (e.g., "Canonicalized: Customer. Skipped: Account.") so the
   caller can include it in its handoff narration. **No structured return
   value** — skills are not function calls; the summary is informational
   prose for the caller to read off the conversation.

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

- **vs. `LANGUAGE.md`** — `LANGUAGE.md` (architectural primitives, owned by
  `architecture-overview`) and `./CONTEXT.md` (domain terms) live in
  different namespaces. v1 does NOT actively read `LANGUAGE.md` before
  writing — collision detection is **deferred to v2** (filed as part of the
  read-discipline follow-ups). If the user notices a collision in the
  meantime, prefer `LANGUAGE.md` for architectural primitives, `./CONTEXT.md`
  for domain terms; surface a one-line note in the response and let the
  user decide.
- **vs. `MEMORY.md` auto-memory** — terminology facts belong in
  `./CONTEXT.md`, not auto-memory. v1 does NOT actively scan auto-memory
  before writing — contradiction detection is **deferred to v2**. If the
  agent happens to notice a contradiction during normal operation, surface
  a one-line warning of the form:

  > "Auto-memory entry for `<term>` contradicts ./CONTEXT.md (canonical:
  > <X>; auto-memory says: <Y>) — recommend deleting the auto-memory entry."

  Do NOT modify auto-memory automatically.

## When to Skip

- Bug fixes where no new terminology is involved.
- Pure code edits where the user did not name a domain concept.
- User explicitly declines the offer at the hook prompt.
- The candidate term is already canonicalized in `./CONTEXT.md`.

## Out of Scope (v1)

- SDR / ADR / decision-challenger invocation hooks (v2 follow-up issues
  #321 / #322 / #323).
- Read-discipline enforcement in consumer skills, including active
  collision detection vs. `LANGUAGE.md` and contradiction detection vs.
  `MEMORY.md` auto-memory (v2; follow-ups #324 / #325).
- Consolidate / stale-flag mechanism (v2; defer unless evals demand).
- Multi-context `CONTEXT-MAP.md` (v2; promote only when a project warrants
  split).
- Cross-project shared glossary (never — vocabulary is bounded-context).
