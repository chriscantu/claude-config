# Architecture Overview Skill — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship MVP `/architecture-overview` skill (sections 1-4) per spec [`2026-04-26-architecture-overview-design.md`](../specs/2026-04-26-architecture-overview-design.md).

**Architecture:** New isolated skill at `skills/architecture-overview/`. Workflow lives in `SKILL.md`; templates render the landscape doc. Evals run against fixture mini-repos. Slash routing via `commands/architecture-overview.md`. Symlinks picked up by `bin/link-config.fish`.

**Tech Stack:** Markdown (skill + templates), JSON (eval suite), Bash/fish (symlinks), bun (eval runner already exists).

---

## File Structure

| Path | Responsibility |
|---|---|
| `skills/architecture-overview/SKILL.md` | Workflow, frontmatter, anti-hallucination rules |
| `skills/architecture-overview/templates/repos.yaml.template` | Config scaffold for users |
| `skills/architecture-overview/templates/landscape.md.template` | Main output skeleton |
| `skills/architecture-overview/templates/per-repo-section.md.template` | Per-repo block format |
| `skills/architecture-overview/evals/evals.json` | 4 evals per spec |
| `skills/architecture-overview/evals/fixtures/` | Mini-repo fixtures for evals |
| `commands/architecture-overview.md` | Slash command → Skill tool routing |
| Symlinks under `~/.claude/skills/`, `~/.claude/commands/` | Activated via `bin/link-config.fish` |

---

## Task 1: Scaffold Skill Directory + Frontmatter

**Files:**
- Create: `skills/architecture-overview/SKILL.md`
- Create: `skills/architecture-overview/templates/` (dir)
- Create: `skills/architecture-overview/evals/` (dir)

- [ ] **Step 1: Create directories**

```fish
mkdir -p skills/architecture-overview/templates skills/architecture-overview/evals/fixtures
```

- [ ] **Step 2: Write SKILL.md frontmatter + skeleton**

Create `skills/architecture-overview/SKILL.md`:

```markdown
---
name: architecture-overview
description: >
  Use when user says /architecture-overview, "map the architecture", "landscape of
  these repos", or wants a whole-system technical inventory across multiple repos
  for new-role onboarding. Produces inventory + dep map + data flow + integrations
  doc with code citations and flagged inferences. Do NOT use for single-repo deep
  dive (use /onboard) or new-system design (use /sdr).
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

- Single-repo deep dive → use `/onboard` (#12)
- New-system design → use `/sdr`
- Impact analysis of one specific change → use `/cross-project`

(Workflow added in Task 2.)
```

- [ ] **Step 3: Verify frontmatter loads**

```fish
bun run tests/eval-runner-v2.ts architecture-overview --dry-run
```

Expected: passes structural checks (no evals defined yet — runner may complain about empty evals; if so, defer this verification to Task 5).

- [ ] **Step 4: Commit**

```fish
git add skills/architecture-overview/
git commit -m "Scaffold architecture-overview skill directory + frontmatter (#44)"
```

---

## Task 2: Write SKILL.md Workflow

**Files:**
- Modify: `skills/architecture-overview/SKILL.md`

- [ ] **Step 1: Append workflow to SKILL.md**

Append to `skills/architecture-overview/SKILL.md` after the "When NOT To Use" section:

````markdown
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
- Direct deps: top 10 from manifest dep list
- Service hints: `Dockerfile`, `docker-compose.yml`, `k8s/*.yaml`, `serverless.yml`, `Procfile`
- Purpose: README first 50 lines (first heading or first paragraph)
- ADRs/SDRs: `adrs/*.md`, `docs/adrs/*.md`, `sdrs/*.md`
- Entry points: `main.*`, `index.*`, `cmd/*/main.go`, `src/main/`

**Flagged inferences (prefix `⚠ inferred —` always):**
- Likely externals from env vars (`*_URL`, `*_API_KEY`, `DATABASE_URL`)
- Inter-repo calls inferred from import patterns or domain names
- Owner team inferred from CODEOWNERS or commit-author frequency

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

Use `templates/landscape.md.template`. Fill:
- `<org>` from `context.org`
- `<date>` = today
- Section 1: Inventory table from per-repo scans
- Section 2: Dependency map (direct + flagged inferences)
- Section 3: Data flow (ingress/storage/egress)
- Section 4: External integrations (deduped table)
- Gaps: aggregated from per-repo scans + cross-reference pass
- Per-repo detail: appended at end

### Step 6: Summary

Print: `"Landscape captured. <N> repos, <M> flagged inferences, <K> gaps. Next: probe gaps in 1:1s."`

## Anti-Hallucination Guardrails (load-bearing)

- Every claim in inventory/deps/integrations sections MUST cite file path; if no
  citation, prefix `⚠ inferred —`
