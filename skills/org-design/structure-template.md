# `org/structure.md` — seed template + fence rules

The skill scaffolds this file into `<workspace>/org/structure.md` on first
`--mode=analyze` run when it is absent, then stops and asks the user to fill it.
It is the **sole structural source** for the analysis (no HRIS, per issue #35).

## Seed (written verbatim on scaffold)

```markdown
# Org structure — <Org>

One row per person. Manual entry. This file is the input to /org-design
analyze. Fill every column you can; blanks degrade specific analyses
(noted below) but never abort the run.

<!-- org-design:structure -->
| Person | Role (M/IC) | Team | Reports to | Critical systems owned | On-call rotation | Key skills |
|--------|-------------|------|------------|------------------------|------------------|-----------|
|        |             |      |            |                        |                  |           |
<!-- /org-design:structure -->
```

## Column contract

| Column | Feeds | Blank-cell effect |
|---|---|---|
| Person | the chart, every count | row is unusable — skip it |
| Role (M/IC) | span of control (§2), manager:IC ratio (§6) | row excluded from §2/§6 |
| Team | §2, §6, on-call by team (§4) | row excluded from team-grouped analyses |
| Reports to | chart reporting lines (§1), span (§2) | node floats in chart; flag "no manager recorded" |
| Critical systems owned | system-ownership SPOF (§3), skill gaps (§5) | §3 weaker for that person |
| On-call rotation | on-call distribution (§4) | person excluded from §4 |
| Key skills | skill coverage gaps (§5) | §5 weaker for that person |

`Role (M/IC)` accepts `M` (manager — has direct reports) or `IC`. A manager
is identified for span/ratio purposes by appearing in another row's `Reports
to` column, not solely by the `M` tag — cross-check both.

## Structure fence

The `<!-- org-design:structure -->` ... `<!-- /org-design:structure -->` pair
marks the machine-read table. The "template-only / no data rows" gate in
SKILL.md is satisfied when every row between the fences is blank (the seed
state). One or more populated rows = ready to analyze.

## Analysis-artifact fence (shared pattern)

The analysis output `decisions/<date>-org-analysis.md` uses the **same fence
discipline** with a different tag — `<!-- org-design:auto -->`:

```markdown
## 3. Single points of failure

<!-- org-design:auto -->
- [SPOF: Jane Doe owns billing-service deploy keys (org/structure.md) AND is sole approver (memory: power=high) — single departure is load-bearing]
- [TODO: confirm secondary owner for payments on-call]
<!-- /org-design:auto -->

User annotations live below the closing fence and survive re-runs.
```

**Fence rules (both files):**
- Auto-content lives strictly between an open/close pair. The skill regenerates
  only inside-fence content; everything outside is user-owned and preserved.
- Malformed fences (unclosed, nested, or mismatched open/close) refuse mutation
  and emit a damage report — the original file is never partially written.
- `[TODO: ...]` markers inside a fence signal a gap the user should close.
