---
name: architecture-overview
description: Slash-invoked discovery-mode skill that scans multiple repos and produces a 4-file landscape bundle (inventory, dependencies, data flow, integrations) using the canonical LANGUAGE.md vocabulary (Module / Interface / Depth / Seam / Adapter / Leverage / Locality). Use when a new senior eng leader needs a credible whole-system mental model on day 3-7 of a ramp. Do NOT use for single-repo deepening grading (use /improve-codebase-architecture), a single architectural choice (use /adr), a system-level design record (use /sdr), or tool/framework adoption (use /tech-radar).
disable-model-invocation: true
status: experimental
version: 0.1.0
---

# Architecture Overview

Discovery-mode multi-repo landscape mapper. Walks each repo with an Explore subagent
for narrative discovery and runs `bin/architecture-overview/repo-stats.ts` for
deterministic metrics. Produces 4 markdown files using shared architectural
vocabulary so downstream skills (notably `/improve-codebase-architecture`) consume
without retranslation.

**Announce at start:** "I'm using the architecture-overview skill to produce a
discovery-mode landscape across the supplied repos."

## When To Use

- New eng leader needs day-3 whole-system mental model
- User explicitly invokes `/architecture-overview`
- User asks to "map the architecture", "produce a landscape doc", "list the services"

## When NOT To Use

- Single-repo deepening grading → `/improve-codebase-architecture`
- Single architectural choice with named alternatives → `/adr`
- System-level design record → `/sdr`
- Tool/framework adoption evaluation → `/tech-radar`

## Inputs

- `--repos <yaml-or-csv>` — path to a `repos.yaml` config OR comma-separated paths/URLs
- `--output <path>` — override default output dir
- `--clone-cache <path>` — override URL clone target (default `~/.cache/architecture-overview/`)
- `--no-fetch` — skip `git fetch` on already-cached URL clones

## Glossary (canonical: [`architecture-language.md`](../../references/architecture-language.md))

Use these terms exactly:

- **Module** — anything with an interface and an implementation
- **Interface** — everything a caller must know
- **Implementation** — what's inside
- **Depth** — leverage at the interface
- **Seam** — where the interface lives
- **Adapter** — concrete thing satisfying an interface at a seam
- **Leverage** — what callers get from depth
- **Locality** — what maintainers get from depth

Avoid: "component", "service", "API", "boundary".

## Process

### 1. Parse Input

Resolve `--repos` into `[{name, source: path | url}]`. Reject unparseable entries
with a clear error.

### 2. Cache Prompt (URL Inputs Only)

If any entry is a URL AND `--clone-cache` was not supplied, emit a conversational
prompt:

> "I'll need to clone the URL repos. Default cache: `~/.cache/architecture-overview/`.
> Press enter or type 'default' to accept, or supply a path."

Wait for user reply. Treat empty / "default" / "yes" as accept-default.

### 3. Resolve Repos (Parallel)

For each entry:

- **Path** → verify readable directory; bail-soft on error (record in repo entry,
  don't abort the whole run).
- **URL** → `git clone --depth=1 <url> <cache>/<host>/<owner>/<repo>` if not
  already present; `git fetch --depth=1` unless `--no-fetch`. Auth failures surface
  as inferred-only inventory entries.

### 4. Walk (Parallel per Repo)

Two parallel sources per repo:

- **`Explore` subagent** for narrative — read `CONTEXT.md` / ADRs if present,
  walk source, produce inventory / dependencies / data-flow / integrations
  narrative. Italic-default — only mark a claim plain when the agent cites file:line
  evidence.
- **`bunx run bin/architecture-overview/repo-stats.ts --repo <path>`** for
  deterministic metrics — capture stdout JSON.

### 5. Aggregate

Merge per-repo records (narrative + metrics) in memory. Cross-repo edge resolution:
if repo A has a manifest dep matching repo B's package name, emit edge `A → B
[observed]`.

### 6. Vocab Pass

Rewrite all narrative claims using the LANGUAGE.md terms above. If a target repo has
`CONTEXT.md`, apply its domain terms inline. Italic-mark claims without explicit
code evidence.

### 7. Output Guardrails

- Refuse if resolved output path is inside `claude-config` (verified via
  `git rev-parse --show-toplevel` from the output dir).
- Default output resolution:
  - Exactly one `~/repos/onboard-*/` workspace exists → default to
    `<workspace>/architecture/`.
  - Zero workspaces OR more than one → require `--output <path>`. Print candidates
    if multiple.

### 8. Render

Write 4 files at the resolved output path. Frontmatter format defined in
[`references/output-format.md`](references/output-format.md).

**Path-relativity note for `language_ref` in frontmatter**: The example
`language_ref: ../../references/architecture-language.md` in `output-format.md` is
relative to the OUTPUT file's parent directory (e.g., from
`~/repos/onboard-acme/architecture/inventory.md`, that path resolves to
`~/repos/architecture-language.md`). Adjust the path emitted in actual frontmatter to
match the output location's depth from the canonical vocab file. If the bundle is
landing outside the repo tree entirely, emit an absolute path or a URL to the
canonical file in the user's `claude-config` clone.

### 9. Done

Print summary:

> "Wrote 4 files at `<path>`. <N> repos scanned. <M> errors (see frontmatter)."

## Composition

- **`/improve-codebase-architecture`** — consumes this output (loose composition;
  vocabulary is the contract). Run this skill first; user holds bundle context
  while running the deepening-grader.
- **`/onboard`** — leader's broader ramp toolkit. Future versions may auto-invoke
  this skill; for now it is opt-in.

## Repo Requirements

See [`references/repo-requirements.md`](references/repo-requirements.md) for the
hard / soft / auto-skipped / edge-case matrix.

## Known Gaps (v0.1.0 — Experimental)

- Auto-discovery handshake with `/improve-codebase-architecture` not implemented
- ADR-conflict surfacing not implemented (skill reads ADRs but doesn't grade)
- Brittleness heuristic nomination deferred (observation-only)
- Mermaid graph render deferred (text output only)
- Concept-validation phase enforcing italic-on-inferred deferred (convention only)
- Non-UTF8 binary detection in `repo-stats.ts` is best-effort (size-only filter; non-UTF8 first-8KB check deferred)
- `envVarsReferenced` test coverage in `repo-stats.ts` is structural (Array.isArray) only — no fixture currently exercises a positive match
- LOC count uses `content.split("\n").length` which is +1 for files ending in newline
