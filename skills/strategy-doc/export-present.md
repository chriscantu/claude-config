# `/present` Handoff — 90-Day Plan Slidev Export

Invoked after challenge pass clean. Maps the 7 doc sections onto Slidev slides and provides speaker-note guidance.

## Slide map (one section → one slide unless noted)

| Slide | Source section | Notes |
|---|---|---|
| 1 — Title | (none) | "<Org> 90-Day Plan — <Role>" + presenter name + date |
| 2 — What I learned | §1 | Key 3-6 bullets; speaker notes carry full prose |
| 3 — What is working | §2 | Strengths + allies; speaker notes name sources |
| 4 — Problems observed | §3 | One bullet per problem with confidence badge (`[confirmed]` / `[likely]`) |
| 5 — Problems suspected | §4 | Bullet + "to confirm" hint; defer "to refute" to speaker notes |
| 6 — Asks | §5 | Numbers + dates only; speaker notes carry rationale |
| 7-9 — Milestones (W1-30 / W30-60 / W60-90) | §6 | Three slides; one per band |
| 10 — Risks | §7 | Top 3-5 with owner + mitigation; speaker notes carry full list |

## Invocation

After challenge clean, prompt user:

> "Export to Slidev? (Default: yes)"

If accepted, invoke `/present` with arguments:

- `--source decisions/<date>-90-day-plan.md`
- `--map skills/strategy-doc/export-present.md` (this file is the slide-map reference)
- `--audience primary` (manager-as-primary; multi-variant deferred to Phase 2)

`/present` writes deck to `decks/slidev/<date>-90-day-plan/`.

## Confidentiality

The Slidev export inherits the workspace's NDA boundary. Deck files live inside `~/repos/onboard-<org>/decks/` — same git boundary as the source doc.

The export does NOT redact §5 asks or §3 evidence sources for non-manager audiences. Multi-variant export (manager / peers / reports views with redaction) is deferred to Phase 2.
