# Catalog

Inventory of rules, skills, agents, and templates shipped by `claude-config`. For install instructions see the [README](../README.md). For runtime operations (bypass flags, hooks) see [operations.md](operations.md).

## The Workflow

These pieces compose into a deliberate design pipeline:

```mermaid
flowchart LR
    A["/define-the-problem"] --> B["/systems-analysis"]
    B --> C["brainstorming"]
    C --> D["/fat-marker-sketch"]
    D --> E["detailed design"]
    E --> F["TDD implementation"]
    F --> G["verification"]

    style A fill:#4a90d9,color:#fff,stroke:none
    style B fill:#4a90d9,color:#fff,stroke:none
    style C fill:#7b68ee,color:#fff,stroke:none
    style D fill:#7b68ee,color:#fff,stroke:none
    style E fill:#5ba85a,color:#fff,stroke:none
    style F fill:#5ba85a,color:#fff,stroke:none
    style G fill:#e67e22,color:#fff,stroke:none
```

You can enter at any point — the rules enforce the upstream steps automatically. Start building a feature and Claude will decompose the problem first. Select an approach and Claude will sketch before designing. Write code and Claude will verify before declaring done.

## Rules (always active)

The reasoning gates. Each is a HARD-GATE — Claude can't bypass without a named-cost skip.

| Rule | What it enforces |
|------|-----------------|
| **planning** | Mandatory pipeline: problem definition → systems analysis → brainstorming → fat-marker sketch → detailed design. Pressure-framing floor blocks premature skips. Announces stage transitions. |
| **think-before-coding** | Three-part preamble before any recommendation: Assumptions, Interpretations, Simpler-Path Challenge. Forces trade-off surfacing instead of silent picks. |
| **fat-marker-sketch** | After approach selection, Claude produces a structural visual sketch before detailed design. Forces shape conversation before pixel detail. |
| **goal-driven** | Every implementation step needs an explicit verify check defined up front. Loop until each check passes — no "should work." |
| **verification** | End-of-work gate: tests run, type-check runs. No claims of completion without proof. |
| **pr-validation** | Declaring a PR ready, or invoking any draft-promoting action (`gh pr ready`, `gh pr merge`, label changes), triggers mandatory test-plan execution. Mechanical zero-functional-change carve-out via `git diff --stat` quoting. |
| **disagreement** | When you push back on a stated position, Claude must identify whether you supplied **new evidence** before reversing. Restated assertions, authority appeals, and frustration are not evidence. Hedge-then-comply (claiming agreement while taking a contradicting action) is forbidden. The anti-sycophancy gate. |
| **memory-discipline** | Stored auto-memory entries are defaults with provenance, not commands. `feedback` memories yield to surfaced trade-offs on context shift; `project` memories may be stale; file/function/flag claims require verification before action. |
| **execution-mode** | Sizing guard before invoking subagent-driven-development. Plans ≥5 tasks across ≥2 files with ≥300 LOC → subagent mode. Smaller plans → single-implementer + final review. Trivial tier skips subagent overhead. |

Also active: **tdd-pragmatic** (test-first for non-trivial logic, reproducing test before bug fix).

