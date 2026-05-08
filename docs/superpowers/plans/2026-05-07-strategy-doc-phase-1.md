# /strategy-doc Skill — Phase 1 Implementation Plan (90-day-plan mode)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/strategy-doc <org> [--mode=draft|review|challenge]` skill that collates `/swot` + `/stakeholder-map` + `/architecture-overview` + `notes/*.md` into a 7-section 90-day-plan markdown artifact under `~/repos/onboard-<org>/decisions/`, with stub-and-iterate flow, layered challenge pass, and `/present` handoff.

**Architecture:** Markdown-driven skill (Pattern C) at `skills/strategy-doc/SKILL.md` instructing Claude to perform synthesis, write skeleton via `Write`, run challenge checks via natural-language steps. No new scripts Phase 1 — confidentiality refusal delegates to existing `skills/onboard/scripts/onboard-guard.ts`. Tests = evals only (`skills/strategy-doc/evals/evals.json` + `tests/fixtures/strategy-doc/`). Mirrors `/swot`, `/stakeholder-map`, `/architecture-overview` shape.

**Tech Stack:** Markdown (skill body + reference docs), JSON (evals), filesystem fixtures. No TypeScript, no fish scripts. Reuses `bun:test` eval runner via existing `tests/eval-runner-v2.ts`.

**Spec:** [docs/superpowers/specs/2026-05-07-strategy-doc-design.md](../specs/2026-05-07-strategy-doc-design.md) (committed `435ea37`).