- Owner claims without CODEOWNERS evidence MUST be `⚠ inferred` or `⚠ unknown`
- NEVER invent service names not present in code/config
- Final pass: grep doc for proper nouns (CamelCase or capitalized words) lacking
  `⚠` flag and lacking a `(citation: path)` reference; flag any survivor
````

- [ ] **Step 2: Commit**

```fish
git add skills/architecture-overview/SKILL.md
git commit -m "Add /architecture-overview workflow to SKILL.md (#44)"
```

---

## Task 3: Write Templates

**Files:**
- Create: `skills/architecture-overview/templates/repos.yaml.template`
- Create: `skills/architecture-overview/templates/landscape.md.template`
- Create: `skills/architecture-overview/templates/per-repo-section.md.template`

- [ ] **Step 1: Write `repos.yaml.template`**

```yaml
# /architecture-overview config
# Save as docs/onboarding/repos.yaml in your project (or pass path as arg).

context:
  org: "Your Org Name"
  role: "Your Role"           # e.g., "VP Engineering"
  date_started: "YYYY-MM-DD"

repos:
  - path: ~/repos/example-api
    purpose: "Public REST API"   # optional — anchors purpose claim
    owner: "Platform team"       # optional — anchors owner claim
  - path: ~/repos/example-worker
  # Add one entry per repo. Paths must be readable.
```

- [ ] **Step 2: Write `landscape.md.template`**

```markdown
# Architecture Landscape — {{org}}

*Captured: {{date}} by /architecture-overview · DRAFT — probe gaps in 1:1s*

## 1. Systems Inventory

| Repo | Purpose | Stack | Owner | Status |
|---|---|---|---|---|
{{inventory_rows}}

## 2. Dependency Map

{{dependency_lines}}

## 3. Data Flow

- **Ingress:** {{ingress}}
- **Storage:** {{storage}}
- **Egress:** {{egress}}

## 4. External Integrations

| Service | Repo(s) | Evidence | Cost / lock-in note |
|---|---|---|---|
{{integration_rows}}

## Gaps to probe in 1:1s

{{gaps}}

---

## Per-repo detail

{{per_repo_detail}}
```

- [ ] **Step 3: Write `per-repo-section.md.template`**

```markdown
### {{repo_name}}

**Purpose:** {{purpose}}
**Stack:** {{stack}} (citation: {{stack_citation}})
**Direct deps:** {{direct_deps}}
**Likely externals:** {{externals}}
**Entry points:** {{entry_points}}
**ADRs/SDRs found:** {{adr_count}} ({{adr_paths}})
**Source citations:** {{citations}}
**Gaps:** {{gaps}}
```

- [ ] **Step 4: Commit**

```fish
git add skills/architecture-overview/templates/
git commit -m "Add architecture-overview templates (config + landscape + per-repo) (#44)"
```

---

## Task 4: Write Slash Command File

**Files:**
- Create: `commands/architecture-overview.md`

- [ ] **Step 1: Check existing command pattern**

```fish
ls commands/
cat commands/(ls commands/ | head -1)
```

If `commands/` is sparse (only `review-pr-surgical.md` existed at plan time), the convention is one short file per command that routes to its skill. If a different pattern is established, follow that pattern instead.

- [ ] **Step 2: Write command routing file**

Create `commands/architecture-overview.md`:

```markdown
---
description: Map the architecture landscape across multiple repos (issue #44)
---

Invoke the `architecture-overview` skill to produce a whole-system landscape
document from a list of repos.

Usage:
  /architecture-overview [path-to-repos.yaml]

Defaults to `docs/onboarding/repos.yaml` when no arg supplied.
```

- [ ] **Step 3: Commit**

```fish
git add commands/architecture-overview.md
git commit -m "Add /architecture-overview slash command routing (#44)"
```

---

## Task 5: Build Eval Fixtures

**Files:**
- Create: `skills/architecture-overview/evals/fixtures/repos.yaml`
- Create: `skills/architecture-overview/evals/fixtures/repo-a/package.json`
- Create: `skills/architecture-overview/evals/fixtures/repo-a/README.md`
- Create: `skills/architecture-overview/evals/fixtures/repo-a/src/index.js`
- Create: `skills/architecture-overview/evals/fixtures/repo-b/Dockerfile`
- Create: `skills/architecture-overview/evals/fixtures/repo-b/.env.example`
- Create: `skills/architecture-overview/evals/fixtures/repo-b/main.go`
- Create: `skills/architecture-overview/evals/fixtures/repo-empty/.gitkeep`

- [ ] **Step 1: Build `repo-a` (Node service with manifest)**

`skills/architecture-overview/evals/fixtures/repo-a/package.json`:

```json
{
  "name": "repo-a",
  "version": "0.1.0",
  "dependencies": {
    "express": "^4.18.0",
    "stripe": "^14.0.0"
  }
}
```

