---
name: technical-writing
description: >
  Concrete sentence-level style rules for technical prose and code comments,
  derived from the Google developer documentation style guide. Use when
  writing or revising technical documentation — READMEs, guides, API docs,
  tutorials, PR/issue bodies, or the prose sections of ADRs/SDRs. Use when
  writing or revising code comments or docstrings. Do NOT use for reviewing
  existing code (→ code-review), architecture narrative
  (→ architecture-overview), decision rationale (→ adr / sdr), or the
  multi-stage long-form doc workflow (→ doc-coauthoring, which this skill
  supplies the style rules for).
status: experimental
version: 0.1.0
---

# Technical Writing

Concrete style rules for technical prose and code comments, so docs and
comments are clear on first read. Modeled on the Google developer
documentation style guide, adapted for Claude output.

**Announce at start:** "I'm using the technical-writing skill to <action>."

## What this skill owns vs. what CLAUDE.md owns

`CLAUDE.md` already owns **tone and format basics** — lead with the point,
plain words, cut filler, explain jargon on first use, no opening flattery
(Communication Style); Markdown for docs, Mermaid for diagrams, newcomer-first
(Documentation & Diagrams). Do NOT restate those here.

This skill owns the **mechanical rules** those sections leave unspecified:
sentence-level voice/tense/formatting for prose, and comment/docstring
discipline. When a rule here would repeat CLAUDE.md, cross-reference instead.

## When to Use

- Writing or editing a README, guide, tutorial, API reference, or doc site page.
- Writing PR descriptions, issue bodies, or the prose sections of an ADR/SDR.
- Writing or revising code comments or docstrings during implementation.

## When NOT to Use

- Reviewing existing code for defects → `code-review`.
- Describing a repo/system's architecture → `architecture-overview`.
- Capturing a decision's rationale and alternatives → `adr` / `sdr`.
- Running the guided context→refine→reader-test workflow for a long-form
  doc → `doc-coauthoring` (it consumes these rules; this skill does not
  replace its workflow).

## Core checklist (the rules people get wrong most)

Prose:

1. **Second person, active voice, present tense.** "You configure the client"
   — not "the client should be configured" or "you will configure."
2. **Conditions before instructions.** "To enable X, run Y" — not "run Y to
   enable X." The reader needs the goal before the step.
3. **Sentence case headings**, serial commas, standard American spelling.
4. **Code font** for code, filenames, flags, and UI element names.
5. **List type matches intent** — numbered for a sequence, bulleted for an
   unordered set, description list for term/definition pairs.
6. **Descriptive link text** — link the thing, never "click here" or "this."
7. **Alt text on every image**; prefer vector/high-res.
8. **Lead with what a thing is and why it matters** before its shorthand name
   (extends CLAUDE.md's newcomer rule).

Comments:

9. **Comment the *why*, not the *what*.** The code already says what it does;
   the comment explains intent, trade-off, or non-obvious constraint. Never
   restate the signature.
10. **No comment rot.** A comment that contradicts the code is a bug — update
    or delete it. Delete dead code; don't comment it out.

Full rule sets — including examples and the reader-test pass — live in
`references/`. Read them when the checklist isn't enough.

## When to Skip

- Trivial one-liners the user dictated verbatim (a typo fix, a rename).
- Content CLAUDE.md already fully governs with no mechanical-rule question
  (e.g., choosing Markdown vs. another format — that's settled upstream).
- The user explicitly opts out for the turn.

## References

Read on demand, not upfront:

- [documentation-style.md](references/documentation-style.md) — full prose
  rules (voice, structure, formatting, links, images) + the reader-test pass.
- [comment-style.md](references/comment-style.md) — comment and docstring
  discipline: why-not-what, comment rot, docstring shape, TODO format, when
  not to comment.
