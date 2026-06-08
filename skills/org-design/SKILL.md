---
name: org-design
description: Use when the user says /org-design <org>, "analyze the org I inherited", "inherited org analysis", "span of control / SPOF / on-call distribution review", or wants a descriptive read of the org structure they just walked into during a senior eng leader ramp. Phase 1 supports analyze-inherited mode only — reads a manual org/structure.md + stakeholder memory graph into a 7-section analysis under ~/repos/onboard-<org>/decisions/. Scenario modeling (splits/merges/headcount) is Phase 2 (separate spec). Do NOT use for codebase architecture (use /architecture-overview).
disable-model-invocation: true
status: experimental
version: 0.1.0
---

# /org-design — Inherited-Org Analysis (Phase 1)

Descriptive read of the org a new senior leader inherited — **before** proposing any change. The skill is the analyst and flag-raiser; the user is the primary reader. It describes and flags; it never prescribes. Prescription (scenario modeling) is Phase 2.

**Announce at start:** "I'm using the org-design skill to analyze the org you inherited (descriptive read, no proposed changes)."

**Reference files** (read on demand):

- [structure-template.md](structure-template.md) — the `org/structure.md` seed table + structure-fence rules.
- [analysis-checks.md](analysis-checks.md) — the six analyses, thresholds, and SPOF inference rules.

## When to Use

- User invokes `/org-design <org>` during a senior eng leader ramp (days 30–60).
- "Analyze the org I inherited" / "what's the shape of the team I walked into".
- "Span of control / single points of failure / on-call distribution review" before proposing any reorg.

## When NOT to Use

- Codebase / service architecture — use `/architecture-overview` (no people/team data here).
- Proposing org *changes* (splits, merges, headcount moves) — that's Phase 2 scenario modeling, not yet implemented.
- A single political-relationship map — use `/stakeholder-map` (this skill *reads* its output).

## Invocation

```
/org-design <org> [--mode=analyze] [--workspace <path>]
```

`<org>` is required. Default (and only Phase-1) mode is `analyze`.

