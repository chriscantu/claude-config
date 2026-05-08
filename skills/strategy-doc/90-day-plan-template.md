# 90-Day Plan Template

This is the canonical 7-section template that `/strategy-doc <org> --mode=draft` writes to `decisions/<YYYY-MM-DD>-90-day-plan.md`. Auto-populated content lives strictly inside `<!-- strategy-doc:auto -->` ... `<!-- /strategy-doc:auto -->` fence pairs. Outside-fence content is user-owned and never mutated by the skill.

## Section Order (canonical — do not reorder)

1. What I learned
2. What is working
3. Problems I have observed (evidence + confidence)
4. Problems I suspect (lack evidence)
5. Specific asks
6. 30/60/90 milestones (action commitments)
7. Risks and dependencies

## Discipline Invariant

Sections 3 and 4 contain observations only — never proposed actions. Action commitments live exclusively in Section 6 with timeline + success criteria. "Parking" a problem (declining to act) is implicit: a Section 3 entry that earns no Section 6 milestone is parked. This separation enforces evidence-grounded framing before intervention.

## Skeleton (literal — write to `decisions/<date>-90-day-plan.md`)

```markdown
# 90-Day Plan — <Org> (<Role>)

**Created:** <YYYY-MM-DD>
**Last updated:** <YYYY-MM-DD>
**Status:** draft | review-ready | final

---

## 1. What I learned

<!-- strategy-doc:auto -->
[TODO: synthesis from /swot, /stakeholder-map, /architecture-overview, notes/*.md — 3-6 bullets]
<!-- /strategy-doc:auto -->

(User-written prose may follow below the closing fence.)

---

## 2. What is working

<!-- strategy-doc:auto -->
[TODO: SWOT strengths + stakeholder allies — 2-5 bullets each with source citation]
<!-- /strategy-doc:auto -->

---

## 3. Problems I have observed

> Evidence sources + confidence (confirmed / likely). No proposed action — interventions live in Section 6.

<!-- strategy-doc:auto -->
[TODO: SWOT weaknesses + threats with multi-source corroboration; stakeholder gaps confirmed by 1on1 absence; arch findings from inventory/dependencies/data-flow/integrations]

Format per entry:
- **<Problem statement>**
  - Evidence: <source A>, <source B>
  - Confidence: confirmed | likely
<!-- /strategy-doc:auto -->

---

## 4. Problems I suspect

> Hunches. What evidence would confirm or refute. Section 6 milestones may target validation directly.

<!-- strategy-doc:auto -->
[TODO: notes/*.md hunches not yet corroborated; single-observation SWOT entries; thin-data stakeholder patterns]

Format per entry:
- **<Suspected problem>**
  - Source: <where the hunch came from>
  - To confirm: <what evidence would corroborate>
  - To refute: <what evidence would rule it out>
<!-- /strategy-doc:auto -->

---

## 5. Specific asks

> Headcount, budget, scope, authority. Quality gate: numbers + dates required (no "more headcount" — write "2 senior eng by W6").

<!-- strategy-doc:auto -->
[TODO: user-supplied. Skill cannot synthesize asks from upstream — leave [TODO] until user fills.]
<!-- /strategy-doc:auto -->

---

## 6. 30/60/90 milestones

> Sole locus of action commitments. Each milestone references Section 3 or 4 problem(s) it addresses. Validation milestones are valid (e.g., "Confirm Section 4 hunch X by W4 via Y").

<!-- strategy-doc:auto -->
[TODO: user-supplied. Format per milestone:]

### W1-30
- **<Milestone>** (addresses §3.<N> | validates §4.<N>)
  - Success criteria: <measurable>
  - Timeline: by W<N>

### W30-60
- ...

### W60-90
- ...
<!-- /strategy-doc:auto -->

---

## 7. Risks and dependencies

<!-- strategy-doc:auto -->
[TODO: SWOT threats + arch integration risks + cross-team dependencies. Each risk has named owner.]

Format per risk:
- **<Risk>**
  - Owner: <name>
  - Mitigation: <plan or "monitoring only">
  - Trigger to escalate: <condition>
<!-- /strategy-doc:auto -->

---
```

## Section-fence rules (load-bearing)

1. Auto-populated content lives strictly inside `<!-- strategy-doc:auto -->` ... `<!-- /strategy-doc:auto -->` pairs.
2. Outside-fence content is user-owned. Never mutate.
3. Malformed fences (unclosed, mismatched, nested) → refuse mutation. Emit damage report listing fence positions and line numbers. Do NOT auto-repair.
4. `--mode=draft` re-run merges new upstream evidence inside fences only. User edits below the closing fence are preserved verbatim.

## Multi-day overlap

If `decisions/<date>-90-day-plan.md` exists with a date different from today, glob `decisions/*-90-day-plan.md` and mutate the existing file (latest by mtime if multiple). Do not create a new dated file. One artifact per ramp.

If glob returns multiple files (e.g., user manually created two), refuse mutation, emit list, ask user to consolidate.
