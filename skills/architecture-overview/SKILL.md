---
name: architecture-overview
description: Slash-invoked discovery-mode skill that scans multiple repos and produces a 4-file landscape bundle (inventory, dependencies, data flow, integrations) using the canonical LANGUAGE.md vocabulary. Use when a new senior eng leader joins and asks to "walk me through the architecture", "map the services across our repos", or needs a credible whole-system mental model on day 3-7 of a ramp. Do NOT use for single-repo deepening grading (use /improve-codebase-architecture), a single architectural choice (use /adr), a system-level design record (use /sdr), or tool/framework adoption (use /tech-radar).
disable-model-invocation: true
status: experimental
version: 0.3.1
---

# Architecture Overview

Discovery-mode multi-repo landscape mapper. Walks each repo with an Explore subagent
for narrative discovery and runs `skills/architecture-overview/scripts/repo-stats.ts` for
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

## Vocabulary

Canonical: [`architecture-language.md`](../../references/architecture-language.md). Module / Interface / Seam / Adapter / Depth / Leverage / Locality. Avoid `component` / `service` / `API` / `boundary` as descriptive vocab — see [`output-format.md`](references/output-format.md) for the proper-noun carve-out.

## Process

### 1. Parse Input
Resolve `--repos` into `[{name, source: path | url}]`. Reject unparseable entries with a clear error.

### 2. Resolve Repos (Parallel)
- **Cache prompt (URL inputs only)** — if `--clone-cache` not supplied, prompt: _"Default cache: `~/.cache/architecture-overview/`. Enter to accept or supply a path."_ Empty / "default" / "yes" = accept.
- **Path** → verify readable directory; bail-soft on error (record, don't abort).
- **URL** → `git clone --depth=1` if not cached; `git fetch --depth=1` unless `--no-fetch`. Auth failures → inferred-only entries.

### 3. Walk (Parallel per Repo)
- **`Explore` subagent** — read `CONTEXT.md` / ADRs and walk source. Produce four narrative threads: inventory (Module / Interface / Implementation / Signals), dependencies (Seam / Adapter / Observed-via), data-flow (numbered lifecycle steps), integrations (external SaaS).
- **Italic-default; plain only when the agent cites file:line evidence.** Inferences (manifest absence, env-var implies dep, conventional naming) → italic. Code-grounded claims (import at `src/x.ts:42`, env var read in `config.ts`) → plain. The agent applies the convention while writing the narrative — it is NOT a post-pass.
- **`bun run skills/architecture-overview/scripts/repo-stats.ts --repo <path>`** — capture stdout JSON for deterministic metrics.

### 4. Aggregate + Vocab Pass
Merge per-repo records. Cross-repo edge resolution: if repo A's manifest dep matches repo B's package name, emit edge `A → B [observed]`. Apply LANGUAGE.md vocab interleaved with the merge — per-repo `CONTEXT.md` domain terms layered on top. Single pass, not two; narrative is written once with the right vocab.

### 5. Render
- **Output guardrails** — refuse if output path is inside `claude-config` (`git rev-parse --show-toplevel`) — prevents polluting the source repo with generated landscapes that would re-trigger discovery on the next run. Default: exactly one `~/repos/onboard-*/` workspace → `<workspace>/architecture/` — onboard workspaces are the canonical landing spot per `/onboard` convention; zero or multiple → require `--output <path>` so the user picks intentionally.
- **Write 4 files** at the resolved output path. Frontmatter format: [`references/output-format.md`](references/output-format.md). `language_ref` is relative to each output file's parent directory — keeps the bundle portable when copied to a different repo; emit an absolute path or URL when the bundle lands outside the repo tree.
- **Mermaid** — render blocks per [`output-format.md`](references/output-format.md) — single canonical source post-#233 drift-collapse: `graph TB` in inventory.md (C4 Context), `graph LR` in dependencies.md, `flowchart TD` in data-flow.md. Each diagram has a sufficient-complexity floor — low-density diagrams add noise, not signal; below it, replace with `> _diagram skipped: <reason>_`.
- **Done** — print _"Wrote 4 files at `<path>`. <N> repos scanned."_

## Composition

- **`/improve-codebase-architecture`** — consumes this output (vocabulary is the contract). Run first; user holds bundle context while running the deepening-grader.
- **`/onboard`** — leader's broader ramp toolkit. Future versions may auto-invoke this skill; for now it is opt-in.

## Repo Requirements

See [`references/repo-requirements.md`](references/repo-requirements.md) for the
hard / soft / auto-skipped / edge-case matrix.

## Known Gaps

See [`references/known-gaps.md`](references/known-gaps.md) for the current v0.3.1 (Experimental) gap list.
