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

Also active: **tdd-pragmatic** (test-first for non-trivial logic, reproducing test before bug fix) and **execution-mode** (sizing guard: subagent-driven vs single-implementer).

## Skills (on-demand slash commands)

Pipeline + design-thinking skills. Invoked with `/skill-name`.

| Skill | Purpose |
|-------|---------|
| `/define-the-problem` | Front door of the pipeline. Forces every feature to start with a clear user problem — not a solution. |
| `/systems-analysis` | Maps dependencies, second-order effects, failure modes, org impact. Bridge between problem and design. |
| `/fat-marker-sketch` | Crude structural sketch before detailed design. Auto-invoked by planning rule; callable directly. |
| `/adr` · `/sdr` · `/tech-radar` | Structured records: architectural decisions, system designs, tech-adoption entries (Assess → Trial → Adopt → Hold). |
| `/cross-project` | How a change in this repo affects other local repos. Scans `~/repos/` for dependents. |
| `/improve-codebase-architecture` | Surface deepening opportunities — shallow→deep modules via shared vocabulary (module / interface / depth / seam / adapter) and deletion-test discipline. |
| `/architecture-overview` | Multi-repo architecture mapping. |

Operational skills also included (less central to reasoning): `/1on1-prep`, `/stakeholder-map`, `/swot`, `/new-project`, `/present`, `/tenet-exception`, `/excalidraw`.

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
