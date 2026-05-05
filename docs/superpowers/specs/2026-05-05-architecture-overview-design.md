# `/architecture-overview` — Design Spec (revised)

**Issue:** #44
**Status:** Approved (2026-05-05)
**Supersedes:** [`2026-04-26-architecture-overview-design.md`](2026-04-26-architecture-overview-design.md) — pivot driven by vocabulary-alignment requirement (`LANGUAGE.md`) + 4-file bundle vs single doc.

## Context

`/onboard` (issue #12) shipped in 5 phases by 2026-05-01. Its body explicitly defers
codebase-landscape work to this skill. The 04-26 spec captured the discovery flow but
was authored before two requirements crystallized:

1. **Vocabulary alignment with `/improve-codebase-architecture`.** Both skills must
   speak the same architectural language (Module / Interface / Implementation / Depth /
   Seam / Adapter / Leverage / Locality). Vocabulary drift forces the leader to
   retranslate every pass.
2. **Multi-repo / multi-component scaling.** A single `landscape.md` doesn't scale
   beyond a handful of repos. Splitting into a 4-file bundle (one per concern) keeps
   each file scannable.

This revision encodes both, adds URL inputs (clone-on-demand for cold-start ramps),
and introduces a small TS helper for deterministic metrics so the skill produces
**observation-only** brittleness signals rather than hallucinated nominations.

## Problem

**User**: Newly-hired senior eng leader (Director / VP) at day 3-7 of a ramp.
Secondary consumer: `/improve-codebase-architecture`.

**Problem**: No skill produces discovery-mode multi-repo technical landscape using
vocabulary aligned with `LANGUAGE.md` and project `CONTEXT.md` domain terms.
Vocabulary drift forces retranslation when downstream skills consume output.

**Stakes**: Wrong-bet quick-win under 90-day pressure (#12 documented failure mode).
`/improve-codebase-architecture` SKILL.md asserts a composition contract
("/architecture-overview runs FIRST in onboarding mode") with no producer.

## Systems Analysis Summary

- **Dependencies**: per-org `/onboard` workspace (default output target),
  `/improve-codebase-architecture` (downstream vocab consumer), shared
  `LANGUAGE.md` (canonical vocab), `Explore` subagent, `validate.fish` concept
  enforcement.
- **Second-order effects**: vocabulary lock-in across the skill chain;
  inference-marking convention enforceable later via `validate.fish`; `/onboard`
  will eventually want auto-invoke (deferred).
- **Failure modes**: hallucinated `[observed]` claims (counter-purpose);
  vocab drift; missing `LANGUAGE.md` at runtime; output landing in wrong repo;
  stale-output silent rot.
- **Org impact**: solo user, opt-in slash command, reversible. No on-call.

**Key risks**:
1. Hallucinated observed-claims erode credibility — **mitigation**: italic-default
   for narrative claims, plain text only when helper script or explicit code
   evidence proves the claim.
2. Output-location discipline — **mitigation**: skill refuses writes inside
   `claude-config`; defaults to per-org workspace; `--output` override.
3. Vocab-drift enforcement — **mitigation**: `tests/required-concepts.txt`
   patterns guard canonical terms.

## Approach Decisions

| Fork | Picked | Why |
|---|---|---|
| Output shape | 4-file bundle | Scales w/ org complexity; old single-doc design didn't |
| Inference marking | Italic + section disclaimer | Cleaner / skimmable than per-claim tags |
| Output location | Per-org workspace by default; `--output` override | Confidentiality boundary inherits from `/onboard`; team-publish is separate event |
| Composition w/ `/improve-codebase-architecture` | Vocab-only (loose) | YAGNI auto-discovery; existing skill body already says "or live codebase" |
| LANGUAGE.md location | Promote to shared `references/` root | Removes install-order coupling; sets pattern for future skills |
| Brittleness detection | Observation-only signals (caller count, test presence, recency) | Skill-invented nominations risk false confidence (Q3-B) |
| Skill structure | Hybrid: SKILL.md orchestrates; TS helper computes metrics | Pure-prompt hallucinates numbers; full-TS over-builds |
| URL input | In scope; clone to `~/.cache/architecture-overview/` | Leader can run cold from day-1 before dev env exists |
| Cache location | Default + interactive prompt + `--clone-cache` flag | Disk/encryption preferences vary; matches `/onboard` workspace prompt pattern |

## Design

### Inputs & Invocation

- **Slash command**: `/architecture-overview --repos <yaml-path | csv> [--output <path>] [--clone-cache <path>] [--no-fetch]`
- **Default config**: `repos.yaml` at workspace root if present; else CLI args required
- **Each repo entry**: local path or git URL; mixed allowed

```yaml
context:
  org: "Acme Corp"
  role: "VP Engineering"
  date_started: "2026-05-01"
repos:
  - path: ~/work/billing-service
    purpose: "billing intake"     # optional
    owner: "Platform"             # optional
  - url: https://github.com/acme/users
    name: users-service           # optional override; else inferred from URL
```

### Repo Requirements

**Hard** (skill refuses):
- Readable directory; URL-entries must clone successfully (auth surfaced as inferred-only entry, doesn't block other repos)
- Output path writable; refuses to write inside `claude-config`

**Soft** (graceful degrade):

| Missing | Effect |
|---|---|
| `.git/` | No HEAD SHA in frontmatter, no last-commit-age metric. Marked *"non-git path"* |
| Dependency manifest | `dependencies.md` says *"no manifest detected — deps inferred from import scan only"* |
| `README.md` | Narrative thinner; Explore agent works from source structure alone |
| Tests directory | Brittleness signal *"no test surface"* added |
| `CONTEXT.md` / `CONTEXT-MAP.md` | Skill uses generic `LANGUAGE.md` vocab only |
| `docs/adr/` | No ADR cross-reference; lighter pass |

**Auto-skipped** (config, not requirement): `node_modules/`, `vendor/`, `.git/`, `dist/`, `build/`, `.next/`, `target/`, `__pycache__/`, files > 1 MB, non-UTF8 binaries.

**Edge cases**:
- Monorepo with multiple packages — `repos.yaml` entry can specify `packages: [services/billing, services/users]`; each package becomes a separate inventory entry.
- Private repos requiring SSH/token auth — defers to user's existing `gh auth` / SSH agent. Clone fail → inferred-only entry, not skill error.
- Empty repo — produces inventory entry *"newly initialized, no architecture surface yet"*.

### Skill Orchestration (`SKILL.md` flow)

1. **Parse input** — resolve `--repos` into `[{name, source: path|url}]` list.
2. **Cache prompt** — if any URL entry AND no `--clone-cache` flag: skill emits a conversational prompt (plain assistant text — not the `AskUserQuestion` tool) confirming clone target (default: `~/.cache/architecture-overview/`). Waits for user reply; treats empty / "default" / "yes" as accept-default.
3. **Resolve repos** in parallel:
   - Path → verify readable; bail-soft on error.
   - URL → `git clone --depth=1 <url> <cache>/<host>/<owner>/<repo>` unless already present; `git fetch --depth=1` unless `--no-fetch`.
4. **Walk** in parallel per repo:
   - Dispatch `Explore` subagent for narrative discovery (italic-default — narrative claims are inferred unless code-cited).
   - Run `bunx run bin/architecture-overview/repo-stats.ts --repo <path> --json` for deterministic metrics.
5. **Aggregate** per-repo records. Cross-repo edge resolution: if repo A imports a manifest-name matching repo B's package name, emit edge `A → B [observed]`.
6. **Vocab pass** — rewrite using `references/architecture-language.md` terms (Module / Interface / Implementation / Depth / Seam / Adapter / Leverage / Locality). Apply CONTEXT.md domain terms if present per-repo.
7. **Output guardrails** — refuse if resolved output path is inside `claude-config` (verified via `git rev-parse --show-toplevel`). Default output resolution:
   - Exactly one `~/repos/onboard-*/` workspace exists → default to `<workspace>/architecture/`.
   - Zero workspaces OR more than one → require `--output <path>`. Skill prints the candidate workspaces (if multiple) and exits with usage error.
8. **Render** 4 markdown files (see "Output Bundle"). Frontmatter includes `generated_at`, repo list with HEAD SHAs.
9. **Done** — print summary: `wrote 4 files at <path>. <N> repos scanned. <M> errors (see frontmatter).`

### Output Bundle

Common frontmatter (all 4 files):

```markdown
---
generated_by: /architecture-overview
generated_at: 2026-05-05T16:45:00Z
repos:
  - name: billing-service
    path: ~/work/billing
    head_sha: a1b2c3d4e5f6
  - name: users-service
    path: ~/.cache/architecture-overview/github.com/acme/users
    head_sha: 4e5f6a7b8c9d
language_ref: ../../references/architecture-language.md
---

> *Italics = inferred. Plain = code-grounded (script output / explicit evidence).*
```

**`inventory.md`** — per-repo entry, vocab-aligned. Includes `Module / Interface / Implementation` synthesis + signal block (test surface, last commit, manifests, TODO/FIXME density). Italic-marked likely-brittleness paragraph at end of each entry.

**`dependencies.md`** — edges between modules; cross-repo edges via manifest-name matching. Each edge has `Seam`, `Adapter`, evidence line. Plain or italic per evidence.

**`data-flow.md`** — where data enters / transforms / exits across the bundle. Numbered steps; each step tagged `[observed]` or italicized inferred.

**`integrations.md`** — external SaaS / APIs / infra. Per-integration: which repos use it, evidence (env var, dep), cost / lock-in note (italic if not detectable from code).

### Helper Script — `bin/architecture-overview/repo-stats.ts`

**Invocation**: `bun run bin/architecture-overview/repo-stats.ts --repo <path> [--json]`

**Output (JSON to stdout)**:

```json
{
  "path": "/abs/path",
  "name": "billing-service",
  "git": {
    "isGitRepo": true,
    "headSha": "a1b2c3d4e5f6",
    "lastCommitAt": "2026-04-12T14:23:00Z",
    "ageInDays": 23
  },
  "languages": { "TypeScript": 0.62, "Go": 0.31, "other": 0.07 },
  "manifests": [
    { "type": "package.json", "deps": ["express", "pg", "ioredis"], "devDeps": ["jest"] },
    { "type": "go.mod", "deps": ["github.com/lib/pq"] }
  ],
  "metrics": {
    "fileCount": 142,
    "loc": 8430,
    "testFileCount": 18,
    "hasTestDir": true,
    "todoFixmeCount": 7
  },
  "integrations": {
    "envVarsReferenced": ["DATABASE_URL", "REDIS_URL", "SENTRY_DSN"],
    "dockerfilePresent": true,
    "ciConfigs": [".github/workflows/ci.yml"]
  },
  "errors": []
}
```

**Behavior**:
- Pure read-only; no network; no writes.
- Unknown languages bucket as `"other"`.
- Manifest parse failure → `{type, error}` entry; continue.
- Missing `.git/` → `git.isGitRepo: false`, other git fields `null`.
- Auto-skip globs as listed above.
- Binary detection: file size > 1 MB or non-UTF8 first 8KB → exclude from LOC.
- Exit 0 on success even with partial errors; exit 1 only on hard failure.

### LANGUAGE.md Promotion

Move:
```
skills/improve-codebase-architecture/references/LANGUAGE.md
  → references/architecture-language.md
```

Update `skills/improve-codebase-architecture/SKILL.md` (5 reference occurrences) to point at new path.

`tests/required-concepts.txt` — append:

```
# Architecture vocabulary (canonical: references/architecture-language.md)
[Mm]odule.*[Ii]nterface | LANGUAGE Module/Interface pair must remain canonical
[Dd]eep.*[Ss]hallow | LANGUAGE depth axis must remain canonical
[Ss]eam | LANGUAGE seam term must remain canonical
[Aa]dapter | LANGUAGE adapter term must remain canonical
[Ll]everage.*[Ll]ocality|[Ll]ocality.*[Ll]everage | LANGUAGE leverage/locality pair must remain canonical
```

### File Layout

```
skills/architecture-overview/
├── SKILL.md
├── references/
│   ├── output-format.md
│   └── repo-requirements.md
└── evals/evals.json

bin/architecture-overview/
└── repo-stats.ts

references/architecture-language.md         # promoted from improve-codebase-architecture

skills/improve-codebase-architecture/SKILL.md   # updated reference path

commands/architecture-overview.md            # slash hook

tests/architecture-overview.test.ts          # repo-stats.ts unit tests
tests/fixtures/architecture-overview/{ts-only,go-only,monorepo,no-manifest,non-git,empty}/
```

### Slash Hook

```markdown
---
description: Discovery-mode multi-repo technical landscape — produces 4-file bundle (inventory, dependencies, data flow, integrations) using LANGUAGE.md vocab. Use for new-leader codebase ramp; do NOT use for single-repo grading (/improve-codebase-architecture) or new-system design (/sdr).
argument-hint: --repos <yaml-or-csv> [--output <path>] [--clone-cache <path>] [--no-fetch]
---

Invoke the architecture-overview skill with the supplied arguments.
```

## Acceptance Criteria

- [ ] `references/architecture-language.md` exists; `skills/improve-codebase-architecture/SKILL.md` references new path; old path removed.
- [ ] `tests/required-concepts.txt` updated; `fish validate.fish` passes.
- [ ] `skills/architecture-overview/SKILL.md` ships with orchestration flow.
- [ ] `skills/architecture-overview/references/{output-format.md,repo-requirements.md}` shipped.
- [ ] `bin/architecture-overview/repo-stats.ts` emits JSON per contract.
- [ ] `tests/architecture-overview.test.ts` covers all fixtures; all pass.
- [ ] `commands/architecture-overview.md` shipped; slash invocation works.
- [ ] `bin/link-config.fish --check` passes after install.
- [ ] `tsc --noEmit` clean across `bin/` + `tests/`.
- [ ] Smoke: `/architecture-overview --repos <self-repo>` against `claude-config` itself produces 4 valid markdown files.
- [ ] Smoke: URL input clones to cache and renders inventory entry.

## Verification (per goal-driven plan)

1. **Promote LANGUAGE.md** → verify: `git mv` clean; grep finds zero `references/LANGUAGE.md` strings outside historical references.
2. **Add concept patterns** → verify: `fish validate.fish` exits 0.
3. **Build repo-stats.ts** → verify: `bun test tests/architecture-overview.test.ts` all green.
4. **Build SKILL.md + references** → verify: skill loads via `Skill` tool without error; manual dry-run prints expected stages.
5. **Build slash command** → verify: `link-config.fish` symlinks; `/architecture-overview --help` returns argument-hint.
6. **End-to-end smoke** → verify: 4 files written; frontmatter valid YAML; italic markers present where evidence absent.

## Out of Scope (deferred to follow-up issues)

- Auto-discovery handshake with `/improve-codebase-architecture` (vocab-only composition is sufficient for v1).
- ADR-conflict surfacing depth (skill reads ADRs but does not grade contradictions).
- Brittleness heuristic nomination (observation-only for v1).
- Mermaid render of dependency graph (text-only output for v1).
- Concept-validation phase enforcing italic-on-inferred discipline (convention-only for v1).
- C4 context / container diagrams (deferred from old 04-26 spec — still deferred).
- SPOF / risk-register feed (#21 unbuilt).
- `/tech-debt-score` hooks (#40 unbuilt).
