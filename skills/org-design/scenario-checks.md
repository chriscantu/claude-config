# scenario-checks.md — split-team scenario modeling (Phase 2a)

Rules for `--mode=scenario`, `split-team` operation. Phase 2a is **prescriptive**:
it projects a reorg and compares it to the current org. The Phase-1 backtracking
guardrail (rewrite recommendation → flag) does NOT apply here — see SKILL.md mode wall.

## Scenario spec block

The orchestrator gathers split intent conversationally and transcribes it into this
block, then serializes it to JSON for the scorer:

```markdown
<!-- org-design:scenario -->
type: split-team
target_team: <team being split>
into:
  - name: <new team A>
    lead: <person>
    members: [<person>, ...]
  - name: <new team B>
    lead: <person>
    members: [<person>, ...]
new_reporting:            # optional; default = both leads report to target_team's former manager
  <new team A>: <manager>
<!-- /org-design:scenario -->
```

Spec rules (the orchestrator validates BEFORE calling the scorer):
- Every `members` entry must currently be in `target_team`.
- Every member of `target_team` should be assigned to exactly one new team.
- Each `lead` must be in its group's `members`.

A malformed spec is a usage error — fix it with the user, do not call the scorer.

## Scorer

`scripts/scenario-scorer.ts <structure.md path> <scenario.json path>` → `ScenarioResult` JSON on stdout.
Exit 0 on completion (`valid:false` is a result); non-zero on usage/parse error.

The scorer computes **system-ownership SPOF only** (deterministic from `Critical
systems owned`). **Authority-SPOF** (memory power tags) is overlaid by the
orchestrator during render, with the Phase-1 degradation caveat when memory is down.

## Validity rules (deterministic)

Projected org is INVALID if any hold; each is a `ValidityFailure`:

1. `orphaned_report` — a `Reports to` references a person not in the projected org.
2. `reporting_cycle` — the `Reports to` chain loops.
3. `zero_report_manager` — a row marked `M` (or a new-team lead) ends with zero reports.
4. `subviable_oncall` — a rotation is left with ≤1 person. Exactly 2 = valid-but-warned.

Span (>~7 wide / 1–2 narrow) and manager:IC ratio (~1:5–1:8) are REPORTED in the
delta table, not validity failures — thresholds reused from `analysis-checks.md`.

## Render (on valid)

1. Before/after Mermaid `graph TD`. AFTER annotates new teams/leads (heavier node),
   moved reports (labeled), dropped reporting edges.
2. Delta table: `metric | before | after | note` — span changes, system-SPOF
   before/after, on-call shifts (flag any 2-person rotation), after-state ratios.
3. Short narrative of what the split changes + residual risks.

## Gates

1. **Validity (machine)** — `valid:false` → refuse, print failures, write nothing.
2. **Review (human, universal)** — `valid:true` → print full artifact + "validity:
   passed", STOP, require explicit user confirm before the atomic write. Decline →
   discard. (2b `reduce-headcount` adds a heightened layoff ack ahead of this confirm.)

## Persistence

Atomic write-temp-rename to `decisions/<date>-org-scenario-<slug>.md`
(`<slug>` = `<target_team>-split`, kebab-cased), with `<!-- org-design:auto -->`
fences. Multiple scenario files coexist (different slugs); same-slug-same-day
mutates in place; 2+ same-slug refuses + lists.
