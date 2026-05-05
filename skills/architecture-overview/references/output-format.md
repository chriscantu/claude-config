# Output Format — `/architecture-overview` 4-File Bundle

Every bundle ships four files, all sharing the same frontmatter, all italic-marked
inferred claims, plain-text-only on code-grounded claims.

## Common Frontmatter

```yaml
---
generated_by: /architecture-overview
generated_at: 2026-05-05T16:45:00Z
repos:
  - name: billing-service
    path: ~/work/billing
    head_sha: a1b2c3d
language_ref: ../../references/architecture-language.md
---

> *Italics = inferred. Plain = code-grounded.*
```

## File 1 — `inventory.md`

Per-repo entry. Each entry uses LANGUAGE.md vocab:

```markdown
## <repo-name>

**Module**: <one-line synthesis of what this module is>.
**Interface**: <surface visible to callers — protocol, paths, events>.
**Implementation**: <stack + LOC + entry point>.

**Signals**:
- Test surface: <test file count + hasTestDir>
- Last commit: <date> (<N>d ago)
- Manifests: <list>
- TODO/FIXME: <count>

*Likely brittleness*: <observation paragraph, italic>.
```

## File 2 — `dependencies.md`

Edges between modules. Cross-repo edges resolved when a manifest dep matches another
repo's package name.

```markdown
## <source> → <target>
**Seam**: <where the call lives — file path, protocol>.
**Adapter**: <concrete client/handler>.
**Observed via**: <evidence — import statement, env var>.
```

Italic the entire entry when evidence is inferred (e.g., env var implies dependency
but no client found).

## File 3 — `data-flow.md`

Data lifecycle. Numbered steps. Each step `[observed: <evidence>]` or italicized when
inferred.

## File 4 — `integrations.md`

External SaaS / APIs. Per-integration: which repos, evidence, cost / lock-in note.
