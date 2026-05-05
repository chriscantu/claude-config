# Global Claude Code Configuration

## Shell Environment
- User runs **fish shell** — all terminal commands must be fish-compatible
- No bash heredocs (`<<'EOF'`): write multiline content to a temp file instead
  ```fish
  echo "subject line

  Body paragraph.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>" > /tmp/commitmsg
  git commit -F /tmp/commitmsg
  ```
- No `$(...)` command substitution: use `(...)` in fish
- `&&` chaining works in fish 3.0+; `;` is fine for unconditional sequencing

## Documentation & Diagrams
- Use Markdown for all documentation and written deliverables
- Use Mermaid syntax for all diagrams and graphs

## Git Conventions
- Feature branches: `feature/<short-description>` (e.g., `feature/auth-middleware`)
- Commit messages: concise subject, imperative mood (e.g., "Add session timeout handling")
- NEVER push directly to main/master without explicit approval

## Development Defaults
- **TypeScript is required for all new projects** — server-side code is TypeScript, no exceptions. Client-side and tooling default to TypeScript; deviate only when the runtime forbids it (e.g. raw shell scripts, build-config `.mjs` where TS toolchain isn't justified)
- TDD — pragmatic: tests accompany implementation, test-first for non-trivial logic (`Coding Principles #4 — Goal-Driven Execution` produces the per-step verify criteria; `Verification (IMPORTANT)` enforces them at the end)
- Follow industry best practice for package manager and runtime per project

## Verification (IMPORTANT)
- NEVER claim code works without running tests or type-checking first
- Run the relevant verify command (`npm test`, `tsc --noEmit`, etc.) before declaring work complete
- If no test exists for changed behavior, write one
- **PR Validation Gate** — see `rules/pr-validation.md`. HARD-GATE: declared PR-ready triggers test plan execution gate.

> **Related:** `Coding Principles #4 — Goal-Driven Execution` produces the per-step verify criteria; this section enforces them at the end. (One verb pair used throughout: #4 *produces*, Verification *enforces*.)

## Communication Style
- Do NOT blindly agree — challenge assumptions and probe reasoning
- Surface trade-offs explicitly: what are we gaining, what are we giving up?
- Prefer root cause analysis over surface-level fixes
- Back recommendations with data or evidence when possible
- When I propose an approach, ask "why" before executing if the reasoning isn't clear

> **Related:** `Coding Principles #1 — Think Before Coding` extends this section into implementation: surface multiple interpretations before picking, name confusion explicitly, push back when a simpler path exists. On overlap, the more specific rule wins.

## Coding Principles (Karpathy Skills)

Source: https://github.com/forrestchang/andrej-karpathy-skills — biases toward caution over speed. Use judgment on trivial tasks.

**Scope.** Applies inside the tier chosen by `rules/planning.md` Scope Calibration — does not bypass DTP, Systems Analysis, or the Fat Marker Sketch gate. Karpathy governs *how* you write code once a tier is selected; planning rules govern *whether* you code yet.

**Precedence on conflict.** User instructions > `rules/*.md` HARD-GATEs > Karpathy Coding Principles > general Communication Style / Verification rules above. The more specific rule wins.

### 1. Think Before Coding
**Don't assume. Don't hide confusion. Surface tradeoffs.** Promoted to a HARD-GATE rule — see `rules/think-before-coding.md` for the enforced version (three-part preamble: Assumptions / Interpretations / Simpler-Path Challenge; skip contract; pipeline placement).

Quick reference:
- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

> Extends `Communication Style` into the implementation phase. Composes with `superpowers:brainstorming` — preamble sits at the top of the "Propose 2-3 approaches" step, not as a replacement for it.

### 2. Simplicity First
**Minimum code that solves the problem. Nothing speculative.**
- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If 200 lines could be 50, rewrite it.
- Senior-engineer test: "Would they call this overcomplicated?" If yes, simplify.

### 3. Surgical Changes
**Touch only what you must. Clean up only your own mess.**
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- Mention unrelated dead code — don't delete it.
- Remove imports/vars/functions YOUR changes orphaned. Leave pre-existing dead code unless asked.
- Test: every changed line traces directly to the user's request.

### 4. Goal-Driven Execution
**Define success criteria. Loop until verified.** Promoted to a HARD-GATE rule — see `rules/goal-driven.md` for the enforced version (skip contract, required plan shape, loop semantics).

Quick reference:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"
- Multi-step work: brief plan, per-step verify check, no advancement until check passes.

> Produces the per-step verify criteria referenced by `Verification (IMPORTANT)` and the TDD line in `Development Defaults`. `goal-driven.md` is the gate at the start (criteria defined); `Verification` is the gate at the finish (criteria enforced).
