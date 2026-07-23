---
name: org-design
description: Use when the user says /org-design <org>, "analyze the org I inherited", "inherited org analysis", "span of control / SPOF / on-call distribution review", or wants a descriptive read of the org structure they just walked into during a senior eng leader ramp. The analyze mode reads a manual org/structure.md + stakeholder memory graph into a 7-section analysis under ~/repos/onboard-<org>/decisions/. The scenario mode projects a reorg (split-team, add-headcount, merge-teams, change-reporting, reduce-headcount), validates it structurally, and gates on explicit user review before writing. reduce-headcount adds a machine layoff-acknowledgment gate (machine-enforced deliberateness; the human confirmation behind the flag is prose-bound, not machine-verified). Do NOT use for codebase architecture (use /architecture-overview).
disable-model-invocation: true
status: stable
version: 0.5.0
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
- Multi-scenario trade-off matrix + recommended-option output — that is Phase 2b-iii, not yet implemented. (Splits, additive hires, team merges, reporting-line changes, and headcount reduction are all supported now via `--mode=scenario`; `reduce-headcount` gates on a machine layoff acknowledgment.)
- A single political-relationship map — use `/stakeholder-map` (this skill *reads* its output).

## Invocation

```
/org-design <org> [--mode=analyze|scenario] [--workspace <path>]
```

`<org>` is required. Default mode is `analyze`.

