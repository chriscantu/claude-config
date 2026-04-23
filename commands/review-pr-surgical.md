---
description: "PR review chaining pr-review-toolkit:code-reviewer with surgical-diff-reviewer (Karpathy #3 scope enforcement)"
argument-hint: "\"<user's stated request>\" [git-scope]"
allowed-tools: ["Bash", "Read", "Glob", "Grep", "Task"]
---

# Surgical PR Review

Run two reviewers in sequence on the current diff:

1. **`pr-review-toolkit:code-reviewer`** — correctness, style, CLAUDE.md compliance (plugin)
2. **`surgical-diff-reviewer`** — scope enforcement: every changed line traces to the user's stated request (Karpathy Coding Principle #3, see `~/.claude/CLAUDE.md`)

Together they catch both "is the code right?" and "is the code in scope?"

## Arguments

`$ARGUMENTS` must start with a quoted one-sentence paraphrase of the user's stated request — surgical-diff-reviewer cannot judge scope without it. Optional second argument is the git scope (`staged`, a commit range, or specific files). Default scope: unstaged `git diff`.

Examples:

```
/review-pr-surgical "Add null-check to the email validator"
/review-pr-surgical "Fix the auth middleware token expiry bug" staged
/review-pr-surgical "Refactor the user service" HEAD~3..HEAD
```

## Workflow

1. **Parse `$ARGUMENTS`.** Extract the quoted stated-request string and the optional git scope. If the quoted string is missing or empty, STOP and ask the user to provide it — do not run either reviewer.

2. **Sanity-check the diff.** Run `git status` and `git diff --stat` (or `git diff --cached --stat` / the specified scope). If empty, report "no diff to review" and stop.

3. **Launch `pr-review-toolkit:code-reviewer`** via the Task tool. Pass:
   - The diff scope (same as step 2)
   - A note: "Review correctness, style, CLAUDE.md compliance. Do NOT flag scope — that is handled by a separate reviewer."

4. **Launch `surgical-diff-reviewer`** via the Task tool. Pass:
   - The exact stated-request string from `$ARGUMENTS`
   - The diff scope

   Run this AFTER code-reviewer completes so its findings can be cited back. Both can run in parallel if the user requests it explicitly (add `parallel` as a flag).

5. **Aggregate results.** Present a combined summary:

```markdown
# Surgical PR Review

**Stated request:** <verbatim from arguments>
**Diff scope:** <scope reviewed>

## Correctness findings (pr-review-toolkit:code-reviewer)
<paste agent output, or "No high-confidence issues">

## Scope findings (surgical-diff-reviewer)
<paste agent output>

## Combined verdict
<APPROVE / FIX CORRECTNESS / REVERT SCOPE CREEP / FIX BOTH>
<one-line rationale referencing whichever agent flagged issues>
```

## Verdict Rules

- **APPROVE** — both agents clean
- **FIX CORRECTNESS** — code-reviewer flagged issues; scope is clean
- **REVERT SCOPE CREEP** — surgical-diff-reviewer flagged out-of-scope hunks; correctness is clean
- **FIX BOTH** — both agents flagged issues

## Notes

- The plugin's `pr-review-toolkit:code-reviewer` already reads CLAUDE.md, which now contains Karpathy principles. This command adds surgical-diff-reviewer as an explicit, first-class scope check rather than relying on implicit CLAUDE.md pickup.
- Use `/pr-review-toolkit:review-pr` for a full multi-agent review (tests, comments, errors, types, simplifier). Use this command when you specifically want the scope-enforcement pair.