`skills/architecture-overview/evals/fixtures/repo-a/README.md`:

```markdown
# repo-a

Public REST API for orders.
```

`skills/architecture-overview/evals/fixtures/repo-a/src/index.js`:

```javascript
const express = require('express');
const app = express();
app.listen(3000);
```

- [ ] **Step 2: Build `repo-b` (Go service with env-only externals)**

`skills/architecture-overview/evals/fixtures/repo-b/Dockerfile`:

```dockerfile
FROM golang:1.22
COPY . /app
WORKDIR /app
RUN go build -o worker
CMD ["./worker"]
```

`skills/architecture-overview/evals/fixtures/repo-b/.env.example`:

```sh
SENDGRID_API_KEY=
WORKER_QUEUE_URL=
```

`skills/architecture-overview/evals/fixtures/repo-b/main.go`:

```go
package main

import "fmt"

func main() {
	fmt.Println("worker running")
}
```

- [ ] **Step 3: Build `repo-empty` (refusal case)**

```fish
mkdir -p skills/architecture-overview/evals/fixtures/repo-empty
touch skills/architecture-overview/evals/fixtures/repo-empty/.gitkeep
```

- [ ] **Step 4: Build fixture config**

`skills/architecture-overview/evals/fixtures/repos.yaml`:

```yaml
context:
  org: "Fixture Org"
  role: "Test Engineer"
  date_started: "2026-04-26"
repos:
  - path: ./skills/architecture-overview/evals/fixtures/repo-a
    purpose: "Order API"
  - path: ./skills/architecture-overview/evals/fixtures/repo-b
  - path: ./skills/architecture-overview/evals/fixtures/repo-empty
```

- [ ] **Step 5: Commit**

```fish
git add skills/architecture-overview/evals/fixtures/
git commit -m "Add architecture-overview eval fixtures (3 mini-repos + config) (#44)"
```

---

## Task 6: Write evals.json

**Files:**
- Create: `skills/architecture-overview/evals/evals.json`

- [ ] **Step 1: Write the eval file**

Create `skills/architecture-overview/evals/evals.json`:

```json
{
  "skill": "architecture-overview",
  "description": "Behavioral evals for /architecture-overview MVP (sections 1-4 only). Covers: doc-from-yaml, inference flagging, refusal-on-empty-repo, archive-on-rerun.",
  "evals": [
    {
      "name": "produces-doc-from-yaml",
      "summary": "Given fixture yaml + 2 mini repos + 1 empty, produces landscape.md with all 4 MVP sections.",
      "prompt": "/architecture-overview skills/architecture-overview/evals/fixtures/repos.yaml — produce the landscape doc to a temp path (do not write to docs/architecture/landscape.md during the eval). Show the full doc inline.",
      "assertions": [
        { "type": "skill_invoked", "skill": "architecture-overview", "description": "skill fires" },
        { "type": "regex", "pattern": "^##\\s*1\\.\\s*Systems Inventory", "flags": "im", "description": "Section 1 heading present" },
        { "type": "regex", "pattern": "^##\\s*2\\.\\s*Dependency Map", "flags": "im", "description": "Section 2 heading present" },
        { "type": "regex", "pattern": "^##\\s*3\\.\\s*Data Flow", "flags": "im", "description": "Section 3 heading present" },
        { "type": "regex", "pattern": "^##\\s*4\\.\\s*External Integrations", "flags": "im", "description": "Section 4 heading present" }
      ]
    },
    {
      "name": "flags-inferences",
      "summary": "Env-var-only externals (SendGrid in repo-b) must be flagged with ⚠ inferred.",
      "prompt": "/architecture-overview skills/architecture-overview/evals/fixtures/repos.yaml — produce the landscape doc inline. Focus on Section 4 External Integrations.",
      "assertions": [
        { "type": "regex", "pattern": "(SendGrid|sendgrid).{0,80}⚠", "flags": "is", "description": "SendGrid (env-var-derived) carries ⚠ inferred flag" },
        { "type": "not_regex", "pattern": "^[^⚠\\n]*\\bSendGrid\\b[^⚠\\n]*$", "flags": "im", "description": "No SendGrid line lacks the ⚠ flag" }
      ]
    },
    {
      "name": "refuses-on-empty-repo",
      "summary": "repo-empty has no manifest/Dockerfile/entry — must list under Gaps, not in Inventory with confident claim.",
      "prompt": "/architecture-overview skills/architecture-overview/evals/fixtures/repos.yaml — produce the landscape doc inline. How is repo-empty handled?",
      "assertions": [
        { "type": "regex", "pattern": "(Gaps|gaps|cannot characterize|needs user input|unknown).{0,200}repo-empty", "flags": "is", "description": "repo-empty cited under Gaps or refusal language" },
        { "type": "not_regex", "pattern": "\\|\\s*repo-empty\\s*\\|\\s*[A-Za-z][^|⚠]*\\s*\\|", "flags": "i", "description": "repo-empty does NOT appear in inventory table with a confident purpose claim" }
      ]
    },
    {
      "name": "archives-on-rerun",
      "summary": "Documents the archive behavior. Eval asserts the skill describes archive-on-rerun in its run plan (the actual file move is exercised at use-time, not in eval).",
      "prompt": "/architecture-overview skills/architecture-overview/evals/fixtures/repos.yaml — pretend a prior landscape.md already exists at docs/architecture/landscape.md. Walk me through your steps before writing the new one.",
      "assertions": [
        { "type": "regex", "pattern": "(archive|archives|archived).{0,80}(landscape|prior|existing)", "flags": "i", "description": "archive step described" },
        { "type": "regex", "pattern": "docs/architecture/archive/landscape-", "flags": "i", "description": "archive path format cited" }
      ]
    }
  ]
}
```

