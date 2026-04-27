# `/architecture-overview` — Design Spec

**Issue:** #44
**Status:** Approved (2026-04-26)
**Scope:** MVP (sections 1-4 only; Mermaid + challenge pass + risk-register feed deferred to v2)

## Problem

A new engineering leader (VP/Director) starting a role needs a credible whole-system mental model within the first week. Reading one repo at a time (`/onboard`) is too narrow. No existing skill produces the discovery-mode landscape map a new VP needs on day 3.

**User:** New engineering leader (VP/Director) onboarding to an unfamiliar codebase.
**Stakes:** Day-3 credibility with new staff. A confidently-wrong landscape doc is worse than no doc.
**Evidence:** Acceptance criteria + composition map captured in issue #44.

## Systems Analysis Summary

- **Dependencies:** Composes with `/onboard` (#12, precedes), `/risk-register` (#21, unbuilt), `/tech-debt-score` (#40, unbuilt), `/swot` (built), `/strategy-doc` (#42, unbuilt).
- **Second-order:** Schema coupling with unbuilt skills risks pre-commit. Mitigation: defer schema emit to v2.
- **Failure modes:** Hallucinated architecture = highest credibility risk. Mitigation: code-grounded claims only; flagged inferences (`⚠`) for everything else.
- **Org impact:** Solo owner, no migration burden, scales fine to ~20 repos.

Key risks:
1. Composition with unbuilt skills (mitigated by deferral).
2. Hallucinated claims (mitigated by citation requirement + inference flagging).
3. Output staleness (mitigated by date-stamped archive on re-run).

## Approach Decisions

| Fork | Picked | Why |
|---|---|---|
| Scope | A — MVP sections 1-4 | Field-test before adding sections that may not be needed; defer #21 schema coupling |
| Anti-hallucination | B — code-grounded + flagged inferences | A misses runtime deps; C burns time budget; B with strict tagging gives coverage + audit trail |
| Output structure | C — single doc + dated archive | Single source of truth + history audit; per-repo split premature for repo count <10 |

## Design

### Inputs & Invocation

- **Slash command:** `/architecture-overview [repos.yaml]`
- **Default config:** `docs/onboarding/repos.yaml`
- **Fallback:** prompt to create config if missing.

**Config shape:**

```yaml
context:
  org: "Acme Corp"
  role: "VP Engineering"
  date_started: "2026-05-01"
repos:
  - path: ~/repos/acme-api
    purpose: "Public REST API"        # optional
    owner: "Platform team"            # optional
  - path: ~/repos/acme-worker
```

### Per-Repo Scan Logic

**Code-grounded extractions (no inference):**

- Stack — `package.json`, `Cargo.toml`, `go.mod`, `pyproject.toml`, `Gemfile`, `pom.xml`
- Direct deps — manifest dep lists
- Service hints — `Dockerfile`, `docker-compose.yml`, `k8s/*.yaml`, `serverless.yml`, `Procfile`
- README first 50 lines (anchors purpose claim)
- ADRs/SDRs — `adrs/*.md`, `docs/adrs/*.md`, `sdrs/*.md`
- Entry points — `main.*`, `index.*`, `cmd/*/main.go`, `src/main/`

**Flagged inferences (prefixed `⚠ inferred —`):**

- Likely external services from env vars (`*_URL`, `*_API_KEY`, `DATABASE_URL`)
- Probable inter-repo calls from import patterns or domain names
- Inferred owner team from CODEOWNERS, commit-author frequency

**Refusal cases:**

- No manifest + no Dockerfile + no entry point → "cannot characterize — needs user input"
- Path not readable → flag + skip
- Repo > 10k files → cap depth, note truncation

**Per-repo emit format:**

```markdown
### <repo-name>
**Purpose:** <from README first heading or user-supplied>
**Stack:** <from manifest>
**Direct deps:** <from manifest, top 10 by import frequency>
**Likely externals:** ⚠ <env-var-derived> — confirm
**Entry points:** <files>
**ADRs/SDRs found:** <count + paths>
**Source citations:** <file:line per claim>
**Gaps:** <unscannable areas>
```

### Landscape Doc Structure

**Path:** `docs/architecture/landscape.md` (canonical) + `docs/architecture/archive/landscape-YYYY-MM-DD-HHMM.md` on re-run.

```markdown
# Architecture Landscape — <org>
*Captured: 2026-05-03 by /architecture-overview · DRAFT — probe gaps in 1:1s*

## 1. Systems Inventory
| Repo | Purpose | Stack | Owner | Status |
|---|---|---|---|---|
| acme-api | Public REST API | Node 20 / Express | Platform | active |
| acme-worker | Job processor | Go 1.22 | ⚠ inferred: Platform | active |

## 2. Dependency Map
- acme-web → acme-api (HTTP, citation: src/api.ts:8)
- acme-api → acme-worker ⚠ inferred from `WORKER_QUEUE_URL` env var — confirm
- acme-api → Postgres (DATABASE_URL)

## 3. Data Flow
- Ingress: acme-web (browser) + acme-api (public)
- Storage: Postgres (acme-api), S3 ⚠ inferred from `S3_BUCKET` env var
- Egress: <none scanned>

## 4. External Integrations
| Service | Repo | Evidence | Cost / lock-in note |
|---|---|---|---|
| Stripe | acme-api | package.json: `stripe@14` | payment lock-in, high switching cost |
| SendGrid | acme-worker | env: `SENDGRID_API_KEY` | ⚠ inferred — confirm |

## Gaps to probe in 1:1s
- acme-worker owner unconfirmed (CODEOWNERS missing)
- No ADRs found — ask if architecture decisions are tracked elsewhere
- 3 services share Postgres — confirm if intentional or migration debt

## Per-repo detail
<links to per-repo sections>
```

### Assembly Order

1. Run all per-repo scans
2. Cross-reference: dedupe externals across repos → Section 4
3. Cross-reference: find repos sharing same external → flag as data-gravity in Gaps
4. Archive prior `landscape.md` if exists → `archive/landscape-<timestamp>.md`
5. Write new canonical doc
6. Print summary: "Landscape captured. N repos, M flagged inferences, K gaps. Next: probe gaps in 1:1s."

### File Layout

```
skills/architecture-overview/
  SKILL.md                          # frontmatter + workflow
  templates/
    repos.yaml.template
    landscape.md.template
    per-repo-section.md.template
  evals/
    evals.json
commands/
  architecture-overview.md          # slash routing → Skill tool
```

Touched (not created): `bin/link-config.fish` symlink pickup (idempotent).

### SKILL.md Frontmatter

```yaml
---
name: architecture-overview
description: Use when user says /architecture-overview, "map the architecture", "landscape of these repos", or wants a whole-system technical inventory across multiple repos for new-role onboarding. Produces inventory + dep map + data flow + integrations doc with code citations and flagged inferences. Do NOT use for single-repo deep dive (use /onboard) or new-system design (use /sdr).
---
```

### Anti-Hallucination Guardrails (load-bearing)

- Every claim in inventory/deps/integrations sections MUST cite file path; if no citation, prefix `⚠ inferred —`
- Owner claims without CODEOWNERS evidence MUST be `⚠ inferred` or `⚠ unknown`
- Skill MUST NOT invent service names not present in code/config
- Final pass: grep doc for unflagged proper nouns missing citations → flag

### Evals (MVP set, 4 evals)

1. **`produces-doc-from-yaml`** — given fixture yaml + 2 mini repos, produces `landscape.md` with Sections 1-4. Structural: file exists, all 4 headings present.
2. **`flags-inferences`** — fixture has env-var-only external (no manifest dep) → output must contain `⚠ inferred` tag for that external. Forbidden regex: external name without `⚠`.
3. **`refuses-on-empty-repo`** — repo with no manifest/Dockerfile/entry → output cites repo in "Gaps" not in "Inventory" with confident claim.
4. **`archives-on-rerun`** — pre-existing `landscape.md` → after run, `archive/landscape-*.md` exists, canonical updated. Structural: file count assertion.

### Composition Contracts

- **Risk-register feed (#21):** NOT emitted in v1. Sections 5-6 deferred.
- **`/onboard` (#12):** MVP doc has "Per-repo detail" section `/onboard` can read for prioritization hints.
- **`/tech-debt-score` (#40):** no coupling in v1.

## Out of Scope (v2)

- Mermaid C4 diagrams (context + container)
- Challenge pass (SPOF detection, oldest-component, missing-owner sweep)
- Risk-register schema emit (waits on #21 design)
- Tech-debt scoring hooks (waits on #40)

## Acceptance Criteria (issue #44 — partial in v1)

- [x] Produces landscape document from a list of repo inputs
- [ ] Generates at least C4 context and container Mermaid diagrams — **deferred to v2**
- [ ] Surfaces SPOF and risk candidates automatically — **deferred to v2 challenge pass**
- [ ] Writes risk items in the /risk-register format for #21 integration — **deferred to v2**
- [x] Handles both polyrepo and monorepo layouts (config takes paths regardless of layout)
- [x] Flags gaps the skill cannot see and prompts the user to probe them in 1:1s
- [x] Works standalone or as part of the onboarding toolkit
