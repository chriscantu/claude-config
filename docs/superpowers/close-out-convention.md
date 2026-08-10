# Trailing-doc close-out convention

**What this is.** A checklist for stamping the *closing* status on in-repo tracking paper
when the work it points at ships. **Why it matters:** when a PR merges or an issue closes,
plan checkboxes, spec status headers, decision breadcrumbs, and ADR `## Status` fields do
not update themselves. Left undone, they overstate what's undone and misdirect future
sessions — a spec that still says "resume at writing-plans," a SKILL.md that calls a shipped
feature "not yet implemented." Issue #507 exists because PR #508 had to reconcile 16 files
that had drifted this way.

**When to do it.** At the moment a PR that completes tracked work merges — or when you are
the one merging it. Close out every artifact the PR finished, then merge.

## Formats

Each doc type has one canonical closed form. Match it exactly so the status is greppable.

### Plan — `docs/superpowers/plans/*.md`

Add a blockquote as **line 3** (right under the title), leaving existing checkboxes as-is:

```markdown
> **Status: SHIPPED via PR #NNN (YYYY-MM-DD). Completed; checkboxes below not retroactively ticked.**
```

Use `PARTIALLY SHIPPED` with a one-line scope note when only part of the plan landed.

### Spec — `docs/superpowers/specs/*.md`

Rewrite the `**Status:**` / `**Pipeline state**` field off its in-progress value
(`Resume at writing-plans`, `Proposed`, …) to:

```markdown
**Status:** Shipped (PR #NNN; issue #N closed). <one-line evidence — what is now live>
```

### Breadcrumb — `docs/superpowers/decisions/*.md`

Flip the relevant sub-phase in the `**Pipeline state**` / `**Status**` field to shipped,
carrying the PR number:

```markdown
- <phase>: shipped ✅ (PR #NNN)
```

### ADR — `adrs/*.md`

Run `/adr accept <n>` (the `adr` skill's `accept` command). It rewrites `## Status` from
`Proposed` to:

```markdown
Accepted (YYYY-MM-DD) — in force: <evidence — the shipped PR / enforcing check>.
```

## Where this is enforced

- **PR template** (`.github/pull_request_template.md`) — a "Trailing docs close-out"
  checklist prompts you at every PR.
- **`adr` skill** (`skills/adr/SKILL.md`) — the `accept` command owns the ADR half.

There is intentionally no `validate.fish` CI gate for this (see issue #507): a static,
offline validator cannot reliably match a *forgotten* close-out to its merged PR. If drift
recurs despite the gates above, the next step is a merge-event GitHub Actions workflow, not
a validator phase.
