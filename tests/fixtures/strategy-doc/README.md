# Fixtures — `/strategy-doc`

Each fixture is a minimal `~/repos/onboard-<org>/` workspace shape that exercises a specific eval contract from `skills/strategy-doc/evals/evals.json`. New fixtures must be added with: (a) eval consumer in [`skills/strategy-doc/evals/evals.json`](../../../skills/strategy-doc/evals/evals.json), (b) entry in the matrix below.

`validate.fish` Phase 1n enforces fixture↔eval integrity: every fixture under this directory must either have an eval consumer or be listed under `## Orphaned fixtures` (warning, not failure).

## Eval → Fixture matrix

| Eval (`evals/evals.json`) | Fixture | Why this fixture |
|---|---|---|
| `workspace-missing-refusal` | (none — eval supplies bogus org name) | Tests prereq refusal; no workspace needed |
| `draft-fresh-workspace` | `fresh-workspace/` | Onboard-scaffolded layout; empty SWOT/stakeholder/arch/notes; all sections [TODO] |
| `draft-with-swot-only` | `with-swot-only/` | Workspace + memory-entity seed for SWOT only; §1-3 partial |
| `draft-full-pipeline` | `full-pipeline/` | All four sources populated; §1-3 substantially filled, §5/§6 [TODO] |
| `draft-idempotent` | `draft-with-user-edits/` | Doc has user prose below closing fence; re-run preserves it |
| `review-mode-readonly` | `clean-doc/` | Complete doc; review renders without mutation |
| `challenge-layer-1-fail` | `draft-with-todos/` | Doc with [TODO] markers inside fences |
| `challenge-layer-2-fail-vague-asks` | `draft-vague-asks/` | Complete §1-4, §7; §5 has "more headcount" + §6 has "Build trust" milestone with no Success criteria — exercises Layer 2 ask-specificity AND milestone-measurability checks |
| `challenge-layer-2-fail-quality-gaps` | `draft-layer2-quality-gaps/` | Layer 1 clean; multiple §3-7 quality fields missing: §3 entry no Evidence:; §4 entry no To confirm:/To refute:; §6 milestone no (addresses §X.N) cross-ref; §7 risks missing Owner: or have Owner: [TODO]. Exercises remaining 4 Layer 2 quality checks. |
| `challenge-layer-3-pass-handoff` | `clean-doc/` | All layers clean; handoff offered |
| `refusal-raw-notes` | `with-raw-notes/` | Has `notes/raw/sensitive.md`; skill auto-globs `notes/*.md` excluding `notes/raw/` AND onboard-guard refuses if path passed (defense in depth) |
| `memory-mcp-unavailable` | `fresh-workspace/` | Reused; eval simulates MCP unavailability |
| `conflicting-evidence-blocks-challenge` | `conflicting-evidence/` | SWOT entity says X is strength; notes/X.md flags X as weakness |
| `doc-fence-malformed-refuses-mutation` | `malformed-fences/` | Doc has unclosed `<!-- strategy-doc:auto -->` |
| `multi-day-overlap-mutates-existing` | `existing-old-doc/` | Doc dated 2 weeks ago; --mode=draft mutates same file |
| `multi-file-glob-refusal` | `multi-day-plans/` | Two `*-90-day-plan.md` files present; refuse mutation |

## Orphaned fixtures

(none currently)
