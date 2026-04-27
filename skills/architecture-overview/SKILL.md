---
name: architecture-overview
description: >
  Use when user says /architecture-overview, "map the architecture", "landscape of
  these repos", or wants a whole-system technical inventory across multiple repos
  for new-role onboarding. Produces inventory + dep map + data flow + integrations
  doc with code citations and flagged inferences. Do NOT use for single-repo deep
  dive (use /onboard), new-system design (use /sdr), or organizational/people
  landscape analysis (use /swot).
---

# /architecture-overview — Whole-System Landscape

Discovery-mode architecture skill. Produces a landscape document covering systems,
dependencies, data flows, and external integrations across a list of repos.

**Announce:** "I'm using the architecture-overview skill to map the whole-system
landscape — code-grounded claims only, with flagged inferences for anything I can't
cite directly."

## When To Use

- User starting in a new role and needs day-3 mental model of the whole system
- User has multiple repos and wants a single landscape doc
- User explicitly invokes `/architecture-overview`

## When NOT To Use

- Single-repo deep dive → use `/onboard` (when available)
- New-system design → use `/sdr`
- Impact analysis of one specific change → use `/cross-project`
- Organizational/people landscape (strengths, weaknesses, stakeholders) → use `/swot`

## Inputs

**Default config path:** `docs/onboarding/repos.yaml`

**Override:** `/architecture-overview <path-to-yaml>`

**If no config found:** offer to create one from
`templates/repos.yaml.template`. Do NOT proceed without explicit repo paths.

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

## Workflow

### Step 1: Validate inputs

- Resolve config path (arg → default → prompt-create)
- For each repo path: verify directory exists and is readable
- Skipped repos go in "Gaps" section, not silently dropped

### Step 2: Per-repo scan

For each repo, extract code-grounded facts. Cite file paths for every claim.

**Code-grounded extractions:**
- Stack: read `package.json`, `Cargo.toml`, `go.mod`, `pyproject.toml`, `Gemfile`, `pom.xml`
- Direct deps: top 10 from manifest dep list (manifest order; alphabetical fallback)
- Service hints: `Dockerfile`, `docker-compose.yml`, `k8s/*.yaml`, `serverless.yml`, `Procfile`
- Purpose: first heading in README, or first non-blank paragraph after any
  frontmatter/badge block (cap search at 100 lines)
- ADRs/SDRs: search `adrs/*.md`, `docs/adrs/*.md`, `sdrs/*.md`, `doc/adr/*.md`,
  `architecture/decisions/*.md`. If 0 found, emit a Gaps item ("ADR location
  unknown — repo may use a non-standard convention"), don't silently report 0.
- Entry points: `main.*`, `index.*`, `cmd/*/main.go`, `src/main/`

**Flagged inferences (prefix `⚠ inferred —` always):**
- Likely externals from env vars (`*_URL`, `*_API_KEY`, `DATABASE_URL`)
- Inter-repo calls inferred from import patterns or domain names
- Owner team inferred from CODEOWNERS or commit-author frequency

**How to fill the per-repo template's `{{externals}}` slot:**
- Code-grounded (Dockerfile, docker-compose, manifest dep): `<service> (citation: <path>)` — NO `⚠` prefix
- Env-var-only inference: `⚠ inferred — <service> (env: <VAR_NAME>, confirm)`
- None found: `none identified`
- The template's `⚠ inferred —` prefix on the Likely externals line applies ONLY to inferred entries; cited entries use a separate cited-line format below the inferred line, or replace the line entirely if no inferred externals exist.

**Refusal cases:**
- No manifest + no Dockerfile + no entry point → list under "Gaps", do NOT
  fabricate purpose
- Path unreadable → list under "Gaps"
- Repo > 10k files → cap depth, note truncation in Gaps

Emit each repo using `templates/per-repo-section.md.template`.

### Step 3: Cross-reference pass

- Dedupe externals across repos for Section 4 (External Integrations)
- Find shared externals (e.g., 3 services share Postgres) → flag as data-gravity
  in Gaps
- Find inter-repo dependency cycles → flag in Gaps

### Step 4: Archive prior doc

- If `docs/architecture/landscape.md` exists, copy it to
  `docs/architecture/archive/landscape-YYYY-MM-DD-HHMM.md` first
- Then proceed to write the new canonical doc

### Step 5: Render landscape.md

Use `templates/landscape.md.template`. Fill the mustache placeholders:
- `{{org}}` from `context.org`
- `{{date}}` = today (ISO 8601: YYYY-MM-DD)
- `{{inventory_rows}}` = inventory table rows from per-repo scans (Section 1)
- `{{dependency_lines}}` = dependency map bullets, direct + flagged inferences (Section 2)
- `{{ingress}}` / `{{storage}}` / `{{egress}}` = data flow (Section 3)
- `{{integration_rows}}` = external integrations table rows, deduped (Section 4)
- `{{gaps}}` = aggregated gaps from per-repo scans + cross-reference pass
- `{{per_repo_detail}}` = per-repo blocks (one per repo, using the per-repo template)

Preserve the template's heading numbering exactly (`## 1. Systems Inventory`, `## 2. Dependency Map`, etc.) — do NOT improvise alternative section names like "Section 1:".

### Step 6: Summary

Print: `Landscape captured. <N> repos, <M> flagged inferences, <K> gaps. Next: probe gaps in 1:1s.` (substitute actual counts for the angle-bracketed values).

## Anti-Hallucination Guardrails (load-bearing)

- Every claim in inventory/deps/integrations sections MUST cite file path; if no
  citation, prefix `⚠ inferred —`
- Owner claims without CODEOWNERS evidence MUST be `⚠ inferred` or `⚠ unknown`
- NEVER invent service names not present in code/config
- Final pass: for each named service, library, or tool appearing in the
  inventory/deps/integrations sections, confirm it has either a `(citation:
  <path>)` reference OR a `⚠ inferred —` prefix. Flag any without either.
  (Skip section headings, bold field labels, and template-supplied tokens —
  this check targets named entities in claim positions only.)