**Karpathy Coding Principles** (live in `global/CLAUDE.md`, sourced from [andrej-karpathy-skills](https://github.com/forrestchang/andrej-karpathy-skills)) layer on top of the rules during the implementation phase:

1. **Think Before Coding** — promoted to HARD-GATE via `rules/think-before-coding.md`.
2. **Simplicity First** — minimum code that solves the problem; no speculative flexibility.
3. **Surgical Changes** — touch only what's needed; clean up only your own mess (enforced by `surgical-diff-reviewer` agent).
4. **Goal-Driven Execution** — promoted to HARD-GATE via `rules/goal-driven.md`.

Precedence on conflict: User instructions > `rules/*.md` HARD-GATEs > Karpathy Coding Principles > general Communication Style / Verification rules.

## Skills (on-demand slash commands)

### Pipeline + design-thinking

| Skill | Purpose |
|-------|---------|
| `/define-the-problem` | Front door of the pipeline. Forces every feature to start with a clear user problem — not a solution. |
| `/systems-analysis` | Maps dependencies, second-order effects, failure modes, org impact. Bridge between problem and design. |
| `/fat-marker-sketch` | Crude structural sketch before detailed design. Auto-invoked by planning rule; callable directly. |
| `/adr` · `/sdr` · `/tech-radar` · `/tenet-exception` | Structured records: architectural decisions, system designs, tech-adoption entries (Assess → Trial → Adopt → Hold), and tenet-deviation justifications. |
| `/cross-project` | How a change in this repo affects other local repos. Scans `~/repos/` for dependents. |
| `/improve-codebase-architecture` | Surface deepening opportunities — shallow→deep modules via shared vocabulary (module / interface / depth / seam / adapter) and deletion-test discipline. |
| `/architecture-overview` | Multi-repo technical landscape — produces a 4-file bundle (inventory, dependencies, data flow, integrations) using LANGUAGE.md vocabulary. Use for new-leader codebase ramp. |

### Senior eng leader toolkit

| Skill | Purpose |
|-------|---------|
| `/onboard <org>` | 90-day senior-eng-leader ramp orchestrator. Per-org git-isolated workspace, cadence nags, confidentiality boundary for raw 1:1 notes (`interviews/raw/` refused via `onboard-guard.ts`), calendar-watch, graduation flow. |
| `/strategy-doc <org>` | 90-day-plan authoring. Collates `/swot`, `/stakeholder-map`, `/architecture-overview`, free-form `notes/*.md` into a 7-section markdown artifact under `~/repos/onboard-<org>/decisions/`. Section 3 (problems observed) and Section 4 (problems suspected) are observation-only; intervention lives in Section 6 milestones. Layered challenge pass: completeness → quality → consistency → `/present` Slidev handoff. |
| `/swot` | SWOT landscape analysis with cross-session memory-graph accumulation. Conversational capture, artifact-pointed capture, challenge pass, multi-format export (markdown / excalidraw 2x2 / Slidev deck). |
| `/stakeholder-map` | Political-topology map for new leadership ramps. Coverage-review queries; meet-in-what-order guidance. |
| `/1on1-prep` | Per-person 1:1 preparation from accumulated context. |
| `/present` | Slidev presentation builder — consumes structured artifacts (SWOT exports, 90-day plan sections) and renders aggregate-framed reflect-back decks. |

### Other operational skills

| Skill | Purpose |
|-------|---------|
| `/new-project` | New-project scaffold from a vetted template. |
| `/excalidraw` | Drive an Excalidraw canvas via MCP for diagrams, flowcharts, and visuals. |

## Agents (specialized reviewers)

| Agent | Purpose |
|-------|---------|
| **platform-reviewer** | Reviews code changes for API contract stability, backward compatibility, operational burden, and cross-team impact. |
| **security-reviewer** | Reviews code changes for security vulnerabilities — OWASP categories, credential exposure, input validation, auth/authz boundaries, and dependency risks. |
| **decision-challenger** | Devil's advocate for ADRs, SDRs, and tech radar entries. Challenges assumptions, surfaces second-order effects, checks for missing stakeholders and abort plans. |
| **surgical-diff-reviewer** | Karpathy #3 scope enforcement — every changed line in a diff must trace directly to the user's stated request. Catches drive-by refactors and scope creep. |

## Templates

| Template | Purpose |
|----------|---------|
| **PROJECT-CLAUDE-MD.md** | Drop-in template for per-repo CLAUDE.md files. Covers project purpose, architecture, commands, conventions, domain glossary, and non-obvious decisions. |

## Ecosystem (third-party plugins this config plays well with)

| Plugin | Purpose |
|--------|---------|
| [caveman](https://github.com/JuliusBrussee/caveman) | Optional ultra-compressed communication mode. ~75% token reduction by speaking like a smart caveman while preserving full technical accuracy. Opt-in via `/caveman` (lite / full / ultra levels). Skill bodies, commits, and security warnings stay in normal English; only assistant prose is compressed. |
| [superpowers](https://github.com/anthropics/claude-code-plugins) | Anthropic's official plugin bundle providing `brainstorming`, `writing-plans`, `subagent-driven-development`, `executing-plans`, `using-git-worktrees`, and `requesting-code-review` skills that the planning pipeline invokes. |

External plugins are not symlinked or managed by `bin/link-config.fish`; install per their own instructions. The rules in this repo do not require any of these — they layer cleanly when present.
