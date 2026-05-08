# Challenge-Pass Checks — `/strategy-doc` Phase 1

Layered checks fired by `--mode=challenge`. Layer N runs only if Layer N-1 is clean (Layer 3 advisory: emits findings but does not gate handoff).

## Layer 1 — Completeness (gating)

Fail if ANY:

1. Any `[TODO` substring inside a `<!-- strategy-doc:auto -->` fence.
2. Any `[CONFLICT` substring anywhere in the doc.
3. Any of Sections 1-7 missing or empty (no content between heading and next `---`).
4. Any section-fence pair malformed (unclosed, mismatched, nested).

Output on fail: list each failing check with section anchor (e.g., `§3 — 2 [TODO] markers; §5 — empty`). Then stop. Do NOT run Layer 2/3.

Output on pass: "Layer 1 (completeness): clean. Running Layer 2..."

## Layer 2 — Quality (gating, with `--continue` escape)

Fail if ANY:

1. **§5 ask specificity:** any ask without both a number AND a date. Regex screen: `(?i)(more|some|a few|several)\s+(headcount|budget|engineers?|managers?|hires?)` → fail. "2 senior eng by W6" passes.
2. **§6 milestone measurability:** any milestone without a `Success criteria:` line.
3. **§6 cross-reference:** any milestone without `(addresses §3.<N>` or `(validates §4.<N>` annotation.
4. **§7 risk ownership:** any risk without `Owner:` line, or `Owner:` value is `[TODO: assign owner]`.
5. **§4 confirm/refute presence:** any §4 entry missing either `To confirm:` or `To refute:` line.
6. **§3 evidence citation:** any §3 entry missing `Evidence:` line or with empty source list.

Output on fail: per-section findings table:

```
§5 — 2 vague asks:
  - "Need more headcount for platform team" (no number, no date)
  - "Authority to make scope calls" (no date)
§6 — 1 unmeasurable milestone:
  - W2: "Build trust" — no success criteria
```

Then stop. Layer 3 only fires if user re-runs with `--mode=challenge --continue`.

Output on pass: "Layer 2 (quality): clean. Running Layer 3..."

## Layer 3 — Consistency (advisory)

Findings, not gates. Emit and continue.

1. **§6 ↔ §3/§4 cross-reference:** every §6 milestone references at least one §3 or §4 entry. Orphan milestones flagged.
2. **§5 ↔ §6 alignment:** every §5 ask supports at least one §6 milestone. Orphan asks flagged.
3. **30/60/90 sequencing:** no W<early> milestone declares dependency on a W<later> milestone (parse `dependency:` or `blocks on` clauses).
4. **§2 ↔ §3 contradiction:** scan for the same surface area (regex on noun-phrase overlap) in §2 strengths and §3 problems. Flag each pair for human review (not auto-resolution).

Output: findings table. Always end with: "Layer 3 advisory: review and resolve, or proceed to /present handoff."

## Handoff to `/present`

After Layer 3 clean (or after user accepts advisory findings), prompt:

> "Challenge pass clean. Export to Slidev deck via `/present`?"

If user accepts, invoke `/present` with the doc path and follow `export-present.md` mapping. If `/present` skill unavailable (`mcp__*` or skill-load error), emit notice "/present unavailable; doc remains at decisions/<date>-90-day-plan.md" and exit cleanly.

If challenge layer 1 or 2 not clean, refuse `/present` handoff: "Run --mode=challenge to clean before export."