**Issue:** [#42](https://github.com/chriscantu/claude-config/issues/42).

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `skills/strategy-doc/SKILL.md` | new | Frontmatter (name, description, `disable-model-invocation: true`) + skill body. Workspace resolution, mode routing, prereq refusal, dispatch to reference docs. |
| `skills/strategy-doc/90-day-plan-template.md` | new | Canonical 7-section template with section-fence sentinel pattern (`<!-- strategy-doc:auto -->`). Read on demand by SKILL during draft mode. |
| `skills/strategy-doc/synthesis.md` | new | Upstream-input routing rules (SWOT entity → Section 1-3; stakeholder entity → Section 1, 7; arch bundle → Section 1, 3; notes/*.md → Section 4 default, promote to 3 on corroboration). |
| `skills/strategy-doc/challenge-checks.md` | new | Three layered passes: completeness ([TODO] markers, empty sections), quality (ask specificity, milestone measurability, risk ownership), consistency (Section 6 ↔ 3/4 cross-refs, sequencing, contradiction). |
| `skills/strategy-doc/export-present.md` | new | `/present` handoff Slidev shape: section → slide mapping, speaker-note guidance. |
| `skills/strategy-doc/evals/evals.json` | new | 14 evals covering draft happy paths, idempotence, review, challenge layers, refusal, degradation, doc-state errors. |
| `tests/fixtures/strategy-doc/README.md` | new | Fixture↔eval matrix per `validate.fish` Phase 1n contract. |
| `tests/fixtures/strategy-doc/<scenario>/` | new (×9) | Onboard-workspace skeletons exercising each eval. See task tables below. |
| `~/.claude/skills/strategy-doc` | new symlink | Created by `bin/link-config.fish` on user's machine. Final task asserts `bin/link-config.fish --check` passes. |

Phase 1 introduces zero modifications to existing files. The symlink is the only `~/.claude/` mutation; the install script handles it.

---

## Task 1 — Scaffold the skill via `bin/new-skill`

**Files:**
- Create: `skills/strategy-doc/SKILL.md` (overwritten in Task 6)
- Create: `skills/strategy-doc/evals/` (empty dir; populated Task 8+)
- Create: `skills/strategy-doc/references/` (empty dir; reserved for deep-dive content)

- [ ] **Step 1: Run scaffolder**

```fish
bin/new-skill strategy-doc
```

Expected: `skills/strategy-doc/SKILL.md` created from `templates/skill/`. `fish validate.fish` runs automatically; should pass on unmodified template.

- [ ] **Step 2: Verify scaffold landed**

```fish
ls skills/strategy-doc/
test -f skills/strategy-doc/SKILL.md && echo OK
```

Expected: `SKILL.md`, `evals/`, `references/` present. OK on stdout.

- [ ] **Step 3: Commit scaffold**

```fish
git add skills/strategy-doc/
git commit -m "Scaffold /strategy-doc skill from template (#42)"
```

---

## Task 2 — Write `90-day-plan-template.md` (canonical 7-section template)

**Files:**
- Create: `skills/strategy-doc/90-day-plan-template.md`

- [ ] **Step 1: Write the template file**

Content of `skills/strategy-doc/90-day-plan-template.md`:

````markdown
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
````

- [ ] **Step 2: Verify file**

```fish
test -f skills/strategy-doc/90-day-plan-template.md && grep -c "strategy-doc:auto" skills/strategy-doc/90-day-plan-template.md
```

Expected: count >= 14 (7 opening + 7 closing fences in skeleton).

- [ ] **Step 3: Commit**

```fish
git add skills/strategy-doc/90-day-plan-template.md
git commit -m "Add 90-day-plan canonical 7-section template (#42)"
```

---

## Task 3 — Write `synthesis.md` (upstream-input routing rules)

**Files:**
- Create: `skills/strategy-doc/synthesis.md`

- [ ] **Step 1: Write the synthesis file**

Content of `skills/strategy-doc/synthesis.md`:

````markdown
# Synthesis Rules — `/strategy-doc` Phase 1

How to combine upstream inputs into the 7 sections of the 90-day-plan during `--mode=draft`. Each rule fires independently; the skill walks rules section-by-section.

## Inputs

| Source | Read via | Always read? |
|---|---|---|
| `<Org> SWOT` memory entity | `mcp__memory__search_nodes("<Org> SWOT")` | Yes (warn + skip if memory MCP unavailable) |
| `<Org> Stakeholders` memory entity | `mcp__memory__search_nodes("<Org> Stakeholders")` | Yes |
| Architecture bundle | `arch/{inventory,dependencies,data-flow,integrations}.md` via `Read` | Yes (skip if any file absent) |
| Free-form notes | glob `notes/*.md` (exclude `notes/raw/`) | Yes |

## Confidentiality precondition

Before reading any path under the workspace, run:

```fish
bun run "$CLAUDE_PROJECT_DIR/skills/onboard/scripts/onboard-guard.ts" refuse-raw <path>
```

For URLs and paths outside the workspace, the guard is a no-op and exits 0. For paths inside `notes/raw/`, the guard exits non-zero — the skill MUST refuse to read.

## Section-by-section synthesis

### Section 1 — What I learned

Combine signal across all four sources into 3-6 bullets. Each bullet cites at least one source:

- SWOT entity entries (any quadrant) — pull observations with multi-source landscape tags.
- Stakeholder entity — political-topology highlights (e.g., "engineering-product alignment confirmed by 3 directors").
- Arch bundle — top 1-2 facts from `inventory.md` + key seams from `data-flow.md`.
- Notes — emergent themes appearing across multiple `notes/*.md` files.

If a source is empty, omit its contribution silently — do not emit "no SWOT data" stub here. Section 1 surface is "what I learned." Empty sources just mean less learned.

### Section 2 — What is working

Pull only:

- SWOT **Strengths** quadrant entries.
- Stakeholder entries tagged as allies / supporters.

2-5 bullets, each with source citation. Do not invent positives — if both sources empty, leave as `[TODO: capture during /swot --mode=add or 1on1 reviews]`.

### Section 3 — Problems I have observed

Routing rule: a problem qualifies if it has **multi-source corroboration** OR **direct code-grounded evidence**.

| Source signal | Section 3 if... |
|---|---|
| SWOT **Weaknesses** | Mentioned in 2+ entries OR landscape-tagged with same theme |
| SWOT **Threats** | Multi-source OR stakeholder-corroborated |
| Stakeholder gap | Confirmed by absence of 1on1 with named role (`stakeholder-map` confirms gap) |
| Arch finding | Code-grounded: cited from `inventory.md` / `dependencies.md` / `integrations.md` |
| Notes hunch | Promote to §3 only if a SWOT entry or stakeholder entry corroborates same theme |

Per-entry format (literal):

```markdown
- **<Problem>**
  - Evidence: <source A path/citation>, <source B path/citation>
  - Confidence: confirmed (≥2 independent sources) | likely (1 strong source + 1 weak)
```

### Section 4 — Problems I suspect

Routing rule: signal exists but does NOT meet Section 3's corroboration bar.

| Source signal | Section 4 |
|---|---|
| Single SWOT entry, no landscape tag | Default |
| Stakeholder pattern from <3 interviews | Default |
| Notes hunch with no SWOT/stakeholder echo | Default |

Per-entry format (literal):

```markdown
- **<Suspected problem>**
  - Source: <single source path/citation>
  - To confirm: <evidence that would corroborate>
  - To refute: <evidence that would rule out>
```

The "To confirm" and "To refute" fields are required — they are what enables a Section 6 validation milestone to target this entry.

### Section 5 — Specific asks

Skill cannot synthesize asks from upstream. Leave the inside-fence content as `[TODO: user-supplied]`. Surface a hint: "Section 5 requires user input — asks can't be inferred from observations alone."

### Section 6 — 30/60/90 milestones

Skill cannot synthesize commitments from upstream. Leave inside-fence as `[TODO: user-supplied]` plus the literal sub-headings `### W1-30`, `### W30-60`, `### W60-90` so the user has a structure to fill.

### Section 7 — Risks and dependencies

Pull from:

- SWOT **Threats** quadrant.
- Arch `integrations.md` — external-dependency risks.
- Stakeholder entries marked as blockers / no-allies.

Per-entry format requires a named owner. If the upstream source doesn't name an owner, write `[TODO: assign owner]` for that field — challenge layer 2 will flag it.

## Conflicting evidence

If two sources disagree (SWOT entity says X is strength, `notes/X.md` says X is weakness), emit inline `[CONFLICT: <source-A> says ..., <source-B> says ...; resolve before challenge]` in the affected section. Challenge layer 1 treats unresolved CONFLICT markers as incompleteness — challenge fails until user resolves.
````

- [ ] **Step 2: Verify file**

```fish
test -f skills/strategy-doc/synthesis.md && grep -c "Section " skills/strategy-doc/synthesis.md
```

Expected: count ≥ 7 (7 section headings).

- [ ] **Step 3: Commit**

```fish
git add skills/strategy-doc/synthesis.md
git commit -m "Add /strategy-doc upstream synthesis routing rules (#42)"
```

---

## Task 4 — Write `challenge-checks.md` (3 layered passes)

**Files:**
- Create: `skills/strategy-doc/challenge-checks.md`

- [ ] **Step 1: Write the challenge-checks file**

Content of `skills/strategy-doc/challenge-checks.md`:

````markdown
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
````

- [ ] **Step 2: Verify file**

```fish
test -f skills/strategy-doc/challenge-checks.md && grep -c "^## Layer " skills/strategy-doc/challenge-checks.md
```

Expected: count = 3.

- [ ] **Step 3: Commit**

```fish
git add skills/strategy-doc/challenge-checks.md
git commit -m "Add /strategy-doc layered challenge-pass checks (#42)"
```

---

## Task 5 — Write `export-present.md` (`/present` handoff)

**Files:**
- Create: `skills/strategy-doc/export-present.md`

- [ ] **Step 1: Write the export-present file**

Content of `skills/strategy-doc/export-present.md`:

````markdown
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
````

- [ ] **Step 2: Verify file**

```fish
test -f skills/strategy-doc/export-present.md && grep -c "^| " skills/strategy-doc/export-present.md
```

Expected: count ≥ 8 (slide-map table rows).

- [ ] **Step 3: Commit**

```fish
git add skills/strategy-doc/export-present.md
git commit -m "Add /strategy-doc /present Slidev handoff mapping (#42)"
```

---

## Task 6 — Write `SKILL.md` v1 (mode routing + workspace prereq)

**Files:**
- Modify: `skills/strategy-doc/SKILL.md` (overwrite scaffold)

- [ ] **Step 1: Overwrite scaffold with skill body**

Content of `skills/strategy-doc/SKILL.md`:

````markdown
---
name: strategy-doc
description: Use when the user says /strategy-doc <org>, "draft my 90-day plan", "review the 90-day plan", or "challenge the 90-day plan" during a senior eng leader ramp. Phase 1 supports the 90-day-plan mode only — collates /swot + /stakeholder-map + /architecture-overview + free-form notes/*.md into a 7-section markdown artifact under ~/repos/onboard-<org>/decisions/. Cross-org RFC mode is Phase 2 (separate spec).
disable-model-invocation: true
status: experimental
version: 0.1.0
---

# /strategy-doc — 90-Day Plan Authoring

Personal note-collator for the 90-day-plan deliverable of a senior eng leader ramp. User is the primary reader; the skill is the synthesizer + critic, not an author of opinions.

**Announce:** "I'm using the strategy-doc skill to help you build your 90-day plan."

**Reference files** (read on demand):

- [90-day-plan-template.md](90-day-plan-template.md) — canonical 7-section template + section-fence rules.
- [synthesis.md](synthesis.md) — upstream-input routing rules per section.
- [challenge-checks.md](challenge-checks.md) — layered completeness → quality → consistency passes.
- [export-present.md](export-present.md) — `/present` Slidev handoff mapping.

## Invocation

```
/strategy-doc <org> [--mode=draft|review|challenge]
```

`<org>` is required. Default mode is `draft`.

## Prerequisites (refuse if missing)

1. `~/repos/onboard-<org>/` directory exists. If absent, refuse with:
   > "Workspace not found at `~/repos/onboard-<org>/`. Run `/onboard <org>` first."
2. `decisions/` subdirectory exists or is creatable. If `~/repos/onboard-<org>/` exists but `decisions/` does not, create it (matches `/onboard` Phase 1 contract).

Do not check upstream skill state (SWOT / stakeholder / arch availability) here — those are graceful-degradation cases handled inside `--mode=draft`.

## Mode routing

| Mode | Effect |
|---|---|
| `draft` (default) | Read existing doc (or scaffold from template), pull upstream evidence per [synthesis.md](synthesis.md), populate inside-fence content. Preserve outside-fence user prose. |
| `review` | Render section-by-section view to terminal. No mutation. No checks. |
| `challenge` | Run layered checks per [challenge-checks.md](challenge-checks.md). Layer 1 fail skips 2-3. Layer 2 fail gates Layer 3 behind `--continue`. All clean → offer `/present` handoff per [export-present.md](export-present.md). |

## Doc location

Single artifact per ramp at `~/repos/onboard-<org>/decisions/<creation-date>-90-day-plan.md`.

- First `--mode=draft` run: create `decisions/<today>-90-day-plan.md` from template.
- Subsequent `--mode=draft` runs: glob `decisions/*-90-day-plan.md` → mutate the existing file (latest mtime if multiple). Do NOT create a new dated file.
- Multiple `*-90-day-plan.md` files present (user manually duplicated): refuse mutation, list files, ask user to consolidate. One artifact per ramp is invariant.

## Confidentiality

Before reading any path inside the workspace, run:

```fish
bun run "$CLAUDE_PROJECT_DIR/skills/onboard/scripts/onboard-guard.ts" refuse-raw <path>
```

The guard refuses paths under `notes/raw/` (non-zero exit). Skill MUST honor the refusal — do not read the file. Exit-code contract and override policy: see [../onboard/refusal-contract.md](../onboard/refusal-contract.md).

## Upstream-input degradation (graceful)

| Missing input | Behavior |
|---|---|
| Memory MCP unavailable | Warn once. Continue with filesystem-only inputs. |
| `<Org> SWOT` entity missing/empty | Inside-fence `[TODO: no SWOT data — run /swot <org> --mode=add or write notes/]` markers in §1-3. |
| `<Org> Stakeholders` entity missing | Similar `[TODO]` in §1, §7. |
| `arch/` directory absent or empty | Skip arch synthesis. `[TODO]` in §1. |
| `notes/*.md` empty / dir absent | Skip notes pass. No error. |

Rule: missing input never aborts draft. Skill emits whatever skeleton it can; `[TODO]` markers signal gaps for the user (and trigger challenge layer 1 fail later).

## Section-fence sentinels

Auto-populated content lives inside `<!-- strategy-doc:auto -->` ... `<!-- /strategy-doc:auto -->` pairs. Outside-fence content is user-owned. Malformed fences refuse mutation; emit damage report. See [90-day-plan-template.md](90-day-plan-template.md) for the canonical pattern.

## Out of scope (Phase 1)

- `--mode=rfc` cross-org strategy / RFC authoring (Phase 2).
- Multi-variant audience export (manager / peers / reports views with redaction) — Phase 2.
- Memory entity for strategy doc — filesystem-only Phase 1.
- Multi-org concurrent workspace handling.
- Interactive `--capture` flag — user writes `notes/*.md` directly Phase 1.
````

- [ ] **Step 2: Verify file structure**

```fish
test -f skills/strategy-doc/SKILL.md
grep -c "^## " skills/strategy-doc/SKILL.md
fish validate.fish
```

Expected: SKILL.md present. Heading count ≥ 7 (Invocation, Prerequisites, Mode routing, Doc location, Confidentiality, Upstream degradation, Section-fence sentinels, Out of scope). `validate.fish` passes (no broken delegate-links, anchor labels, fixture↔eval gaps).

- [ ] **Step 3: Commit**

```fish
git add skills/strategy-doc/SKILL.md
git commit -m "Write /strategy-doc SKILL.md v0.1.0 — mode routing + prereq refusal (#42)"
```

---

## Task 7 — Create fixture root + README (validate Phase 1n contract)

**Files:**
- Create: `tests/fixtures/strategy-doc/README.md`

- [ ] **Step 1: Write the fixtures README**

Content of `tests/fixtures/strategy-doc/README.md`:

````markdown
# Fixtures — `/strategy-doc`

Each fixture is a minimal `~/repos/onboard-<org>/` workspace shape that exercises a specific eval contract from `skills/strategy-doc/evals/evals.json`. New fixtures must be added with: (a) eval consumer in [`skills/strategy-doc/evals/evals.json`](../../../skills/strategy-doc/evals/evals.json), (b) entry in the matrix below.

`validate.fish` Phase 1n enforces fixture↔eval integrity: every fixture under this directory must either have an eval consumer or be listed under `## Orphaned fixtures` (warning, not failure).

## Eval → Fixture matrix

| Eval (`evals/evals.json`) | Fixture | Why this fixture |
|---|---|---|
| `workspace-missing` | (none — eval supplies bogus org name) | Tests prereq refusal; no workspace needed |
| `draft-fresh-workspace` | `fresh-workspace/` | Onboard-scaffolded layout; empty SWOT/stakeholder/arch/notes; all sections [TODO] |
| `draft-with-swot-only` | `with-swot-only/` | Workspace + memory-entity seed for SWOT only; §1-3 partial |
| `draft-full-pipeline` | `full-pipeline/` | All four sources populated; §1-3 substantially filled, §5/§6 [TODO] |
| `draft-idempotent` | `draft-with-user-edits/` | Doc has user prose below closing fence; re-run preserves it |
| `review-mode-readonly` | `clean-doc/` | Complete doc; review renders without mutation |
| `challenge-layer-1-fail` | `draft-with-todos/` | Doc with [TODO] markers inside fences |
| `challenge-layer-2-fail` | `draft-vague-asks/` | Complete §1-4, §7; §5 has "more headcount" / §6 has unmeasurable milestone |
| `challenge-layer-3-pass` | `clean-doc/` | All layers clean; handoff offered |
| `refusal-raw-notes` | `with-raw-notes/` | Has `notes/raw/sensitive.md`; --read attempt refused |
| `memory-mcp-unavailable` | `fresh-workspace/` | Reused; eval simulates MCP unavailability |
| `conflicting-evidence` | `conflicting-evidence/` | SWOT entity says X is strength; notes/X.md flags X as weakness |
| `doc-fence-malformed` | `malformed-fences/` | Doc has unclosed `<!-- strategy-doc:auto -->` |
| `multi-day-overlap` | `existing-old-doc/` | Doc dated 2 weeks ago; --mode=draft mutates same file |
| `multi-file-glob-refusal` | `multi-day-plans/` | Two `*-90-day-plan.md` files present; refuse mutation |

## Orphaned fixtures

(none currently)
````

- [ ] **Step 2: Verify**

```fish
test -f tests/fixtures/strategy-doc/README.md
grep -c "^| " tests/fixtures/strategy-doc/README.md
```

Expected: count ≥ 16 (table header + 15 eval rows).

- [ ] **Step 3: Commit**

```fish
git add tests/fixtures/strategy-doc/
git commit -m "Add /strategy-doc fixtures README + eval matrix (#42)"
```

---

## Task 8 — Build the 9 fixture directories

**Files (create per scenario, listed below):**
- `tests/fixtures/strategy-doc/fresh-workspace/`
- `tests/fixtures/strategy-doc/with-swot-only/`
- `tests/fixtures/strategy-doc/full-pipeline/`
- `tests/fixtures/strategy-doc/draft-with-user-edits/`
- `tests/fixtures/strategy-doc/clean-doc/`
- `tests/fixtures/strategy-doc/draft-with-todos/`
- `tests/fixtures/strategy-doc/draft-vague-asks/`
- `tests/fixtures/strategy-doc/with-raw-notes/`
- `tests/fixtures/strategy-doc/conflicting-evidence/`
- `tests/fixtures/strategy-doc/malformed-fences/`
- `tests/fixtures/strategy-doc/existing-old-doc/`
- `tests/fixtures/strategy-doc/multi-day-plans/`

Per-fixture canonical layout (only files relevant to that scenario; absent files exercise graceful degradation):

```
<fixture>/
  RAMP.md                  # cadence preset (always present — onboard scaffolds it)
  stakeholders/map.md      # may be empty stub
  arch/                    # may be empty
    inventory.md
    dependencies.md
    data-flow.md
    integrations.md
  swot/                    # may be empty (memory-entity is canonical; this dir is for md exports)
  notes/                   # free-form notes
    *.md
    raw/                   # only in with-raw-notes/
      sensitive.md
  decisions/               # plan output dir
    *.md
  memory-seed.json         # optional: fixture-specific memory MCP entity seed (read by eval runner)
```

- [ ] **Step 1: `fresh-workspace/` — empty onboard scaffold**

```fish
mkdir -p tests/fixtures/strategy-doc/fresh-workspace/{stakeholders,arch,swot,notes,decisions}
cat > tests/fixtures/strategy-doc/fresh-workspace/RAMP.md <<'EOF'
# Ramp — Fresh Workspace

**Cadence:** standard
**Created:** 2026-05-07
EOF
cat > tests/fixtures/strategy-doc/fresh-workspace/stakeholders/map.md <<'EOF'
# Stakeholder Map (empty)
EOF
```

- [ ] **Step 2: `with-swot-only/` — populated SWOT, empty stakeholder/arch/notes**

```fish
mkdir -p tests/fixtures/strategy-doc/with-swot-only/{stakeholders,arch,swot,notes,decisions}
cp tests/fixtures/strategy-doc/fresh-workspace/RAMP.md tests/fixtures/strategy-doc/with-swot-only/RAMP.md
cp tests/fixtures/strategy-doc/fresh-workspace/stakeholders/map.md tests/fixtures/strategy-doc/with-swot-only/stakeholders/map.md
cat > tests/fixtures/strategy-doc/with-swot-only/memory-seed.json <<'EOF'
{
  "entities": [
    {
      "name": "Acme SWOT",
      "entityType": "SWOT",
      "observations": [
        "[strength] Engineering velocity high — 40 PRs/week (multi-team)",
        "[weakness] On-call burden uneven — 3 ICs hold 80% of pages",
        "[weakness] Test coverage on payments service drifting (was 75%, now 52%)",
        "[opportunity] Recently hired 2 senior eng with platform experience",
        "[threat] Stripe API v2 deprecation forces migration in Q3"
      ]
    }
  ]
}
EOF
```

- [ ] **Step 3: `full-pipeline/` — all four sources populated**

```fish
mkdir -p tests/fixtures/strategy-doc/full-pipeline/{stakeholders,arch,swot,notes,decisions}
cp tests/fixtures/strategy-doc/fresh-workspace/RAMP.md tests/fixtures/strategy-doc/full-pipeline/RAMP.md

cat > tests/fixtures/strategy-doc/full-pipeline/stakeholders/map.md <<'EOF'
# Stakeholder Map — Acme

## Allies
- Director of Product (interviewed W2, strong alignment on Q3 priorities)
- VP Eng (interviewed W1, manager handoff included clear top-3 problems)

## Gaps
- No 1on1 yet with Director of Data Platform — domain dependency for §3 problems
EOF

for f in inventory dependencies data-flow integrations; do
  echo "# Architecture — $f" > tests/fixtures/strategy-doc/full-pipeline/arch/$f.md
done
echo "## Modules
- payments-service (TypeScript, deps: stripe, postgres)
- web-checkout (React, deps: payments-service)" >> tests/fixtures/strategy-doc/full-pipeline/arch/inventory.md

echo "## External integrations
- Stripe API v2 (deprecated; migration to v3 forced Q3)
- Snowflake warehouse (data-platform team owns)" >> tests/fixtures/strategy-doc/full-pipeline/arch/integrations.md

cat > tests/fixtures/strategy-doc/full-pipeline/notes/week-1.md <<'EOF'
# Week 1 notes

- Engineering team morale strong; people want to ship.
- Heard third-hand that platform-team hiring froze 6 months ago. Need to confirm.
EOF

cat > tests/fixtures/strategy-doc/full-pipeline/notes/week-2.md <<'EOF'
# Week 2 notes

- 1:1 w/ payments lead: test coverage drift confirmed (cited Q3 incident).
- Suspicion: data-platform team is under-resourced. Single source so far (engineering complaints in retros).
EOF

cat > tests/fixtures/strategy-doc/full-pipeline/memory-seed.json <<'EOF'
{
  "entities": [
    {
      "name": "Acme SWOT",
      "entityType": "SWOT",
      "observations": [
        "[strength] Engineering velocity high — 40 PRs/week",
        "[weakness] On-call burden uneven — 3 ICs hold 80% of pages",
        "[weakness] Payments service test coverage drifting",
        "[threat] Stripe API v2 deprecation forces Q3 migration",
        "[opportunity] 2 senior eng platform hires landed last sprint"
      ]
    },
    {
      "name": "Acme Stakeholders",
      "entityType": "Stakeholders",
      "observations": [
        "Director of Product — ally, interviewed W2",
        "VP Eng — ally, manager handoff complete W1",
        "Director of Data Platform — coverage gap, no 1on1 yet"
      ]
    }
  ]
}
EOF
```

- [ ] **Step 4: `draft-with-user-edits/` — for idempotence eval**

```fish
mkdir -p tests/fixtures/strategy-doc/draft-with-user-edits/{stakeholders,arch,swot,notes,decisions}
cp tests/fixtures/strategy-doc/with-swot-only/RAMP.md tests/fixtures/strategy-doc/draft-with-user-edits/RAMP.md
cp tests/fixtures/strategy-doc/with-swot-only/memory-seed.json tests/fixtures/strategy-doc/draft-with-user-edits/memory-seed.json
cp tests/fixtures/strategy-doc/with-swot-only/stakeholders/map.md tests/fixtures/strategy-doc/draft-with-user-edits/stakeholders/map.md

cat > tests/fixtures/strategy-doc/draft-with-user-edits/decisions/2026-05-01-90-day-plan.md <<'EOF'
# 90-Day Plan — Acme (VP Eng)

**Created:** 2026-05-01
**Last updated:** 2026-05-01
**Status:** draft

---

## 1. What I learned

<!-- strategy-doc:auto -->
- [Old auto bullet — should be replaced on re-run]
<!-- /strategy-doc:auto -->

USER PROSE: This is my own synthesis paragraph that should NEVER be clobbered.
I wrote this after the W2 1:1s. It must survive re-runs.

---

## 2. What is working

<!-- strategy-doc:auto -->
[TODO]
<!-- /strategy-doc:auto -->

---

## 3. Problems I have observed

<!-- strategy-doc:auto -->
[TODO]
<!-- /strategy-doc:auto -->

---

## 4. Problems I suspect

<!-- strategy-doc:auto -->
[TODO]
<!-- /strategy-doc:auto -->

---

## 5. Specific asks

<!-- strategy-doc:auto -->
[TODO]
<!-- /strategy-doc:auto -->

---

## 6. 30/60/90 milestones

<!-- strategy-doc:auto -->
[TODO]
<!-- /strategy-doc:auto -->

---

## 7. Risks and dependencies

<!-- strategy-doc:auto -->
[TODO]
<!-- /strategy-doc:auto -->

---
EOF
```

- [ ] **Step 5: `clean-doc/` — for review-mode + challenge-layer-3-pass**

```fish
mkdir -p tests/fixtures/strategy-doc/clean-doc/{stakeholders,arch,swot,notes,decisions}
cp tests/fixtures/strategy-doc/full-pipeline/RAMP.md tests/fixtures/strategy-doc/clean-doc/RAMP.md
```

Then write `tests/fixtures/strategy-doc/clean-doc/decisions/2026-05-07-90-day-plan.md` with all 7 sections fully populated, no [TODO], no [CONFLICT], asks like "2 senior eng by W6", milestones with `Success criteria:` and `(addresses §3.1)` cross-refs, risks with named owners. (≈80 lines; mirror the populated full-pipeline doc shape but with all user-input sections filled.)

```fish
cat > tests/fixtures/strategy-doc/clean-doc/decisions/2026-05-07-90-day-plan.md <<'EOF'
# 90-Day Plan — Acme (VP Eng)

**Created:** 2026-05-07
**Last updated:** 2026-05-07
**Status:** review-ready

---

## 1. What I learned

<!-- strategy-doc:auto -->
- Engineering velocity high (40 PRs/week per SWOT).
- Payments service test coverage drifting (SWOT + W2 1:1).
- Data-platform coverage gap (no 1on1 with Director yet).
<!-- /strategy-doc:auto -->

---

## 2. What is working

<!-- strategy-doc:auto -->
- Strong engineering shipping cadence (SWOT strengths).
- Manager handoff sharp; top-3 problems pre-named (W1 handoff).
<!-- /strategy-doc:auto -->

---

## 3. Problems I have observed

<!-- strategy-doc:auto -->
- **Payments service test coverage drift**
  - Evidence: SWOT entry, W2 1:1 with payments lead
  - Confidence: confirmed
- **On-call burden concentration**
  - Evidence: SWOT entry, on-call rota analysis
  - Confidence: likely
<!-- /strategy-doc:auto -->

---

## 4. Problems I suspect

<!-- strategy-doc:auto -->
- **Data-platform team under-resourced**
  - Source: engineering retros (single source)
  - To confirm: 1on1 w/ Director of Data Platform; review headcount vs. roadmap
  - To refute: Director cites adequate staffing; roadmap matches capacity
<!-- /strategy-doc:auto -->

---

## 5. Specific asks

<!-- strategy-doc:auto -->
- 2 senior backend engineers for payments-service hardening by W6.
- Authority to defer non-critical Stripe v3 migration scope items by W4.
<!-- /strategy-doc:auto -->

---

## 6. 30/60/90 milestones

<!-- strategy-doc:auto -->
### W1-30
- **Confirm data-platform staffing hypothesis** (validates §4.1)
  - Success criteria: 1on1 with Director complete; written summary in notes/
  - Timeline: by W4
- **Test-coverage baseline restoration plan** (addresses §3.1)
  - Success criteria: payments-service coverage ≥ 65% (from current 52%)
  - Timeline: by W6

### W30-60
- **On-call rotation rebalance** (addresses §3.2)
  - Success criteria: top-3 ICs hold ≤50% of pages
  - Timeline: by W8

### W60-90
- **Stripe v3 migration cut-over** (addresses §3 implicit dependency)
  - Success criteria: payments-service running on v3 in staging
  - Timeline: by W12
<!-- /strategy-doc:auto -->

---

## 7. Risks and dependencies

<!-- strategy-doc:auto -->
- **Stripe API v2 forced deprecation timeline**
  - Owner: payments lead
  - Mitigation: scope-cut migration to MVP per §5 ask
  - Trigger to escalate: Stripe v3 sandbox unavailable beyond W6
- **Data-platform dependency for Q3 reporting roadmap**
  - Owner: Director of Data Platform (pending 1on1)
  - Mitigation: monitoring only until §4.1 confirmed
  - Trigger to escalate: data-platform pushback on engineering reporting needs
<!-- /strategy-doc:auto -->

---
EOF
```

- [ ] **Step 6: `draft-with-todos/` — for challenge layer 1 fail**

```fish
mkdir -p tests/fixtures/strategy-doc/draft-with-todos/{stakeholders,arch,swot,notes,decisions}
cp tests/fixtures/strategy-doc/fresh-workspace/RAMP.md tests/fixtures/strategy-doc/draft-with-todos/RAMP.md

cat > tests/fixtures/strategy-doc/draft-with-todos/decisions/2026-05-07-90-day-plan.md <<'EOF'
# 90-Day Plan — Acme

---

## 1. What I learned

<!-- strategy-doc:auto -->
- One thing I learned.
<!-- /strategy-doc:auto -->

## 2. What is working

<!-- strategy-doc:auto -->
[TODO: capture during /swot]
<!-- /strategy-doc:auto -->

## 3. Problems I have observed

<!-- strategy-doc:auto -->
- A problem.
<!-- /strategy-doc:auto -->

## 4. Problems I suspect

<!-- strategy-doc:auto -->
[TODO]
<!-- /strategy-doc:auto -->

## 5. Specific asks

<!-- strategy-doc:auto -->
[TODO: user-supplied]
<!-- /strategy-doc:auto -->

## 6. 30/60/90 milestones

<!-- strategy-doc:auto -->
[TODO: user-supplied]
<!-- /strategy-doc:auto -->

## 7. Risks and dependencies

<!-- strategy-doc:auto -->
[TODO]
<!-- /strategy-doc:auto -->
EOF
```

- [ ] **Step 7: `draft-vague-asks/` — for challenge layer 2 fail**

```fish
mkdir -p tests/fixtures/strategy-doc/draft-vague-asks/{stakeholders,arch,swot,notes,decisions}
cp tests/fixtures/strategy-doc/clean-doc/decisions/2026-05-07-90-day-plan.md tests/fixtures/strategy-doc/draft-vague-asks/decisions/2026-05-07-90-day-plan.md
```

Then edit the fixture's §5 to "More headcount for platform team" (no number, no date) and §6 to add an unmeasurable milestone:

```fish
sed -i.bak 's|- 2 senior backend engineers for payments-service hardening by W6.|- More headcount for platform team.|' tests/fixtures/strategy-doc/draft-vague-asks/decisions/2026-05-07-90-day-plan.md
rm tests/fixtures/strategy-doc/draft-vague-asks/decisions/2026-05-07-90-day-plan.md.bak
cp tests/fixtures/strategy-doc/clean-doc/RAMP.md tests/fixtures/strategy-doc/draft-vague-asks/RAMP.md
```

- [ ] **Step 8: `with-raw-notes/` — for refusal eval**

```fish
mkdir -p tests/fixtures/strategy-doc/with-raw-notes/{stakeholders,arch,swot,notes/raw,decisions}
cp tests/fixtures/strategy-doc/fresh-workspace/RAMP.md tests/fixtures/strategy-doc/with-raw-notes/RAMP.md
cat > tests/fixtures/strategy-doc/with-raw-notes/notes/raw/sensitive.md <<'EOF'
# Raw verbatim 1:1 notes — DO NOT READ from /strategy-doc
Verbatim quote from CFO: "We need to cut 30%."
EOF
```

- [ ] **Step 9: `conflicting-evidence/` — for conflict-marker eval**

```fish
mkdir -p tests/fixtures/strategy-doc/conflicting-evidence/{stakeholders,arch,swot,notes,decisions}
cp tests/fixtures/strategy-doc/fresh-workspace/RAMP.md tests/fixtures/strategy-doc/conflicting-evidence/RAMP.md
cat > tests/fixtures/strategy-doc/conflicting-evidence/memory-seed.json <<'EOF'
{
  "entities": [
    {
      "name": "Acme SWOT",
      "entityType": "SWOT",
      "observations": [
        "[strength] Test coverage on payments service is excellent — 90%+"
      ]
    }
  ]
}
EOF
cat > tests/fixtures/strategy-doc/conflicting-evidence/notes/payments-test-coverage.md <<'EOF'
# Notes — payments test coverage

The payments service test coverage is a serious problem. Currently at 52%, dropped from 75% in Q1.
EOF
```

- [ ] **Step 10: `malformed-fences/` — for damage-report eval**

```fish
mkdir -p tests/fixtures/strategy-doc/malformed-fences/{stakeholders,arch,swot,notes,decisions}
cp tests/fixtures/strategy-doc/fresh-workspace/RAMP.md tests/fixtures/strategy-doc/malformed-fences/RAMP.md
cat > tests/fixtures/strategy-doc/malformed-fences/decisions/2026-05-07-90-day-plan.md <<'EOF'
# 90-Day Plan — broken fences

## 1. What I learned

<!-- strategy-doc:auto -->
- Unclosed fence below
[no closing fence, intentional]

## 2. What is working

<!-- strategy-doc:auto -->
- Nested fence violation
<!-- strategy-doc:auto -->
- Inner content
<!-- /strategy-doc:auto -->
<!-- /strategy-doc:auto -->
EOF
```

- [ ] **Step 11: `existing-old-doc/` — for multi-day-overlap eval**

```fish
mkdir -p tests/fixtures/strategy-doc/existing-old-doc/{stakeholders,arch,swot,notes,decisions}
cp tests/fixtures/strategy-doc/with-swot-only/RAMP.md tests/fixtures/strategy-doc/existing-old-doc/RAMP.md
cp tests/fixtures/strategy-doc/with-swot-only/memory-seed.json tests/fixtures/strategy-doc/existing-old-doc/memory-seed.json
# Doc dated 2 weeks ago
cp tests/fixtures/strategy-doc/clean-doc/decisions/2026-05-07-90-day-plan.md tests/fixtures/strategy-doc/existing-old-doc/decisions/2026-04-23-90-day-plan.md
```

- [ ] **Step 12: `multi-day-plans/` — for refusal-on-multiple-files eval**

```fish
mkdir -p tests/fixtures/strategy-doc/multi-day-plans/{stakeholders,arch,swot,notes,decisions}
cp tests/fixtures/strategy-doc/with-swot-only/RAMP.md tests/fixtures/strategy-doc/multi-day-plans/RAMP.md
cp tests/fixtures/strategy-doc/with-swot-only/memory-seed.json tests/fixtures/strategy-doc/multi-day-plans/memory-seed.json
cp tests/fixtures/strategy-doc/clean-doc/decisions/2026-05-07-90-day-plan.md tests/fixtures/strategy-doc/multi-day-plans/decisions/2026-04-23-90-day-plan.md
cp tests/fixtures/strategy-doc/clean-doc/decisions/2026-05-07-90-day-plan.md tests/fixtures/strategy-doc/multi-day-plans/decisions/2026-05-07-90-day-plan.md
```

- [ ] **Step 13: Verify all fixtures present**

```fish
ls tests/fixtures/strategy-doc/ | grep -v README.md | wc -l
```

Expected: count = 12 (all fixture dirs).

- [ ] **Step 14: Commit fixtures**

```fish
git add tests/fixtures/strategy-doc/
git commit -m "Add /strategy-doc test fixtures (12 scenarios) (#42)"
```

---

## Task 9 — Write `evals/evals.json` with all 14 evals

**Files:**
- Create: `skills/strategy-doc/evals/evals.json`

- [ ] **Step 1: Write the evals file**

The full evals.json content. Each eval has `name`, `summary`, `prompt` (or `turns[]`), `assertions[]` with `type`, `tier`, `description`. All evals tagged via `summary` line "tag: mode:90-day-plan" for filterable Phase 2 regression guard. Use the SWOT/sdr/fat-marker-sketch examples in this repo as the structural pattern.

Content of `skills/strategy-doc/evals/evals.json`:

```json
{
  "skill": "strategy-doc",
  "description": "Phase 1 evals — 90-day-plan mode end-to-end. Covers draft happy paths (workspace prereq, fresh, swot-only, full-pipeline), idempotence, review render, layered challenge (completeness → quality → consistency → /present handoff), refusal-contract delegation to onboard-guard, graceful upstream degradation, conflicting evidence, doc-state errors. All evals tag 'mode:90-day-plan' in summary for Phase 2 RFC regression filtering.",
  "evals": [
    {
      "name": "workspace-missing-refusal",
      "summary": "tag: mode:90-day-plan. Prereq refusal: ~/repos/onboard-<org>/ absent → skill refuses with /onboard-first message.",
      "prompt": "/strategy-doc nonexistent-org-fixture --mode=draft",
      "assertions": [
        {"type": "regex", "pattern": "(workspace not found|run /onboard|onboard <org> first)", "flags": "i", "tier": "required", "description": "refusal message names the missing workspace and points at /onboard"},
        {"type": "not_regex", "pattern": "<!-- strategy-doc:auto -->", "flags": "i", "tier": "required", "description": "no doc emitted on refusal"}
      ]
    },
    {
      "name": "draft-fresh-workspace",
      "summary": "tag: mode:90-day-plan. Empty onboard scaffold; --mode=draft emits 7-section skeleton with [TODO] in all sections.",
      "prompt": "/strategy-doc fresh-workspace --mode=draft  (fixture: tests/fixtures/strategy-doc/fresh-workspace/)",
      "assertions": [
        {"type": "regex", "pattern": "## 1\\. What I learned", "flags": "i", "tier": "required", "description": "Section 1 heading present"},
        {"type": "regex", "pattern": "## 7\\. Risks and dependencies", "flags": "i", "tier": "required", "description": "Section 7 heading present"},
        {"type": "regex", "pattern": "<!-- strategy-doc:auto -->", "flags": "i", "tier": "required", "description": "section-fence sentinel present"},
        {"type": "regex", "pattern": "\\[TODO", "flags": "i", "tier": "required", "description": "[TODO] markers present (empty workspace → all sections [TODO])"}
      ]
    },
    {
      "name": "draft-with-swot-only",
      "summary": "tag: mode:90-day-plan. SWOT entity populated; stakeholder/arch/notes empty. §1-3 partial; §5/§6 still [TODO].",
      "prompt": "/strategy-doc with-swot-only --mode=draft  (fixture: tests/fixtures/strategy-doc/with-swot-only/, memory seed: memory-seed.json)",
      "assertions": [
        {"type": "regex", "pattern": "(velocity|on-call|test coverage|stripe)", "flags": "i", "tier": "required", "description": "SWOT entity content reflected in synthesis"},
        {"type": "regex", "pattern": "## 5\\. Specific asks[\\s\\S]*?\\[TODO", "flags": "i", "tier": "required", "description": "§5 still [TODO] (skill cannot synthesize asks)"},
        {"type": "regex", "pattern": "## 6\\. 30/60/90 milestones[\\s\\S]*?\\[TODO", "flags": "i", "tier": "required", "description": "§6 still [TODO]"}
      ]
    },
    {
      "name": "draft-full-pipeline",
      "summary": "tag: mode:90-day-plan. All four sources populated. §1-3 substantially filled with multi-source citations; §4 has hunch with confirm/refute; §5/§6 [TODO].",
      "prompt": "/strategy-doc full-pipeline --mode=draft  (fixture: tests/fixtures/strategy-doc/full-pipeline/)",
      "assertions": [
        {"type": "regex", "pattern": "(Director of Data Platform|data-platform|coverage gap)", "flags": "i", "tier": "required", "description": "stakeholder gap reflected in §1 or §3"},
        {"type": "regex", "pattern": "Confidence:\\s*(confirmed|likely)", "flags": "i", "tier": "required", "description": "§3 entries carry confidence labels"},
        {"type": "regex", "pattern": "To confirm:|To refute:", "flags": "i", "tier": "required", "description": "§4 entries carry confirm/refute fields"},
        {"type": "regex", "pattern": "(stripe|integration|external)", "flags": "i", "tier": "required", "description": "arch integrations.md reflected in §1 or §7"}
      ]
    },
    {
      "name": "draft-idempotent",
      "summary": "tag: mode:90-day-plan. Re-run --mode=draft preserves outside-fence user prose; refreshes inside-fence content.",
      "prompt": "/strategy-doc draft-with-user-edits --mode=draft  (fixture: tests/fixtures/strategy-doc/draft-with-user-edits/)",
      "assertions": [
        {"type": "regex", "pattern": "USER PROSE: This is my own synthesis paragraph", "flags": "", "tier": "required", "description": "user prose below closing fence preserved verbatim"},
        {"type": "not_regex", "pattern": "Old auto bullet — should be replaced on re-run", "flags": "", "tier": "required", "description": "stale inside-fence content replaced"}
      ]
    },
    {
      "name": "review-mode-readonly",
      "summary": "tag: mode:90-day-plan. --mode=review renders sections; no mutation; no checks.",
      "prompt": "/strategy-doc clean-doc --mode=review  (fixture: tests/fixtures/strategy-doc/clean-doc/)",
      "assertions": [
        {"type": "regex", "pattern": "## 1\\. What I learned", "flags": "i", "tier": "required", "description": "section heading rendered to terminal"},
        {"type": "not_regex", "pattern": "(Layer 1|completeness|quality|consistency|challenge)", "flags": "i", "tier": "required", "description": "review mode does not run challenge checks"}
      ]
    },
    {
      "name": "challenge-layer-1-fail",
      "summary": "tag: mode:90-day-plan. Doc with [TODO] markers fails layer 1; layer 2/3 not run.",
      "prompt": "/strategy-doc draft-with-todos --mode=challenge  (fixture: tests/fixtures/strategy-doc/draft-with-todos/)",
      "assertions": [
        {"type": "regex", "pattern": "(layer 1|completeness)", "flags": "i", "tier": "required", "description": "layer 1 failure named"},
        {"type": "regex", "pattern": "\\[TODO", "flags": "", "tier": "required", "description": "[TODO] count or list emitted"},
        {"type": "not_regex", "pattern": "(layer 2|quality|layer 3|consistency)", "flags": "i", "tier": "required", "description": "layers 2-3 not run"}
      ]
    },
    {
      "name": "challenge-layer-2-fail-vague-asks",
      "summary": "tag: mode:90-day-plan. Layer 1 clean, §5 has 'more headcount' (no number/date) → layer 2 fails on ask-specificity.",
      "prompt": "/strategy-doc draft-vague-asks --mode=challenge  (fixture: tests/fixtures/strategy-doc/draft-vague-asks/)",
      "assertions": [
        {"type": "regex", "pattern": "(layer 2|quality)", "flags": "i", "tier": "required", "description": "layer 2 named"},
        {"type": "regex", "pattern": "(vague|specific|number|date|more headcount)", "flags": "i", "tier": "required", "description": "ask-specificity failure cited"},
        {"type": "not_regex", "pattern": "(layer 3|consistency)", "flags": "i", "tier": "required", "description": "layer 3 gated behind --continue"}
      ]
    },
    {
      "name": "challenge-layer-3-pass-handoff",
      "summary": "tag: mode:90-day-plan. All 3 layers clean → /present handoff offered.",
      "prompt": "/strategy-doc clean-doc --mode=challenge  (fixture: tests/fixtures/strategy-doc/clean-doc/)",
      "assertions": [
        {"type": "regex", "pattern": "(layer 1|completeness).{0,40}(clean|pass)", "flags": "i", "tier": "required", "description": "layer 1 reports clean"},
        {"type": "regex", "pattern": "(/present|export|slidev|deck)", "flags": "i", "tier": "required", "description": "/present handoff offered"}
      ]
    },
    {
      "name": "refusal-raw-notes",
      "summary": "tag: mode:90-day-plan. Path under notes/raw/ → refusal-contract honored via onboard-guard delegation.",
      "prompt": "/strategy-doc with-raw-notes --mode=draft --read notes/raw/sensitive.md  (fixture: tests/fixtures/strategy-doc/with-raw-notes/)",
      "assertions": [
        {"type": "regex", "pattern": "(refus|raw|guard|cannot read|sanitiz)", "flags": "i", "tier": "required", "description": "refusal cited"},
        {"type": "not_regex", "pattern": "We need to cut 30%", "flags": "", "tier": "required", "description": "verbatim raw content NOT echoed"}
      ]
    },
    {
      "name": "memory-mcp-unavailable",
      "summary": "tag: mode:90-day-plan. Memory MCP unavailable → graceful filesystem-only fallback; no abort.",
      "prompt": "/strategy-doc fresh-workspace --mode=draft  (fixture: tests/fixtures/strategy-doc/fresh-workspace/ — no memory-seed.json, simulating both 'MCP unavailable' and 'entity missing' indistinguishably; eval asserts skill does not abort)",
      "assertions": [
        {"type": "regex", "pattern": "## 7\\. Risks and dependencies", "flags": "i", "tier": "required", "description": "all 7 sections still emitted"},
        {"type": "regex", "pattern": "(memory|mcp).{0,40}(unavailable|skip|filesystem)", "flags": "i", "tier": "diagnostic", "description": "informational warning emitted"}
      ]
    },
    {
      "name": "conflicting-evidence-blocks-challenge",
      "summary": "tag: mode:90-day-plan. SWOT-strength vs notes-weakness → [CONFLICT: ...] inline marker; challenge layer 1 fails on CONFLICT.",
      "prompt": "/strategy-doc conflicting-evidence --mode=draft  (fixture: tests/fixtures/strategy-doc/conflicting-evidence/)",
      "assertions": [
        {"type": "regex", "pattern": "\\[CONFLICT", "flags": "", "tier": "required", "description": "CONFLICT marker emitted inline"},
        {"type": "regex", "pattern": "(test coverage|payments)", "flags": "i", "tier": "required", "description": "conflict cites the disputed surface"}
      ]
    },
    {
      "name": "doc-fence-malformed-refuses-mutation",
      "summary": "tag: mode:90-day-plan. Doc with unclosed/nested fences → skill refuses mutation, emits damage report.",
      "prompt": "/strategy-doc malformed-fences --mode=draft  (fixture: tests/fixtures/strategy-doc/malformed-fences/)",
      "assertions": [
        {"type": "regex", "pattern": "(malformed|unclosed|nested|damage|fence)", "flags": "i", "tier": "required", "description": "damage cited"},
        {"type": "regex", "pattern": "(line|position|section)", "flags": "i", "tier": "required", "description": "specific location named"}
      ]
    },
    {
      "name": "multi-day-overlap-mutates-existing",
      "summary": "tag: mode:90-day-plan. Existing doc dated 2 weeks ago → --mode=draft mutates same file (does NOT create new dated file).",
      "prompt": "/strategy-doc existing-old-doc --mode=draft  (fixture: tests/fixtures/strategy-doc/existing-old-doc/)",
      "assertions": [
        {"type": "regex", "pattern": "2026-04-23-90-day-plan\\.md", "flags": "", "tier": "required", "description": "existing dated filename referenced as mutation target"},
        {"type": "not_regex", "pattern": "2026-05-07-90-day-plan\\.md", "flags": "", "tier": "required", "description": "no new dated file created today"}
      ]
    },
    {
      "name": "multi-file-glob-refusal",
      "summary": "tag: mode:90-day-plan. Two *-90-day-plan.md files present → refuse mutation, ask user to consolidate.",
      "prompt": "/strategy-doc multi-day-plans --mode=draft  (fixture: tests/fixtures/strategy-doc/multi-day-plans/)",
      "assertions": [
        {"type": "regex", "pattern": "(consolidat|multiple|ambiguous|two|both)", "flags": "i", "tier": "required", "description": "multi-file refusal language"},
        {"type": "regex", "pattern": "2026-04-23.*2026-05-07|2026-05-07.*2026-04-23", "flags": "s", "tier": "required", "description": "both filenames listed"}
      ]
    }
  ]
}
```

- [ ] **Step 2: Verify evals file shape**

```fish
test -f skills/strategy-doc/evals/evals.json
bun run -e 'const e = JSON.parse(await Bun.file("skills/strategy-doc/evals/evals.json").text()); console.log(e.evals.length, "evals;", e.evals.every(v => v.name && v.summary && (v.prompt || v.turns) && v.assertions?.length) ? "all valid shape" : "shape errors");'
fish validate.fish
```

Expected: "15 evals; all valid shape" (workspace-missing + 14 fixture-driven). validate.fish passes Phase 1m (evals.json shape) + Phase 1n (fixture↔eval integrity).

- [ ] **Step 3: Commit**

```fish
git add skills/strategy-doc/evals/evals.json
git commit -m "Add /strategy-doc Phase 1 eval suite (15 evals) (#42)"
```

---

## Task 10 — Run full eval suite + iterate on SKILL.md until pass

**Files:**
- Modify (as needed): `skills/strategy-doc/SKILL.md`
- Modify (as needed): `skills/strategy-doc/synthesis.md`, `challenge-checks.md`, `90-day-plan-template.md`

- [ ] **Step 1: Run the full suite**

```fish
bun run evals strategy-doc
```

Expected on first run: some evals will likely fail because SKILL.md doesn't yet contain step-by-step prose for every assertion. Read failing transcripts in `tests/results/strategy-doc-*.md`.

- [ ] **Step 2: Iterate on SKILL.md / reference docs**

For each failing eval, identify whether:
- The skill body lacks an instruction Claude needs to produce the asserted output → add to SKILL.md or appropriate reference doc.
- The fixture is wrong → fix the fixture, re-run.
- The assertion is wrong → narrow or broaden the regex, document why in `description`.

Common Phase 1 iteration targets:

1. **Refusal language:** ensure SKILL.md "Prerequisites" section uses the exact phrase shapes the `workspace-missing-refusal` eval matches.
2. **Section-fence emission:** ensure 90-day-plan-template.md is loaded by the skill on `--mode=draft` and the literal `<!-- strategy-doc:auto -->` markers reach the output.
3. **Layer 1 stop semantics:** ensure challenge-checks.md prose explicitly says "if layer 1 fails, do NOT run layer 2 or 3" so the model honors the gate.
4. **CONFLICT marker:** ensure synthesis.md "Conflicting evidence" section is referenced from SKILL.md "Upstream-input degradation" so the model emits CONFLICT inline.

- [ ] **Step 3: Re-run until clean**

```fish
bun run evals strategy-doc
```

Expected: all 15 evals pass at required tier. Diagnostic-tier failures are acceptable but should be documented in the eval `description` field.

- [ ] **Step 4: Commit iterations**

Make one commit per iteration cycle (don't squash debugging history; future readers benefit from seeing which prose changes moved which evals).

```fish
git add skills/strategy-doc/
git commit -m "Iterate /strategy-doc skill body on eval feedback (#42)"
```

(Repeat as needed.)

---

## Task 11 — Final validate + install + sanity check

**Files:**
- Modify: none

- [ ] **Step 1: Full validate run**

```fish
fish validate.fish
```

Expected: all phases pass. Specifically:
- Phase 1m (evals.json shape): each eval has name, prompt|turns, assertions[]; sentinel present.
- Phase 1n (fixture↔eval integrity): every `tests/fixtures/strategy-doc/<dir>/` has an eval consumer or is listed under `## Orphaned fixtures` in the README.

- [ ] **Step 2: Install + check symlink**

```fish
./bin/link-config.fish
./bin/link-config.fish --check
```

Expected: idempotent install creates `~/.claude/skills/strategy-doc` symlink. `--check` exits 0.

- [ ] **Step 3: Verify rule loaded (manual fallback)**

In a fresh Claude session (after install):

> "List every skill in your loaded system instructions. Do not Read from disk."

Expected: `strategy-doc` appears in the list.

- [ ] **Step 4: Run full eval suite once more from clean state**

```fish
bun run evals strategy-doc
```

Expected: 15/15 required-tier pass.

- [ ] **Step 5: Open PR**

```fish
git push -u origin <branch>
gh pr create --title "Add /strategy-doc Phase 1 — 90-day-plan mode (#42)" --body "$(cat <<'EOF'
## Summary
- New `/strategy-doc <org> --mode=draft|review|challenge` skill at `skills/strategy-doc/`.
- Phase 1 = 90-day-plan mode end-to-end. Workspace-coupled to `/onboard`. Stub-and-iterate flow with section-fence sentinels for idempotent re-runs. Layered challenge pass (completeness → quality → consistency). `/present` Slidev handoff.
- 5 markdown files (SKILL + 4 reference docs); 15 evals; 12 fixtures. No new scripts — confidentiality refusal delegates to existing `skills/onboard/scripts/onboard-guard.ts`.
- Closes Phase 1 of #42; cross-org RFC mode and multi-variant export deferred to Phase 2.

Spec: docs/superpowers/specs/2026-05-07-strategy-doc-design.md
Plan: docs/superpowers/plans/2026-05-07-strategy-doc-phase-1.md

## Test plan
- [ ] `bun run evals strategy-doc` — 15/15 required-tier pass
- [ ] `fish validate.fish` — all phases including 1m (evals shape) + 1n (fixture↔eval integrity)
- [ ] `./bin/link-config.fish --check` — symlink in place
- [ ] Manual: fresh session lists `strategy-doc` skill in loaded instructions

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR opens, CI runs evals + validate; review checklist visible.

---

## Out-of-Scope (this plan)

- `--mode=rfc` cross-org strategy authoring (Phase 2).
- Multi-variant export with redaction (Phase 2).
- Memory entity for strategy doc (revisit only if cross-session friction surfaces).
- Multi-org concurrent workspace handling.
- `--capture` interactive flag (user writes `notes/*.md` directly Phase 1).

## Acceptance Criteria (from spec)

Lifted verbatim from `docs/superpowers/specs/2026-05-07-strategy-doc-design.md`:

- [ ] `/strategy-doc <org>` refuses if `~/repos/onboard-<org>/` absent.
- [ ] `--mode=draft` emits 7-section skeleton with section-fence sentinels and [TODO] markers populated from upstream evidence.
- [ ] Re-run `--mode=draft` preserves outside-fence user content; refreshes inside-fence auto content.
- [ ] `--mode=review` renders section-by-section; no mutation.
- [ ] `--mode=challenge` runs layered pass; layer 1 fail skips 2-3; layer 2 fail gates layer 3 behind `--continue`; all clean → `/present` handoff.
- [ ] Refusal-contract: paths in `notes/raw/` refused via `onboard-guard.ts refuse-raw`.
- [ ] Memory MCP unavailable → graceful filesystem-only fallback; no abort.
- [ ] Conflicting upstream evidence flagged inline; blocks challenge.
- [ ] Malformed section fences refuse mutation with damage report.
- [ ] Eval suite (`skills/strategy-doc/evals/evals.json`) covers ≥14 scenarios (this plan ships 15 — adds `workspace-missing-refusal` as a separate eval rather than folding into draft happy path); `validate.fish` Phase 1n passes (fixture↔eval integrity).
- [ ] All evals tagged `mode:90-day-plan` for filtered runs (Phase 2 RFC mode regression guard).
- [ ] `bin/link-config.fish --check` passes after install.
- [ ] `fish validate.fish` passes.
