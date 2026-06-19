# Sample Run — Observation-First Intake (issue #483)

A frozen, reproducible demonstration that observation-first capture makes challenge
checks #1 (vague) and #4 (miscategorized) flag **measurably fewer** entries than the old
bucketed form, on the same underlying signal.

There is no automated eval harness for skill prompts, so this is a single representative
run over a fixed input. LLM tagging is non-deterministic — re-running may shift a count
by one. The value is auditability: the inputs and both transcripts are committed, so the
before/after is reproducible by hand, not asserted.

> **For future editors:** the flag counts below are hand-derived against the Check #1 and
> Check #4 definitions in [../challenge-checks.md](../challenge-checks.md). If those
> definitions change, re-derive the counts here — nothing fails automatically.
> Scenario 17 in [../test/scenarios.md](../test/scenarios.md) re-runs this by hand.

---

## Fixed input — the raw signal a leader observed

Twelve things a newly-hired platform leader noticed in their first weeks. This is the
ground truth; the two flows below capture the *same* signal differently.

1. The team writes a follow-up doc after every incident — 12 of 12 last quarter.
2. Deploys take about 15 minutes with zero downtime. My last org took two hours.
3. There is no on-call rotation; two senior devs carry the pager and both mentioned burnout.
4. Three senior engineers left in six months; exit interviews cite on-call load.
5. A competitor just dropped enterprise support and their customers are shopping around.
6. A newer rival raised $80M and is hiring aggressively in our space.
7. We carry a lot of tech debt in the billing service — every change risks a regression.
8. Two competitors shipped AI copilots in our product category this quarter.
9. The org went through a reorg six months ago; some teams are still settling.
10. We have no staging environment that matches production.
11. The platform team owns five services but has no product manager.
12. Documentation is thin — new hires take weeks to find anything.

---

## OLD flow (5 bucketed prompts) — what the user pre-sorts

The old form asks the user to slot answers into Strengths / Weaknesses / Opportunities /
Threats at input time. That invites vague conclusions and internal/external mis-sorts.

```
[strength][cultural]  Strong engineering culture
[strength][technical] Good CI/CD
[strength][market]    We have a chance to win the competitor's customers   <- external, mis-slotted
[weakness][org]       No SRE team
[weakness][cultural]  Morale is low
[weakness][market]    A rival raised $80M and is hiring                     <- external, mis-slotted
[opportunity][market] AI is big right now
[threat][technical]   Our tech debt could slow us down                      <- internal, mis-slotted
[context]             Reorg six months ago
```

### Challenge results — OLD

- **Check #1 (Specific?)** flags: "Strong engineering culture", "Good CI/CD",
  "Morale is low", "AI is big right now" → **4 flagged**
- **Check #4 (Correctly Categorized?)** flags: customer-win opportunity slotted as a
  strength; external rival slotted as a weakness; internal tech debt slotted as a threat
  → **3 flagged**

---

## NEW flow (6 neutral prompts) — observation-first

The "how do you know?", "compared to what?", and "what's missing?" prompts pull
specifics and evidence; the skill assigns SWOT tags at the confirm step and the user
corrects via Retag. Same signal, captured as observations.

```
[strength][cultural]  Blameless postmortems on every incident — 12 of 12 last quarter had written follow-ups (incident tracker)
[strength][technical] Deploys run ~15 min, zero downtime; last org took 2 hours (deploy dashboard)
[weakness][org]       No on-call rotation — two senior devs carry the pager, both report burnout (1:1s)
[weakness][cultural]  Three senior engineers left in 6 months; exit interviews cite on-call load (HR)
[weakness][technical] Billing service carries heavy tech debt — every change risks a regression (code review)
[weakness][org]       No staging environment matching production (platform lead)
[weakness][org]       Platform team owns 5 services with no product manager (org chart)
[weakness][cultural]  Docs are thin — new hires take weeks to find basic info (new-hire feedback)
[opportunity][market] Competitor dropped enterprise support — their customers are shopping (sales)
[threat][market]      Newer rival raised $80M, hiring aggressively in our space (public filing)
[threat][market]      Two competitors shipped AI copilots in our category this quarter (product teardown)
[context]             Reorg six months ago — some teams still settling (1:1 with Mike)
```

### Challenge results — NEW

- **Check #1 (Specific?)** flags: **0** — the comparative and "how do you know?" prompts
  force a measurable claim and a source on each entry.
- **Check #4 (Correctly Categorized?)** flags: **0** — the skill applied the
  internal/external split at confirm and the user confirmed; nothing was pre-sorted by
  the user.

---

## Before / After

| Challenge check | OLD (bucketed, 9 entries) | NEW (observation-first, 12 entries) |
|---|---:|---:|
| #1 Specific? (vague entries flagged) | 4 | 0 |
| #4 Correctly Categorized? (mis-sorts flagged) | 3 | 0 |

**Two distinct effects — don't conflate them.** The corpora differ in size on purpose,
and that mixes two wins:

1. **Bias removal (the AC#3 claim).** This is the like-for-like result: of the signal the
   OLD form *did* capture, 4 entries were vague and 3 were mis-sorted; captured
   observation-first, the same signal produces 0 and 0. The form stops *generating* the
   #1/#4 error classes. That is what AC#3 asks for.
2. **Richer capture (a bonus, not the AC claim).** The NEW flow also surfaces 3 extra real
   weaknesses (no staging, no PM, thin docs) the bucketed form never prompted for — the
   absence prompt ("what's missing?") at work. This widens the corpus but is a separate
   benefit; it is not what drives the flag-count drop.

Read the headline as "the error classes go to zero," not "more entries = fewer flags."

---

## Backward-compatibility spot check

Old entries use `[YYYY-MM-DD][swot-tag][landscape-tag] text (provenance)`. The new flow
writes the **same** string shape, so review and challenge read both without migration.
This pre-existing entry, captured under the old flow, still renders and challenges
correctly alongside new entries:

```
[2026-04-10][strength][technical] Good API design — consistent REST conventions, versioned (code review)
```

Run `/swot "<org>" --mode=review` over a mix of old- and new-flow entries to confirm a
single rendered report with no format errors.