**Flags:**
- `--mode=analyze` — descriptive pass. See [Mode routing](#mode-routing).
- `--workspace <path>` — override the default `~/repos/onboard-<org>/` resolution. Supports eval fixtures and custom locations.

**Workspace resolution order:**
1. `--workspace <path>` if provided — use that path directly.
2. Otherwise, `~/repos/onboard-<org>/`.

## Prerequisites (refuse if missing)

1. Resolved workspace directory exists. If absent, refuse with:
   > "Workspace not found at `<resolved-path>`. Run `/onboard <org>` first." (omit the `/onboard` hint when `--workspace` was passed — those are typically eval or custom paths.)
2. `decisions/` subdirectory exists or is creatable. Create it if absent (matches `/onboard` Phase 1 contract).

Do not check stakeholder-graph / interview availability here — those are graceful-degradation cases handled inside `--mode=analyze`.

## Mode routing

| Mode | Effect |
|---|---|
| `analyze` (default) | If `org/structure.md` is absent or template-only, scaffold the seed and stop (see [Structure-file gate](#structure-file-gate)). Otherwise: read the structure file, cross-reference the stakeholder memory graph + `interviews/sanitized/`, run the six analyses per [analysis-checks.md](analysis-checks.md), regenerate `<!-- org-design:auto -->` blocks in the analysis artifact, preserve user prose below the fences, emit the annotated Mermaid chart. **After writing, print the complete file content verbatim** so the user can review it — do NOT substitute a summary. |
| `scenario` (and any named scenario flag) | Refuse: "Scenario modeling is Phase 2 — not yet implemented. Phase 1 supports `--mode=analyze` (descriptive read of the inherited org) only." |

## Structure-file gate

`--mode=analyze` begins by resolving `<workspace>/org/structure.md`:

| State | Action |
|---|---|
| Absent | Create `org/` if needed, write the seed from [structure-template.md](structure-template.md), tell the user to fill it, **stop** (not an error). |
| Present but only the template header / no data rows | Refuse analysis: "`org/structure.md` has no rows — fill it first." (idempotent — re-running an empty file produces the same message, never a half-analysis). |
| Present with ≥1 data row | Proceed to analysis. |

## Doc location

Single artifact per analysis at `<workspace>/decisions/<creation-date>-org-analysis.md`.

**Glob outcome routing** — every `--mode=analyze` run (past the structure gate) starts with `glob <workspace>/decisions/*-org-analysis.md`:

| Glob result | Action |
|---|---|
| 0 files | First-run path. Create `<workspace>/decisions/<today>-org-analysis.md`. |
| 1 file | Mutate that file in place. Do NOT create a new dated file even if today differs from the file's date. |
| 2+ files | Refuse mutation. List each filename + `mtime` (newest first), ask the user to consolidate. One artifact per analysis is invariant; the refusal is idempotent. |

**Atomic write** — for the 0-file and 1-file cases, write-temp-then-rename: render to `.<final-filename>.tmp`, validate fences, `rename` only on pass; on any failure delete the `.tmp`, leave the original untouched, surface the cause. Forbids partial writes.

## Confidentiality

Before reading any path inside the workspace, run:

```fish
bun run "$CLAUDE_PROJECT_DIR/skills/onboard/scripts/onboard-guard.ts" refuse-raw <path>
```

The guard refuses paths under `interviews/raw/` and `notes/raw/` (non-zero exit). The skill MUST honor the refusal — do not read the file. Consume `interviews/sanitized/` only. Exit-code contract and override policy: see [../onboard/refusal-contract.md](../onboard/refusal-contract.md).

## Inputs and degradation (graceful)

| Source | Surface | Used for |
|---|---|---|
| Org structure (sole structural source) | `<workspace>/org/structure.md` | span, ratios, on-call, system-ownership SPOF, skill gaps, the chart |
| Stakeholder graph | memory MCP (`mcp__memory__read_graph` / `search_nodes`) — `<Org> Stakeholders` person entities with power/category/function tags | authority/decision-path SPOF |
| Interview themes | `interviews/sanitized/` (aggregate only) | corroborating signals |

**Not an input:** `/architecture-overview` is a code landscape (service inventory / deps / data-flow / integrations) — no human/team ownership. System ownership comes from the `org/structure.md` `Critical systems owned` column, never arch-overview.

| Missing input | Behavior |
|---|---|
| Memory MCP unavailable / `<Org> Stakeholders` entity missing | Warn once. Run structure-only analyses. Flag that authority-SPOF (§3) is weaker without power tags. Same memory-down handling `/stakeholder-map` uses. |
| `interviews/sanitized/` empty / absent | Skip corroboration pass. No error. |

Rule: a missing cross-reference never aborts the analysis — emit what the structure file supports and flag the gap inside the fence with a `[TODO]` marker.

## The seven sections

Write these in canonical order into `decisions/<date>-org-analysis.md`. Per-section reasoning, thresholds, and SPOF inference live in [analysis-checks.md](analysis-checks.md).

1. **Inherited structure** — annotated Mermaid org chart (reporting lines from the `Reports to` column; SPOF + wide-span nodes flagged) + one-paragraph plain read.
2. **Span of control** — per-manager direct-report counts; flag too-wide (>~7) and too-narrow (1–2, possible layer bloat).
3. **Single points of failure** — per person/role where critical *system* ownership (`org/structure.md`) OR *authority/decision* concentration (memory power tags) makes one departure load-bearing.
4. **On-call burden distribution** — rotation load per person/team; flag imbalance.
5. **Skill coverage gaps** — capabilities owned by exactly one person; teams thin on a needed skill.
6. **Manager:IC ratio by team** — ratio per team; flag outliers against an org-typical band, stated as observation not target.
7. **Inherited-shape flags** — places the structure implies a prior decision worth understanding before changing. Descriptive prompts ("why does Team X own both A and B?"), never recommendations.

**Discipline:** §§3–7 describe and flag; none prescribes. The "before changing" framing in §7 is the guardrail against premature reorg — mirrors `rules/planning-pipeline.md` (observe before act).

## Section-fence sentinels

Auto-populated content lives inside `<!-- org-design:auto -->` ... `<!-- /org-design:auto -->` pairs. Outside-fence content is user-owned and preserved across re-runs. Malformed fences refuse mutation and emit a damage report.

**Fence pre-check (`--mode=analyze` only):** when an existing analysis doc is found, validate fences IMMEDIATELY — before loading the memory graph or interviews. A malformed fence (unclosed, nested, mismatched) emits the damage report and stops; do not proceed to cross-reference loading.

See [structure-template.md](structure-template.md) for the canonical fence pattern.

## Backtracking

If the rendered analysis proposes a change anywhere (§§3–7 contain a recommendation, not just an observation), return to the section and rewrite it as a descriptive flag. Phase 1 is observe-before-act; a prescriptive line is a known-wrong shape — do not ship it.

## Where this skill persists state

**User working repo** (`~/repos/onboard-<org>/`):
- `org/structure.md` — manual org-structure input (user-owned, committed alongside ramp notes).
- `decisions/<creation-date>-org-analysis.md` — the analysis artifact.

**memory MCP knowledge graph** (`mcp__memory__*`):
- Reads only — `<Org> Stakeholders` entities pulled for authority-SPOF (graceful-degradation on miss). No writes; `/stakeholder-map` owns that entity.

**Not used by this skill:** auto-memory MD, ruflo MCP, scheduled-tasks MCP, arch-overview output. No org-design memory entity Phase 1 (filesystem only).

## Out of scope (Phase 1)

- Scenario modeling — adds / reductions / splits / merges / reporting changes (`--mode=scenario`).
- Multi-scenario trade-off matrix + recommended-option output.
- Before/after org-chart comparison rendering.
- Excalidraw rendering (Mermaid only Phase 1).
- HRIS / directory auto-import — structure is manual by design (issue #35: no HRIS).
- Automated hand-off into `/strategy-doc` — the user folds the analysis into their notes manually; strategy-doc does not auto-read org output.
- TS scorer for span/ratio math — Phase 1 is LLM counting over a small table; promote in Phase 2 only if scenario math dominates.
