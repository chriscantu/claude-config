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

## Phase 2b spec blocks (add-headcount / merge-teams / change-reporting / reduce-headcount)

`--mode=scenario` routes five operations. The orchestrator gathers intent
conversationally, transcribes it into one of these blocks, then serializes to JSON
for the scorer.

**add-headcount** — append new hires; optionally reparent existing people onto a new
hire (so a new-manager hire is not an instant `zero_report_manager`).

```markdown
<!-- org-design:scenario -->
type: add-headcount
hires:
  - person: <name>
    role: <M|IC>
    team: <team>
    reports_to: <manager>
    systems: [<system>, ...]
    oncall: [<rotation>, ...]
    skills: [<skill>, ...]
reassign:            # optional; existing person -> new manager (e.g. give a new EM reports)
  <existing person>: <new hire>
<!-- /org-design:scenario -->
```

**merge-teams** — fold ≥2 teams into one under a surviving manager. Each non-surviving
manager keeps role `M` and reports to the surviving manager (sub-hierarchy preserved);
their reports are unchanged. Span on the surviving manager grows — reported in the
delta table, not a validity failure.

```markdown
<!-- org-design:scenario -->
type: merge-teams
teams: [<team A>, <team B>, ...]
new_name: <merged team name>
surviving_manager: <person who leads the merged team>
<!-- /org-design:scenario -->
```

**change-reporting** — re-wire reporting lines only (no team relabel).

```markdown
<!-- org-design:scenario -->
type: change-reporting
reassign:
  <person>: <new manager>
<!-- /org-design:scenario -->
```

**reduce-headcount** — remove people (model a layoff). Optionally re-home a displaced
report onto a surviving manager; an unreassigned report of a cut person is left
orphaned on purpose (no silent roll-up) and surfaces as `orphaned_report`. The
serialized JSON MUST carry `acknowledged: true` or the scorer refuses (machine
layoff-acknowledgment gate, below).

```markdown
<!-- org-design:scenario -->
type: reduce-headcount
cut: [<person>, ...]
reassign:            # optional; displaced report -> surviving manager
  <displaced report>: <new manager>
acknowledged: true   # set ONLY after the explicit user layoff confirmation
<!-- /org-design:scenario -->
```

Spec rules (orchestrator validates BEFORE scoring):
- add-headcount: each hire has all seven columns; a `reassign` key must be an existing
  person and its value an existing person or one of the new hires.
- merge-teams: `teams` lists ≥2 existing teams; `surviving_manager` is an existing
  role-`M` person in one of those teams.
- change-reporting: every `reassign` key is an existing person; values should be
  existing people (a missing target surfaces as `orphaned_report` from the scorer).
- reduce-headcount: every `cut` entry is an existing person; a `reassign` key is an
  existing person and its value a surviving (not-cut) person. `acknowledged` is set
  only after the user explicitly confirms the layoff (see ack gate below).

Field names map snake_case prose → camelCase JSON for the scorer (`new_name`→`newName`,
`surviving_manager`→`survivingManager`, `reports_to`→`reportsTo`), consistent with the
2a `target_team`→`targetTeam` precedent. A malformed spec is a usage error — fix it
with the user, do not call the scorer. The validity rules below are unchanged and
apply to all five modes.

### Layoff acknowledgment gate (reduce-headcount only)

A machine gate enforced in the deterministic scorer: `applyMutation`'s
`reduce-headcount` case throws unless `spec.acknowledged === true` (CLI exits 65).
The machine guarantees a layoff projection is impossible without a deliberate
`acknowledged:true` flag-flip — no accidental or casual layoff modeling. It CANNOT
verify a human actually confirmed; SKILL.md prose binds the flag-flip to an explicit
user confirmation after the gravity is surfaced (real layoff, named people, NDA
workspace). Machine-enforced deliberateness + prose-enforced human-confirm is the
strongest gate the filesystem/LLM architecture supports — documented as such, with no
false claim of full enforcement.

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

No new rule for reduce-headcount: the four rules already cover its structural
failures (unreassigned report → `orphaned_report`; a manager whose every report was
cut → `zero_report_manager`; a rotation cut to ≤1 → `subviable_oncall`). A critical
system whose sole owner is cut (1→0 owners) is NOT a validity failure — a layoff
legitimately drops scope — but it would silently leave the after-SPOF list, so it is
reported loudly as `metrics.unownedAfter` (below). The user decides at the review gate.

## Render (on valid)

1. Before/after Mermaid `graph TD`. AFTER annotates new teams/leads (heavier node),
   moved reports (labeled), dropped reporting edges.
2. Delta table: `metric | before | after | note` — span changes, system-SPOF
   before/after, on-call shifts (flag any 2-person rotation), after-state ratios.
3. If `metrics.unownedAfter` is non-empty, a **prominent** line above the narrative —
   "systems left UNOWNED: …" — listing every system whose last owner was cut. Loud and
   separate from the SPOF row, because a 1→0 system silently drops off after-SPOF.
4. Short narrative of what the change does + residual risks.

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