- [ ] **Step 2: Validate eval file (dry run)**

```fish
bun run evals architecture-overview --dry-run
```

Expected: `architecture-overview` listed; no schema/regex errors. If dry-run fails, fix and re-run.

- [ ] **Step 3: Commit**

```fish
git add skills/architecture-overview/evals/evals.json
git commit -m "Add architecture-overview evals (4 evals, MVP coverage) (#44)"
```

---

## Task 7: Wire Symlinks + Run Evals

**Files:**
- Modify: nothing (idempotent symlink script picks up new files)

- [ ] **Step 1: Run install script**

```fish
./bin/link-config.fish
```

Expected: creates `~/.claude/skills/architecture-overview` and `~/.claude/commands/architecture-overview.md` symlinks. Should be idempotent on re-run.

- [ ] **Step 2: Verify install**

```fish
./bin/link-config.fish --check
```

Expected: exits 0.

- [ ] **Step 3: Run evals against current main**

```fish
bun run evals architecture-overview
```

Expected: at least the structural assertions on `produces-doc-from-yaml` and `flags-inferences` pass. Some text-channel assertions may fail on first run — note which.

- [ ] **Step 4: Diagnose failures**

For each failing eval:
- Read the transcript at `tests/results/architecture-overview-<name>-v2-*.md`
- Determine if failure is (a) skill bug, (b) eval-too-strict, or (c) prompt issue
- Fix the load-bearing one (skill > eval). Avoid lowering eval rigor to chase a green run — a too-loose eval is worse than a known failure.

- [ ] **Step 5: Iterate**

If any required-tier assertion fails on real (non-dry) run:
- Skill bug → edit `SKILL.md`, re-run evals
- Eval-too-strict → tighten prompt or relax pattern with explicit comment in eval description; commit separately

- [ ] **Step 6: Commit any fixes**

```fish
git add skills/architecture-overview/
git commit -m "Iterate architecture-overview to green eval state (#44)"
```

---

## Task 8: Open PR

**Files:**
- None (PR creation only)

- [ ] **Step 1: Verify branch state**

```fish
git status
git log --oneline main..HEAD
```

Expected: clean working tree, ~7 commits on `feature/architecture-overview-skill`.

- [ ] **Step 2: Run validation gate**

```fish
./bin/link-config.fish --check
./bin/check-rules-drift.fish
./bin/validate.fish
bun run evals architecture-overview
```

Expected: all four exit 0.

- [ ] **Step 3: Push + open PR**

```fish
git push -u origin feature/architecture-overview-skill
```

Then create PR via `gh pr create` with body listing:
- Closes (partial — MVP scope) #44
- Links spec + plan
- Acceptance criteria checked off (those that apply to MVP)
- Test plan: dry-run evals, real-run evals, manual smoke against a real repo set

---

## Self-Review

**Spec coverage:**
- Inputs/Invocation → Task 2 (workflow Step 1) + Task 3 (template) + Task 4 (command)
- Per-repo scan → Task 2 (workflow Step 2) + Task 3 (per-repo template)
- Landscape doc → Task 2 (workflow Step 5) + Task 3 (landscape template)
- Anti-hallucination → Task 2 (Anti-Hallucination Guardrails section)
- 4 evals → Task 6
- File layout → Tasks 1-6 cover all listed files
- Composition contracts (no risk-register emit in v1) → enforced by absence in template

**Placeholder scan:** No TBD/TODO. All code blocks complete. All commands exact.

**Type consistency:** Template variable names consistent: `{{org}}`, `{{date}}`, `{{inventory_rows}}`, etc. used same way in landscape template + workflow.

**Risk: Mermaid not in MVP** — confirmed deferred to v2 in spec; plan does NOT add Mermaid task.

**Risk: command file convention** — commands/ dir is sparse at plan time. Task 4 Step 1 has the engineer check the existing pattern first; if a different convention exists, follow it.
