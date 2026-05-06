---
name: architecture-overview
description: Slash-invoked discovery-mode skill that scans multiple repos and produces a 4-file landscape bundle (inventory, dependencies, data flow, integrations) using the canonical LANGUAGE.md vocabulary (Module / Interface / Depth / Seam / Adapter / Leverage / Locality). Use when a new senior eng leader needs a credible whole-system mental model on day 3-7 of a ramp. Do NOT use for single-repo deepening grading (use /improve-codebase-architecture), a single architectural choice (use /adr), a system-level design record (use /sdr), or tool/framework adoption (use /tech-radar).
disable-model-invocation: true
status: experimental
version: 0.2.0
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
Resolve `--repos` into `[{name, source: path | url}]`. Reject unparseable entries with a clear error.

### 2. Cache Prompt (URL Inputs Only)
If any entry is a URL and `--clone-cache` was not supplied, prompt: _"Default cache: `~/.cache/architecture-overview/`. Enter to accept or supply a path."_ Treat empty / "default" / "yes" as accept.

### 3. Resolve Repos (Parallel)
- **Path** → verify readable directory; bail-soft on error (record, don't abort).
- **URL** → `git clone --depth=1` if not cached; `git fetch --depth=1` unless `--no-fetch`. Auth failures → inferred-only entries.

### 4. Walk (Parallel per Repo)
- **`Explore` subagent** — read `CONTEXT.md` / ADRs, walk source, produce inventory / dependencies / data-flow / integrations narrative. Italic-default; plain only when agent cites file:line evidence.
- **`bun run bin/architecture-overview/repo-stats.ts --repo <path>`** — capture stdout JSON for deterministic metrics.

### 5. Aggregate
Merge per-repo records. Cross-repo edge resolution: if repo A manifest dep matches repo B's package name, emit edge `A → B [observed]`.

### 6. Vocab Pass
Rewrite narrative using LANGUAGE.md terms; apply per-repo `CONTEXT.md` domain terms if present.

### 7. Output Guardrails
- Refuse if output path is inside `claude-config` (verified via `git rev-parse --show-toplevel`).
- Default: exactly one `~/repos/onboard-*/` workspace → `<workspace>/architecture/`; zero or multiple → require `--output <path>`.

### 8. Render
Write 4 files at the resolved output path. Frontmatter format: [`references/output-format.md`](references/output-format.md).

**`language_ref` path** is relative to each output file's parent directory. From
`~/repos/onboard-acme/architecture/inventory.md`, `../../references/architecture-language.md`
resolves to `~/repos/references/architecture-language.md`. If the bundle lands
outside the repo tree, emit an absolute path or a URL.

**Mermaid diagrams** — emit a fenced ` ```mermaid ` block alongside the prose in
`dependencies.md` (`graph LR` of Module → Module edges) and `data-flow.md`
(`flowchart TD` of numbered lifecycle steps). Solid `-->` = observed,
dashed `-.->` = inferred (edge label prefixed `inferred:` to carry italic
discipline). Cap ~12 nodes per block; split per domain (`### Domain: Auth`)
or per flow (`### Flow: Signup`) when larger. Templates and shape examples:
[`references/output-format.md`](references/output-format.md).

### 9. Done
Print: _"Wrote 4 files at `<path>`. <N> repos scanned."_

## Composition

- **`/improve-codebase-architecture`** — consumes this output (vocabulary is the contract). Run first; user holds bundle context while running the deepening-grader.
- **`/onboard`** — leader's broader ramp toolkit. Future versions may auto-invoke this skill; for now it is opt-in.

## Repo Requirements

See [`references/repo-requirements.md`](references/repo-requirements.md) for the
hard / soft / auto-skipped / edge-case matrix.

## Known Gaps (v0.2.0 — Experimental)

- Auto-discovery handshake with `/improve-codebase-architecture` not implemented
- ADR-conflict surfacing not implemented (skill reads ADRs but doesn't grade)
- Brittleness heuristic nomination deferred (observation-only) — intent-grounding follow-up: #228
- C4 context block in `inventory.md` deferred — v0.3 candidate
- Concept-validation phase enforcing italic-on-inferred deferred (convention only)
- Non-UTF8 binary detection in `repo-stats.ts` is best-effort (size-only filter; non-UTF8 first-8KB check deferred)
- `envVarsReferenced` test coverage in `repo-stats.ts` is structural (Array.isArray) only — no fixture currently exercises a positive match
- LOC count uses `content.split("\n").length` which is +1 for files ending in newline
