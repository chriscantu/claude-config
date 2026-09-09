# Code Clarity Standard

Write-time guidance for the *structure* of code you produce. This is a **standard,
not a HARD-GATE** — it shapes how you write, and it is what the `code-review` skill
and `clarity-adversary` enforce at review time. It composes with, and is bounded by,
the Karpathy Coding Principles in `global/CLAUDE.md`.

> **Relationship to scope discipline.** Karpathy #2 (Simplicity First) and #3
> (Surgical Changes) govern *how much* code you write and *what* you touch. This
> standard governs *how readable* the code you do write is. When they pull apart —
> e.g. a clarity refactor would exceed the requested scope — scope wins: note the
> clarity issue, don't smuggle the refactor. See "Boundaries" below.

## Hard Caps (bright lines)

These are checkable. Treat a breach as a defect to fix, not a preference.

- **Max nesting depth ~3.** Beyond three levels of `if`/`for`/`while`/`try`, stop.
  Use **guard clauses / early returns** to flatten, or extract the inner block into
  a named helper.
- **No arrow anti-pattern.** Don't grow a staircase of nested conditionals. Invert
  the predicate and return early for the exceptional case, leaving the happy path
  un-indented.
- **Extract non-trivial nested loops.** When an inner loop body is more than a line
  or two, lift it into a named function — the name documents intent and the nesting
  disappears from the caller.

## Heuristics (judgement calls)

Apply with sense, not dogma. These are the same altitude as the `code-review` smell
baseline — nudges, not violations.

- **Intention-revealing names.** A function/variable/type name should say what it
  does or holds. If no honest name comes, the design is murky — fix the design, not
  the name.
- **DRY the *shape*, not the coincidence.** Extract logic that is genuinely the same
  shape in two places. Do not merge code that merely looks similar today but answers
  to different reasons — that coupling costs more than the duplication.
- **Single responsibility per function.** A function should change for one reason. If
  you can't describe what it does without "and", consider splitting it.
- **Pragmatic SOLID.** Favor these principles, but **not at the cost of
  over-abstraction.** A single-use interface, a premature strategy pattern, or a
  factory for one concrete type is a scope violation the `scope-adversary` will flag.
  Abstract when a second real caller exists, not in anticipation of one.

## Boundaries

- **New code follows this standard in full.** You are writing it fresh; there is no
  existing style to preserve.
- **Editing existing code:** Karpathy #3 ("match existing style") still governs. Do
  not refactor surrounding code for clarity unless it's in scope. Flag it instead.
- **Clarity is not a license to grow scope.** The fix for a nested mess you were not
  asked to touch is a one-line mention, not an unrequested rewrite.

## When to Skip

- Throwaway/exploratory scripts the user scoped as disposable
- A repo's own documented coding standard that conflicts — the repo wins; note the conflict
- Generated or vendored code you don't own
