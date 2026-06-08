# analysis-checks.md — the six analyses

Per-section reasoning rules for `--mode=analyze`. All six are descriptive: they
report and flag what the inherited structure *is*. None proposes a change — that
is Phase 2. Every threshold below is an observation prompt, not a target the org
must hit.

Inputs available per the SKILL.md degradation table: `org/structure.md` (always),
stakeholder memory graph (may be absent → degrade), `interviews/sanitized/` (may
be absent → skip corroboration).

---

## §1 — Inherited structure (chart + plain read)

Render a Mermaid `graph TD` org chart from the `Reports to` column (each person
→ their manager). Annotate:
- SPOF nodes (from §3) — distinct node style/label.
- Wide-span managers (from §2) — distinct node style/label.

Follow with one paragraph in plain language: how many layers, how many teams,
where the mass sits. Description only — no "should".

Floating nodes (blank `Reports to`) are drawn unattached and flagged
"no manager recorded".

## §2 — Span of control

Count direct reports per manager (a manager = anyone who appears in another
row's `Reports to`). For each:
- **> ~7 reports** → flag too-wide ("span of N — wide; watch for thin support /
  skip-level gaps").
- **1–2 reports** → flag too-narrow ("span of N — narrow; possible extra layer").
- 3–7 → no flag (typical band).

The `~7` boundary is a prompt, not a rule. State the count for every manager so
the user sees the distribution, flagged or not.

## §3 — Single points of failure

Two SPOF classes; report both, attribute the source:

1. **System-ownership SPOF** — a `Critical systems owned` entry held by exactly
   one person across the whole table. One departure = that system loses its
   owner. Source: `org/structure.md`.
2. **Authority/decision SPOF** — a person tagged high power in the stakeholder
   memory graph who is also the sole approver / decision-holder for a domain.
   Source: memory `<Org> Stakeholders` power tags. **Degrades:** if memory is
   unavailable, emit only system-ownership SPOF and add
   `[TODO: authority-SPOF needs the stakeholder graph — run /stakeholder-map]`.

Combine when one person hits both classes — that is the highest-confidence SPOF.
Corroborate with `interviews/sanitized/` themes when present ("two teams flagged
the same overloaded lead") but never attribute to an individual interview.

## §4 — On-call burden distribution

Group `On-call rotation` by person and by team. Report load distribution; flag:
- one person in many rotations ("carries N rotations — concentration risk"),
- a team whose on-call rests on 1–2 people ("thin rotation — bus-factor on call").

People with a blank `On-call rotation` are excluded (not assumed off-call) — note
the exclusion count so the picture isn't read as complete when it isn't.

## §5 — Skill coverage gaps

From `Key skills`: a capability listed for exactly one person is a single-owner
skill → gap. A team with no one listing a skill its `Critical systems owned`
plainly need is a coverage hole. Report both as observations
("only Jane lists Kafka — single-owner skill"). Blank `Key skills` cells weaken
this per-person; flag the blanks rather than inferring zero skills.

## §6 — Manager:IC ratio by team

Per team, count `M` vs `IC` (cross-checked against who actually has reports).
Report the ratio. Flag outliers against a loose org-typical band (~1:5 to ~1:8
is common) **as observation**: "Team X is 1:3 — manager-heavy vs the rest of the
org" / "Team Y is 1:11 — lean management". No target is asserted; the band is a
comparison anchor only.

## §7 — Inherited-shape flags

The discipline section. Surface places the current structure encodes a past
decision worth understanding **before** anyone proposes changing it. Phrase every
entry as a question or observation, never a recommendation:

- "Team X owns both billing and notifications — why coupled? (understand before splitting)"
- "Two managers each have a span of 2 under the same director — historical reason? (understand before flattening)"

A line that says "should split" / "move N to Team Y" / "consolidate" is a Phase-2
prescription and must not appear here. If the reasoning naturally produces one,
rewrite it as the underlying question (Backtracking in SKILL.md).

---

## Cross-cutting rules

- **Describe, don't prescribe.** Every flag names what *is* and (in §7) what to
  understand — never what to do.
- **Attribute every flag to its source** (`org/structure.md` column or memory
  power tag) so the user can audit it.
- **Aggregate-only for interviews.** Corroborating signals from
  `interviews/sanitized/` are theme-level; never tie a flag to one named
  interviewee. `interviews/raw/` is never read.
- **Gaps are flagged, not filled.** A blank column degrades its analysis and
  earns a `[TODO]` marker inside the fence — the skill never invents data.