**Flags:**
- `--mode=analyze` (default) — descriptive pass. See [Mode routing](#mode-routing).
- `--mode=scenario` — prescriptive reorg modeling (split-team, add-headcount, merge-teams, change-reporting). See [Scenario mode](#scenario-mode).
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
| `scenario` (Phase 2b) | Route a reorg operation per [scenario-checks.md](scenario-checks.md): gather intent conversationally → build the `org-design:scenario` spec → call `scripts/scenario-scorer.ts` → **validity gate** (refuse on invalid, no write) → render before/after charts + delta table → **review gate** (print, require explicit confirm) → atomic write to `decisions/<date>-org-scenario-<slug>.md`. See [Scenario mode](#scenario-mode). Routes five operations: `split-team`, `add-headcount`, `merge-teams`, `change-reporting`, `reduce-headcount`. `reduce-headcount` adds a gather-then-acknowledge step + a machine ack gate (the scorer refuses unless `acknowledged:true`). The skill can also **compare ≥2 scenarios** in one pass — a trade-off matrix + a ranked recommended-option (decision aid, never a bare prescription); see [Multi-scenario comparison](#multi-scenario-comparison-compare-2-options). |

## Mode wall (analyze vs scenario)

`analyze` (Phase 1) and `scenario` (Phase 2) are disjoint routes writing disjoint
namespaces:

| Mode | Namespace | Backtracking guardrail |
|---|---|---|
| `analyze` | `decisions/<date>-org-analysis.md` | **ON** — any recommendation rewritten to a flag |
| `scenario` | `decisions/<date>-org-scenario-<slug>.md` | **OFF** — output is prescriptive by design |

The [Backtracking](#backtracking) rule below applies to **`analyze` output only**.
Scenario output prescribes by design; never rewrite a scenario recommendation into a
flag. The two routes never co-mutate a file (different namespaces), so prescription
cannot leak into an analysis artifact.

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

## Scenario mode

Prescriptive. Routed from `--mode=scenario`. Rules + the scenario-spec formats
(four operations) live in [scenario-checks.md](scenario-checks.md).

1. **Confidentiality** — same as analyze: `bun run "$CLAUDE_PROJECT_DIR/skills/onboard/scripts/onboard-guard.ts" refuse-raw <path>` before any workspace read.
2. **Structure gate** — resolve `<workspace>/org/structure.md`; same absent/empty handling as analyze (scaffold-or-refuse). Scenario needs a populated structure.
3. **Gather intent** — conversationally determine the operation and its fields, build the `org-design:scenario` block (formats in [scenario-checks.md](scenario-checks.md)), and validate it BEFORE scoring:
   - **split-team** — team to split, new teams, members, leads, optional lead reporting (members ∈ target team; each member in exactly one team; lead ∈ members).
   - **add-headcount** — each hire's seven columns; optional reassignments of existing people onto a new hire.
   - **merge-teams** — which teams (≥2), the new name, the surviving manager (an existing role-M person in one of the teams).
   - **change-reporting** — which person(s) and their new manager(s).
   - **reduce-headcount** — gather the `cut` list (people to remove) and any optional `reassign` (displaced report → surviving manager). THEN **surface the gravity**: this models a real layoff, names specific people, and persists them to an NDA workspace. Require an explicit user confirmation. Only on confirm, set `acknowledged: true` in the serialized spec — without it, leave the flag off and the scorer refuses (machine ack gate). Reports of a cut person who are not reassigned are left orphaned on purpose (no silent roll-up); the validity gate forces the user to re-home them.
4. **Score** — write the spec to a temp JSON, run `bun run skills/org-design/scripts/scenario-scorer.ts <structure.md> <spec.json>`, parse the `ScenarioResult`. A `reduce-headcount` spec missing `acknowledged:true` makes the scorer exit 65 with the layoff-acknowledgment-gate message — surface that refusal and stop; no projection is produced.
5. **Validity gate** — if `valid:false`: print each failure (`kind` + `detail` + `involved`), state no file was written, STOP. Do not render, do not persist.
6. **Render** (valid only) — emit two Mermaid `graph TD` charts (before = current; after = projected with new teams/leads heavier, moved reports labeled) + the delta table (`metric | before | after | note`, flag any 2-person rotation) + a short narrative. If `metrics.unownedAfter` is non-empty, surface it **prominently** ("systems left UNOWNED: …") — these are systems whose every owner was cut, distinct from a SPOF that was genuinely resolved; a 1→0 system silently leaves the after-SPOF list, so it gets its own loud line. Overlay authority-SPOF from the stakeholder memory graph; if memory is down, add the Phase-1 degradation caveat.
7. **Review gate** — print the full rendered artifact + a `validity: passed` line, then STOP and ask the user to confirm explicitly before writing. No auto-persist.
8. **Persist** (on confirm) — atomic write-temp-rename to `decisions/<date>-org-scenario-<slug>.md`. `<slug>` is the scenario **mode** alone, kebab-cased, with **no person or team name** (F3 / ADR #0024 — the filename leaks via `ls`, `git log`, and tab-complete in an NDA workspace): `split`, `add`, `merge`, `reporting`, `reduce`. When a distinct scenario of the same mode already exists that day, append a numeric disambiguator (`reduce`, then `reduce-2`). `<!-- org-design:auto -->` fences. Re-running the same logical scenario mutates that file in place; 2+ files sharing a slug refuses + lists. On decline, discard — nothing written.

### Multi-scenario comparison (compare ≥2 options)

When the user asks to weigh several options against each other:

1. **Gather each scenario** — run the per-mode gather (step 3 above) once per option, including the reduce-headcount gather-then-acknowledge step for any reduce in the set (gravity surfaced + explicit confirm before that scenario's `acknowledged:true` is set). Build a manifest: a JSON array of `{ "label": "<short name>", "spec": {...} }`.
2. **Score** — write the manifest to a temp JSON, run `bun run skills/org-design/scripts/scenario-scorer.ts --matrix <structure.md> <manifest.json>`, parse the `MatrixResult`. An unacknowledged reduce in the set exits 65 with the ack-gate message — surface the refusal and stop (no matrix produced).
3. **Render the trade-off matrix** — a markdown table, one row per scenario: `| Scenario | Valid | Reversibility | SPOF after | Unowned after | Widest span | Key risks |`. Then full before/after Mermaid `graph TD` for the top-ranked option only (others on request). Any non-empty `unownedAfter` keeps its loud per-scenario line.
4. **Recommended option** — a ranked list WITH shown work, headed **"Recommended (decision aid — you decide)"**. Order: valid first; among valid, fewer risk flags higher; surface ties as ties. Each entry states its reasoning (risk flags + deltas + reversibility). Flag irreversibility prominently — an `irreversible` option carries a heightened-caution line even when it ranks well; never a bare "do this". If `validLabels` is empty, list why each option breaks and emit NO recommendation.
5. **Review gate** — print the full matrix artifact + a `validity:` summary, STOP, require explicit confirm before writing. No auto-persist.
6. **Persist** (on confirm) — atomic write-temp-rename to `decisions/<date>-org-scenario-matrix.md` (fixed `matrix` slug), `<!-- org-design:auto -->` fences. Same-day mutates in place; 2+ `matrix` files refuse + list.

Rules, the manifest shape, risk-flag derivation, and the recommended-option contract live in [scenario-checks.md](scenario-checks.md).

### Independent review (`strategy-adversary`)

The validity gate and scorer check that a scenario is **well-formed and metrically
scored** — they do not stress-test whether the reorg is *wise*. After the review
gate (before the user folds a scenario into a strategy or presents it upward), offer
an independent adversarial pass:

> "The scenario is valid and scored. Want an independent review with
> `strategy-adversary` before you act on it? It challenges second-order org effects,
> attrition and SPOF risk, and — for a reduce-headcount — whether the irreversible
> move has an explicit abort/mitigation plan."

Advisory, not gating, and especially warranted for `reduce-headcount`: the machine
ack gate (ADR #0024) enforces deliberateness, not soundness — `strategy-adversary`
is the independent substance check on the human cost. Dispatch it with the scenario
artifact path, type (`org-design scenario`), and decision context; it never rewrites.

## Backtracking

**Applies to `--mode=analyze` output only** (per the [Mode wall](#mode-wall-analyze-vs-scenario) — scenario output is prescriptive by design and is exempt). If the rendered **analyze** artifact proposes a change anywhere (§§3–7 contain a recommendation, not just an observation), return to the section and rewrite it as a descriptive flag. Analyze is observe-before-act; a prescriptive line is a known-wrong shape there — do not ship it.

## Where this skill persists state

**User working repo** (`~/repos/onboard-<org>/`):
- `org/structure.md` — manual org-structure input (user-owned, committed alongside ramp notes).
- `decisions/<creation-date>-org-analysis.md` — the analysis artifact.

**memory MCP knowledge graph** (`mcp__memory__*`):
- Reads only — `<Org> Stakeholders` entities pulled for authority-SPOF (graceful-degradation on miss). No writes; `/stakeholder-map` owns that entity.

**Not used by this skill:** auto-memory MD, ruflo MCP, scheduled-tasks MCP, arch-overview output. No org-design memory entity Phase 1 (filesystem only).

## Out of scope (Phase 2b-iii)

Phase 2b ships `--mode=scenario` with all five operations — `split-team` + `add-headcount` + `merge-teams` + `change-reporting` + `reduce-headcount` (the last gated by a machine layoff acknowledgment) — plus the multi-scenario trade-off matrix and recommended-option output. Deferred beyond 2b:

- Excalidraw rendering (Mermaid only).
- HRIS / directory auto-import — structure is manual by design (issue #35: no HRIS).
- Automated hand-off into `/strategy-doc` — the user folds output into their notes manually.
- Any scalar org-quality score or auto-applied recommendation — the matrix is facts-only; ranking is a decision aid the user adjudicates.
