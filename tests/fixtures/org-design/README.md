# Fixtures — `/org-design`

Each fixture is a minimal `~/repos/onboard-<org>/` workspace shape that exercises a specific eval contract from `skills/org-design/evals/evals.json`. New fixtures must be added with: (a) an eval consumer in [`skills/org-design/evals/evals.json`](../../../skills/org-design/evals/evals.json), (b) an entry in the matrix below.

`validate.fish` Phase 1n enforces fixture↔eval integrity: every fixture under this directory must either have an eval consumer or be listed under `## Orphaned fixtures` (warning, not failure).

## Eval → Fixture matrix

| Eval (`evals/evals.json`) | Fixture | Why this fixture |
|---|---|---|
| `analyze-structure-only` | `structure-only/` | Workspace with a populated `org/structure.md` (6 rows) and no stakeholder memory entity. Exercises the analyze-inherited happy path under graceful degradation: the skill reads the structure, writes the 7-section analysis with a Mermaid chart + fences, names the sole-owner SPOF (`billing-service`), and flags the absent authority data rather than aborting. |
| `scenario-split-valid` | `split-valid/` | Same 6-row org as `structure-only`. Splitting Payments into two staffed teams is structurally valid → exercises the scorer + render + review gate (must NOT auto-persist before explicit confirm). |
| `scenario-invalid-refusal` | `split-invalid/` | Same org. A split that moves Jordan + Riley off Sam leaves Sam (M) with zero reports → `zero_report_manager`; exercises the validity-gate refusal (no write). |
| `scenario-mode-wall` | `split-valid/` | Reuses `split-valid/`; asserts a scenario run never writes the analyze namespace (`*-org-analysis.md`). |

## Orphaned fixtures

(none currently)
