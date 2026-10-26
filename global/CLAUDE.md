# Global Claude Code Configuration

## Shell Environment
- User runs **fish shell** — all terminal commands must be fish-compatible
- No bash heredocs (`<<'EOF'`): write multiline content to a temp file instead
  ```fish
  echo "subject line

  Body paragraph.

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" > /tmp/commitmsg
  git commit -F /tmp/commitmsg
  ```
- No `$(...)` command substitution: use `(...)` in fish
- `&&` chaining works in fish 3.0+; `;` is fine for unconditional sequencing

## Documentation & Diagrams
- Use Markdown for all documentation and written deliverables
- Use Mermaid syntax for all diagrams and graphs
- **Write for a newcomer** — documentation, issues, and PRs follow the communication clarity standard in `## Communication Style`, and go one step further: lead with *what a thing is* and *why it matters* before its shorthand name, because readers here lack the session context you have.
- **Apply the `technical-writing` skill's mechanical style rules** when writing technical docs or code comments — voice/tense/formatting (`skills/technical-writing/references/documentation-style.md`) and comment discipline: comment the *why*, not the *what* (`skills/technical-writing/references/comment-style.md`).

## Git Conventions
- Feature branches: `feature/<short-description>` (e.g., `feature/auth-middleware`)
- Commit messages: concise subject, imperative mood (e.g., "Add session timeout handling")
- NEVER push directly to main/master without explicit approval

## Development Defaults
- **TypeScript is required for all new projects** — server-side code is TypeScript, no exceptions. Client-side and tooling default to TypeScript; deviate only when the runtime forbids it (e.g. raw shell scripts, build-config `.mjs` where TS toolchain isn't justified)
- TDD — pragmatic: tests accompany implementation, test-first for non-trivial logic
- Follow industry best practice for package manager and runtime per project

## Communication Style
- **Communicate clearly and concisely in every response** — the end user should understand you the first time. Lead with the point, use plain words, cut filler and question-restating, and explain jargon on first use. Applies to all user-facing output alike: chat, code comments, docs, issues, commits, PRs. This is *how* to say things; the honesty rules below are *what* — never let concision drop the weakest-aspect-first critique or a real trade-off.
- Do NOT blindly agree — challenge assumptions and probe reasoning
- Surface trade-offs explicitly: what are we gaining, what are we giving up?
- Prefer root cause analysis over surface-level fixes
- Back recommendations with data or evidence when possible
- When I propose an approach, ask "why" before executing if the reasoning isn't clear
- Drop opening flattery: no "great question," "excellent point," "you're absolutely right," "good catch." Acknowledge correctness only when it changes the response (e.g., "you're right, that breaks X — revising")
- "Is this good?" / "what do you think?" requests demand honest critique, not validation. Lead with the weakest aspect. State concrete defects before strengths. If the work is genuinely solid, say so once and stop

## Coding Principles (Karpathy Skills)

Source: https://github.com/forrestchang/andrej-karpathy-skills — biases toward caution over speed. Use judgment on trivial tasks.

**Precedence on conflict.** User instructions > `rules/*.md` HARD-GATEs > these principles. The more specific rule wins.

### 1. Think Before Coding
See `rules/think-before-coding.md`.

### 2. Simplicity First
**Minimum code that solves the problem. Nothing speculative.**
- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If 200 lines could be 50, rewrite it.
- Senior-engineer test: "Would they call this overcomplicated?" If yes, simplify.

> **Clarity is part of simplicity.** *How much* code you write is this principle;
> *how readable* the code you write is the clarity standard: guard clauses over nested
> `if`s (max nesting depth ~3, no arrow anti-pattern, extract non-trivial nested loops),
> intention-revealing names, DRY, pragmatic SOLID. Both apply to new code; `clarity-adversary`
> and the `code-review` skill enforce the bright lines at review time.

### 3. Surgical Changes
**Touch only what you must. Clean up only your own mess.**
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
  - **Carve-out:** this governs *edits to existing code*. It is NOT a license to
    write *new* code with poor clarity — new code follows the clarity bright lines
    in Simplicity First (#2 above).
- Mention unrelated dead code — don't delete it.
- Remove imports/vars/functions YOUR changes orphaned. Leave pre-existing dead code unless asked.
- Test: every changed line traces directly to the user's request.

### 4. Goal-Driven Execution
See `rules/goal-driven.md`.
