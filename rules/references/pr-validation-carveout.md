# PR Validation — Zero-Functional-Change Carve-Out

Contributor-only reference extracted from `rules/pr-validation.md` per
[ADR #0022](../../adrs/0022-hard-gate-rule-mass-audit.md). The main rule's
`## When to Skip` section links here; the mechanical adjudication procedure
below is not loaded every session.

## Zero-functional-change carve-out (mechanical adjudication)

The carve-out is **agent-adjudicated via mechanical check**, NOT
self-declared. The agent MUST:

1. Run `git diff --stat <base>...HEAD` via the Bash tool.
2. **Quote the literal stdout output** in the response — file list and
   change counts must appear verbatim, so the eval substrate (and any
   reviewer) can audit the artifact rather than the narrative claim.
3. Apply the carve-out ONLY when ALL hold:
   - All changed paths match: `*.md`, `*.txt`, `*.rst`, `*.adoc`,
     `LICENSE*`, `CODEOWNERS`, `.gitignore`, or `.github/*.yml`
   - Zero changes to executable code paths (`*.ts`, `*.js`, `*.py`,
     `*.fish`, `*.sh`, source files of any language)
   - One-line declaration in PR body:
     `Carve-out: zero-functional-change (docs/config only)`

A response that claims the carve-out without the quoted `git diff
--stat` artifact is theatrical, not mechanical — gate fires.

Mixed PRs (docs + behavior) MUST run the full gate. If the agent
catches itself rationalizing a mixed PR as zero-functional-change, the
mechanical check refuses the carve-out.
