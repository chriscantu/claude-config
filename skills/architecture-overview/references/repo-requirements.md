# Repo Requirements — `/architecture-overview`

## Hard (skill refuses)

- Readable directory; URL entries must clone successfully (auth surfaced as
  inferred-only entry, doesn't block other repos).
- Output path writable; refuses to write inside `claude-config`.

## Soft (graceful degrade)

| Missing | Effect |
|---|---|
| `.git/` | No HEAD SHA in frontmatter, no last-commit-age. Marked *"non-git path"* |
| Dependency manifest | `dependencies.md` says *"no manifest detected — deps inferred from import scan only"* |
| `README.md` | Narrative thinner |
| Tests directory | Brittleness signal *"no test surface"* added |
| `CONTEXT.md` / `CONTEXT-MAP.md` | Generic LANGUAGE.md vocab only |
| `docs/adr/` | No ADR cross-reference |

## Auto-skipped

`node_modules/`, `vendor/`, `.git/`, `dist/`, `build/`, `.next/`, `target/`,
`__pycache__/`, files > 1 MB, non-UTF8 binaries.

## Edge cases

- **Monorepo with multiple packages** — `repos.yaml` entry can specify
  `packages: [services/billing, services/users]`; each package becomes a separate
  inventory entry.
- **Private repos requiring SSH/token auth** — defers to user's `gh auth` /
  SSH agent. Clone fail → inferred-only entry, not skill error.
- **Empty repo** — produces inventory entry *"newly initialized, no architecture
  surface yet"*.
